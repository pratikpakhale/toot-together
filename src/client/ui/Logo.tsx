import { Icon } from './Icon'

export function Logo({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const big = size === 'lg'
  return (
    <div className="relative inline-block select-none -rotate-3 anim-float" aria-label="Toot Together">
      <div className="flex items-center gap-[0.12em]" style={{ fontSize: big ? 'clamp(44px, min(9vw, 13vh), 124px)' : '56px' }}>
        <div
          className="font-display stroke-text leading-[0.85]"
          style={{
            color: '#a6e84a',
            backgroundImage: 'linear-gradient(#d8ff7a, #8fd636 55%, #5faa1f)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 6px 0 var(--color-ink))',
          }}
        >
          TOOT
        </div>
        <Icon name="toot" size="0.62em" className="anim-wobble" />
      </div>
      <div
        className="font-display stroke-text leading-[0.9] text-white"
        style={{ fontSize: big ? 'clamp(28px, min(5.6vw, 8vh), 76px)' : '34px', filter: 'drop-shadow(0 5px 0 var(--color-ink))', marginTop: big ? -6 : -2 }}
      >
        TOGETHER
      </div>
    </div>
  )
}
