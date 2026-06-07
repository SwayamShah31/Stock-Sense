export async function getOllamaInsight({ history = [], forecast = [] }) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const prompt = [
    'You are StockSense AI, a retail inventory and sales assistant.',
    'Use only retail, stock, billing, and restocking language.',
    'Do not mention restaurants, food, menus, or unrelated industries.',
    `Historical daily sales: ${JSON.stringify(history)}`,
    `Forecast for the next days: ${JSON.stringify(forecast)}`,
    'Return exactly three short bullet points:',
    '1. Sales trend insight.',
    '2. Restocking recommendation.',
    '3. Risk note.',
    'Keep the answer concise, factual, and focused on this store only.',
  ].join(' ');

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}`);
    }

    const data = await response.json();
    return data?.message?.content || 'No AI insight returned.';
  } catch {
    return 'Ollama is unavailable locally. Using deterministic forecast only.';
  }
}
