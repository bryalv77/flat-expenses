export function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** Sample standard deviation over the mean; null with fewer than 2 values or a zero mean. */
export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = (values.reduce((s, v) => s + v, 0)) / values.length;
  if (m === 0) return null;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / m;
}

/** Recency-weighted mean: the i-th oldest of n values has weight i+1. */
export function weightedRecentAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += v * (i + 1);
    den += i + 1;
  });
  return num / den;
}
