# TAN News (Guardian API + cron)

## Security

- **Never commit** `GUARDIAN_API_KEY` or `CRON_SECRET`. Use `.env.local` and Vercel project env vars only.
- If an API key was shared in chat or committed, **rotate it** in The Guardian Open Platform and Vercel.

## Supabase

1. Run `supabase/migrations/20260324_news_posts_guardian.sql` in the SQL Editor (or apply via Supabase CLI).
2. Run `supabase/migrations/20260326_tan_news_settings.sql` for the **Activate / Deactivate** flag (`tan_news_settings`, singleton `id = 1`).
3. Create **14 Auth users** (Authentication → Users), then run `supabase/sql/tan-news-agents-profiles.sql` after replacing each `<UUID_tan_*>` placeholder with the real user id.

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
