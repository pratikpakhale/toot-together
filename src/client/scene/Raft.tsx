import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CREW_SIZE, MAX_RAFTS } from '../../sim/constants'
import { rimSector } from '../../sim/sectors'
import { pointAt, type BakedCourse } from '../../sim/track'
import { BUFF_CODE, RAFT_RESULT, RAFT_STATE, type PlayerSnap, type RaftStateCode } from '../../sim/types'
import { audio } from '../audio/audio'
import { EARSHOT, frame, isRace, myRaft, SEAT_COLORS, standings, tagSlot, TEAMS } from '../game/frame'
import { useApp } from '../state/store'
import type { IconName } from '../ui/icons'
import { setTagContent } from '../ui/NameTags'
import { crewLabel, ordinal } from '../ui/format'
import { fx } from './Fx'
import { Hippo, type HippoHandle } from './Hippo'
import { PALETTE, soft } from './materials'
import { HIPPO_SCALE, hullKit, SEAT_R, SEAT_Y, SLICE_GAP } from './raftKit'
import { RaftHull } from './RaftHull'
import { BlobShadow } from './shadow'

const BUTT_R = SEAT_R + 0.66 * HIPPO_SCALE
const PUFF_RATE = 30
const BUFF_ICON: (IconName | null)[] = [null, 'beans', 'chili', 'prune']
const tagPos = new THREE.Vector3()
/** Space kept between two crewmates' name tags (px). */
const TAG_GAP = 4

/** Where a hippo's name tag and chat bubble go on screen this frame. */
interface TagSpot {
  tag: HTMLElement | null
  bubble: HTMLElement | null
  x: number
  y: number
}
/** Rivals' team tags fade from this distance (m) to their faintest at twice that. */
const TAG_FADE = 25

const FART_COLORS = SEAT_COLORS.map((c) => '#' + new THREE.Color(PALETTE.fart).lerp(new THREE.Color(c), 0.3).getHexString())
/** Soot that rolls off chili fire. */
const SMOKE = '#5e4a46'

/** The push arrow under each hippo, shared by every raft. */
const arrowGeo = (() => {
  const arrow = new THREE.Shape()
  arrow.moveTo(0, 0.55)
  arrow.lineTo(0.5, -0.05)
  arrow.lineTo(0.18, -0.05)
  arrow.lineTo(0.18, -0.5)
  arrow.lineTo(-0.18, -0.5)
  arrow.lineTo(-0.18, -0.05)
  arrow.lineTo(-0.5, -0.05)
  arrow.closePath()
  return new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2)
})()

export function Rafts({ course }: { course: BakedCourse }) {
  return (
    <>
      {Array.from({ length: MAX_RAFTS }, (_, i) => (
        <RaftView key={i} course={course} index={i} />
      ))}
    </>
  )
}

function RaftView({ course, index }: { course: BakedCourse; index: number }) {
  const info = useApp((s) => s.sessionInfo)
  const session = useApp((s) => s.session)
  const roster = info?.roster ?? []
  const localIds = useMemo(() => session?.localPlayers.map((p) => p.id) ?? [], [session, info])
  const root = useRef<THREE.Group>(null!)
  const tilt = useRef<THREE.Group>(null!)
  const raftBody = useRef<THREE.Group>(null!)
  const band = useRef<THREE.Mesh>(null!)
  const belt = useRef<THREE.Mesh>(null!)
  const rope = useRef<THREE.Group>(null!)
  const pennant = useRef<THREE.Group>(null!)
  const flag = useRef<THREE.Mesh>(null!)
  const shadow = useRef<THREE.Group>(null!)
  const hippos = useRef<(HippoHandle | null)[]>([])
  const holders = useRef<(THREE.Group | null)[]>([])
  const camera = useThree((s) => s.camera)
  const menu = useApp((s) => s.screen !== 'game')
  const arrows = useRef<(THREE.Group | null)[]>([])
  const slices = useRef<(THREE.Mesh | null)[]>([])
  const arrowMats = useMemo(() => SEAT_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, depthWrite: false })), [])
  const fartKeys = useMemo(() => SEAT_COLORS.map((_, seat) => `p${index}-${seat}`), [index])
  const state = useRef({ emit: [0, 0, 0, 0], tooting: [false, false, false, false], wake: 0, tiltX: 0, tiltZ: 0, team: false })

  useEffect(() => () => arrowMats.forEach((m) => m.dispose()), [arrowMats])
  // The raft and crew cast sun shadows (drawn only where the renderer has shadows on).
  useEffect(() => {
    root.current.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  }, [])

  const hideHippo = (seat: number) => {
    state.current.tooting[seat] = false
    const slot = tagSlot(index, seat)
    const tag = frame.tagEls[slot]
    const bubble = frame.bubbleEls[slot]
    if (tag) tag.style.display = 'none'
    if (bubble) bubble.style.display = 'none'
    audio.fartStop(fartKeys[seat])
    const arrow = arrows.current[seat]
    if (arrow) arrow.visible = false
  }

  const place = (el: HTMLElement, holder: THREE.Object3D, lift: number) => {
    holder.getWorldPosition(tagPos)
    tagPos.y += lift
    tagPos.project(camera)
    if (tagPos.z >= 1) return null
    return { x: ((tagPos.x + 1) / 2) * window.innerWidth, y: ((1 - tagPos.y) / 2) * window.innerHeight, el }
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const v = frame.view
    const r = v?.rafts[index]
    const crew = v && r ? v.players.filter((p) => p.raft === index) : []
    const raftTag = frame.raftTagEls[index]
    // Race rafts nobody is on aren't in play; the co-op raft is always drawn, as it always was.
    if (!v || !r || (crew.length === 0 && (index > 0 || isRace(v)))) {
      root.current.visible = false
      shadow.current.visible = false
      if (raftTag) raftTag.style.display = 'none'
      for (let seat = 0; seat < CREW_SIZE; seat++) hideHippo(seat)
      return
    }
    root.current.visible = true
    const t = clock.elapsedTime
    const st = state.current
    const race = isRace(v)
    const mine = myRaft(v, session)
    const own = !race || mine === index
    const onCamera = frame.follow === index
    const showSlices = crew.length > 1 && !menu
    const showTags = own && showSlices

    if (st.team !== race) {
      st.team = race
      band.current.material = soft(race ? TEAMS[index].color : PALETTE.raftBand)
    }
    belt.current.visible = race
    rope.current.visible = !race
    pennant.current.visible = race
    if (race) flag.current.rotation.y = Math.sin(t * 6 + index) * 0.25

    root.current.position.set(r.x, r.y, r.z)
    root.current.rotation.y = -r.a

    let tx = 0
    let tz = 0
    for (const p of crew) {
      if (!isFarting(p, r.st, localIds)) continue
      const ang = p.rim + Math.PI
      tx += Math.cos(ang)
      tz += Math.sin(ang)
    }
    st.tiltX = THREE.MathUtils.damp(st.tiltX, tz * 0.05, 6, dt)
    st.tiltZ = THREE.MathUtils.damp(st.tiltZ, -tx * 0.05, 6, dt)
    tilt.current.rotation.set(st.tiltX + Math.sin(t * 1.7) * 0.02, 0, st.tiltZ + Math.cos(t * 1.3) * 0.02)
    tilt.current.position.y = Math.sin(t * 2.1) * 0.04
    // A raft respawning through others flickers; one that's done racing just drifts through.
    tilt.current.visible = !(r.gh && r.res === RAFT_RESULT.none && Math.floor(t * 12) % 2)

    let raftScale = 1
    if (r.st === RAFT_STATE.popped) raftScale = r.stT < 0.1 ? 1 + r.stT * 3 : 0
    else if (r.st === RAFT_STATE.float && r.stT < 0.45) raftScale = elasticOut(r.stT / 0.45)
    raftBody.current.scale.setScalar(Math.max(0.0001, raftScale))
    raftBody.current.visible = raftScale > 0.001

    shadow.current.position.set(r.x, pointAt(course, r.s).y, r.z)
    shadow.current.visible = r.st === RAFT_STATE.float

    const speed = Math.hypot(r.vx, r.vz)
    st.wake -= dt
    if (r.st === RAFT_STATE.float && speed > 1.2 && st.wake <= 0) {
      st.wake = THREE.MathUtils.clamp(0.5 - speed * 0.04, 0.14, 0.4)
      fx.ring(r.x - (r.vx / speed) * 1.2, r.y, r.z - (r.vz / speed) * 1.2, 2.2, '#ffffff', 1.2)
    }
    if (onCamera) audio.setWater(Math.min(1, speed / 9 + (course.slope[r.i] > 0.05 ? 0.6 : 0)))

    const followed = v.rafts[frame.follow] ?? r
    const away = Math.hypot(r.x - followed.x, r.z - followed.z)
    const loudness = onCamera ? 1 : Math.max(0, 1 - away / EARSHOT) * 0.8

    if (raftTag) {
      const spot = race && !own && r.st !== RAFT_STATE.popped && !menu ? place(raftTag, root.current, 2.7) : null
      raftTag.style.display = spot ? 'block' : 'none'
      if (spot) {
        const running = v.phase === 'racing' || v.phase === 'finished'
        const rank = r.res === RAFT_RESULT.finished ? r.pl : r.res === RAFT_RESULT.none && running ? standings(v).indexOf(index) + 1 : 0
        setTagContent(raftTag, [TEAMS[index].icon], ` ${running ? `${TEAMS[index].name}${rank ? ` · ${ordinal(rank)}` : ''}` : crewNames(crew)}`)
        raftTag.style.opacity = String(THREE.MathUtils.clamp(1 - (away - TAG_FADE) / TAG_FADE, 0.45, 1))
        raftTag.style.transform = `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px)`
      }
    }

    const bySeat: (PlayerSnap | undefined)[] = []
    for (const p of crew) bySeat[p.seat] = p
    // The rim is split among the hippos who are connected, as the sim does.
    const live = crew.filter((p) => !roster.some((e) => e.id === p.id && e.away))
    const ords = live.map((p) => p.ord)
    const sliceGeo = hullKit.slices[live.length]
    const tagSpots: TagSpot[] = []

    for (let seat = 0; seat < CREW_SIZE; seat++) {
      const p = bySeat[seat]
      const slice = slices.current[seat]
      const sector = p && sliceGeo && showSlices && live.includes(p) ? rimSector(p.ord, ords) : null
      if (slice) {
        slice.visible = !!sector
        if (sector && sliceGeo) {
          slice.geometry = sliceGeo
          slice.rotation.set(Math.PI / 2, 0, sector.center - ((Math.PI * 2) / live.length - SLICE_GAP) / 2)
        }
      }
      const holder = holders.current[seat]
      const hippo = hippos.current[seat]
      if (!holder || !hippo) continue
      holder.visible = !!p
      if (!p) {
        hideHippo(seat)
        continue
      }

      const farting = isFarting(p, r.st, localIds)
      const ca = Math.cos(p.rim)
      const sa = Math.sin(p.rim)
      if (r.st === RAFT_STATE.popped) {
        const k = r.stT
        const out = SEAT_R + k * 4.5
        const y = SEAT_Y + 7 * k - 12 * k * k
        holder.position.set(ca * out, Math.max(-2, y), sa * out)
        holder.rotation.set(k * 9 * (seat % 2 ? 1 : -1), -(p.rim + Math.PI), k * 6)
        holder.visible = y > -1.6
      } else {
        holder.position.set(ca * SEAT_R, SEAT_Y, sa * SEAT_R)
        holder.rotation.set(0, -(p.rim + Math.PI), r.st === RAFT_STATE.falling ? Math.sin(t * 20 + seat) * 0.4 : 0)
      }
      hippo.pose({
        t,
        walk: p.walk,
        farting,
        exhausted: p.exh === 1,
        burst: Math.max(0, 1 - p.burstAgo / 0.35),
        strain: farting ? 1 : 0,
        buff: p.buff,
        celebrate: v.phase === 'finished' || r.res === RAFT_RESULT.finished,
      })

      const slot = tagSlot(index, seat)
      const tag = frame.tagEls[slot]
      const bubble = frame.bubbleEls[slot]
      const spot = tag && !menu && r.st !== RAFT_STATE.popped ? place(tag, holder, 2.05) : null
      if (tag) {
        if (spot && showTags) {
          const icons: IconName[] = []
          const buff = BUFF_ICON[p.buff]
          if (buff) icons.push(buff)
          if (p.exh) icons.push('hippoTired')
          setTagContent(tag, icons, roster.find((e) => e.id === p.id)?.name ?? '')
          tag.style.display = 'block'
        } else tag.style.display = 'none'
      }
      const talking = !!bubble && !!spot && (race || showSlices)
      if (bubble) bubble.style.display = talking ? 'block' : 'none'
      const tagShown = !!tag && !!spot && showTags
      if (spot && (tagShown || talking)) {
        tagSpots.push({ tag: tagShown ? tag : null, bubble: talking ? bubble : null, x: spot.x, y: spot.y })
      }

      const alpha = r.a + p.rim
      const ox = Math.cos(alpha)
      const oz = Math.sin(alpha)
      const fartKey = fartKeys[seat]
      if (!farting || loudness < 0.08) audio.fartStop(fartKey)
      else if (!audio.isFarting(fartKey)) audio.fartStart(fartKey, seat, { pan: seat % 2 ? 0.3 : -0.3, kind: p.buff === BUFF_CODE.chili ? 'chili' : 'normal', gain: loudness })

      const started = farting && !st.tooting[seat]
      st.tooting[seat] = farting
      if (farting) {
        st.emit[seat] += dt * PUFF_RATE * (p.buff === BUFF_CODE.beans ? 1.5 : 1)
        const bx = r.x + ox * BUTT_R
        const by = r.y + SEAT_Y + 0.62 * HIPPO_SCALE
        const bz = r.z + oz * BUTT_R
        if (started && !p.sync && p.buff !== BUFF_CODE.chili) fx.tootStart(bx, by, bz, ox, oz, FART_COLORS[seat], r.vx, r.vz)
        while (st.emit[seat] >= 1) {
          st.emit[seat] -= 1
          if (p.sync) fx.rainbowFart(bx, by, bz, ox, oz)
          else if (p.buff === BUFF_CODE.chili) {
            fx.flame(bx, by, bz, ox, oz, r.vx, r.vz)
            if (Math.random() < 0.25) fx.fart(bx, by, bz, ox, oz, SMOKE, 1, r.vx, r.vz)
          }
          else fx.fart(bx, by, bz, ox, oz, FART_COLORS[seat], p.buff === BUFF_CODE.beans ? 1.35 : 1, r.vx, r.vz)
        }
      }

      const arrow = arrows.current[seat]
      if (arrow) {
        const local = !menu && localIds.includes(p.id) && r.st === RAFT_STATE.float && v.phase !== 'finished' && r.res === RAFT_RESULT.none
        arrow.visible = local
        if (local) {
          const push = alpha + Math.PI
          arrow.position.set(r.x + Math.cos(push) * 2.45, r.y + 0.08, r.z + Math.sin(push) * 2.45)
          arrow.rotation.y = -push - Math.PI / 2
          const pulse = farting ? 1.15 + Math.sin(t * 25) * 0.08 : 1
          arrow.scale.setScalar(pulse)
          arrowMats[seat].opacity = farting ? 0.95 : p.exh ? 0.25 : 0.55
        }
      }
    }

    spreadTags(tagSpots)
    for (const s of tagSpots) {
      if (s.tag) s.tag.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px)`
      if (s.bubble) s.bubble.style.transform = `translate(-50%, -100%) translate(${s.x}px, ${s.y - 16}px)`
    }
  })

  return (
    <>
      <group ref={root} visible={false}>
        <group ref={tilt}>
          <group ref={raftBody}>
            <RaftHull index={index} parts={{ band, belt, rope, pennant, flag, slices }} />
          </group>
          {SEAT_COLORS.map((color, seat) => (
            <group
              key={seat}
              ref={(g) => {
                holders.current[seat] = g
              }}
              visible={false}
            >
              <group scale={HIPPO_SCALE}>
                <Hippo
                  ref={(h) => {
                    hippos.current[seat] = h
                  }}
                  color={color}
                  seat={seat}
                />
              </group>
            </group>
          ))}
        </group>
      </group>
      <group ref={shadow}>
        <BlobShadow size={4.6} opacity={0.32} />
      </group>
      {SEAT_COLORS.map((_, seat) => (
        <group
          key={seat}
          ref={(g) => {
            arrows.current[seat] = g
          }}
          visible={false}
        >
          <mesh geometry={arrowGeo} material={arrowMats[seat]} renderOrder={3} />
        </group>
      ))}
    </>
  )
}

function isFarting(p: PlayerSnap, raftState: RaftStateCode, localIds: number[]) {
  if (raftState !== RAFT_STATE.float) return false
  if (p.fart) return true
  return localIds.includes(p.id) && frame.localFart.get(p.id) === true && p.exh === 0 && p.stam > 0.02
}

/** Before a race a rival raft's tag says who's on it, so friends can find each other: "Kabir, Mira +1". */
function crewNames(crew: PlayerSnap[]) {
  const roster = useApp.getState().sessionInfo?.roster ?? []
  return crewLabel(crew.map((p) => roster.find((o) => o.id === p.id)?.name ?? ''))
}

/** Nudges crewmates' name tags apart sideways where they would overlap, as two hippos side by side at the back do. */
function spreadTags(spots: TagSpot[]) {
  // Measured together, after every tag's text is set: one layout per frame rather than one per hippo.
  const tags = spots
    .flatMap((s) => (s.tag ? [{ s, w: s.tag.offsetWidth, h: s.tag.offsetHeight }] : []))
    .sort((a, b) => a.s.x - b.s.x)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < tags.length; i++) {
      const a = tags[i - 1]
      const b = tags[i]
      if (Math.abs(a.s.y - b.s.y) >= (a.h + b.h) / 2) continue
      const overlap = (a.w + b.w) / 2 + TAG_GAP - (b.s.x - a.s.x)
      if (overlap <= 0) continue
      a.s.x -= overlap / 2
      b.s.x += overlap / 2
    }
  }
}

function elasticOut(x: number) {
  if (x >= 1) return 1
  return 2 ** (-10 * x) * Math.sin(((x * 10 - 0.75) * (2 * Math.PI)) / 3) + 1
}
