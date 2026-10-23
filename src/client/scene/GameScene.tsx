import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { getCourse } from '../../sim/courses'
import { isTouch } from '../platform'
import { useApp } from '../state/store'
import { CameraRig } from './CameraRig'
import { Decor } from './Decor'
import { Driver } from './Driver'
import { Environment } from './Environment'
import { FxLayer } from './Fx'
import { Gates } from './Gates'
import { Obstacles } from './Obstacles'
import { Raft } from './Raft'
import { Track } from './Track'

function ContextWatch() {
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    const listeners = new AbortController()
    const { signal } = listeners
    let lost = false
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      if (!lost || document.hidden) return
      timer = window.setTimeout(() => {
        useApp.getState().setNotice({ title: 'Graphics hiccup', message: 'Your device paused the 3D view. Reload the page to get the river back.' })
      }, 3000)
    }
    canvas.addEventListener(
      'webglcontextlost',
      () => {
        lost = true
        arm()
      },
      { signal },
    )
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        lost = false
        window.clearTimeout(timer)
      },
      { signal },
    )
    document.addEventListener('visibilitychange', arm, { signal })
    return () => {
      listeners.abort()
      window.clearTimeout(timer)
    }
  }, [canvas])
  return null
}

const MAX_DPR = isTouch ? 1.5 : 2

export function GameScene() {
  const screen = useApp((s) => s.screen)
  const quality = useApp((s) => s.settings.quality)
  const courseId = useApp((s) => s.sessionInfo?.courseId)
  const course = getCourse(courseId)
  const mode = screen === 'game' ? 'game' : 'menu'
  return (
    <Canvas
      key={quality}
      className="!fixed inset-0"
      flat
      dpr={quality === 'high' ? [1, MAX_DPR] : [0.75, 1]}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 55, near: 0.2, far: 1400, position: [0, 8, -12] }}
      onCreated={(state) => {
        if (import.meta.env.DEV) Object.assign(window, { __gl: state.gl })
      }}
    >
      <ContextWatch />
      <Suspense fallback={null}>
        <Driver mode={mode} />
        <Environment course={course} />
        <Track course={course} />
        <Decor course={course} />
        <Gates course={course} />
        <Obstacles course={course} />
        <Raft course={course} />
        <FxLayer />
        <CameraRig course={course} mode={mode} />
      </Suspense>
    </Canvas>
  )
}
