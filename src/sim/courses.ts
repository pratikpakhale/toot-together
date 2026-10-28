import { type BakedCourse, bakeCourse, type CourseDef } from './track'

const LAZY_RIVER: CourseDef = {
  id: 'lazy-river',
  name: 'Lazy River',
  blurb: 'A gentle float to learn the ropes.',
  theme: 'meadow',
  difficulty: 1,
  medals: [120, 165, 250],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 11, flow: 1.6, shelf: 7 },

    { len: 20, start: true, width: 12, flow: 2, items: [{ kind: 'boost', at: 10 }] },
    { len: 30, turn: 35, width: 12 },
    { len: 16, width: 12, items: [{ kind: 'rock', at: 8, d: -2.5 }] },
    { len: 30, turn: -45, width: 12, items: [{ kind: 'pickup', at: 15, d: 0, item: 'beans' }] },
    { len: 16, width: 12, items: [{ kind: 'rock', at: 8, d: 2.6 }] },

    { len: 24, checkpoint: true, width: 12 },
    { len: 24, width: 13, items: [{ kind: 'bumper', at: 8, d: -3.6 }, { kind: 'bumper', at: 16, d: 3.6 }] },
    { len: 30, turn: 50, width: 11, right: 'spikes' },
    { len: 16, width: 11, items: [{ kind: 'mine', at: 8, d: 2.8 }] },
    { len: 26, turn: -40, width: 12, items: [{ kind: 'boost', at: 14 }] },

    { len: 24, checkpoint: true, width: 13 },
    { len: 26, width: 16, items: [{ kind: 'spinner', at: 13, arm: 3, speed: 0.7, arms: 2 }] },
    { len: 18, width: 13, items: [{ kind: 'pickup', at: 9, d: 0, item: 'chili' }] },
    { len: 28, turn: 40, width: 12, left: 'spikes', items: [{ kind: 'mine', at: 14, d: -2.4 }] },

    { len: 24, checkpoint: true, width: 12 },
    { len: 20, drop: 3.5, flow: 3.2, width: 10 },
    { len: 24, width: 14, flow: 1.6 },
    { len: 26, turn: -35, width: 12, items: [{ kind: 'mace', at: 14, amp: 3.6, period: 4.6 }] },
    { len: 18, width: 12, items: [{ kind: 'boost', at: 6 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const CANYON_RUN: CourseDef = {
  id: 'canyon-run',
  name: 'Canyon Run',
  blurb: 'Spikes, spinners, a big drop, the rapids and the crushers.',
  theme: 'canyon',
  difficulty: 4,
  medals: [300, 410, 625],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 9.5, flow: 1.8, shelf: 7 },

    { len: 18, start: true, flow: 2.4, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 42 },
    { len: 14, items: [{ kind: 'rock', at: 7, d: 2.3 }] },
    { len: 36, turn: -68, items: [{ kind: 'bumper', at: 18, d: -2.7 }] },
    { len: 16, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },
    { len: 26, turn: 30, items: [{ kind: 'rock', at: 14, d: -2.4, r: 1 }] },

    { len: 28, checkpoint: true, width: 10 },
    { len: 24, left: 'spikes', right: 'spikes', width: 9.5, items: [{ kind: 'rock', at: 15, d: -1.9, r: 0.9 }] },
    { len: 26, turn: 40, left: 'spikes', right: 'spikes' },
    { len: 16, left: 'spikes', right: 'wall', items: [{ kind: 'mine', at: 9, d: 1.9 }] },
    { len: 26, turn: -45, left: 'wall', right: 'spikes', items: [{ kind: 'mine', at: 15, d: -2.1 }] },
    { len: 14, left: 'spikes', right: 'spikes', items: [{ kind: 'boost', at: 4 }] },

    { len: 28, checkpoint: true, width: 14 },
    { len: 24, width: 15, items: [{ kind: 'spinner', at: 12, arm: 3.3, speed: 1.25 }] },
    {
      len: 16,
      items: [
        { kind: 'bumper', at: 5, d: -4.2 },
        { kind: 'bumper', at: 10, d: 4.2 },
        { kind: 'pickup', at: 8, d: 0, item: 'chili' },
      ],
    },
    { len: 30, turn: 50, items: [{ kind: 'mine', at: 11, d: -3.2 }, { kind: 'mine', at: 20, d: 3.4 }] },
    {
      len: 26,
      items: [
        { kind: 'spinner', at: 9, d: -3.4, arm: 2.6, speed: -1.7, arms: 2 },
        { kind: 'spinner', at: 18, d: 3.4, arm: 2.6, speed: 1.7, arms: 2, phase: 0.25 },
      ],
    },
    { len: 14, width: 10 },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, drop: 7, flow: 4.2, width: 8.5 },
    { len: 22, width: 14, flow: 2, items: [{ kind: 'bumper', at: 8, d: -3.6 }, { kind: 'bumper', at: 15, d: 3.6 }] },
    { len: 30, turn: -60, items: [{ kind: 'mace', at: 15, amp: 4, period: 4 }] },
    { len: 24, drop: 5, flow: 3.8, width: 9 },
    {
      len: 18,
      width: 13,
      flow: 1.8,
      items: [
        { kind: 'pickup', at: 9, d: -2.6, item: 'prune' },
        { kind: 'pickup', at: 9, d: 2.6, item: 'beans' },
      ],
    },
    { len: 22, width: 11, flow: -1.8 },

    { len: 28, checkpoint: true, width: 12, flow: 1.6 },
    { len: 28, ice: true, left: 'open', right: 'open', width: 12, flow: 1.2, items: [{ kind: 'rock', at: 16, d: 0, r: 1.1 }] },
    { len: 30, turn: 50, ice: true, left: 'open', right: 'open', items: [{ kind: 'mine', at: 11, d: 1.6 }, { kind: 'mine', at: 22, d: -1.6 }] },
    {
      len: 26,
      turn: -50,
      ice: true,
      left: 'open',
      right: 'open',
      items: [{ kind: 'rock', at: 9, d: -2.6, r: 1 }, { kind: 'rock', at: 19, d: 2.6, r: 1 }],
    },
    { len: 14, flow: 2.2, width: 10 },

    { len: 28, checkpoint: true, width: 9.5 },
    { len: 20, items: [{ kind: 'crusher', at: 10, period: 3.8 }] },
    { len: 24, turn: 35, left: 'spikes', right: 'spikes' },
    {
      len: 24,
      width: 11,
      items: [
        { kind: 'piston', at: 8, d: -2.4, period: 3.4 },
        { kind: 'piston', at: 16, d: 2.4, period: 3.4, phase: 0.5 },
      ],
    },
    { len: 20, width: 9.5, items: [{ kind: 'crusher', at: 10, period: 3.2, phase: 0.35 }] },
    { len: 26, turn: -40, items: [{ kind: 'pickup', at: 13, d: 0, item: 'beans' }] },

    { len: 28, checkpoint: true, width: 10 },
    {
      len: 30,
      left: 'open',
      right: 'open',
      width: 9,
      flow: 2.4,
      items: [
        { kind: 'boost', at: 4 },
        { kind: 'piston', at: 17, d: -2.2, period: 3, r: 1.3 },
        { kind: 'piston', at: 25, d: 2.2, period: 3, phase: 0.5, r: 1.3 },
      ],
    },
    { len: 34, turn: 60, left: 'open', right: 'open', width: 9 },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.4 },
    { len: 26, turn: -50, left: 'open', right: 'open', items: [{ kind: 'mine', at: 13, d: 1.8 }] },
    { len: 22, width: 13, flow: 2.2, items: [{ kind: 'spinner', at: 11, arm: 3, speed: 1.6, arms: 2 }] },
    { len: 18, width: 12, items: [{ kind: 'mace', at: 9, amp: 4, period: 2.7 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const VOLCANO_PEAK: CourseDef = {
  id: 'volcano-peak',
  name: 'Volcano Peak',
  blurb: 'Lava chutes, geysers, obsidian ice and the crusher corridor.',
  theme: 'volcano',
  difficulty: 3,
  medals: [240, 340, 500],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 9.5, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 9.5, flow: 2.6, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 45, left: 'spikes', items: [{ kind: 'mine', at: 18, d: 1.8 }] },
    { len: 18, left: 'spikes', right: 'spikes', width: 9.5, items: [{ kind: 'rock', at: 9, d: -1.8, r: 0.9 }] },
    { len: 30, turn: -55, right: 'spikes', items: [{ kind: 'mine', at: 10, d: -2.2 }, { kind: 'mine', at: 22, d: 2.2 }] },
    { len: 16, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },

    { len: 28, checkpoint: true, width: 14 },
    { len: 22, width: 16.5, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: 1.2, arms: 3 }] },
    { len: 22, width: 16.5, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: -1.4, arms: 3, phase: 0.3 }] },
    { len: 28, turn: 50, width: 12, items: [{ kind: 'mine', at: 9, d: -3.1 }, { kind: 'mine', at: 19, d: 3.1 }] },
    {
      len: 24,
      width: 14,
      items: [
        { kind: 'spinner', at: 8, d: -3.4, arm: 2.6, speed: 1.6, arms: 2 },
        { kind: 'spinner', at: 17, d: 3.4, arm: 2.6, speed: -1.6, arms: 2, phase: 0.25 },
      ],
    },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, drop: 8, flow: 4.4, width: 8.5 },
    { len: 32, width: 14, flow: 1.4, items: [{ kind: 'geyser', at: 16, d: 0, period: 4 }] },
    {
      len: 22,
      width: 12,
      items: [
        { kind: 'slider', at: 7, len: 4.5, amp: 3.2, period: 4.2 },
        { kind: 'slider', at: 16, len: 4.5, amp: 3.2, period: 4.2, phase: 0.5 },
      ],
    },
    { len: 28, turn: -50, items: [{ kind: 'mace', at: 14, amp: 4, period: 3.4 }] },

    { len: 28, checkpoint: true, width: 12 },
    { len: 26, ice: true, left: 'open', right: 'open', width: 11, flow: 1.4, items: [{ kind: 'piston', at: 13, d: 0, period: 3.2, r: 1.3 }] },
    { len: 30, turn: 55, ice: true, left: 'open', right: 'open', width: 11, items: [{ kind: 'mine', at: 10, d: 1.8 }, { kind: 'mine', at: 21, d: -1.8 }] },
    {
      len: 24,
      turn: -40,
      ice: true,
      left: 'open',
      right: 'wall',
      width: 11,
      items: [
        { kind: 'piston', at: 8, d: -2.4, period: 3, r: 1.3 },
        { kind: 'piston', at: 17, d: 2.4, period: 3, phase: 0.5, r: 1.3 },
      ],
    },
    { len: 14, flow: 2.2, width: 10 },

    { len: 28, checkpoint: true, width: 9.5 },
    { len: 20, left: 'spikes', right: 'spikes', items: [{ kind: 'crusher', at: 10, period: 3.6 }] },
    { len: 22, turn: 35, items: [{ kind: 'crusher', at: 11, period: 3.3, phase: 0.4 }] },
    { len: 20, left: 'spikes', right: 'spikes', items: [{ kind: 'crusher', at: 10, period: 3, phase: 0.2 }] },
    { len: 26, turn: -35, width: 11, items: [{ kind: 'pickup', at: 13, d: 0, item: 'chili' }] },

    { len: 28, checkpoint: true, width: 10 },
    { len: 26, left: 'open', right: 'open', width: 8.5, flow: 2.6, items: [{ kind: 'mace', at: 13, amp: 3.4, period: 2.8 }] },
    { len: 30, turn: 55, left: 'open', right: 'open', width: 9, items: [{ kind: 'mine', at: 15, d: 1.6 }] },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.6, width: 9 },
    { len: 22, turn: -45, left: 'open', right: 'open', width: 10, items: [{ kind: 'piston', at: 11, d: 0, period: 2.8, r: 1.3 }] },
    { len: 22, width: 13, flow: 2, items: [{ kind: 'spinner', at: 11, arm: 3.2, speed: 1.9, arms: 3 }] },
    { len: 18, width: 12, items: [{ kind: 'mace', at: 9, amp: 4, period: 2.5 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const BAYOU_BENDS: CourseDef = {
  id: 'bayou-bends',
  name: 'Bayou Bends',
  blurb: 'Sideways currents, sticky kelp, hungry whirlpools and spike fences.',
  theme: 'bayou',
  difficulty: 3,
  medals: [125, 170, 260],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 11, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 12, flow: 2.2, items: [{ kind: 'boost', at: 8 }] },
    { len: 28, turn: 30, width: 12, items: [{ kind: 'current', at: 6, push: 4.5, len: 14 }, { kind: 'mine', at: 22, d: 3.4 }] },
    { len: 18, width: 13, items: [{ kind: 'kelp', at: 2, len: 12 }, { kind: 'pickup', at: 16, d: -3, item: 'beans' }] },
    { len: 30, turn: -45, width: 12, right: 'spikes', items: [{ kind: 'current', at: 6, push: 4.5, len: 16 }] },

    { len: 26, checkpoint: true, width: 14 },
    { len: 24, width: 15, items: [{ kind: 'whirlpool', at: 12, d: 0, pull: 11.5 }] },
    { len: 28, turn: 40, width: 14, items: [{ kind: 'whirlpool', at: 10, d: -3.2, pull: 11.5 }, { kind: 'mine', at: 21, d: 3.4 }] },
    { len: 24, width: 13, items: [{ kind: 'whirlpool', at: 10, d: 3, swirl: -6, pull: 11.5 }, { kind: 'pickup', at: 12, d: -4, item: 'chili' }, { kind: 'mace', at: 20, amp: 3.6, period: 3.6 }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 22, width: 12, items: [{ kind: 'fence', at: 11, gap: 5.2, amp: 2.8, period: 4.6 }] },
    { len: 28, turn: -45, width: 12, right: 'spikes', items: [{ kind: 'current', at: 4, push: 4.5, len: 18 }] },
    { len: 24, width: 12, items: [{ kind: 'kelp', at: 0, len: 9 }, { kind: 'fence', at: 13, gap: 5, amp: 3, period: 4.4, phase: 0.3 }, { kind: 'rock', at: 21, d: 0 }] },

    { len: 26, checkpoint: true, width: 13 },
    { len: 20, drop: 4, flow: 3.4, width: 11 },
    { len: 26, width: 15, flow: 1.6, items: [{ kind: 'whirlpool', at: 9, d: -3.6, pull: 11.5 }, { kind: 'mine', at: 14, d: 1.2 }, { kind: 'whirlpool', at: 19, d: 3.6, swirl: -5, pull: 11.5 }] },
    { len: 30, turn: 50, width: 12, left: 'spikes', items: [{ kind: 'current', at: 4, push: -4.5, len: 14 }, { kind: 'mace', at: 23, amp: 3.6, period: 2.9 }] },
    { len: 22, width: 12, items: [{ kind: 'kelp', at: 0, len: 8 }, { kind: 'fence', at: 13, gap: 5, amp: 3, period: 4.2 }] },
    { len: 18, width: 13, items: [{ kind: 'boost', at: 6 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const FROSTBITE_FALLS: CourseDef = {
  id: 'frostbite-falls',
  name: 'Frostbite Falls',
  blurb: 'Slippery ice, swinging booms, ice geysers and two frozen falls.',
  theme: 'glacier',
  difficulty: 4,
  medals: [180, 250, 375],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 11, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 11, flow: 2.4, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 40, width: 12, ice: true, items: [{ kind: 'rock', at: 12, d: 2.4 }, { kind: 'mine', at: 22, d: -2.2 }] },
    { len: 26, turn: -50, width: 12, ice: true, left: 'spikes', items: [{ kind: 'mine', at: 13, d: 2.2 }] },
    { len: 16, width: 12, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 26, width: 12, items: [{ kind: 'sweeper', at: 13, side: 1, len: 7.5, swing: 72, period: 3.8 }] },
    { len: 26, turn: 35, width: 12, items: [{ kind: 'geyser', at: 9, d: -2.6, period: 3.6 }, { kind: 'geyser', at: 19, d: 2.6, period: 3.6, phase: 0.5 }] },
    { len: 30, width: 12, items: [{ kind: 'sweeper', at: 8, side: -1, len: 7.5, swing: 74, period: 3.6 }, { kind: 'sweeper', at: 22, side: 1, len: 7.5, swing: 74, period: 3.6 }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 28, ice: true, left: 'open', right: 'open', width: 12, flow: 1.2, items: [{ kind: 'fence', at: 14, gap: 6, amp: 2.4, period: 5.5 }] },
    { len: 30, turn: -55, ice: true, left: 'open', right: 'open', width: 11, items: [{ kind: 'mine', at: 10, d: 2 }, { kind: 'geyser', at: 22, d: -1.8, period: 3.8 }] },
    { len: 26, turn: 40, ice: true, left: 'open', width: 11, items: [{ kind: 'fence', at: 13, gap: 6, amp: 2.4, period: 5.5, phase: 0.2 }] },
    { len: 14, flow: 2.2, width: 11 },

    { len: 26, checkpoint: true, width: 11 },
    { len: 24, drop: 7, flow: 4.4, width: 9 },
    { len: 26, width: 14, flow: 1.6, items: [{ kind: 'whirlpool', at: 13, d: 0, r: 5, pull: 11.5 }] },
    { len: 22, drop: 5, flow: 4, width: 9.5 },
    {
      len: 20,
      width: 13,
      flow: 1.8,
      items: [
        { kind: 'geyser', at: 6, d: 0, period: 3.2 },
        { kind: 'pickup', at: 14, d: -3, item: 'chili' },
        { kind: 'pickup', at: 14, d: 3, item: 'prune' },
      ],
    },

    { len: 26, checkpoint: true, width: 12 },
    { len: 30, ice: true, width: 12, items: [{ kind: 'sweeper', at: 8, side: 1, len: 7.5, swing: 72, period: 3.8 }, { kind: 'sweeper', at: 22, side: -1, len: 7.5, swing: 72, period: 3.8 }] },
    { len: 30, turn: 50, ice: true, left: 'spikes', width: 12, items: [{ kind: 'geyser', at: 10, d: 2.2, period: 3.4 }, { kind: 'rock', at: 20, d: -1, r: 1 }] },
    { len: 24, width: 12, items: [{ kind: 'fence', at: 8, gap: 5.5, amp: 3, period: 5 }, { kind: 'fence', at: 18, gap: 5.5, amp: 3, period: 5, phase: 0.5 }] },
    { len: 22, width: 13, items: [{ kind: 'mace', at: 11, amp: 4, period: 2.7 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const SUNKEN_TEMPLE: CourseDef = {
  id: 'sunken-temple',
  name: 'Sunken Temple',
  blurb: 'Sluice gates, fire traps, crushers and booms in the old ruins.',
  theme: 'temple',
  difficulty: 4,
  medals: [175, 240, 365],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 10, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 10, flow: 2.4, items: [{ kind: 'boost', at: 8 }] },
    { len: 28, turn: 35, width: 11, items: [{ kind: 'flame', at: 9, side: 1, period: 3.4, len: 6 }, { kind: 'flame', at: 20, side: -1, period: 3.4, len: 6, phase: 0.5 }] },
    { len: 28, turn: -45, width: 11, items: [{ kind: 'flame', at: 14, side: -1, period: 3.2, len: 7, on: 0.45 }] },
    { len: 24, width: 11, items: [{ kind: 'gate', at: 10, period: 4.8, open: 0.4 }, { kind: 'pickup', at: 19, d: 0, item: 'beans' }] },

    { len: 26, checkpoint: true, width: 11 },
    { len: 26, width: 11, items: [{ kind: 'flame', at: 8, side: 1, period: 3.2, on: 0.4 }, { kind: 'flame', at: 18, side: -1, period: 3.2, on: 0.4, phase: 0.5 }] },
    { len: 28, turn: 40, width: 12, left: 'spikes', items: [{ kind: 'current', at: 4, push: -4.5, len: 18 }] },
    { len: 22, width: 11, items: [{ kind: 'crusher', at: 6, period: 3.1 }, { kind: 'gate', at: 17, period: 4.4, open: 0.35, phase: 0.3 }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 26, width: 13, items: [{ kind: 'sweeper', at: 13, side: -1, len: 8.5, swing: 78, period: 3.2 }] },
    {
      len: 28,
      turn: -50,
      width: 12,
      items: [
        { kind: 'piston', at: 7, d: -2.4, period: 2.5 },
        { kind: 'flame', at: 14, side: 1, period: 2.5, len: 6, on: 0.45, phase: 0.25 },
        { kind: 'piston', at: 21, d: 2.4, period: 2.5, phase: 0.5 },
      ],
    },
    { len: 26, width: 12, items: [{ kind: 'flame', at: 6, side: 1, period: 3, on: 0.45 }, { kind: 'sweeper', at: 17, side: 1, len: 7.5, swing: 75, period: 3, phase: 0.25 }] },

    { len: 26, checkpoint: true, width: 11 },
    { len: 22, drop: 6, flow: 4, width: 9 },
    { len: 24, width: 12, flow: 2.6, items: [{ kind: 'gate', at: 12, period: 4.4, open: 0.32 }] },
    { len: 28, turn: 45, width: 11, flow: 1.8, items: [{ kind: 'flame', at: 9, side: -1, period: 2.8, on: 0.45 }, { kind: 'flame', at: 19, side: 1, period: 2.8, on: 0.45, phase: 0.5 }] },
    { len: 20, width: 12, items: [{ kind: 'fence', at: 8, gap: 5.5, amp: 3, period: 4.6 }, { kind: 'pickup', at: 16, d: 0, item: 'chili' }] },

    { len: 26, checkpoint: true, width: 10 },
    { len: 20, width: 10, items: [{ kind: 'crusher', at: 10, period: 2.8 }] },
    { len: 22, width: 10, items: [{ kind: 'flame', at: 7, side: 1, period: 2.8, on: 0.5, phase: 0.3 }, { kind: 'flame', at: 15, side: -1, period: 2.8, on: 0.5, phase: 0.8 }] },
    { len: 20, width: 10, items: [{ kind: 'crusher', at: 10, period: 2.8, phase: 0.5 }] },
    { len: 26, turn: -40, width: 12, items: [{ kind: 'sweeper', at: 13, side: 1, len: 7.5, swing: 80, period: 3 }] },
    { len: 20, width: 12, items: [{ kind: 'kelp', at: 0, len: 7 }, { kind: 'gate', at: 13, period: 4, open: 0.3 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const DRAGONS_GULLET: CourseDef = {
  id: 'dragons-gullet',
  name: "Dragon's Gullet",
  blurb: 'Fire, geysers, whirlpools and a climb up the burning rapids.',
  theme: 'volcano',
  difficulty: 5,
  medals: [235, 325, 490],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 10, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 10, flow: 2.6, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: 45, width: 11, left: 'spikes', items: [{ kind: 'flame', at: 15, side: 1, period: 3, len: 6, on: 0.45 }] },
    { len: 22, width: 13, items: [{ kind: 'whirlpool', at: 11, d: -2.6, pull: 11.5 }, { kind: 'geyser', at: 11, d: 3.6, period: 3.4 }] },
    { len: 30, turn: -50, width: 11, right: 'spikes', items: [{ kind: 'current', at: 6, push: 5, len: 16 }] },
    { len: 16, width: 11, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },

    { len: 26, checkpoint: true, width: 12 },
    {
      len: 30,
      width: 12,
      items: [
        { kind: 'flame', at: 7, side: -1, period: 2.8, on: 0.4 },
        { kind: 'flame', at: 15, side: 1, period: 2.8, on: 0.4, phase: 0.33 },
        { kind: 'flame', at: 23, side: -1, period: 2.8, on: 0.4, phase: 0.66 },
      ],
    },
    { len: 28, turn: 45, width: 14, items: [{ kind: 'spinner', at: 14, arm: 3.4, speed: 1.8, arms: 3 }] },
    { len: 24, width: 14, items: [{ kind: 'whirlpool', at: 8, d: 3.4, swirl: -6, pull: 11.5 }, { kind: 'whirlpool', at: 18, d: -3.4, swirl: 6, pull: 11.5 }] },

    { len: 26, checkpoint: true, width: 10 },
    { len: 24, drop: 7, flow: 4.4, width: 8.5 },
    { len: 26, width: 13, flow: 1.6, left: 'open', right: 'open', items: [{ kind: 'geyser', at: 7, d: 2.4, period: 3.2 }, { kind: 'piston', at: 18, d: 0, period: 2.8, r: 1.3 }] },
    { len: 28, turn: -50, width: 11, left: 'open', right: 'open', items: [{ kind: 'current', at: 4, push: -4.5, len: 16 }] },
    { len: 22, width: 12, items: [{ kind: 'sweeper', at: 11, side: -1, len: 7.5, swing: 78, period: 3.2 }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 24, width: 12, items: [{ kind: 'fence', at: 8, gap: 5, amp: 3, period: 4.6 }, { kind: 'fence', at: 18, gap: 5, amp: 3, period: 4.6, phase: 0.5 }] },
    { len: 30, turn: 50, width: 11, left: 'spikes', right: 'spikes', items: [{ kind: 'flame', at: 15, side: 1, period: 2.8, len: 6, on: 0.45 }] },
    { len: 22, width: 11, items: [{ kind: 'crusher', at: 6, period: 2.9 }, { kind: 'gate', at: 16, period: 4.2, open: 0.35, phase: 0.4 }] },
    { len: 18, width: 12, items: [{ kind: 'pickup', at: 9, d: -3, item: 'chili' }, { kind: 'pickup', at: 9, d: 3, item: 'beans' }] },

    { len: 26, checkpoint: true, width: 13 },
    { len: 26, width: 13, flow: -3, items: [{ kind: 'flame', at: 8, side: -1, period: 3, len: 7, on: 0.45 }, { kind: 'flame', at: 18, side: 1, period: 3, len: 7, on: 0.45, phase: 0.5 }] },
    { len: 28, turn: 40, width: 12, flow: 2, items: [{ kind: 'slider', at: 9, len: 4.5, amp: 3.2, period: 3.4 }, { kind: 'piston', at: 20, d: 0, period: 2.8, r: 1.3 }] },
    { len: 24, width: 12, items: [{ kind: 'kelp', at: 0, len: 8 }, { kind: 'fence', at: 14, gap: 5, amp: 3, period: 4.4 }] },

    { len: 26, checkpoint: true, width: 11 },
    { len: 26, left: 'open', right: 'open', width: 10, flow: 2.6, items: [{ kind: 'flame', at: 9, side: 1, period: 2.8, len: 6 }, { kind: 'geyser', at: 19, d: -1.6, period: 3 }] },
    { len: 30, turn: -55, left: 'open', right: 'open', width: 10, items: [{ kind: 'whirlpool', at: 15, d: 0, r: 4, pull: 11.5 }] },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.6, width: 9.5 },
    { len: 34, width: 13, flow: 2, items: [{ kind: 'sweeper', at: 12, side: 1, len: 8.5, swing: 76, period: 3.4 }, { kind: 'sweeper', at: 28, side: -1, len: 8.5, swing: 76, period: 3.4 }] },
    { len: 20, width: 12, items: [{ kind: 'mace', at: 10, amp: 4, period: 2.6 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

const THUNDER_RUN: CourseDef = {
  id: 'thunder-run',
  name: 'Thunder Run',
  blurb: 'A storm-lashed river: lightning, and every trap at once.',
  theme: 'storm',
  difficulty: 5,
  medals: [265, 365, 550],
  startHeading: 0,
  pieces: [
    { len: 28, width: 20, flow: 0.25, shelf: 10 },
    { len: 12, width: 10, flow: 1.8, shelf: 7 },

    { len: 18, start: true, width: 10, flow: 2.6, items: [{ kind: 'boost', at: 8 }] },
    { len: 30, turn: -40, width: 11, items: [{ kind: 'current', at: 4, push: 5.5, len: 12 }, { kind: 'mine', at: 22, d: -2.2 }] },
    { len: 24, width: 12, items: [{ kind: 'lightning', at: 12, beat: 1.25 }] },
    { len: 30, turn: 45, width: 12, right: 'spikes', items: [{ kind: 'sweeper', at: 15, side: -1, len: 7.5, swing: 78, period: 3.2 }] },
    { len: 16, width: 12, items: [{ kind: 'fence', at: 8, gap: 5, amp: 2.5, period: 4.4 }] },

    { len: 26, checkpoint: true, width: 14 },
    { len: 24, width: 16, items: [{ kind: 'spinner', at: 12, arm: 3.4, speed: -1.9, arms: 3 }, { kind: 'whirlpool', at: 12, d: 5.8, r: 3, pull: 11.5 }] },
    { len: 28, turn: -45, width: 13, items: [{ kind: 'flame', at: 9, side: 1, period: 2.7, len: 7, on: 0.45 }, { kind: 'flame', at: 19, side: -1, period: 2.7, len: 7, on: 0.45, phase: 0.5 }] },
    {
      len: 24,
      width: 12,
      items: [
        { kind: 'slider', at: 8, len: 4.8, amp: 3.4, period: 3 },
        { kind: 'slider', at: 17, len: 4.8, amp: 3.4, period: 3, phase: 0.5 },
      ],
    },
    { len: 16, width: 12, items: [{ kind: 'pickup', at: 8, d: 0, item: 'beans' }] },

    { len: 26, checkpoint: true, width: 10 },
    { len: 24, drop: 8, flow: 4.6, width: 8.5 },
    { len: 28, ice: true, left: 'open', right: 'open', width: 12, flow: 1.3, items: [{ kind: 'whirlpool', at: 14, d: 0, r: 5, pull: 11.5 }] },
    { len: 30, turn: 55, ice: true, left: 'open', right: 'open', width: 11, items: [{ kind: 'current', at: 4, push: -3.5, len: 14 }, { kind: 'mine', at: 24, d: 2 }] },
    { len: 26, turn: -35, ice: true, left: 'open', width: 11, items: [{ kind: 'piston', at: 9, d: -2.4, period: 2.7, r: 1.3 }, { kind: 'piston', at: 18, d: 2.4, period: 2.7, phase: 0.5, r: 1.3 }] },
    { len: 14, flow: 2.2, width: 11 },

    { len: 26, checkpoint: true, width: 10 },
    { len: 20, left: 'spikes', right: 'spikes', items: [{ kind: 'crusher', at: 10, period: 2.9 }] },
    { len: 24, width: 11, items: [{ kind: 'kelp', at: 0, len: 9 }, { kind: 'gate', at: 15, period: 4.2, open: 0.33 }] },
    { len: 20, left: 'spikes', right: 'spikes', width: 10, items: [{ kind: 'crusher', at: 10, period: 2.7, phase: 0.3 }] },
    { len: 26, turn: 40, width: 12, items: [{ kind: 'sweeper', at: 13, side: 1, len: 7.5, swing: 80, period: 2.9 }] },
    { len: 18, width: 12, items: [{ kind: 'pickup', at: 9, d: -3, item: 'chili' }, { kind: 'pickup', at: 9, d: 3, item: 'prune' }] },

    { len: 26, checkpoint: true, width: 13 },
    { len: 28, width: 14, items: [{ kind: 'whirlpool', at: 9, d: 3.4, pull: 11.5 }, { kind: 'lightning', at: 15, beat: 1.05 }, { kind: 'whirlpool', at: 21, d: -3.4, swirl: -5, pull: 11.5 }] },
    { len: 30, turn: -45, width: 11, right: 'spikes', items: [{ kind: 'flame', at: 10, side: -1, period: 2.8, len: 5, on: 0.45 }, { kind: 'current', at: 16, push: 5, len: 12 }] },
    { len: 16, width: 12, items: [{ kind: 'gate', at: 7, period: 4, open: 0.35 }] },
    { len: 20, width: 12, items: [{ kind: 'fence', at: 10, gap: 5.2, amp: 2.6, period: 4.4 }] },
    { len: 18, width: 12, items: [{ kind: 'geyser', at: 9, d: 0, period: 3 }] },

    { len: 26, checkpoint: true, width: 12 },
    { len: 26, width: 13, items: [{ kind: 'mace', at: 8, amp: 4, period: 2.6 }, { kind: 'flame', at: 19, side: -1, period: 2.7, on: 0.45, phase: 0.4 }] },
    { len: 30, turn: -50, width: 12, left: 'spikes', items: [{ kind: 'current', at: 4, push: -5, len: 16 }, { kind: 'mine', at: 24, d: 2.5 }] },
    { len: 24, checkpoint: true, width: 12 },
    { len: 26, width: 12, flow: -2.6, items: [{ kind: 'lightning', at: 13, beat: 1.3 }] },
    { len: 22, drop: 6, left: 'open', right: 'open', flow: 3.8, width: 9.5 },

    { len: 24, checkpoint: true, width: 13, flow: 2 },
    { len: 34, width: 13, flow: 2, items: [{ kind: 'sweeper', at: 12, side: -1, len: 8.5, swing: 76, period: 3.3 }, { kind: 'sweeper', at: 28, side: 1, len: 8.5, swing: 76, period: 3.3 }] },
    { len: 22, width: 13, items: [{ kind: 'fence', at: 8, gap: 4.8, amp: 3.4, period: 4.2 }, { kind: 'spinner', at: 17, arm: 3.2, speed: 2.3, arms: 2 }] },
    { len: 10, finish: true, width: 16, flow: 1.2 },
    { len: 26, width: 20, flow: 0.15, shelf: 10 },
  ],
}

/** Levels in play order; each unlocks the next. */
export const COURSE_LIST: CourseDef[] = [LAZY_RIVER, BAYOU_BENDS, VOLCANO_PEAK, FROSTBITE_FALLS, SUNKEN_TEMPLE, CANYON_RUN, DRAGONS_GULLET, THUNDER_RUN]
/** Null-prototype so untrusted ids like "constructor" or "__proto__" never match. */
export const COURSES: Readonly<Record<string, CourseDef>> = Object.assign(Object.create(null) as Record<string, CourseDef>, Object.fromEntries(COURSE_LIST.map((c) => [c.id, c])))
export const DEFAULT_COURSE = LAZY_RIVER.id

/** Validates a course id from an untrusted source (network, storage). */
export function isCourseId(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(COURSES, id)
}

export function nextCourseId(id: string): string | null {
  const i = COURSE_LIST.findIndex((c) => c.id === id)
  return i >= 0 && i < COURSE_LIST.length - 1 ? COURSE_LIST[i + 1].id : null
}

const baked = new Map<string, BakedCourse>()

export function getCourse(id: string = DEFAULT_COURSE): BakedCourse {
  const def = isCourseId(id) ? COURSES[id] : LAZY_RIVER
  let c = baked.get(def.id)
  if (!c) {
    c = bakeCourse(def)
    baked.set(def.id, c)
  }
  return c
}
