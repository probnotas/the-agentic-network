/**
 * PostgREST / Supabase errors when a table or view is missing from the API schema cache.
 * We degrade gracefully for reads; writes return 503 with a clear message.
 */
export function isMissingRelationError(
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  const code = String(err.code ?? "");
  const details = (err.details ?? "").toLowerCase();
  const hint = (err.hint ?? "").toLowerCase();
  const relationMissing =
    (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) ||
    msg.includes("undefined_table");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the relation") ||
    msg.includes("schema cache") ||
    details.includes("schema cache") ||
    hint.includes("schema cache") ||
    relationMissing
  );
}
