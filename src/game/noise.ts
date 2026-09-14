export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  return () => {
    let next = (seed += 0x6d2b79f5);
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function lattice(seed: number, x: number, z: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= seed;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise2D(
  seed: number,
  x: number,
  z: number,
  scale = 1,
): number {
  const sampleX = x / scale;
  const sampleZ = z / scale;
  const x0 = Math.floor(sampleX);
  const z0 = Math.floor(sampleZ);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = fade(sampleX - x0);
  const tz = fade(sampleZ - z0);
  const a = lattice(seed, x0, z0);
  const b = lattice(seed, x1, z0);
  const c = lattice(seed, x0, z1);
  const d = lattice(seed, x1, z1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

export function fbm2D(seed: number, x: number, z: number): number {
  let total = 0;
  let amplitude = 0.58;
  let scale = 28;
  let normalizer = 0;

  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise2D(seed + octave * 811, x, z, scale) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    scale *= 0.52;
  }

  return total / normalizer;
}
