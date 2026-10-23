import { Component, type ReactNode } from 'react'
import { Icon } from './Icon'

export function FatalScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper p-4">
      <div className="panel w-[min(440px,100%)] p-6 text-center anim-pop">
        <Icon name="hippoOops" size={84} />
        <div className="font-display mt-2 text-3xl">{title}</div>
        <p className="mt-2 font-extrabold text-ink/70">{message}</p>
        <button className="btn btn-green mt-5 w-full text-xl" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  )
}

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (this.state.error) return <FatalScreen title="The raft sprang a leak" message="Something went wrong. Reload to jump back in." />
    return this.props.children
  }
}
