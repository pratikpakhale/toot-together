import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAX_PLAYERS } from '../../sim/constants'
import { rimSector } from '../../sim/sectors'
import { pointAt, type BakedCourse } from '../../sim/track'
import { BUFF_CODE, RAFT_STATE, type PlayerSnap, type RaftStateCode } from '../../sim/types'
import { audio } from '../audio/audio'
import { frame, SEAT_COLORS } from '../game/frame'
import { useApp } from '../state/store'
import type { IconName } from '../ui/icons'
import { setTagContent } from '../ui/NameTags'
import { fx } from './Fx'
import { Hippo, type HippoHandle } from './Hippo'
import { PALETTE, toon, toonGradient } from './materials'
import { BlobShadow } from './shadow'

const HIPPO_R = 1.08
const BUTT_R = HIPPO_R + 0.66
const FLOOR_Y = 0.14
const PUFF_RATE = 30
const BUFF_ICON: (IconName | null)[] = [null, 'beans', 'chili', 'prune']
const tagPos = new THREE.Vector3()
const SLICE_GAP = 0.08

const FART_COLORS = SEAT_COLORS.map((c) => '#' + new THREE.Color(PALETTE.fart).lerp(new THREE.Color(c), 0.3).getHexString())
const FIRE = ['#ff5a1f', '#ffb21f', '#ff3b2f']
const FART_KEYS = SEAT_COLORS.map((_, seat) => `p${seat}`)

function plankTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const planks = 7
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = i % 2 ? PALETTE.raftFloor : '#8cc650'
    ctx.fillRect(0, (i * 256) / planks, 256, 256 / planks)
    ctx.fillStyle = '#6fa23f'
    ctx.fillRect(0, (i * 256) / planks, 256, 4)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function Raft({ course }: { course: BakedCourse }) {
  const info = useApp((s) => s.sessionInfo)
  const session = useApp((s) => s.session)
  const roster = info?.roster ?? []
  const localIds = useMemo(() => session?.localPlayers.map((p) => p.id) ?? [], [session, info])
  const root = useRef<THREE.Group>(null!)
  const tilt = useRef<THREE.Group>(null!)
  const raftBody = useRef<THREE.Group>(null!)
  const shadow = useRef<THREE.Group>(null!)
  const hippos = useRef<(HippoHandle | null)[]>([])
  const holders = useRef<(THREE.Group | null)[]>([])
  const camera = useThree((s) => s.camera)
  const menu = useApp((s) => s.screen !== 'game')
  const arrows = useRef<(THREE.Group | null)[]>([])
  const slices = useRef<(THREE.Mesh | null)[]>([])
  const sliceGeos = useMemo(
    () => Array.from({ length: MAX_PLAYERS + 1 }, (_, n) => (n < 2 ? null : new THREE.TorusGeometry(1.45, 0.352, 12, 40, (Math.PI * 2) / n - SLICE_GAP))),
    [],
  )
  const arrowMats = useMemo(
    () => SEAT_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, depthWrite: false })),
    [],
  )
  const floorMat = useMemo(() => new THREE.MeshToonMaterial({ map: plankTexture(), gradientMap: toonGradient() }), [])
  const state = useRef({
    emit: [0, 0, 0, 0],
    wake: 0,
    tiltX: 0,
    tiltZ: 0,
  })

  const arrowGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0.55)
    s.lineTo(0.5, -0.05)
    s.lineTo(0.18, -0.05)
    s.lineTo(0.18, -0.5)
    s.lineTo(-0.18, -0.5)
    s.lineTo(-0.18, -0.05)
    s.lineTo(-0.5, -0.05)
    s.closePath()
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
  }, [])

  useEffect(
    () => () => {
      for (const g of sliceGeos) g?.dispose()
      for (const m of arrowMats) m.dispose()
      floorMat.map?.dispose()
      floorMat.dispose()
      arrowGeo.dispose()
    },
    [sliceGeos, arrowMats, floorMat, arrowGeo],
  )

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const v = frame.view
    if (!v) return
    const t = clock.elapsedTime
    const r = v.raft
    const st = state.current
    const showPlayers = v.players.length > 1 && !menu

    root.current.position.set(r.x, r.y, r.z)
    root.current.rotation.y = -r.a

    let tx = 0
    let tz = 0
    for (const p of v.players) {
      if (!isFarting(p, r.st, localIds)) continue
      const ang = p.rim + Math.PI
      tx += Math.cos(ang)
      tz += Math.sin(ang)
    }
    st.tiltX = THREE.MathUtils.damp(st.tiltX, tz * 0.05, 6, dt)
    st.tiltZ = THREE.MathUtils.damp(st.tiltZ, -tx * 0.05, 6, dt)
    tilt.current.rotation.set(st.tiltX + Math.sin(t * 1.7) * 0.02, 0, st.tiltZ + Math.cos(t * 1.3) * 0.02)
    tilt.current.position.y = Math.sin(t * 2.1) * 0.04

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
    audio.setWater(Math.min(1, speed / 9 + (course.slope[r.i] > 0.05 ? 0.6 : 0)))

    const bySeat: (PlayerSnap | undefined)[] = []
    for (const p of v.players) bySeat[p.seat] = p
    const seats = v.players.map((p) => p.seat)
    const sliceGeo = sliceGeos[seats.length]

    for (let seat = 0; seat < MAX_PLAYERS; seat++) {
      const p = bySeat[seat]
      const slice = slices.current[seat]
      const sector = p && sliceGeo && showPlayers ? rimSector(seat, seats) : null
      if (slice) {
        slice.visible = !!sector
        if (sector && sliceGeo) {
          slice.geometry = sliceGeo
          slice.rotation.set(Math.PI / 2, 0, sector.center - ((Math.PI * 2) / seats.length - SLICE_GAP) / 2)
        }
      }
      const holder = holders.current[seat]
      const hippo = hippos.current[seat]
      if (!holder || !hippo) continue
      holder.visible = !!p
      const tag = frame.tagEls[seat]
      const bubble = frame.bubbleEls[seat]
      const tagVisible = !!p && showPlayers && r.st !== RAFT_STATE.popped
      const arrow = arrows.current[seat]
      if (!p) {
        if (tag) tag.style.display = 'none'
        if (bubble) bubble.style.display = 'none'
        audio.fartStop(FART_KEYS[seat])
        if (arrow) arrow.visible = false
        continue
      }

      const farting = isFarting(p, r.st, localIds)
      const ca = Math.cos(p.rim)
      const sa = Math.sin(p.rim)
      if (r.st === RAFT_STATE.popped) {
        const k = r.stT
        const out = HIPPO_R + k * 4.5
        const y = FLOOR_Y + 7 * k - 12 * k * k
        holder.position.set(ca * out, Math.max(-2, y), sa * out)
        holder.rotation.set(k * 9 * (seat % 2 ? 1 : -1), -(p.rim + Math.PI), k * 6)
        holder.visible = y > -1.6
      } else {
        holder.position.set(ca * HIPPO_R, FLOOR_Y, sa * HIPPO_R)
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
        celebrate: v.phase === 'finished',
      })

      if (tag) {
        if (tagVisible) {
          const name = roster.find((e) => e.id === p.id)?.name ?? ''
          const icons: IconName[] = []
          const buff = BUFF_ICON[p.buff]
          if (buff) icons.push(buff)
          if (p.exh) icons.push('hippoTired')
          setTagContent(tag, icons, name)
          holder.getWorldPosition(tagPos)
          tagPos.y += 2.05
          tagPos.project(camera)
          const display = tagPos.z < 1 ? 'block' : 'none'
          const x = ((tagPos.x + 1) / 2) * window.innerWidth
          const y = ((1 - tagPos.y) / 2) * window.innerHeight
          tag.style.display = display
          tag.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`
          if (bubble) {
            bubble.style.display = display
            bubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 16}px)`
          }
        } else {
          tag.style.display = 'none'
          if (bubble) bubble.style.display = 'none'
        }
      }

      const alpha = r.a + p.rim
      const ox = Math.cos(alpha)
      const oz = Math.sin(alpha)
      const fartKey = FART_KEYS[seat]
      if (!farting) audio.fartStop(fartKey)
      else if (!audio.isFarting(fartKey)) audio.fartStart(fartKey, seat, { pan: seat % 2 ? 0.3 : -0.3, kind: p.buff === BUFF_CODE.chili ? 'chili' : 'normal' })

      if (farting) {
        st.emit[seat] += dt * PUFF_RATE * (p.buff === BUFF_CODE.beans ? 1.5 : 1)
        const bx = r.x + ox * BUTT_R
        const by = r.y + FLOOR_Y + 0.62
        const bz = r.z + oz * BUTT_R
        while (st.emit[seat] >= 1) {
          st.emit[seat] -= 1
          if (p.sync) fx.rainbowFart(bx, by, bz, ox, oz)
          else if (p.buff === BUFF_CODE.chili) fx.fart(bx, by, bz, ox, oz, FIRE[Math.floor(Math.random() * 3)], 1.2, r.vx, r.vz)
          else fx.fart(bx, by, bz, ox, oz, FART_COLORS[seat], p.buff === BUFF_CODE.beans ? 1.35 : 1, r.vx, r.vz)
        }
      }

      if (arrow) {
        const local = !menu && localIds.includes(p.id) && r.st === RAFT_STATE.float && v.phase !== 'finished'
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
  })

  return (
    <>
      <group ref={root}>
        <group ref={tilt}>
          <group ref={raftBody}>
            <mesh position={[0, 0.07, 0]} material={floorMat}>
              <cylinderGeometry args={[1.32, 1.32, 0.14, 28]} />
            </mesh>
            <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]} material={toon(PALETTE.raftRing)}>
              <torusGeometry args={[1.45, 0.34, 14, 36]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={toon(PALETTE.raftBand)}>
              <torusGeometry args={[1.5, 0.2, 10, 36]} />
            </mesh>
            {SEAT_COLORS.map((color, seat) => (
              <mesh
                key={seat}
                ref={(m) => {
                  slices.current[seat] = m
                }}
                position={[0, 0.22, 0]}
                material={toon(new THREE.Color(PALETTE.raftRing).lerp(new THREE.Color(color), 0.7))}
                visible={false}
              />
            ))}
            {[0, 1, 2, 3].map((k) => {
              const a = Math.PI / 4 + (k * Math.PI) / 2
              return (
                <mesh
                  key={k}
                  position={[Math.cos(a) * 1.45, 0.5, Math.sin(a) * 1.45]}
                  rotation={[0, -a + Math.PI / 2, 0]}
                  material={toon(PALETTE.raftHandle)}
                >
                  <torusGeometry args={[0.2, 0.07, 8, 14, Math.PI]} />
                </mesh>
              )
            })}
          </group>
          {Array.from({ length: MAX_PLAYERS }, (_, seat) => (
            <group
              key={seat}
              ref={(g) => {
                holders.current[seat] = g
              }}
              visible={false}
            >
              <Hippo
                ref={(h) => {
                  hippos.current[seat] = h
                }}
                color={SEAT_COLORS[seat]}
                seat={seat}
              />
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

function elasticOut(x: number) {
  if (x >= 1) return 1
  return 2 ** (-10 * x) * Math.sin(((x * 10 - 0.75) * (2 * Math.PI)) / 3) + 1
}
