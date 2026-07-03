import { describe, it, expect } from 'vitest';
import { createRNG } from '../game/rng';

describe('RNG (Mulberry32)', () => {
  it('same seed produces identical sequence', () => {
    const a = createRNG(42);
    const b = createRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createRNG(1);
    const b = createRNG(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() returns values in [0, 1)', () => {
    const rng = createRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(n) returns values in [0, n)', () => {
    const rng = createRNG(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('nextInt(1) always returns 0', () => {
    const rng = createRNG(7);
    for (let i = 0; i < 100; i++) {
      expect(rng.nextInt(1)).toBe(0);
    }
  });

  it('handles seed=0', () => {
    const rng = createRNG(0);
    expect(rng.next()).toBeGreaterThanOrEqual(0);
  });

  it('handles seed=-1 (negative)', () => {
    const rng = createRNG(-1);
    expect(rng.next()).toBeGreaterThanOrEqual(0);
  });

  it('handles large seed (2^31-1)', () => {
    const rng = createRNG(2147483647);
    expect(rng.next()).toBeGreaterThanOrEqual(0);
  });

  it('state getter reflects internal state', () => {
    const rng = createRNG(100);
    const s0 = rng.state;
    rng.next();
    expect(rng.state).not.toBe(s0);
  });

  it('uniform distribution (10k samples, 10 buckets)', () => {
    const rng = createRNG(Date.now());
    const buckets = new Array(10).fill(0);
    const N = 10000;
    for (let i = 0; i < N; i++) {
      buckets[Math.floor(rng.next() * 10)]++;
    }
    // Each bucket should have ~1000 samples; allow ±150 (3σ approx)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});
