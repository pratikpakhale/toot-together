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
  bayou: {
    skyTop: '#4f6fa8',
    skyHorizon: '#f7c9a0',
    fog: [70, 330],
    hemi: ['#fff1dc', '#5f7d4a', 1.5],
    sun: ['#ffd9a8', 1.7],
    water: { deep: '#2f7f6d', light: '#6fc4a3', foam: '#eafff4', ice: '#d8f3ff' },
    bank: { wall: '#7a5a3a', shelf: '#6f9a45', cliff: '#6b4f36', cliffDark: '#55402d', rail: '#c9a35a', lip: '#9fd9a8' },
    mesa: { side: '#5f6e45', top: '#7fae4f' },
    cloud: '#f3e3d3',
    decor: {
      weights: { tree: 0.46, bush: 0.24, cane: 0.22, rock: 0.08 },
      leaves: ['#4f8f3a', '#5f9e45', '#3f7a35', '#7aa84f'],
      trunk: '#5a4030',
      cane: ['#8a9a4a', '#a3ad5a'],
      rock: ['#7d8075', '#959889'],
      flowers: ['#f3a6d8', '#fff2a6', '#ffffff'],
      lilyPads: true,
      glow: '#e6ff7a',
    },
    gate: { post: '#c9a35a', top: '#6f9a45' },
  },
  glacier: {
    skyTop: '#7cc4ff',
    skyHorizon: '#f2fbff',
    fog: [90, 380],
    hemi: ['#ffffff', '#b8d4ea', 1.7],
    sun: ['#ffffff', 1.8],
    water: { deep: '#2a8fd6', light: '#8fe4ff', foam: '#ffffff', ice: '#e4f7ff' },
    bank: { wall: '#9cc3e0', shelf: '#f4fbff', cliff: '#b6d6ec', cliffDark: '#8fb6d4', rail: '#ff6f61', lip: '#d4f2ff' },
    mesa: { side: '#a9cbe6', top: '#ffffff' },
    cloud: '#ffffff',
    decor: {
      weights: { tree: 0.4, bush: 0.12, cane: 0.04, rock: 0.44 },
      leaves: ['#2f6f5a', '#3a7d66', '#e8f6ff', '#2a5f4f'],
      trunk: '#6b4a3a',
      cane: ['#cfe8f7', '#e8f6ff'],
      rock: ['#cfe6f5', '#e6f4ff'],
      flowers: ['#ffffff'],
      lilyPads: false,
      glow: '#8fe9ff',
    },
    gate: { post: '#ff6f61', top: '#ffffff' },
  },
  temple: {
    skyTop: '#56b8e8',
    skyHorizon: '#fff0c8',
    fog: [80, 350],
    hemi: ['#fff5e0', '#7fa86a', 1.55],
    sun: ['#fff0d0', 1.9],
    water: { deep: '#1f9a9a', light: '#5fd8c8', foam: '#ffffff', ice: '#d8f3ff' },
    bank: { wall: '#c9a46a', shelf: '#5faa4a', cliff: '#b38c55', cliffDark: '#937045', rail: '#e9c04a', lip: '#8fe0c0' },
    mesa: { side: '#a9915f', top: '#4f9a40' },
    cloud: '#ffffff',
    decor: {
      weights: { tree: 0.5, bush: 0.3, cane: 0.1, rock: 0.1 },
      leaves: ['#3f9a3d', '#2f8a3a', '#5cbf4a', '#4fae47'],
      trunk: '#6a4a2e',
      cane: ['#7fbf4a', '#9fd05a'],
      rock: ['#b8a07a', '#cdb68c'],
      flowers: ['#ff6f8f', '#ffcf3f', '#ffffff'],
      lilyPads: true,
    },
    gate: { post: '#c9a46a', top: '#e9c04a' },
  },
  storm: {
    skyTop: '#1f2840',
    skyHorizon: '#6f7f9f',
    fog: [55, 290],
    hemi: ['#c8d6f0', '#3a4458', 1.45],
    sun: ['#d8e4ff', 1.6],
    water: { deep: '#1d4f7a', light: '#4f8fbf', foam: '#e6f2ff', ice: '#cfe2f5' },
    bank: { wall: '#4d5568', shelf: '#5d6a5a', cliff: '#3d4456', cliffDark: '#2d3242', rail: '#ffd23f', lip: '#9fd8ff' },
    mesa: { side: '#3d4456', top: '#5d6a5a' },
    cloud: '#5a6378',
    decor: {
      weights: { tree: 0.3, bush: 0.2, cane: 0.2, rock: 0.3 },
      leaves: ['#3f5a4a', '#4a6a55', '#35503f'],
      trunk: '#3a3030',
      cane: ['#4a5a4a', '#5a6a55'],
      rock: ['#5a6070', '#6d7484'],
      flowers: ['#9fd8ff'],
      lilyPads: false,
      glow: '#9fd8ff',
    },
    gate: { post: '#4d5568', top: '#ffd23f' },
  },
}

export function themeFor(course: BakedCourse): Theme {
  return THEMES[course.def.theme]
}
