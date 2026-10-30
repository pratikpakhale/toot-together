const INK = '#1c3557'
const O = `stroke="${INK}" stroke-width="4"`
const O3 = `stroke="${INK}" stroke-width="3"`

const r1 = (n: number) => Math.round(n * 10) / 10

function blob(shapes: string[], fill: string) {
  const els = shapes.map((s) => `<${s}/>`).join('')
  return `<g fill="${INK}" stroke="${INK}" stroke-width="8">${els}</g><g fill="${fill}">${els}</g>`
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number, rotDeg = -90) {
  const out: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = ((rotDeg + (i * 180) / points) * Math.PI) / 180
    const rad = i % 2 ? inner : outer
    out.push(`${r1(cx + Math.cos(a) * rad)},${r1(cy + Math.sin(a) * rad)}`)
  }
  return out.join(' ')
}

const shine = (cx: number, cy: number, rx: number, ry: number, rot = -30, opacity = 0.6) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="${opacity}"/>`

type Mood = 'happy' | 'devil' | 'oops' | 'tired' | 'grumpy' | 'meh' | 'love'

function hippo(mood: Mood, color = '#4aa8ff') {
  const skin = `style="fill:var(--hippo,${color})"`
  let s = ''
  if (mood === 'devil') {
    const horn = `<path d="M13 21C7 15 7 7 11 1c2 7 7 10 12 12z" fill="#c4264f" ${O3}/>`
    s += horn + `<g transform="matrix(-1 0 0 1 64 0)">${horn}</g>`
  }
  s += `<circle cx="17" cy="15" r="6" ${skin} ${O}/><circle cx="47" cy="15" r="6" ${skin} ${O}/>`
  s += `<circle cx="17" cy="15" r="2.6" fill="#ff8fa3"/><circle cx="47" cy="15" r="2.6" fill="#ff8fa3"/>`
  s += `<ellipse cx="32" cy="29" rx="20" ry="17" ${skin} ${O}/>`
  s += shine(32, 16, 7, 2.4, 0, 0.45)
  s += `<ellipse cx="32" cy="44" rx="23" ry="14" ${skin} ${O}/><ellipse cx="32" cy="44" rx="21" ry="12" fill="#fff" opacity=".3"/>`
  s += `<ellipse cx="24" cy="40" rx="2.4" ry="3.4" fill="${INK}"/><ellipse cx="40" cy="40" rx="2.4" ry="3.4" fill="${INK}"/>`
  s += `<ellipse cx="13" cy="47" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".9"/><ellipse cx="51" cy="47" rx="3.6" ry="2.2" fill="#ff8fa3" opacity=".9"/>`

  const heart = (x: number, y: number) =>
    `<path d="M${x} ${y + 6}c-6-4-8-7-8-10a4 4 0 0 1 8-1.5 4 4 0 0 1 8 1.5c0 3-2 6-8 10z" fill="#ff5b8a" ${O3}/>`
  const eye = (x: number, px: number, py: number) =>
    `<circle cx="${x}" cy="25" r="5.5" fill="#fff" ${O3}/><circle cx="${px}" cy="${py}" r="2.8" fill="${INK}"/><circle cx="${px + 1}" cy="${py - 1.2}" r="1" fill="#fff"/>`
  switch (mood) {
    case 'happy':
      s += eye(25, 26, 26) + eye(39, 40, 26)
      s += `<path d="M23 50q9 6 18 0" fill="none" ${O3}/>`
      break
    case 'devil':
      s += eye(25, 26.5, 26.5) + eye(39, 40.5, 26.5)
      s += `<path d="M18 17l12 5M46 17l-12 5" ${O}/>`
      s += `<path d="M23 48q11 6 19-3" fill="none" ${O3}/>`
      break
    case 'oops':
      s += eye(25, 25, 23.5) + eye(39, 39, 23.5)
      s += `<path d="M19 18l9-4M45 18l-9-4" ${O3}/>`
      s += `<ellipse cx="32" cy="51" rx="3.2" ry="3.8" fill="${INK}"/>`
      s += `<path d="M55 1c4 7 6 10 6 13a6 6 0 0 1-12 0c0-3 2-6 6-13z" fill="#7fd0ff" ${O3}/>`
      break
    case 'tired':
      s += `<path d="M20 26q5 4 10 0M34 26q5 4 10 0" fill="none" ${O3}/>`
      s += `<ellipse cx="32" cy="51" rx="5" ry="3.6" fill="${INK}"/><ellipse cx="33.5" cy="53" rx="2.6" ry="1.6" fill="#ff8fa3"/>`
      break
    case 'grumpy':
      s += eye(25, 26, 27) + eye(39, 38, 27)
      s += `<path d="M18 19l11 4M46 19l-11 4" ${O}/>`
      s += `<path d="M23 53q9-6 18 0" fill="none" ${O3}/>`
      break
    case 'meh':
      s += eye(25, 25, 26) + eye(39, 39, 26)
      s += `<path d="M24 51h16" ${O3}/>`
      break
    case 'love':
      s += heart(25, 25) + heart(39, 25)
      s += `<path d="M21 48q11 10 22 0z" fill="${INK}" ${O3}/>`
      break
  }
  return s
}

const CLOUD = [
  'circle cx="36" cy="24" r="12"',
  'circle cx="24" cy="32" r="11"',
  'circle cx="47" cy="31" r="11"',
  'circle cx="30" cy="43" r="11"',
  'circle cx="44" cy="42" r="11"',
]
const cloudAt = (dy: number) => CLOUD.map((c) => c.replace(/cy="(\d+)"/, (_, y) => `cy="${Number(y) + dy}"`))

const toot =
  `<path d="M3 23h8M2 33h8M4 43h7" stroke="${INK}" stroke-width="4"/>` +
  blob(cloudAt(0), '#9be23a') +
  `<path d="M27 34q3-4 6 0M38 33q3-4 6 0" fill="none" ${O3}/>` +
  `<ellipse cx="25" cy="39" rx="3" ry="1.8" fill="#ff8fa3" opacity=".9"/><ellipse cx="47" cy="38" rx="3" ry="1.8" fill="#ff8fa3" opacity=".9"/>` +
  shine(31, 20, 5, 2.6)

const stink =
  `<path d="M21 15c-3-3 3-5 0-8s3-4 0-6M33 13c-3-3 3-5 0-8M45 15c-3-3 3-5 0-8s3-4 0-6" fill="none" stroke="#5fa11f" stroke-width="3"/>` +
  blob(cloudAt(6), '#c4e86b') +
  `<path d="M23 33l6 6M29 33l-6 6M37 33l6 6M43 33l-6 6" ${O3}/>` +
  `<path d="M26 49q3-3 6 0t6 0" fill="none" ${O3}/>` +
  shine(31, 26, 5, 2.4)

const sneaky =
  blob(cloudAt(4), '#d9f2c4') +
  `<ellipse cx="27" cy="36" rx="5.5" ry="4.5" fill="#fff" ${O3}/><ellipse cx="41" cy="36" rx="5.5" ry="4.5" fill="#fff" ${O3}/>` +
  `<circle cx="30" cy="37.5" r="2.3" fill="${INK}"/><circle cx="44" cy="37.5" r="2.3" fill="${INK}"/>` +
  `<path d="M21.5 35h11M35.5 35h11" ${O3}/>` +
  `<path d="M28 47q5 2 9-1" fill="none" ${O3}/>` +
  shine(31, 24, 5, 2.4)

function flag(kind: 'start' | 'finish') {
  const x0 = 18
  const x1 = 56
  const h = 24
  const top = (x: number) => 10 + 3.2 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2)
  const edge = (a: number, b: number, off: number) => {
    const pts: string[] = []
    const steps = 12
    for (let i = 0; i <= steps; i++) {
      const x = a + ((b - a) * i) / steps
      pts.push(`${r1(x)},${r1(top(x) + off)}`)
    }
    return pts
  }
  const outline = `M${[...edge(x0, x1, 0), ...edge(x1, x0, h)].join('L')}Z`
  let s = `<rect x="11" y="7" width="7" height="54" rx="3.5" fill="#f4f1ea" ${O}/>`
  s += `<path d="${outline}" fill="${kind === 'start' ? '#ff5b8a' : '#fff'}"/>`
  if (kind === 'finish') {
    const cols = 5
    const rows = 3
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if ((c + r) % 2) continue
        const a = x0 + ((x1 - x0) * c) / cols
        const b = x0 + ((x1 - x0) * (c + 1)) / cols
        s += `<path d="M${[...edge(a, b, (h * r) / rows), ...edge(b, a, (h * (r + 1)) / rows)].join('L')}Z" fill="${INK}"/>`
      }
    }
  } else {
    s += `<path d="M${edge(x0 + 4, x1 - 4, 5).join('L')}" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/>`
  }
  s += `<path d="${outline}" fill="none" ${O}/>`
  s += `<circle cx="14.5" cy="7" r="5" fill="#ffcf3f" ${O}/>`
  return s
}

function medal(color: string, dark: string, n: number) {
  return (
    `<path d="M17 3h12l10 25H27z" fill="#ff5b8a" ${O}/><path d="M47 3H35L25 28h12z" fill="#4aa8ff" ${O}/>` +
    `<circle cx="32" cy="42" r="17" fill="${color}" ${O}/><circle cx="32" cy="42" r="11.5" fill="none" stroke="${dark}" stroke-width="3"/>` +
    `<text x="32" y="48.5" text-anchor="middle" font-family="Lilita One, system-ui, sans-serif" font-size="18" fill="${dark}">${n}</text>` +
    shine(24, 34, 4.5, 2.4, -40, 0.75)
  )
}

function keyboardKeys() {
  let s = ''
  for (let i = 0; i < 6; i++) s += `<rect x="${8.5 + i * 8}" y="21" width="6" height="6" rx="1.6" fill="#fff" stroke="${INK}" stroke-width="2"/>`
  for (let i = 0; i < 5; i++) s += `<rect x="${12.5 + i * 8}" y="29.5" width="6" height="6" rx="1.6" fill="#fff" stroke="${INK}" stroke-width="2"/>`
  return s + `<rect x="17" y="38.5" width="30" height="6" rx="2" fill="#9be23a" stroke="${INK}" stroke-width="2"/>`
}

const corners = (d: string) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="12"/><path d="${d}" fill="none" stroke="#ffcf3f" stroke-width="5"/>`

export const ICONS = {
  hippo: hippo('happy'),
  hippoDevil: hippo('devil', '#ff6b6b'),
  hippoOops: hippo('oops'),
  hippoTired: hippo('tired', '#b8c4d6'),
  hippoGrumpy: hippo('grumpy', '#ff8a5c'),
  hippoMeh: hippo('meh', '#ffcf3f'),
  hippoLove: hippo('love', '#ff7eb6'),
  toot,
  stink,
  sneaky,

  skull:
    blob(['circle cx="32" cy="27" r="20"', 'rect x="20" y="36" width="24" height="21" rx="6"'], '#fff8ec') +
    `<ellipse cx="24" cy="29" rx="5.5" ry="6.5" fill="${INK}"/><ellipse cx="40" cy="29" rx="5.5" ry="6.5" fill="${INK}"/>` +
    `<path d="M32 37l-3.5 5h7z" fill="${INK}" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M22 47h20M27 47v9M32 47v9M37 47v9" ${O3}/>` +
    shine(22, 15, 6, 2.6, -30, 0.9),

  flag: flag('start'),
  finishFlag: flag('finish'),

  link:
    `<g transform="rotate(-45 32 32)"><rect x="5" y="24" width="30" height="16" rx="8" fill="none" stroke="${INK}" stroke-width="10"/>` +
    `<rect x="29" y="24" width="30" height="16" rx="8" fill="none" stroke="${INK}" stroke-width="10"/>` +
    `<rect x="5" y="24" width="30" height="16" rx="8" fill="none" stroke="#4aa8ff" stroke-width="4"/>` +
    `<rect x="29" y="24" width="30" height="16" rx="8" fill="none" stroke="#7fd0ff" stroke-width="4"/></g>`,

  check:
    `<circle cx="32" cy="32" r="25" fill="#9be23a" ${O}/>` +
    `<path d="M19 33l9 9 17-19" fill="none" stroke="${INK}" stroke-width="12"/><path d="M19 33l9 9 17-19" fill="none" stroke="#fff" stroke-width="5"/>` +
    shine(22, 18, 6, 3),

  beans:
    `<rect x="15" y="14" width="34" height="45" rx="6" fill="#e3e9f2" ${O}/>` +
    `<rect x="17" y="25" width="30" height="22" fill="#ff9a3c"/><path d="M15 25h34M15 47h34" ${O3}/>` +
    [
      [25, 36, -20],
      [34, 33, 15],
      [40, 39, 30],
      [30, 41, -5],
    ]
      .map(
        ([x, y, a]) =>
          `<ellipse cx="${x}" cy="${y}" rx="4" ry="2.9" transform="rotate(${a} ${x} ${y})" fill="#b5562a" stroke="${INK}" stroke-width="2"/>`,
      )
      .join('') +
    `<ellipse cx="32" cy="14" rx="17" ry="5.5" fill="#cfd8e6" ${O}/>` +
    `<ellipse cx="27" cy="9" rx="4" ry="2.9" transform="rotate(-25 27 9)" fill="#b5562a" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="36" cy="7" rx="4" ry="2.9" transform="rotate(20 36 7)" fill="#b5562a" stroke="${INK}" stroke-width="2"/>` +
    `<rect x="20" y="18" width="4" height="36" rx="2" fill="#fff" opacity=".6"/>`,

  chili:
    `<path d="M27 17c-1-7 3-11 9-13" fill="none" stroke="${INK}" stroke-width="10"/><path d="M27 17c-1-7 3-11 9-13" fill="none" stroke="#5fa11f" stroke-width="4"/>` +
    `<path d="M20 18C10 30 18 53 52 57 41 48 35 36 35 22c-2-6-10-8-15-4z" fill="#ff3b2f" ${O}/>` +
    `<ellipse cx="27.5" cy="18" rx="9" ry="5" fill="#5fa11f" ${O}/>` +
    `<path d="M21 27c-2 9 3 18 13 23" fill="none" stroke="#fff" stroke-width="3.5" opacity=".6"/>`,

  prune:
    `<path d="M32 22q1-9 6-13" fill="none" ${O}/>` +
    `<circle cx="32" cy="39" r="20" fill="#7b4bc4" ${O}/>` +
    `<path d="M22 32q4 6 0 12M41 28q-3 8 2 14M29 50q6 2 12-2" fill="none" stroke="${INK}" stroke-width="2.5" opacity=".45"/>` +
    `<path d="M36 13C42 3 53 5 56 9c-6 6-13 8-20 4z" fill="#9be23a" ${O3}/>` +
    shine(24, 30, 5, 3, -35),

  trophy:
    `<path d="M17 15h-7c0 10 4 14 9 14M47 15h7c0 10-4 14-9 14" fill="none" stroke="${INK}" stroke-width="9"/>` +
    `<path d="M17 15h-7c0 10 4 14 9 14M47 15h7c0 10-4 14-9 14" fill="none" stroke="#ffcf3f" stroke-width="3.5"/>` +
    `<rect x="28" y="40" width="8" height="10" fill="#e6a51c" ${O}/>` +
    `<path d="M17 9h30v15c0 11-6 18-15 18s-15-7-15-18z" fill="#ffcf3f" ${O}/>` +
    `<polygon points="${starPoints(32, 24, 7.5, 3.2, 5)}" fill="#fff"/>` +
    `<path d="M22 13v10c0 4 1 7 3 10" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/>` +
    `<rect x="16" y="49" width="32" height="10" rx="3" fill="#9a5b34" ${O}/><rect x="25" y="52" width="14" height="4" rx="1" fill="#ffcf3f"/>`,

  medalGold: medal('#ffcf3f', '#c98a0c', 1),
  medalSilver: medal('#e3e9f2', '#8d9bb0', 2),
  medalBronze: medal('#f0a067', '#a8582a', 3),

  poop:
    blob(
      [
        'ellipse cx="32" cy="50" rx="24" ry="9"',
        'ellipse cx="32" cy="38" rx="18" ry="8"',
        'ellipse cx="32" cy="27" rx="11" ry="7"',
        'path d="M26 24C27 15 34 13 39 5c2 9 0 15-3 20z"',
      ],
      '#a0623a',
    ) +
    `<path d="M14 45q18 6 36 0M20 33q12 5 24 0" fill="none" stroke="${INK}" stroke-width="3" opacity=".5"/>` +
    `<circle cx="25" cy="39" r="4.2" fill="#fff" ${O3}/><circle cx="39" cy="39" r="4.2" fill="#fff" ${O3}/>` +
    `<circle cx="25" cy="40.5" r="2" fill="${INK}"/><circle cx="39" cy="40.5" r="2" fill="${INK}"/>` +
    `<path d="M27 53q5-4 10 0" fill="none" ${O3}/>` +
    shine(25, 22, 3.5, 2, -40),

  note:
    blob(
      [
        'ellipse cx="20" cy="49" rx="9" ry="7" transform="rotate(-20 20 49)"',
        'ellipse cx="45" cy="44" rx="9" ry="7" transform="rotate(-20 45 44)"',
        'rect x="24.5" y="15" width="5" height="35"',
        'rect x="49.5" y="9" width="5" height="35"',
        'path d="M24.5 14L54.5 6v10L24.5 24z"',
      ],
      '#9b6bf2',
    ) +
    shine(17, 46, 3.5, 2, -25) +
    shine(42, 41, 3.5, 2, -25),

  burst:
    `<polygon points="${starPoints(32, 32, 30, 17, 10, -72)}" fill="#ff9a3c" ${O}/>` +
    `<polygon points="${starPoints(32, 32, 18, 10, 10, -54)}" fill="#ffcf3f"/>` +
    `<circle cx="32" cy="32" r="5.5" fill="#fff"/>`,

  keyboard: `<rect x="3" y="15" width="58" height="35" rx="7" fill="#dfe6ef" ${O}/>` + keyboardKeys(),

  gamepad:
    blob(['rect x="8" y="17" width="48" height="25" rx="12.5"', 'circle cx="17" cy="38" r="11"', 'circle cx="47" cy="38" r="11"'], '#dfe6ef') +
    `<rect x="11.5" y="27.5" width="14" height="5" rx="1.5" fill="${INK}"/><rect x="16" y="23" width="5" height="14" rx="1.5" fill="${INK}"/>` +
    `<circle cx="45" cy="24.5" r="3.4" fill="#ffcf3f" stroke="${INK}" stroke-width="2"/><circle cx="51" cy="30" r="3.4" fill="#ff5b8a" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="39" cy="30" r="3.4" fill="#4aa8ff" stroke="${INK}" stroke-width="2"/><circle cx="45" cy="35.5" r="3.4" fill="#9be23a" stroke="${INK}" stroke-width="2"/>` +
    shine(22, 21, 6, 2, -8),

  couch:
    `<path d="M10 50v7M54 50v7" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="10" y="11" width="44" height="27" rx="9" fill="#ff9a3c" ${O}/>` +
    `<path d="M32 16v15" stroke="${INK}" stroke-width="3" opacity=".35"/>` +
    `<rect x="14" y="32" width="36" height="13" rx="4" fill="#ffb86e" ${O}/>` +
    `<rect x="3" y="25" width="13" height="26" rx="6.5" fill="#ff9a3c" ${O}/><rect x="48" y="25" width="13" height="26" rx="6.5" fill="#ff9a3c" ${O}/>` +
    shine(20, 17, 5, 2, -10),

  globe:
    `<circle cx="32" cy="32" r="26" fill="#5fbdf3" ${O}/>` +
    `<path d="M16 20C22 12 32 14 30 22c-1 6-8 6-6 12 1 5-6 6-10 0-3-5-2-10 2-14z" fill="#9be23a" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M38 34c6-4 14 0 12 8-2 7-10 10-13 4-2-4-3-9 1-12z" fill="#9be23a" stroke="${INK}" stroke-width="2.5"/>` +
    `<ellipse cx="44" cy="18" rx="5" ry="3" fill="#9be23a" stroke="${INK}" stroke-width="2.5"/>` +
    `<ellipse cx="32" cy="32" rx="11" ry="26" fill="none" stroke="${INK}" stroke-width="2" opacity=".25"/><path d="M6 32h52" stroke="${INK}" stroke-width="2" opacity=".25"/>` +
    shine(20, 17, 6, 3, -40),

  move:
    `<path d="M25 12l7-7 7 7M25 52l7 7 7-7M12 25l-7 7 7 7M52 25l7 7-7 7" fill="none" stroke="${INK}" stroke-width="10"/>` +
    `<path d="M25 12l7-7 7 7M25 52l7 7 7-7M12 25l-7 7 7 7M52 25l7 7-7 7" fill="none" stroke="#ffcf3f" stroke-width="4"/>` +
    `<circle cx="24.5" cy="21.5" r="4" style="fill:var(--hippo,#4aa8ff)" ${O3}/><circle cx="39.5" cy="21.5" r="4" style="fill:var(--hippo,#4aa8ff)" ${O3}/>` +
    `<ellipse cx="32" cy="29" rx="12" ry="10" style="fill:var(--hippo,#4aa8ff)" ${O3}/>` +
    `<ellipse cx="32" cy="37" rx="13.5" ry="8" style="fill:var(--hippo,#4aa8ff)" ${O3}/><ellipse cx="32" cy="37" rx="12" ry="6.5" fill="#fff" opacity=".3"/>` +
    `<circle cx="27.5" cy="27" r="2" fill="${INK}"/><circle cx="36.5" cy="27" r="2" fill="${INK}"/>` +
    `<ellipse cx="28" cy="35.5" rx="1.4" ry="2" fill="${INK}"/><ellipse cx="36" cy="35.5" rx="1.4" ry="2" fill="${INK}"/>`,

  gauge:
    `<rect x="4" y="43" width="56" height="12" rx="6" fill="#ff5b8a" ${O}/>` +
    `<path d="M6 46a26 26 0 0 1 52 0z" fill="#fff8ec" ${O}/>` +
    `<path d="M13 46a19 19 0 0 1 5.6-13.4" fill="none" stroke="#ff6b6b" stroke-width="6" stroke-linecap="butt"/>` +
    `<path d="M18.6 32.6A19 19 0 0 1 35.3 27.3" fill="none" stroke="#ffcf3f" stroke-width="6" stroke-linecap="butt"/>` +
    `<path d="M35.3 27.3A19 19 0 0 1 51 46" fill="none" stroke="#9be23a" stroke-width="6" stroke-linecap="butt"/>` +
    `<path d="M32 46l9-15" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="46" r="4.5" fill="${INK}"/>`,

  spikes:
    `<polygon points="${starPoints(32, 32, 29, 16, 8, -90)}" fill="#8a96a8" ${O}/>` +
    `<circle cx="32" cy="32" r="16" fill="#aab5c6" ${O}/>` +
    `<path d="M23 27l6 3M41 27l-6 3" ${O3}/><circle cx="27" cy="33" r="2.4" fill="${INK}"/><circle cx="37" cy="33" r="2.4" fill="${INK}"/>` +
    `<path d="M28 41q4-3 8 0" fill="none" ${O3}/>` +
    shine(25, 23, 4, 2, -35),

  lifebuoy:
    `<circle cx="32" cy="32" r="20" fill="none" stroke="${INK}" stroke-width="20"/>` +
    `<circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="13"/>` +
    `<circle cx="32" cy="32" r="20" fill="none" stroke="#ff5b5b" stroke-width="13" stroke-dasharray="15.71 15.71" stroke-dashoffset="7.85" stroke-linecap="butt"/>` +
    `<path d="M17 21a19 19 0 0 1 9-7" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>`,

  sparkle:
    `<path d="M29 5c2 16 6 20 22 22-16 2-20 6-22 22-2-16-6-20-22-22 16-2 20-6 22-22z" fill="#ffcf3f" ${O}/>` +
    `<path d="M49 37c1 7 2 8 9 9-7 1-8 2-9 9-1-7-2-8-9-9 7-1 8-2 9-9z" fill="#fff" ${O3}/>` +
    shine(26, 20, 2, 5, 0, 0.7),

  drag:
    `<circle cx="32" cy="32" r="26" fill="#fff" fill-opacity=".55" ${O} stroke-dasharray="7 6"/>` +
    `<path d="M28 13l4-4 4 4M28 51l4 4 4-4M13 28l-4 4 4 4M51 28l4 4-4 4" fill="none" ${O3}/>` +
    `<circle cx="32" cy="32" r="12" fill="#fff" ${O}/><circle cx="32" cy="32" r="6" fill="#dfe6ef"/>`,

  heart: `<path d="M32 56C15 44 6 35 6 23a13 13 0 0 1 26-6 13 13 0 0 1 26 6c0 12-9 21-26 33z" fill="#ff5b8a" ${O}/>` + shine(18, 22, 6, 3.5),
  lock:
    `<path d="M21 30v-8a11 11 0 0 1 22 0v8" fill="none" stroke="${INK}" stroke-width="11"/><path d="M21 30v-8a11 11 0 0 1 22 0v8" fill="none" stroke="#dfe6ef" stroke-width="4.5"/>` +
    `<rect x="12" y="28" width="40" height="30" rx="7" fill="#ffcf3f" ${O}/>` +
    `<circle cx="32" cy="40" r="4.5" fill="${INK}"/><path d="M32 42v8" stroke="${INK}" stroke-width="4"/>` +
    shine(19, 33, 4, 2, -20),

  clock:
    `<rect x="27" y="2" width="10" height="8" rx="2.5" fill="#ff5b8a" ${O3}/><path d="M32 10v5" ${O3}/>` +
    `<path d="M50 15l4-4" ${O}/>` +
    `<circle cx="32" cy="37" r="23" fill="#fff8ec" ${O}/>` +
    `<path d="M32 18v4M32 52v4M13 37h4M47 37h4" stroke="${INK}" stroke-width="3" opacity=".45"/>` +
    `<path d="M32 37V24M32 37l9 5" fill="none" ${O}/><circle cx="32" cy="37" r="3.5" fill="${INK}"/>` +
    shine(21, 26, 5, 2.5, -40),

  chat:
    `<path d="M13 9h38a9 9 0 0 1 9 9v19a9 9 0 0 1-9 9H31L18 57V46h-5a9 9 0 0 1-9-9V18a9 9 0 0 1 9-9z" fill="#fff8ec" ${O}/>` +
    `<circle cx="20" cy="27.5" r="4" fill="${INK}"/><circle cx="32" cy="27.5" r="4" fill="${INK}"/><circle cx="44" cy="27.5" r="4" fill="${INK}"/>` +
    shine(15, 17, 4, 2, -25, 0.9),

  eye:
    `<path d="M4 32C14 15 50 15 60 32C50 49 14 49 4 32z" fill="#fff8ec" ${O}/>` +
    `<circle cx="32" cy="32" r="12" fill="#4aa8ff" ${O3}/>` +
    `<circle cx="32" cy="32" r="5.5" fill="${INK}"/>` +
    shine(27, 27, 3, 2, -40, 0.9),

  /** The "more" button in an app's own browser bar. */
  more: [12, 32, 52].map((x) => `<circle cx="${x}" cy="32" r="7" fill="${INK}"/>`).join(''),

  next: `<path d="M8 25h24V12l24 20-24 20V39H8z" fill="#9be23a" ${O}/>` + `<path d="M12 29h22" stroke="#fff" stroke-width="3" opacity=".6"/>`,

  /** Points right; flip it with `-scale-x-100` for left. */
  chevron:
    `<path d="M23 11l21 21-21 21" fill="none" stroke="${INK}" stroke-width="15"/>` +
    `<path d="M23 11l21 21-21 21" fill="none" stroke="#4aa8ff" stroke-width="6"/>`,

  share:
    `<path d="M16 30h-4v24h40V30h-4" fill="none" stroke="${INK}" stroke-width="10"/><path d="M16 30h-4v24h40V30h-4" fill="none" stroke="#fff8ec" stroke-width="4"/>` +
    `<path d="M32 42V8M21 19L32 8l11 11" fill="none" stroke="${INK}" stroke-width="11"/><path d="M32 42V8M21 19L32 8l11 11" fill="none" stroke="#4aa8ff" stroke-width="5"/>`,

  crown:
    `<path d="M8 46l3-28 13 13 8-19 8 19 13-13 3 28z" fill="#ffcf3f" ${O}/>` +
    `<rect x="8" y="44" width="48" height="11" rx="3" fill="#e6a51c" ${O}/>` +
    `<circle cx="20" cy="49.5" r="3" fill="#ff5b8a" stroke="${INK}" stroke-width="2"/><circle cx="32" cy="49.5" r="3" fill="#4aa8ff" stroke="${INK}" stroke-width="2"/><circle cx="44" cy="49.5" r="3" fill="#9be23a" stroke="${INK}" stroke-width="2"/>` +
    shine(18, 30, 2, 5, -10),

  replay:
    `<path d="M50 34a18 18 0 1 1-6-15" fill="none" stroke="${INK}" stroke-width="12"/><path d="M50 34a18 18 0 1 1-6-15" fill="none" stroke="#ff9a3c" stroke-width="5.5"/>` +
    `<path d="M36 10l14 3-4 14z" fill="#ff9a3c" ${O}/>`,

  fullscreen: corners('M7 23V7h16M41 7h16v16M57 41v16H41M23 57H7V41'),
  fullscreenExit: corners('M23 7v16H7M57 23H41V7M41 57V41h16M7 41h16v16'),

  rotate:
    `<rect x="5" y="27" width="54" height="31" rx="7" fill="#4aa8ff" ${O}/>` +
    `<rect x="12" y="32.5" width="40" height="20" rx="3" fill="#fff8ec" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M14 19C22 6 42 6 50 17" fill="none" stroke="${INK}" stroke-width="11"/><path d="M14 19C22 6 42 6 50 17" fill="none" stroke="#ffcf3f" stroke-width="5"/>` +
    `<path d="M41 17.5l13 5 1-13.5z" fill="#ffcf3f" ${O3}/>` +
    shine(14, 31, 3, 1.4, -10, 0.7),

  // Race rafts: a shape each, so they tell apart without colour.
  teamRed: `<path d="M32 7L58 54H6z" fill="#ff5d5d" stroke="${INK}" stroke-width="5"/>` + shine(26, 30, 3, 7, 30),
  teamYellow: `<circle cx="32" cy="32" r="24" fill="#ffc53d" stroke="${INK}" stroke-width="5"/>` + shine(23, 22, 4, 7, 40),
  teamTeal: `<rect x="9" y="9" width="46" height="46" rx="8" fill="#1fbfae" stroke="${INK}" stroke-width="5"/>` + shine(20, 20, 3.5, 7, 45),
  teamPink: `<path d="M32 4L60 32 32 60 4 32z" fill="#f25fd0" stroke="${INK}" stroke-width="5"/>` + shine(24, 24, 3, 7, 45),

  target:
    `<circle cx="32" cy="32" r="24" fill="#fff8ec" ${O}/><circle cx="32" cy="32" r="15" fill="#ff5b8a" ${O3}/><circle cx="32" cy="32" r="6" fill="#fff8ec" ${O3}/>` +
    `<path d="M32 2v12M32 50v12M2 32h12M50 32h12" stroke="${INK}" stroke-width="5"/>`,

  stop:
    `<path d="M22 5h20l15 15v24L42 59H22L7 44V20z" fill="#ff5d5d" ${O}/>` +
    `<rect x="16" y="27" width="32" height="10" rx="4" fill="#fff" ${O3}/>` +
    shine(19, 17, 3, 6, 45, 0.5),

  speaker: `<path d="M8 24h11l15-12v40L19 40H8z" fill="#ffcf3f" ${O}/>` + `<path d="M43 23c4 5 4 13 0 18M50 17c8 9 8 21 0 30" fill="none" ${O}/>`,

  speakerOff:
    `<path d="M8 24h11l15-12v40L19 40H8z" fill="#cfd6e0" ${O}/>` +
    `<path d="M42 24l16 16M58 24L42 40" stroke="${INK}" stroke-width="10"/><path d="M42 24l16 16M58 24L42 40" stroke="#ff5b8a" stroke-width="4"/>`,

  people:
    `<circle cx="44" cy="20" r="9" fill="#ff9a3c" ${O}/><path d="M35 33c3-2 6-3 9-3 9 0 15 7 15 17H41" fill="#ff9a3c" ${O}/>` +
    `<circle cx="22" cy="22" r="10" fill="#4aa8ff" ${O}/><path d="M5 52c0-11 8-18 17-18s17 7 17 18z" fill="#4aa8ff" ${O}/>`,

  gear:
    `<g fill="${INK}">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="26" y="3" width="12" height="16" rx="3" transform="rotate(${a} 32 32)"/>`).join('')}</g>` +
    `<circle cx="32" cy="32" r="19" fill="#ffcf3f" ${O}/><circle cx="32" cy="32" r="7" fill="#fff8ec" ${O}/>` +
    shine(24, 22, 4, 2, -35, 0.7),

  help:
    `<circle cx="32" cy="32" r="26" fill="#6fcaff" ${O}/>` +
    `<path d="M23 25a9 9 0 1 1 13 8c-3 2-4 3-4 7" fill="none" stroke="${INK}" stroke-width="10"/><path d="M23 25a9 9 0 1 1 13 8c-3 2-4 3-4 7" fill="none" stroke="#fff" stroke-width="4"/>` +
    `<circle cx="32" cy="50" r="5" fill="#fff" ${O3}/>` +
    shine(17, 21, 5, 2.5, -40, 0.6),

  pencil:
    `<g transform="rotate(45 32 32)"><rect x="24" y="4" width="16" height="40" rx="3" fill="#ffcf3f" ${O}/>` +
    `<path d="M24 12h16" stroke="${INK}" stroke-width="3"/><path d="M24 44h16l-8 15z" fill="#fde7cf" ${O}/><path d="M29.5 54l2.5 5 2.5-5z" fill="${INK}"/></g>`,

  dice:
    `<rect x="7" y="7" width="50" height="50" rx="12" fill="#fff8ec" ${O}/>` +
    [
      [20, 20],
      [44, 20],
      [32, 32],
      [20, 44],
      [44, 44],
    ]
      .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${INK}"/>`)
      .join('') +
    shine(16, 14, 4, 2, -20, 0.9),
} satisfies Record<string, string>

export type IconName = keyof typeof ICONS

const iconTemplates = new Map<IconName, SVGSVGElement>()

export function iconElement(name: IconName) {
  let svg = iconTemplates.get(name)
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'icon')
    svg.setAttribute('viewBox', '0 0 64 64')
    svg.setAttribute('width', '1em')
    svg.setAttribute('height', '1em')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = ICONS[name]
    iconTemplates.set(name, svg)
  }
  return svg.cloneNode(true) as SVGSVGElement
}
