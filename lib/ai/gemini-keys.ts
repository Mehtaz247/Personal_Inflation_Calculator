export function geminiApiKeys(): string[] {
  return [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
    .filter((k): k is string => !!k && k.length > 0);
}

export async function withKeyFailover<T>(
  fn: (apiKey: string) => Promise<T>,
): Promise<T> {
  const keys = geminiApiKeys();
  if (keys.length === 0) throw new Error("No Gemini API key configured");
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await fn(keys[i]);
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini key ${i + 1} failed, trying next:`, (err as any)?.message);
    }
  }
  throw lastErr;
}
