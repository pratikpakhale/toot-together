import type { BakedCourse, ThemeId } from '../../sim/track'

export interface Theme {
  skyTop: string
  skyHorizon: string
  fog: [near: number, far: number]
  hemi: [sky: string, ground: string, intensity: number]
  sun: [color: string, intensity: number]
  water: { deep: string; light: string; foam: string; ice: string }
  bank: { wall: string; shelf: string; cliff: string; cliffDark: string; rail: string; lip: string }
  mesa: { side: string; top: string }
  cloud: string
  lava?: string
  decor: {
    weights: { tree: number; bush: number; cane: number; rock: number }
    leaves: string[]
    trunk: string
    cane: [string, string]
    rock: [string, string]
    flowers: string[]
    lilyPads: boolean
    glow?: string
  }
  gate: { post: string; top: string }
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: {
    skyTop: '#6fc3ff',
    skyHorizon: '#eaf8ff',
    fog: [90, 380],
    hemi: ['#ffffff', '#a6d68d', 1.6],
    sun: ['#fffbe8', 1.85],
    water: { deep: '#2aa3e6', light: '#7fdcff', foam: '#ffffff', ice: '#d8f3ff' },
    bank: { wall: '#c4925f', shelf: '#8fd36b', cliff: '#b9875a', cliffDark: '#9a6f48', rail: '#f6c56b', lip: '#a6ecd6' },
    mesa: { side: '#c49567', top: '#8fd36b' },
    cloud: '#ffffff',
    decor: {
      weights: { tree: 0.42, bush: 0.36, cane: 0.06, rock: 0.16 },
      leaves: ['#5cbf4a', '#79d257', '#4fae47', '#96de5f'],
      trunk: '#8a5a36',
      cane: ['#8bcf4a', '#a5dc5a'],
      rock: ['#a7a2ad', '#bdb8c2'],
      flowers: ['#ff8fb8', '#ffd1e3', '#fff27a', '#ffffff'],
      lilyPads: true,
    },
    gate: { post: '#e9b949', top: '#5cbf4a' },
  },
  canyon: {
    skyTop: '#5fbdf3',
    skyHorizon: '#fde7cf',
    fog: [80, 360],
    hemi: ['#fff7e8', '#8fb8d8', 1.55],
    sun: ['#fff2df', 1.9],
    water: { deep: '#1f97e6', light: '#56c8f7', foam: '#ffffff', ice: '#d8f3ff' },
    bank: { wall: '#f08a46', shelf: '#f6b46a', cliff: '#df6e5c', cliffDark: '#c9584b', rail: '#84d64a', lip: '#6fe0cf' },
    mesa: { side: '#df6e5c', top: '#f6b46a' },
    cloud: '#ffffff',
    decor: {
      weights: { tree: 0.38, bush: 0.28, cane: 0.16, rock: 0.18 },
      leaves: ['#5cbf4a', '#3f9a3d', '#77cf52', '#4fae47'],
      trunk: '#8a5a36',
      cane: ['#8bcf4a', '#a5dc5a'],
      rock: ['#8f8a94', '#a39ea8'],
      flowers: ['#ff8fb8', '#ffd1e3'],
      lilyPads: true,
    },
    gate: { post: '#e9b949', top: '#5cbf4a' },
  },
  volcano: {
    skyTop: '#3d2b63',
    skyHorizon: '#ff9f72',
    fog: [60, 310],
    hemi: ['#ffd9bd', '#6a3550', 1.4],
    sun: ['#ffb27e', 1.75],
    water: { deep: '#127c8f', light: '#3fd0c4', foam: '#e9fffb', ice: '#cfe9ff' },
    bank: { wall: '#5a4b5f', shelf: '#6d5d72', cliff: '#40354a', cliffDark: '#2f2737', rail: '#ff7a2f', lip: '#ff9a3c' },
    mesa: { side: '#40354a', top: '#ff7a3a' },
    cloud: '#7a5670',
    lava: '#ff6a1f',
    decor: {
      weights: { tree: 0.14, bush: 0.08, cane: 0.3, rock: 0.48 },
      leaves: ['#6b5560', '#5a4652', '#7a6270'],
      trunk: '#2c2532',
      cane: ['#2f2737', '#40354a'],
      rock: ['#4a4350', '#5d5566'],
      flowers: ['#ff9a3c'],
      lilyPads: false,
      glow: '#ff7a2f',
    },
    gate: { post: '#5a4b5f', top: '#ff7a2f' },
  },
}

export function themeFor(course: BakedCourse): Theme {
  return THEMES[course.def.theme]
}
