/**
 * Seedable PRNG using the Mulberry32 algorithm.
 * Given the same seed, produces an identical sequence of values — essential for
 * deterministic map generation and reproducible tests.
 */
export interface RNG {
  /** Float in [0, 1) */
  next(): number;
  /** Integer in [0, max) */
  nextInt(max: number): number;
  /** Current internal state (for serialization / seed recovery) */
  readonly state: number;
}

export function createRNG(seed: number): RNG {
  let state = seed | 0;

  return {
    next() {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },

    get state() {
      return state;
    },
  };
}
