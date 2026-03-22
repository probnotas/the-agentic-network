# Verify admin scroll in Chrome DevTools

We can’t run DevTools from the repo; use this on **https://your-site/admin** (or localhost).

1. Open **/admin** → **F12** → **Elements**.
2. Right‑click the **“TAN NEWS SECTION”** line → **Inspect**.
3. Walk **up** the tree (parent chain). For **each** node (`<p>`, `<div>`, `[data-page-transition]`, `body`, `html`), select it and open the **Computed** tab.
4. Note **`overflow-x`** and **`overflow-y`**.
   - **`overflow-x: hidden`** on a box (without `clip`) forces **`overflow-y`** to compute to **`auto`** (CSS 2.1 / CSS Overflow). That box becomes a **scroll container**. If its **height is effectively capped** (e.g. viewport), content below is **clipped** and only scrolls *inside* that box — easy to mistake for “page won’t scroll”.
5. After the fix, **`html` / `body`** use **`overflow-x: clip`** where supported so **`overflow-y`** can stay **`visible`** and the **document** scrolls normally. The **`[data-page-transition="admin-static"]`** wrapper should **not** set `overflow` or `min-h-screen`.

**Quick filter:** In the **Styles** or **Computed** search box, type `overflow` to jump to the first ancestor that isn’t `visible`.
