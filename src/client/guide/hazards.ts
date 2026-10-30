import type { CourseDef, ItemDef } from '../../sim/track'
import type { IconName } from '../ui/icons'

// What a river page says is on that river, read from its layout in src/sim/courses.ts, so a reworked river's page
// changes with it.

type Hazard = { name: string; icon: IconName; text: string; terrain?: true }

/** The banks and the water, which aren't items in the layout. */
type Terrain = 'spikes' | 'open' | 'ice' | 'drop' | 'uphill'

const TERRAIN: Record<Terrain, Hazard> = {
  spikes: { name: 'Spiked banks', icon: 'spikes', text: 'Brush the edge and the raft pops. Keep to the middle.', terrain: true },
  open: {
    name: 'No walls',
    icon: 'lifebuoy',
    text: 'Stretches with nothing at the edge. Toot too hard and the whole crew goes overboard.',
    terrain: true,
  },
  ice: { name: 'Ice', icon: 'lifebuoy', text: 'The raft slides and spins much longer than on water. Small toots, early.', terrain: true },
  drop: { name: 'Big drops', icon: 'lifebuoy', text: 'The river falls away and the water speeds up. Line up before the edge.', terrain: true },
  uphill: {
    name: 'Rapids upstream',
    icon: 'gauge',
    text: 'Water running back the way you came. Everyone toots the same way, or nobody gets up.',
    terrain: true,
  },
}

const ITEMS: Record<Exclude<ItemDef['kind'], 'pickup' | 'boost'>, Hazard> = {
  rock: { name: 'Rocks', icon: 'lifebuoy', text: 'Harmless, but they stop a raft dead.' },
  bumper: { name: 'Bumpers', icon: 'lifebuoy', text: 'Bouncy posts that ping the raft away, often into something worse.' },
  mine: { name: 'Floating mines', icon: 'skull', text: 'Spiky balls bobbing in the water. Touch one and KABOOM.' },
  spinner: { name: 'Spinners', icon: 'skull', text: 'Spiked arms sweeping round in the middle of the river. Time your gap.' },
  mace: { name: 'Swinging maces', icon: 'skull', text: 'A spiked ball swinging across the river, right at snout height.' },
  crusher: { name: 'Crushers', icon: 'skull', text: 'Blocks that slam shut across the river. Go through while they’re open.' },
  slider: { name: 'Sliding logs', icon: 'skull', text: 'Spiked logs that slide from bank to bank. They have places to be.' },
  piston: { name: 'Pistons', icon: 'skull', text: 'They stamp down from above. Watch for the shadow.' },
  whirlpool: { name: 'Whirlpools', icon: 'skull', text: 'They drag the raft in and spin it. Get pulled into the middle and you go under.' },
  current: { name: 'Side currents', icon: 'gauge', text: 'Water that shoves the raft sideways. Toot against it before it puts you on the bank.' },
  kelp: { name: 'Kelp beds', icon: 'gauge', text: 'Sticky weed that drags the raft to a crawl unless the whole crew toots through.' },
  sweeper: { name: 'Swinging booms', icon: 'skull', text: 'A spiked boom hinged on the bank, swinging across the river on a timer.' },
  flame: { name: 'Fire traps', icon: 'skull', text: 'Nozzles in the bank that blast fire across the river. Wait for the puff to end.' },
  fence: { name: 'Spike fences', icon: 'spikes', text: 'Spikes across the whole river with one gap that slides. Aim for the gap.' },
  gate: { name: 'Sluice gates', icon: 'skull', text: 'Spiked gates that open for a moment, then slam shut. They wait for no hippo.' },
  geyser: { name: 'Geysers', icon: 'burst', text: 'Vents that bubble, then erupt and blast the raft away. Bubbles mean move.' },
  lightning: { name: 'Lightning', icon: 'skull', text: 'Strikes across the river one spot at a time, back and forth. Read the rhythm.' },
  tentacle: { name: 'Kraken tentacles', icon: 'skull', text: 'They rear back from the bank, then slam across the river. The rear-back is the hint.' },
  twister: { name: 'Waterspouts', icon: 'skull', text: 'Twisters that wander across the river and suck the raft in. Toot clear early.' },
  ship: { name: 'Ghost ships', icon: 'skull', text: 'They rise downstream and sail straight back up the river at you.' },
}

/** Each hazard on the river, in the order the crew first meets it, with how many there are (a stretch of bank counts as one each). */
export function hazardsOf(def: CourseDef) {
  const found = new Map<Hazard, number>()
  const add = (h: Hazard) => found.set(h, (found.get(h) ?? 0) + 1)
  for (const piece of def.pieces) {
    if (piece.left === 'spikes' || piece.right === 'spikes') add(TERRAIN.spikes)
    if (piece.left === 'open' || piece.right === 'open') add(TERRAIN.open)
    if (piece.ice) add(TERRAIN.ice)
    if ((piece.flow ?? 0) < 0) add(TERRAIN.uphill)
    if ((piece.drop ?? 0) > 2) add(TERRAIN.drop)
    for (const item of piece.items ?? []) if (item.kind !== 'pickup' && item.kind !== 'boost') add(ITEMS[item.kind])
  }
  return [...found].map(([h, count]) => ({ ...h, count }))
}

/** The snacks lying on the river, in order of first appearance. */
export function snacksOf(def: CourseDef) {
  const kinds = def.pieces.flatMap((p) => p.items ?? []).flatMap((i) => (i.kind === 'pickup' ? [i.item] : []))
  return [...new Set(kinds)]
}
