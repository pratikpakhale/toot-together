import { DT, SNAPSHOT_EVERY } from '../../sim/constants'

const WINDOW = 5
const JITTER_PERCENTILE = 0.95
const MARGIN = 0.003
const MIN_DELAY = SNAPSHOT_EVERY * DT + MARGIN
const MAX_DELAY = 0.25
const WARMUP_SAMPLES = 30
const WARMUP_DELAY = 0.06
const SHRINK_RATE = 0.02
const RESYNC = 1

export class SnapshotClock {
  private arrivals: number[] = []
  private lags: number[] = []
  private minLag: number | null = null
  delay = WARMUP_DELAY

  onSnapshot(t: number, now: number) {
    const lag = now - t
    if (this.minLag !== null && Math.abs(lag - this.minLag) > RESYNC) this.reset()
    this.arrivals.push(now)
    this.lags.push(lag)
    let drop = 0
    while (drop < this.arrivals.length && now - this.arrivals[drop] > WINDOW) drop++
    if (drop) {
      this.arrivals.splice(0, drop)
      this.lags.splice(0, drop)
    }

    const sorted = Float64Array.from(this.lags).sort()
    this.minLag = sorted[0]
    const jitter = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * JITTER_PERCENTILE))] - this.minLag
    let target = Math.min(MAX_DELAY, Math.max(MIN_DELAY, SNAPSHOT_EVERY * DT + jitter + MARGIN))
    if (sorted.length < WARMUP_SAMPLES) target = Math.max(target, WARMUP_DELAY)
    const elapsed = this.arrivals.length > 1 ? now - this.arrivals[this.arrivals.length - 2] : 0
    this.delay = target >= this.delay ? target : Math.max(target, this.delay - SHRINK_RATE * elapsed)
  }

  get synced() {
    return this.minLag !== null
  }

  renderTime(now: number) {
    return now - (this.minLag ?? 0) - this.delay
  }

  reset() {
    this.arrivals = []
    this.lags = []
    this.minLag = null
    this.delay = WARMUP_DELAY
  }
}
