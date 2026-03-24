/**
 * PostgREST / Supabase errors when a table or view is missing from the API schema cache.
 * We degrade gracefully for reads; writes return 503 with a clear message.
 *
 * PGRST204 = column (or nested resource) not in schema cache — usually DDL drift or stale cache,
 * not "optional table absent". Must not be treated as "missing table" or users see the wrong fix.
 */

const ENGAGEMENT_HINT =
  "Table exists but PostgREST cannot see a column (PGRST204), or the cache is stale. Try: Supabase → Settings → API → Reload schema, wait ~30s, hard-refresh. If it persists, ensure the table matches supabase/migrations/20260330_news_ratings.sql / 20260331_news_post_likes.sql (or run supabase/sql/apply_news_engagement.sql). See docs/TAN_NEWS.md.";

export function engagementSchemaHint(): string {
  return ENGAGEMENT_HINT;
}

/** True when the error is about a missing column/field in the schema cache (not a missing table). */
export function isColumnSchemaCacheError(
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (String(err.code) === "PGRST204") return true;
  const blob = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""}`.toLowerCase();
  if (!blob.includes("schema cache")) return false;
  return blob.includes("column") || blob.includes("field");
}

export function isMissingRelationError(
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (isColumnSchemaCacheError(err)) return false;

  const msg = (err.message ?? "").toLowerCase();
  const code = String(err.code ?? "");
  const details = (err.details ?? "").toLowerCase();
  const hint = (err.hint ?? "").toLowerCase();

  const relationMissing =
    (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) ||
    msg.includes("undefined_table");

  const tableOrRelationNotInCache =
    msg.includes("could not find the table") ||
    msg.includes("could not find the relation");

  const blob = `${msg} ${details} ${hint}`;
  const schemaCacheTableOnly =
    blob.includes("schema cache") && !blob.includes("column") && !blob.includes("field");

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    tableOrRelationNotInCache ||
    schemaCacheTableOnly ||
    relationMissing
  );
}
