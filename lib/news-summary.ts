/** Strip basic HTML from Guardian trail text. */
export function stripHtmlToPlainText(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep at most two sentences for card summary (requirement: ~2 sentences).
 */
export function toTwoSentenceSummary(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const plain = stripHtmlToPlainText(raw);
  if (!plain) return null;
  const sentences = plain.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (sentences.length === 0) return plain.length > 280 ? `${plain.slice(0, 277)}…` : plain;
  const two = sentences.slice(0, 2).join(" ").trim();
  return two || null;
}
