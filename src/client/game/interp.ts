import { lerp, lerpAngle, wrapAngle } from '../../sim/math'
import { type PlayerSnap, RAFT_STATE, type Snapshot } from '../../sim/types'

export function cloneSnapshot(s: Snapshot): Snapshot {
  return { ...s, raft: { ...s.raft }, players: s.players.map((p) => ({ ...p })), pickups: [...s.pickups] }
}

const TELEPORT_DISTANCE = 6

function burstAgoAt(t: number, a: Snapshot, pa: PlayerSnap, b: Snapshot, pb: PlayerSnap) {
  const agoFromB = pb.burstAgo - (b.t - t)
  const burstOfBIsAfterT = agoFromB < 0
  return burstOfBIsAfterT ? pa.burstAgo + (t - a.t) : agoFromB
}

export function interpolate(a: Snapshot, b: Snapshot, t: number, out: Snapshot): Snapshot {
  const ra = a.raft
  const rb = b.raft
  const teleport = ra.st !== rb.st || Math.hypot(rb.x - ra.x, rb.z - ra.z) > TELEPORT_DISTANCE
  const k = teleport ? 1 : t

  out.t = lerp(a.t, b.t, t)
  out.tick = b.tick
  out.phase = b.phase
  out.raceTime = b.phase === 'racing' ? lerp(a.raceTime, b.raceTime, t) : b.raceTime
  out.deaths = b.deaths
  out.cp = b.cp
  out.pickups = b.pickups

  const r = out.raft
  r.x = lerp(ra.x, rb.x, k)
  r.y = lerp(ra.y, rb.y, k)
  r.z = lerp(ra.z, rb.z, k)
  r.a = lerpAngle(ra.a, rb.a, k)
  r.vx = lerp(ra.vx, rb.vx, k)
  r.vz = lerp(ra.vz, rb.vz, k)
  r.av = rb.av
  r.st = rb.st
  r.stT = ra.st === rb.st ? lerp(ra.stT, rb.stT, t) : rb.stT
  r.i = rb.i
  r.s = lerp(ra.s, rb.s, k)

  const players: PlayerSnap[] = []
  for (const pb of b.players) {
    const pa = a.players.find((p) => p.id === pb.id) ?? pb
    const prev = out.players.find((p) => p.id === pb.id)
    const o: PlayerSnap = prev ?? { ...pb }
    o.seat = pb.seat
    o.rim = lerpAngle(pa.rim, pb.rim, k)
    o.walk = pb.walk
    o.fart = pb.fart
    o.stam = lerp(pa.stam, pb.stam, t)
    o.exh = pb.exh
    o.buff = pb.buff
    o.buffT = pb.buffT
    o.sync = pb.sync
    o.burstAgo = burstAgoAt(out.t, a, pa, b, pb)
    players.push(o)
  }
  out.players = players
  return out
}

export function extrapolate(s: Snapshot, dt: number, out: Snapshot): Snapshot {
  interpolate(s, s, 1, out)
  out.t = s.t + dt
  if (s.phase === 'racing') out.raceTime = s.raceTime + dt
  const r = out.raft
  r.stT = s.raft.stT + dt
  if (s.raft.st === RAFT_STATE.float) {
    r.x += s.raft.vx * dt
    r.z += s.raft.vz * dt
    r.a = wrapAngle(r.a + s.raft.av * dt)
  }
  for (const p of out.players) p.burstAgo += dt
  return out
}
