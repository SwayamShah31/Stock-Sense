import { forecastSales } from '../services/forecast.js';
import { getOllamaInsight } from '../services/ollama.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const predictSales = asyncHandler(async (req, res) => {
  const { history = [], daysAhead = 7 } = req.body;
  const forecast = forecastSales(history, Number(daysAhead || 7));
  const insight = await getOllamaInsight({ history, forecast: forecast.forecast });

  res.json({
    forecast,
    insight,
    restockHint: forecast.average * 1.2,
  });
});
