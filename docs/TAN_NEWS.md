# TAN News (Guardian API + cron)

## Security

- **Never commit** `GUARDIAN_API_KEY` or `CRON_SECRET`. Use `.env.local` and Vercel project env vars only.
- If an API key was shared in chat or committed, **rotate it** in The Guardian Open Platform and Vercel.

## Supabase

1. Run `supabase/migrations/20260324_news_posts_guardian.sql` in the SQL Editor (or apply via Supabase CLI).
2. If inserts fail with **PGRST204** / missing `thumbnail_url` (table created from an older draft), run **`supabase/migrations/20260327_news_posts_schema_repair.sql`** — it `ADD COLUMN IF NOT EXISTS` for every `news_posts` field the app uses.
3. If inserts fail with **23514** / `news_posts_category_check`, run **`supabase/migrations/20260328_news_posts_drop_category_check.sql`** — the app stores labels like `World`, `Science`, `AI`; an old CHECK may list different values.
4. Run `supabase/migrations/20260326_tan_news_settings.sql` for the **Activate / Deactivate** flag (`tan_news_settings`, singleton `id = 1`).
5. Create **14 Auth users** (Authentication → Users), then run `supabase/sql/tan-news-agents-profiles.sql` after replacing each `<UUID_tan_*>` placeholder with the real user id.

## Environment variables

| Variable | Where |
|----------|--------|
| `GUARDIAN_API_KEY` | `.env.local`, Vercel |
| `CRON_SECRET` | `.env.local`, Vercel (random string) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel (server-only) |

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to `/api/news/cron` when `CRON_SECRET` is set in the project. Schedule in `vercel.json` is **`0 0 * * *`** (once per day at **00:00 UTC**), which matches **Vercel Hobby** (daily cron only).

- Cron **no-ops** when **Deactivated** (`tan_news_settings.auto_fetch_enabled = false`).
- On **Vercel Pro**, you can change `vercel.json` to a more frequent cron (e.g. hourly `0 * * * *`) if you need it.

## Admin UI

**Admin → TAN News agents**: use the single **Activate all** / **Deactivate all** control. When you activate:

1. The flag is saved in Postgres (survives refresh and redeploys).
2. The API runs an **immediate** fetch for all topics once, then cron continues **once per day** (UTC) while activated on the default Hobby-friendly schedule.

## Manual API (optional)

Post all topics (does not change the persisted activate flag):

```bash
curl -X POST https://your-domain.com/api/news/fetch-and-post \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"postAll":true}'
```

(Use a session cookie if your route requires an admin session; adjust to your auth.)

Single topic:

```bash
-d '{"topic":"tan_world"}'
```

Toggle persisted auto-fetch (admin session required):

```bash
curl -X PATCH https://your-domain.com/api/news/auto-fetch-settings \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'
```

## “Posted 0, skipped 0” — not always the Guardian key

The runner **resolves each `tan_*` profile in Supabase before calling the Guardian API**. If production is missing agent rows, wrong `account_type`, or points at a different Supabase project than the one you seeded locally, **every topic fails with 0/0** and the error text is often **about profiles**, not the key.

1. **Vercel → Logs** — search for `[TAN/profile]`, `[TAN/Guardian]`, `[TAN/run]`.
2. **Admin** — after activating, expand **Per-topic results** to see each `tan_*` error string.
3. **Supabase** — confirm 14 rows in `profiles` with usernames `tan_world`, …, `tan_climate` and `account_type = 'agent'`.
4. **Env alignment** — `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Vercel must be the **same project** where those profiles exist.
5. **Guardian** — only if the per-topic error is `Guardian API: …` or `Invalid API key` is it key-related; `response.status === "error"` is handled and surfaced as an error message.

### PGRST204 / missing `thumbnail_url`

PostgREST’s schema cache only exposes columns that exist on the table. This error almost always means **`news_posts` was created earlier without that column** (e.g. an old SQL draft). PostgreSQL **`CREATE TABLE IF NOT EXISTS`** does **not** add new columns to an existing table.

**Fix:** run **`supabase/migrations/20260327_news_posts_schema_repair.sql`** in the Supabase SQL Editor on the **same project** Vercel uses. Then in Dashboard → **Settings → API** use **Reload schema** if errors persist for a minute.

**`tan_ai` returned 0 Guardian results:** try redeploying (query uses **`section=technology`**). If it persists, check Vercel logs for `[TAN/Guardian]` on that topic.

### 23514 / `news_posts_category_check`

The app inserts `category` values like **`World`**, **`Science`**, **`AI`** (see `TOPIC_TO_NEWS_CATEGORY`). A DB **`CHECK`** on `category` with a different allow-list causes **23514**.

**Fix:** run **`supabase/migrations/20260328_news_posts_drop_category_check.sql`** in the SQL Editor, then reload schema if needed.
