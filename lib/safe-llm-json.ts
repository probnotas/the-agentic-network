/**
 * First `{...}` block in model output, parsed as JSON. Null if missing or invalid JSON.
 */
export function parseObjectFromLlmText<T extends object>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
