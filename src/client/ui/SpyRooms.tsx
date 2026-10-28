import { useEffect, useState } from 'react'
import { MAX_RAFTS } from '../../sim/constants'
import { COURSES } from '../../sim/courses'
import { PROTOCOL_VERSION, type RoomSummary, type ServerMsg, type ServerStats } from '../../sim/protocol'
import { REGIONS, type Region } from '../../sim/regions'
import { audio } from '../audio/audio'
import { showMenu, watchRoom } from '../game/controller'
import { seatColor, TEAMS } from '../game/frame'
import { socketUrl } from '../regions'
import { formatTime } from './format'
import { Icon } from './Icon'
import { TeamBadge } from './Race'

type Feed =
  | { status: 'connecting' }
  | { status: 'error'; message: string }
  | { status: 'live'; rooms: RoomSummary[]; server: ServerStats; stale: boolean }

function useRoomFeed(region: Region): Feed {
  const [feed, setFeed] = useState<Feed>({ status: 'connecting' })
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- the cleanup closes the socket and clears the retry timer
  useEffect(() => {
    let ws: WebSocket
    let retry = 0
    let stopped = false
    const connect = () => {
      ws = new WebSocket(socketUrl(region))
      ws.onopen = () => ws.send(JSON.stringify({ type: 'watch', v: PROTOCOL_VERSION }))
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMsg
        if (msg.type === 'rooms') setFeed({ status: 'live', rooms: msg.rooms, server: msg.server, stale: false })
        else if (msg.type === 'error') {
          stopped = true
          setFeed({ status: 'error', message: msg.message })
        }
      }
      ws.onclose = () => {
        if (stopped) return
        setFeed((f) => (f.status === 'live' ? { ...f, stale: true } : f))
        retry = window.setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      stopped = true
      window.clearTimeout(retry)
      ws.close()
    }
  }, [region])
  return feed
}

const PHASE_ORDER = { racing: 0, countdown: 1, pond: 2, finished: 3 } as const

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${seconds % 60}s`
  return `${seconds}s`
}

function leave() {
  audio.click()
  history.replaceState(null, '', '/')
  showMenu()
}

export function SpyRooms() {
  const [region, setRegion] = useState(REGIONS[0])

  return (
    <div className="safe-area pointer-events-none flex flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-8">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3">
        <div className="font-display stroke-text flex items-center gap-2 text-4xl text-white">
          <Icon name="eye" size="1.1em" /> HIPPOCAM
        </div>
        {REGIONS.length > 1 && (
          <div role="tablist" aria-label="Server" className="flex rounded-[18px] border-[3px] border-ink bg-white p-1">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === region.id}
                className={`font-display rounded-[12px] px-4 py-1 text-lg ${r.id === region.id ? 'bg-toot text-ink' : 'text-ink/55'}`}
                onClick={() => {
                  audio.click()
                  setRegion(r)
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-cream ml-auto px-4 py-1.5 text-base" onClick={leave}>
          Back to the game
        </button>
      </div>

      <RegionRooms key={region.id} region={region} />
    </div>
  )
}

/** One server's rooms, live. */
function RegionRooms({ region }: { region: Region }) {
  const feed = useRoomFeed(region)
  return (
    <>
      {feed.status === 'connecting' && <div className="panel pointer-events-auto self-start px-5 py-3 font-display text-xl">Tuning in…</div>}

      {feed.status === 'error' && (
        <div className="panel pointer-events-auto flex max-w-md flex-col items-center gap-3 self-center p-6 text-center">
          <Icon name="hippoOops" size={72} />
          <div className="font-display text-2xl">{feed.message}</div>
        </div>
      )}

      {feed.status === 'live' && (
        <>
          <ServerBar server={feed.server} rooms={feed.rooms} stale={feed.stale} />
          {feed.rooms.length === 0 ? (
            <div className="panel pointer-events-auto self-start px-5 py-3 font-display text-xl">No rooms right now. The river is quiet.</div>
          ) : (
            <div className={`grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] ${feed.stale ? 'opacity-60' : ''}`}>
              {[...feed.rooms]
                .sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || b.players.length - a.players.length || a.age - b.age)
                .map((room) => (
                  <RoomCard key={room.code} room={room} />
                ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function ServerBar({ server, rooms, stale }: { server: ServerStats; rooms: RoomSummary[]; stale: boolean }) {
  const players = rooms.reduce((n, r) => n + r.players.filter((p) => !p.away).length, 0)
  const watchers = rooms.reduce((n, r) => n + r.spectators, 0)
  const items: [string, string][] = [
    ['Rooms', String(rooms.length)],
    ['Players', String(players)],
    ['Spectators', String(watchers)],
    ['Sockets', String(server.sockets)],
    ['CPU', `${Math.round(server.cpu * 100)}%`],
    ['Load', server.load.toFixed(2)],
    ['Steal', server.stealPct === null ? 'n/a' : `${Math.round(server.stealPct)}%`],
    ['Memory', `${server.rssMb} MB`],
    ['Free', `${server.memAvailableMb} MB`],
    ['Tick late', `${server.tickLateAvg.toFixed(1)} / ${server.tickLateMax.toFixed(1)} ms`],
    ['Uptime', duration(server.uptime)],
    ['Release', server.release],
  ]
  return (
    <div className="pointer-events-auto flex flex-wrap gap-2">
      {stale && <div className="chip bg-gold px-3 py-1 text-sm font-extrabold">Reconnecting…</div>}
      {items.map(([label, value]) => (
        <div key={label} className="chip flex items-baseline gap-1.5 px-3 py-1">
          <span className="text-xs font-extrabold uppercase text-ink/55">{label}</span>
          <span className="font-display text-base tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  )
}

function RoomCard({ room }: { room: RoomSummary }) {
  const course = COURSES[room.course]
  const phase = room.idle !== null ? `EMPTY ${room.idle}s` : room.phase === 'pond' ? 'IN THE POND' : room.phase.toUpperCase()
  const phaseColor = room.idle !== null ? 'bg-ink/15' : room.phase === 'racing' ? 'bg-toot' : room.phase === 'finished' ? 'bg-gold' : 'bg-[#7fd0ff]'
  const race = room.rafts > 1
  const lead = Math.max(0, ...room.progress.map((p) => p ?? 0))
  return (
    <div className="panel pointer-events-auto flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-3xl tracking-[0.2em]">{room.code}</span>
        <span className={`ml-auto rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold ${phaseColor}`}>{phase}</span>
      </div>
      <div className="font-display -mt-2 text-lg text-ink/70">
        {course?.name ?? room.course}
        {race && ` · Race · ${room.rafts} rafts`}
      </div>

      <div className="relative h-4 rounded-full border-[3px] border-ink bg-white">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-toot to-grass" style={{ width: `${lead * 100}%` }} />
        {race ? (
          room.progress.map((p, r) =>
            p === null ? null : (
              <Icon
                key={r}
                name={TEAMS[r].icon}
                size={18}
                label={`${TEAMS[r].name} raft`}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p * 100}%` }}
              />
            ),
          )
        ) : (
          <Icon name="hippo" size={24} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${lead * 100}%` }} />
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-extrabold text-ink/75">
        <span className="flex items-center gap-1">
          <Icon name="clock" size="1.2em" /> {formatTime(room.raceTime)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="skull" size="1.2em" /> {room.deaths}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="eye" size="1.2em" /> {room.spectators}
        </span>
        <span className="ml-auto text-ink/50">open {duration(room.age)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {[...room.players]
          .sort((a, b) => (a.raft ?? MAX_RAFTS) - (b.raft ?? MAX_RAFTS) || a.ord - b.ord)
          .map((p) => (
            <div key={p.id} className={`flex items-center gap-2 ${p.away ? 'opacity-45' : ''}`}>
              {race &&
                (p.raft === null ? (
                  <span className="w-[18px] text-center text-xs font-extrabold text-ink/40">–</span>
                ) : (
                  <TeamBadge raft={p.raft} size={18} />
                ))}
              <span className="name-tag max-w-[60%] truncate !text-sm" style={{ ['--tag' as string]: seatColor(p.seat) }}>
                {p.name}
              </span>
              {p.host && <Icon name="crown" size={18} label="Host" />}
              <span className="ml-auto text-xs font-extrabold tabular-nums text-ink/55">
                {p.away ? 'away' : p.ping == null ? '…' : `${p.ping}ms`}
              </span>
            </div>
          ))}
      </div>

      <button
        className="btn btn-blue flex items-center justify-center gap-2 text-xl"
        onClick={() => {
          audio.click()
          watchRoom(room.code)
        }}
      >
        <Icon name="eye" size="1.1em" /> Watch
      </button>
    </div>
  )
}
