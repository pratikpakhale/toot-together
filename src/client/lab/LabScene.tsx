import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getCourse } from '../../sim/courses'
import { rimSector } from '../../sim/sectors'
import { pointAt } from '../../sim/track'
import { audio } from '../audio/audio'
import { frame, SEAT_COLORS, TEAMS } from '../game/frame'
import { Decor } from '../scene/Decor'
import { Environment } from '../scene/Environment'
import { FxLayer, fx } from '../scene/Fx'
import { Gates } from '../scene/Gates'
import { Hippo, type HippoHandle } from '../scene/Hippo'
import { PALETTE, soft } from '../scene/materials'
import { Obstacles } from '../scene/Obstacles'
import { RaftHull } from '../scene/RaftHull'
import { HIPPO_SCALE, hullKit, SEAT_R, SEAT_Y, SLICE_GAP, vinyl } from '../scene/raftKit'
import { lumps, paint, smoothstep } from '../scene/sculpt'
import { BlobShadow } from '../scene/shadow'
import { Track } from '../scene/Track'
import { THEMES, type Theme } from '../scene/themes'
import { type Exhibit, exhibitById, livePose, poseAt, useLab } from './labState'
import { FOCUS_S, riverFor, showcaseCourse } from './showcase'

/** Where hippos stand on the island, above the water. */
const ISLAND_TOP = 0.35
const FART = SEAT_COLORS.map((c) => '#' + new THREE.Color(PALETTE.fart).lerp(new THREE.Color(c), 0.3).getHexString())
const SMOKE = '#5e4a46'
const butt = new THREE.Vector3()
const dir = new THREE.Vector3()

export function LabScene({ shadows }: { shadows: boolean }) {
  const exhibit = exhibitById(useLab((s) => s.exhibit))
  const theme = useLab((s) => s.theme)
  const course = exhibit.stage === 'river' ? getCourse(riverFor(theme).id) : showcaseCourse(exhibit.stage, theme)
  const s = exhibit.stage === 'river' ? course.startS + 24 : FOCUS_S
  const p = pointAt(course, s)
  const focus = useMemo(() => new THREE.Vector3(p.x, p.y, p.z), [p.x, p.y, p.z])

  return (
    <>
      <SimClock />
      <Environment course={course} shadows={shadows} focus={focus} />
      <Track course={course} />
      <Decor course={course} />
      <Obstacles course={course} />
      <Gates course={course} />
      <FxLayer />
      {/* The exhibit's own frame: origin at the focus, +x downstream, +z towards the right bank. */}
      <group position={focus} rotation={[0, -p.heading, 0]}>
        <Stage exhibit={exhibit} theme={THEMES[theme]} />
      </group>
      <Camera key={`${exhibit.id}-${course.def.id}`} exhibit={exhibit} focus={focus} heading={p.heading} />
    </>
  )
}

/**
 * Hazards and gates run on the sim clock in frame.view; the lab has no session, so it feeds them one:
 * a race in progress with no rafts on it.
 */
function SimClock() {
  useFrame(({ clock }) => {
    audio.update()
    frame.view = { t: clock.elapsedTime, tick: 0, phase: 'racing', raceTime: 0, goAt: 0, closeAt: 0, rafts: [], players: [], pickups: [] }
  }, -20)
  useEffect(
    () => () => {
      frame.view = null
      audio.stopAllFarts()
    },
    [],
  )
  return null
}

function Stage({ exhibit, theme }: { exhibit: Exhibit; theme: Theme }) {
  const seat = useLab((s) => s.seat)
  const yaw = exhibit.view.yaw
  switch (exhibit.id) {
    case 'crew':
      return (
        <>
          <Island theme={theme} />
          {SEAT_COLORS.map((color, i) => (
            <group key={color} position={[(i - 1.5) * 1.7, ISLAND_TOP, 0]} rotation={[0, -yaw, 0]}>
              <PosedHippo color={color} seat={i} />
            </group>
          ))}
        </>
      )
    case 'hippo':
      return (
        <>
          <Island theme={theme} />
          <group position={[0, ISLAND_TOP, 0]} rotation={[0, -yaw, 0]}>
            <PosedHippo key={seat} color={SEAT_COLORS[seat]} seat={seat} />
          </group>
        </>
      )
    case 'raft':
    case 'river':
      return <ShowRaft crew={4} />
    case 'hull':
      return <ShowRaft crew={0} />
    case 'race':
      return (
        <>
          {TEAMS.map((_, team) => (
            <ShowRaft key={team} team={team} crew={team + 1} position={[team % 2 ? 2.6 : -2.6, 0, team < 2 ? -2.6 : 2.6]} />
          ))}
        </>
      )
    default:
      return null
  }
}

function PosedHippo({ color, seat }: { color: string; seat: number }) {
  const hippo = useRef<HippoHandle>(null)
  const root = useRef<THREE.Group>(null!)
  useCastShadows(root)
  useFrame(({ clock }) => hippo.current?.pose(poseAt(clock.elapsedTime, livePose(useLab.getState()))))
  useGas(() => [{ body: root.current, seat }])
  return (
    <group ref={root}>
      <Hippo ref={hippo} color={color} seat={seat} />
    </group>
  )
}

/** Everything under `root` casts sun shadows. */
function useCastShadows(root: React.RefObject<THREE.Object3D | null>) {
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  })
}

/** A grassy islet with a sandy rim for the hippos to stand on. */
function Island({ theme }: { theme: Theme }) {
  const geometry = useMemo(() => {
    const profile = [
      [0, ISLAND_TOP],
      [3.4, ISLAND_TOP],
      [3.9, ISLAND_TOP - 0.06],
      [4.4, 0.05],
      [4.9, -0.3],
      [5.2, -0.8],
    ]
      // Outside in, so the lathe's faces point up and out.
      .reverse()
      .map(([r, y]) => new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(profile, 64)
    // A wobbly shoreline, so it reads as land rather than a turned dish.
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const a = Math.atan2(z, x)
      const k = 1 + lumps(Math.cos(a) * 2, 0, Math.sin(a) * 2, 5) * 0.08
      pos.setX(i, x * k)
      pos.setZ(i, z * k)
    }
    g.computeVertexNormals()
    const grass = new THREE.Color(theme.bank.shelf)
    const sand = new THREE.Color(theme.bank.wall).lerp(new THREE.Color('#f3dfb4'), 0.35)
    return paint(g, (p, _n, out) => {
      const r = Math.hypot(p.x, p.z)
      out.copy(sand).lerp(grass, smoothstep(4.0, 3.5, r) * (0.92 + 0.08 * lumps(p.x * 0.8, 0, p.z * 0.8, 2)))
    })
  }, [theme])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={soft('#ffffff', { vertexColors: true, rim: 0 })} receiveShadow />
}

/** A raft with its crew, bobbing on the water and tooting when the pose says so. Race rafts wear team colours. */
function ShowRaft({ crew, team, position = [0, 0, 0] }: { crew: number; team?: number; position?: [number, number, number] }) {
  const root = useRef<THREE.Group>(null!)
  const tilt = useRef<THREE.Group>(null!)
  const band = useRef<THREE.Mesh>(null)
  const belt = useRef<THREE.Mesh>(null)
  const rope = useRef<THREE.Group>(null)
  const pennant = useRef<THREE.Group>(null)
  const flag = useRef<THREE.Mesh>(null)
  const slices = useRef<(THREE.Mesh | null)[]>([])
  const hippos = useRef<(HippoHandle | null)[]>([])
  const bodies = useRef<(THREE.Group | null)[]>([])
  const rims = useMemo(() => {
    const seats = Array.from({ length: crew }, (_, i) => i)
    return seats.map((seat) => rimSector(seat, seats)?.center ?? Math.PI)
  }, [crew])
  const race = team !== undefined
  useCastShadows(root)
  // Gas from every other hippo, so the crew stays visible through it.
  useGas(() => rims.map((_, seat) => ({ body: bodies.current[seat], seat, gassy: seat % 2 === 0 })))

  useLayoutEffect(() => {
    if (!race) return
    belt.current!.visible = true
    rope.current!.visible = false
    pennant.current!.visible = true
    band.current!.material = vinyl(TEAMS[team].color)
    const geo = hullKit.slices[crew]
    rims.forEach((rim, seat) => {
      const slice = slices.current[seat]
      if (!slice || !geo) return
      slice.geometry = geo
      slice.visible = true
      slice.rotation.set(Math.PI / 2, 0, rim - ((Math.PI * 2) / crew - SLICE_GAP) / 2)
    })
  }, [race, team, crew, rims])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + (team ?? 0) * 1.3
    tilt.current.rotation.set(Math.sin(t * 1.7) * 0.02, 0, Math.cos(t * 1.3) * 0.02)
    tilt.current.position.y = Math.sin(t * 2.1) * 0.04
    if (flag.current) flag.current.rotation.y = Math.sin(t * 6) * 0.25
    const pose = livePose(useLab.getState())
    for (const h of hippos.current) h?.pose(poseAt(clock.elapsedTime, pose))
  })

  return (
    <group position={position}>
      <BlobShadow size={4.6} opacity={0.32} />
      <group ref={root}>
        <group ref={tilt}>
          <RaftHull index={team ?? 0} parts={{ band, belt, rope, pennant, flag, slices }} />
          {rims.map((rim, seat) => (
            <group
              key={seat}
              ref={(g) => {
                bodies.current[seat] = g
              }}
              position={[Math.cos(rim) * SEAT_R, SEAT_Y, Math.sin(rim) * SEAT_R]}
              rotation={[0, -(rim + Math.PI), 0]}
              scale={HIPPO_SCALE}
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
    </group>
  )
}

/**
 * Gas from each hippo while it toots, and its toot out loud while TOOT is held. `body` is the hippo's own
 * group (it faces +x); `gassy: false` keeps a hippo's gas in. Voices are one per seat colour, so even the
 * race rafts make four.
 */
function useGas(hippos: () => { body: THREE.Object3D | null; seat: number; gassy?: boolean }[]) {
  const gas = useRef({ emit: 0, tooting: false })
  const voices = useRef(new Set<string>())

  useEffect(
    () => () => {
      for (const key of voices.current) audio.fartStop(key)
    },
    [],
  )

  useFrame((_, dt) => {
    const lab = useLab.getState()
    const pose = livePose(lab)
    const tooting = pose === 'toot' || pose === 'chili'
    const start = tooting && !gas.current.tooting
    gas.current.tooting = tooting
    const list = hippos()

    for (const { seat } of list) {
      const key = `lab-${seat}`
      if (!lab.tooting) {
        audio.fartStop(key)
        voices.current.delete(key)
      } else if (!audio.isFarting(key)) {
        audio.fartStart(key, seat, { kind: pose === 'chili' ? 'chili' : 'normal' })
        voices.current.add(key)
      }
    }

    if (!tooting) return
    gas.current.emit += Math.min(dt, 0.05) * 30
    while (gas.current.emit >= 1 || start) {
      for (const { body, seat, gassy = true } of list) {
        if (!body || !gassy) continue
        body.updateWorldMatrix(true, false)
        butt.set(-0.66, 0.62, 0).applyMatrix4(body.matrixWorld)
        dir.set(-1, 0, 0).transformDirection(body.matrixWorld)
        if (pose === 'chili') {
          fx.flame(butt.x, butt.y, butt.z, dir.x, dir.z)
          if (Math.random() < 0.25) fx.fart(butt.x, butt.y, butt.z, dir.x, dir.z, SMOKE)
        } else {
          if (start) fx.tootStart(butt.x, butt.y, butt.z, dir.x, dir.z, FART[seat])
          fx.fart(butt.x, butt.y, butt.z, dir.x, dir.z, FART[seat])
        }
      }
      if (start) break
      gas.current.emit -= 1
    }
  })
}

/** Orbit camera (drag, pinch, scroll; auto-turns until you grab it), placed for each exhibit. */
function Camera({ exhibit, focus, heading }: { exhibit: Exhibit; focus: THREE.Vector3; heading: number }) {
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const controls = useRef<OrbitControls | null>(null)

  // Built and disposed in one effect: controls listen on the canvas as soon as they exist, so a pair
  // made in a memo (twice under StrictMode) leaves a stray one fighting over the camera.
  useEffect(() => {
    const c = new OrbitControls(camera, dom)
    c.enableDamping = true
    c.autoRotateSpeed = 2
    c.minDistance = 2
    c.maxDistance = 90
    c.maxPolarAngle = 1.48
    c.addEventListener('start', () => useLab.getState().set({ spin: false }))
    const { dist, lift, pitch, yaw } = exhibit.view
    // The bearing is in the exhibit's frame (0 = from downstream, looking up it); turn it into the world's.
    const a = yaw + heading
    c.target.set(focus.x, focus.y + lift, focus.z)
    camera.position.set(
      focus.x + Math.cos(a) * Math.cos(pitch) * dist,
      focus.y + lift + Math.sin(pitch) * dist,
      focus.z + Math.sin(a) * Math.cos(pitch) * dist,
    )
    c.update()
    controls.current = c
    return () => {
      c.dispose()
      controls.current = null
    }
  }, [camera, dom, exhibit, focus, heading])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    c.autoRotate = useLab.getState().spin
    c.update(dt)
  })
  return null
}
