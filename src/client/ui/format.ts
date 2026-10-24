export function formatTime(t: number, digits: 1 | 2 = 2) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const frac = Math.floor((t * 10 ** digits) % 10 ** digits)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(frac).padStart(digits, '0')}`
}

export function formatMedalTime(t: number) {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function ordinal(n: number) {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suffix}`
}

/** A crew at a glance, as on rival raft tags: "Kabir, Mira +1". */
export const crewLabel = (names: string[]) => (names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '))
