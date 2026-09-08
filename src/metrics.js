/**
 * Return the percentage change from previous to current.
 * A zero-to-zero change is defined as 0%; a positive value after zero is
 * represented by Infinity so it always exceeds any finite threshold.
 */
export function percentageChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new TypeError('Metric values must be finite numbers');
  }
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return ((current - previous) / previous) * 100;
}

export function shouldAlert(changes, thresholdPercent) {
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0) {
    throw new TypeError('Threshold must be a non-negative finite number');
  }
  return Object.values(changes).some(
    ({ percentage }) => Math.abs(percentage) > thresholdPercent,
  );
}
