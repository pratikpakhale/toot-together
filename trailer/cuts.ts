import { REEL_SHOTS, SHOTS, type Shot } from './director'
import { STREAM_SHOTS } from './stream'

interface Cut {
  id: 'trailer' | 'reel' | 'stream'
  shots: Shot[]
  /** Seconds of title card before the first shot; 0 opens straight on gameplay. */
  intro: number
  outro: number
  stage: { w: number; h: number }
  fov: number
  /** Blob wipes between shots; off means hard cuts. */
  wipes: boolean
  /** Outro second the music stops, or null to play to the last frame so the video loops. */
  musicStopsAt: number | null
  mix: { master: number; music: number; sfx: number }
  /** The chat log under the HUD; speech bubbles over the hippos show either way. */
  chatLog: boolean
  /** How many hippos can be heard tooting at once. */
  tootVoices: number
}

const CUTS: Record<Cut['id'], Cut> = {
  trailer: {
    id: 'trailer',
    shots: SHOTS,
    intro: 4.4,
    outro: 6.4,
    stage: { w: 1920, h: 1080 },
    fov: 46,
    wipes: true,
    musicStopsAt: 4.3,
    mix: { master: 0.9, music: 0.62, sfx: 0.9 },
    chatLog: true,
    tootVoices: 4,
  },
  reel: {
    id: 'reel',
    shots: REEL_SHOTS,
    intro: 0,
    outro: 4.8,
    stage: { w: 1080, h: 1920 },
    fov: 60,
    wipes: false,
    musicStopsAt: null,
    mix: { master: 0.9, music: 0.8, sfx: 0.6 },
    chatLog: false,
    tootVoices: 1,
  },
  /** Gameplay for a streamer clip: the bottom panel of a vertical Short, no captions or title cards. */
  stream: {
    id: 'stream',
    shots: STREAM_SHOTS,
    intro: 0,
    outro: 0,
    stage: { w: 1080, h: 1152 },
    fov: 58,
    wipes: false,
    musicStopsAt: null,
    mix: { master: 0.9, music: 0.7, sfx: 0.8 },
    chatLog: false,
    tootVoices: 2,
  },
}

const asked = new URLSearchParams(location.search).get('cut')
export const CUT = CUTS[asked === 'reel' || asked === 'stream' ? asked : 'trailer']
