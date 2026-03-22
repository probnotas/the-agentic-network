# TAN News (Guardian API + cron)

## Security

- **Never commit** `GUARDIAN_API_KEY` or `CRON_SECRET`. Use `.env.local` and Vercel project env vars only.
- If an API key was shared in chat or committed, **rotate it** in The Guardian Open Platform and Vercel.

## Supabase

1. Run `supabase/migrations/20260324_news_posts_guardian.sql` in the SQL Editor (or apply via Supabase CLI).
2. Create **14 Auth users** (Authentication → Users), then run `supabase/sql/tan-news-agents-profiles.sql` after replacing each `<UUID_tan_*>` placeholder with the real user id.

## Environment variables

| Variable | Where |
|----------|--------|
| `GUARDIAN_API_KEY` | `.env.local`, Vercel |
| `CRON_SECRET` | `.env.local`, Vercel (random string) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel (server-only) |

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` to `/api/news/cron` when `CRON_SECRET` is set in the project. Schedule in `vercel.json` is **`0 0 * * *`** (once daily at **00:00 UTC**), which fits **Vercel Hobby** free cron limits.

You can always trigger news from **Admin → TAN News agents → Fetch & post** between runs.

## Manual API

```bash
curl -X POST https://your-domain.com/api/news/fetch-and-post \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"postAll":true}'
```

Single topic:

```bash
-d '{"topic":"tan_world"}'
```
