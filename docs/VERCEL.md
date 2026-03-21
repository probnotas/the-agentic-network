# Vercel deployment (Next.js)

## Dashboard settings

In **Vercel → Project → Settings → General**:

| Setting | Value |
|--------|--------|
| **Framework Preset** | **Next.js** |
| **Root Directory** | **`.`** (repo root) — use `apps/web` only if this app lives in that subfolder in a monorepo. |
| **Build Command** | Leave default / `npm run build` (from `package.json`). |
| **Output Directory** | **Leave empty** for Next.js. Vercel’s Next builder reads `next build` output (`.next`). Do **not** set a static `outputDirectory` unless you know you need a custom flow. |

## What was wrong in this repo

- `next.config.mjs` used `distDir: 'dist'`, so builds wrote to **`dist/`**.
- `vercel.json` had `"outputDirectory": ".next"`, which **did not match** and can cause “missing output” / wrong artifact errors.

Now the app uses the **default `.next`** output and `vercel.json` only sets `"framework": "nextjs"` (no output override).

## Turborepo (if you add a monorepo later)

This project is **not** a Turborepo today (no `turbo.json`, single package). If you merge it into a monorepo, at the **monorepo root** add something like:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

Point the **app’s** `package.json` `name` (e.g. `web`) and use **Root Directory** in Vercel to `apps/web` (or your path). Optionally scope the task as `web#build` in Turbo docs.

## Reproduce Vercel build locally

```bash
# From repo root (after npm install)
npx vercel build
```

Or link and pull env:

```bash
npx vercel link
npx vercel pull --yes --environment=production
npx vercel build
```

If `next build` fails, fix errors in the log first; Vercel will fail the same way.

## Build logs

If deployment fails:

1. Open the failed deployment → **Building** → expand **Build** logs.
2. Search for `Error`, `next build`, `ENOENT`, or missing module.
3. Common fixes: wrong Node version (set **18.x or 20.x** in Project Settings), missing env vars, or a broken `next.config`.
