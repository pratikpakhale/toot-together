import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { afterEach } from 'vitest'
import { WebSocket } from 'ws'
import type { ServerMsg } from '../src/sim/protocol'

const servers: ChildProcess[] = []
const sockets: WebSocket[] = []

afterEach(() => {
  for (const ws of sockets.splice(0)) ws.terminate()
  for (const server of servers.splice(0)) server.kill('SIGKILL')
})

export async function freePort() {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, resolve))
  const { port } = probe.address() as { port: number }
  await new Promise((resolve) => probe.close(resolve))
  return port
}

export function startServer(port: number, roomsFile = '') {
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), ROOMS_FILE: roomsFile },
  })
  servers.push(proc)
  const log: string[] = []
  return new Promise<{ proc: ChildProcess; log: string[] }>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      log.push(String(chunk))
      if (String(chunk).includes('Hippo Toot server on')) resolve({ proc, log })
    }
    proc.stdout!.on('data', onData)
    proc.stderr!.on('data', onData)
    proc.once('exit', (code) => reject(new Error(`server exited early (${code}): ${log.join('')}`)))
  })
}

export async function stopServer(proc: ChildProcess) {
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  proc.kill('SIGINT')
  await exited
}

export async function connect(port: number) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`)
  sockets.push(ws)
  const inbox: ServerMsg[] = []
  const waiters: (() => void)[] = []
  ws.on('message', (raw) => {
    inbox.push(JSON.parse(String(raw)) as ServerMsg)
    for (const wake of waiters.splice(0)) wake()
  })
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  const send = (msg: object) => ws.send(JSON.stringify(msg))
  const next = async <T extends ServerMsg['type']>(type: T, match: (m: Extract<ServerMsg, { type: T }>) => boolean = () => true) => {
    const deadline = Date.now() + 5000
    for (;;) {
      const found = inbox.find((m): m is Extract<ServerMsg, { type: T }> => m.type === type && match(m as Extract<ServerMsg, { type: T }>))
      if (found) return found
      if (Date.now() > deadline) throw new Error(`no '${type}' within 5 s`)
      await new Promise<void>((wake) => waiters.push(wake))
    }
  }
  return { ws, inbox, send, next }
}

export const health = async (port: number) => (await (await fetch(`http://localhost:${port}/health`)).json()) as { rooms: number }
