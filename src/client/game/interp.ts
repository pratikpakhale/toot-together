import { lerp, lerpAngle, wrapAngle } from '../../sim/math'
import { type PlayerSnap, RAFT_STATE, type RaftSnap, type Snapshot } from '../../sim/types'

export function cloneSnapshot(s: Snapshot): Snapshot {
  return { ...s, rafts: s.rafts.map((r) => ({ ...r })), players: s.players.map((p) => ({ ...p })), pickups: [...s.pickups] }
}

const TELEPORT_DISTANCE = 6

function burstAgoAt(t: number, a: Snapshot, pa: PlayerSnap, b: Snapshot, pb: PlayerSnap) {
  const agoFromB = pb.burstAgo - (b.t - t)
  const burstOfBIsAfterT = agoFromB < 0
  return burstOfBIsAfterT ? pa.burstAgo + (t - a.t) : agoFromB
}

/** Whether a raft jumped between two snapshots (respawn, pop, fall), so it shouldn't slide. */
const jumped = (ra: RaftSnap, rb: RaftSnap) => ra.st !== rb.st || Math.hypot(rb.x - ra.x, rb.z - ra.z) > TELEPORT_DISTANCE

function interpolateRaft(ra: RaftSnap, rb: RaftSnap, t: number, r: RaftSnap) {
  const k = jumped(ra, rb) ? 1 : t
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
  r.d = rb.d
  r.cp = rb.cp
  r.res = rb.res
  r.pl = rb.pl
  r.ft = rb.ft
  r.gh = rb.gh
}

export function interpolate(a: Snapshot, b: Snapshot, t: number, out: Snapshot): Snapshot {
  out.t = lerp(a.t, b.t, t)
  out.tick = b.tick
  out.phase = b.phase
  out.raceTime = b.phase === 'racing' ? lerp(a.raceTime, b.raceTime, t) : b.raceTime
  out.goAt = b.goAt
  out.closeAt = b.closeAt
  out.pickups = b.pickups

  out.rafts.length = b.rafts.length
  for (let i = 0; i < b.rafts.length; i++) {
    const rb = b.rafts[i]
    out.rafts[i] ??= { ...rb }
    interpolateRaft(a.rafts[i] ?? rb, rb, t, out.rafts[i])
  }

  const players: PlayerSnap[] = []
  for (const pb of b.players) {
    const found = a.players.find((p) => p.id === pb.id)
    const pa = found && found.raft === pb.raft ? found : pb
    const ra = a.rafts[pb.raft]
    const k = ra && jumped(ra, b.rafts[pb.raft]) ? 1 : t
    const prev = out.players.find((p) => p.id === pb.id)
    const o: PlayerSnap = prev ?? { ...pb }
    o.raft = pb.raft
    o.seat = pb.seat
    o.ord = pb.ord
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
  s.rafts.forEach((from, i) => {
    const r = out.rafts[i]
    r.stT = from.stT + dt
    if (from.st !== RAFT_STATE.float) return
    r.x += from.vx * dt
    r.z += from.vz * dt
    r.a = wrapAngle(r.a + from.av * dt)
  })
  for (const p of out.players) p.burstAgo += dt
  return out
}
