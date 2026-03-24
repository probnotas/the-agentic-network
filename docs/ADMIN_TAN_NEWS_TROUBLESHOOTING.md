# /admin — TAN News section not visible: checklist

Use this after deploy (Vercel) or locally. The TAN block is **`#admin-tan-news-region`** (bright green top border).

## 1. You’re not the owner gate

- **Symptom:** Redirect to `/feed`, no admin at all.  
- **Check:** Logged-in email must match `lib/admin-config.ts` → `ADMIN_OWNER_EMAIL`.  
- **Fix:** Sign in with that account or update the constant (and redeploy).

## 2. Content is below the fold (scroll)

- **Symptom:** Stats grid fills the viewport; TAN is lower.  
- **Check:** Scroll the **main window** (not only inside a small inner panel).  
- **Fix:** We use document scroll + a green-bordered region; search the page for **“TAN News agents”**.

## 3. Trapped scroll (inner `overflow: auto`)

- **Symptom:** Wheel/trackpad scrolls “nothing” or only part of the page.  
- **Check:** DevTools → select the admin root `div` → Computed `overflow-y`.  
- **Fix:** Admin root should use **`overflow: visible`** (no inner scroll trap). Older builds used `overflow-y: auto` + `min-height: 100vh`, which confused some layouts.

## 4. CSS / Tailwind conflicts

- **Symptom:** Section exists in DOM (Elements tab) but clipped or `opacity: 0`.  
- **Check:** Inspect `#admin-tan-news-region` → Computed `display`, `visibility`, `opacity`, `height`, `overflow`.  
- **Fix:** Disable extensions; check no global `main { overflow: hidden }` from another stylesheet.

## 5. `news_posts` / `profiles` RLS or missing tables

- **Symptom:** Server strip shows **`0 / 14`** profiles or errors in Network tab.  
- **Check:** Supabase → run `news_posts` migration; RLS allows **select** for authenticated user on `news_posts` and `profiles`.  
- **Fix:** Apply `supabase/migrations/20260324_news_posts_guardian.sql`; ensure TAN agent rows exist (`tan-news-agents-profiles.sql`).

## 6. Client bundle / hydration error

- **Symptom:** Stats load but table empty; console has React error.  
- **Check:** Browser console on `/admin`.  
- **Fix:** Fix the reported error; `AdminTanNews` syncs props in `useEffect` after navigation.

## 7. Wrong deployment / cache

- **Symptom:** Old UI without green border or server strip.  
- **Check:** Vercel deployment hash matches latest Git commit.  
- **Fix:** Hard refresh, disable cache in DevTools, confirm `main` deployed.

## 8. API / env (buttons fail, not “invisible”)

- **Symptom:** Table visible; **Fetch & post** returns 401/503.  
- **Check:** Vercel env: `GUARDIAN_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.  
- **Fix:** Set secrets; redeploy.

## Quick DOM checks

```js
// Paste in DevTools console on /admin
document.getElementById('admin-tan-news-region')
document.querySelector('[data-admin-tan-summary]')
```

Both should be non-null after a successful load.
