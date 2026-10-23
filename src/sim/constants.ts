const TICK_RATE = 60
export const DT = 1 / TICK_RATE
export const SNAPSHOT_EVERY = 1
export const MAX_PLAYERS = 4

export const RAFT_RADIUS = 1.55

export const WALK_SPEED = 4.6
export const HIPPO_GAP = 0.6

export const FART_ACCEL = 9.5
export const FART_SPIN = 0.55
export const STAMINA_DRAIN = 0.3
export const STAMINA_REGEN = 0.42
export const STAMINA_REGEN_DELAY = 0.35
export const EXHAUST_RECOVER = 0.3
export const BURST_DV = 4.8
export const BURST_COST = 0.34
export const BURST_COOLDOWN = 1.1

export const SYNC_WINDOW = 0.3
export const SYNC_ANGLE = 0.95
export const SYNC_BONUS = 0.55
export const SYNC_DURATION = 1.6

export const WATER_DRAG = 1.15
export const ICE_DRAG = 0.12
export const ANGULAR_DRAG = 1.6
export const ICE_ANGULAR_DRAG = 0.25
export const SLOPE_GRAVITY = 15
export const MAX_SPEED = 17

export const SPIKE_INSET = 0.26
export const SPIKE_LENGTH = 0.55
export const SPIKE_REACH = SPIKE_INSET + SPIKE_LENGTH / 2
export const WALL_RESTITUTION = 0.45
export const WALL_SPIN = 0.32
export const BUMPER_RESTITUTION = 1.35
export const BUMPER_MIN_SPEED = 7

export const POP_DURATION = 1.7
export const FALL_DURATION = 1.5
export const RESPAWN_GRACE = 0.9
export const RESPAWN_AHEAD_OF_CHECKPOINT = 12
export const FALL_GRAVITY = 26

export const PICKUP_RESPAWN = 22
export const BUFF_DURATION = { beans: 6, chili: 6, prune: 5.5 } as const
export const LEGENDARY_CHANCE = 1 / 160
export const LEGENDARY_COOLDOWN = 45

export const crewScale = (n: number) => (n <= 1 ? 1.45 : 1.75 / Math.sqrt(n))
