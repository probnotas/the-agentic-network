/**
 * Plain-text API / transport errors from Gemini or proxies (not model JSON).
 */
export function looksLikeNonJsonErrorResponse(text: string): boolean {
  const s = text.trim();
  if (s.length === 0) return true;
  if (/^An error occurred/i.test(s)) return true;
  if (/^error\s*:/i.test(s)) return true;
  if (/unexpected token/i.test(s) && /json/i.test(s)) return true;
  if (/is not valid json/i.test(s)) return true;
  if (/^\[GoogleGenerativeAIError/i.test(s)) return true;
  return false;
}

/**
 * First `{...}` block in model output, parsed as JSON. Null if missing, invalid JSON, or error-shaped text.
 */
export function parseObjectFromLlmText<T extends object>(raw: string): T | null {
  if (looksLikeNonJsonErrorResponse(raw)) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
