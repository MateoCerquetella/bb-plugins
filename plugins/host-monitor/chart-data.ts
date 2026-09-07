const MAX_RENDER_POINTS = 720;
const SAMPLE_INTERVAL_MS = 10_000;

export function expectedSampleInterval(rangeHours: number): number {
  const rangeMs = Math.max(0, rangeHours) * 60 * 60_000;
  return Math.max(
    SAMPLE_INTERVAL_MS,
    Math.ceil((rangeMs + 1) / MAX_RENDER_POINTS / 1_000) * 1_000,
  );
}

/**
 * Mark collection gaps without increasing the number of chart rows. Replacing
 * the first row after a gap with a null row makes ECharts break the line while
 * preserving the store's strict 720-row ceiling.
 */
export function withChartGaps(
  rows: Array<Array<number | null>>,
  expectedIntervalMs: number,
): Array<Array<number | null>> {
  const maxGap = Math.max(90_000, expectedIntervalMs * 3);
  return rows.map((row, index) => {
    const previousTime = rows[index - 1]?.[0];
    const time = row[0];
    if (
      index > 0 &&
      time != null &&
      previousTime != null &&
      time - previousTime > maxGap
    ) {
      return [time, ...Array(row.length - 1).fill(null)];
    }
    return row;
  });
}
