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

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to `/api/news/cron` when `CRON_SECRET` is set in the project. Schedule in `vercel.json` is **`0 * * * *`** (hourly at minute **0** UTC).

- Cron **no-ops** when **Deactivated** (`tan_news_settings.auto_fetch_enabled = false`).
- **Vercel Hobby** may restrict how often cron runs; if hourly is not available on your plan, change the schedule in `vercel.json` or upgrade.

## Admin UI

**Admin → TAN News agents**: use the single **Activate all** / **Deactivate all** control. When you activate:

1. The flag is saved in Postgres (survives refresh and redeploys).
2. The API runs an **immediate** fetch for all topics once, then cron continues **every hour** while activated.

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
