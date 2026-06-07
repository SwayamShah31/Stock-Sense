export function forecastSales(history = [], daysAhead = 7) {
  const numericHistory = history.map((value) => Number(value)).filter((value) => Number.isFinite(value));

  if (!numericHistory.length) {
    return {
      forecast: Array.from({ length: daysAhead }, () => 0),
      average: 0,
      trend: 0,
    };
  }

  const recentSlice = numericHistory.slice(-Math.min(5, numericHistory.length));
  const average = recentSlice.reduce((sum, value) => sum + value, 0) / recentSlice.length;
  const first = recentSlice[0];
  const last = recentSlice[recentSlice.length - 1];
  const trend = recentSlice.length > 1 ? (last - first) / (recentSlice.length - 1) : 0;

  const forecast = Array.from({ length: daysAhead }, (_, index) => {
    const nextValue = average + trend * (index + 1);
    return Math.max(0, Number(nextValue.toFixed(2)));
  });

  return {
    forecast,
    average: Number(average.toFixed(2)),
    trend: Number(trend.toFixed(2)),
  };
}
