# Weekly Planner

A dark-themed PWA weekly planner with GitHub Gist cloud sync. Deploys to GitHub Pages automatically on every push to `main`.

## Stack

- **React 18** + **Vite 5** — fast dev server, optimized production build
- **GitHub Pages** — free hosting via GitHub Actions CI/CD
- **GitHub Gist** — private cloud data store (manual push/pull from the Sync tab)
- **Service Worker** — PWA offline support

---

## One-time setup (≈10 minutes)

### 1. Create your GitHub repo

```bash
# Clone or fork this repo, then:
git remote set-url origin https://github.com/YOUR_USERNAME/weekly-planner.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to your repo → **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### 3. Set `VITE_BASE` (only if deploying to a sub-path)

If your site will live at `https://YOUR_USERNAME.github.io/weekly-planner/` (not a custom domain):

1. Go to **Settings → Variables → Actions**
2. Add a repository variable: `VITE_BASE` = `/weekly-planner/`

If you're using a **custom domain** (e.g. `planner.yourdomain.com`), skip this step.

### 4. Push to deploy

Every push to `main` triggers a build and deploy. First deploy takes ~2 minutes.
Your live URL will appear in **Actions → Deploy to GitHub Pages → deployment step**.

---

## Gist cloud sync (cross-device)

The app stores all data in `localStorage`. The **Sync tab** lets you manually push/pull to a private GitHub Gist so data survives across devices.

### Create a PAT (Personal Access Token)

1. [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Scopes: check **`gist`** only
3. Expiration: your preference (90 days recommended)
4. Copy the token — you won't see it again

### First push (primary device)

1. Open the **Sync tab** in the app
2. Paste your PAT into the PAT field and tap away to save
3. Leave Gist ID blank
4. Tap **↑ PUSH** — the app creates a private Gist named `weekly-planner.json` and fills in the Gist ID automatically

### Pull on a second device

1. Open the app on the second device
2. Go to **Sync tab**
3. Paste the same PAT
4. Paste the Gist ID from your primary device (find it at [gist.github.com](https://gist.github.com) — it's the long string in the URL)
5. Tap **↓ PULL**

### Daily workflow

| Before switching devices | After switching devices |
|--------------------------|-------------------------|
| Tap **↑ PUSH** | Tap **↓ PULL** before editing |

Sync is manual and intentional — no background sync that could silently overwrite data.

---

## Local development

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `GitHub 401: Unauthorized` | PAT expired or missing `gist` scope — regenerate |
| `GitHub 404: Not Found` | Gist ID is wrong — find it at gist.github.com |
| `File not found in Gist` | Push from primary device first before pulling |
| Build fails in Actions | Check `VITE_BASE` variable matches your Pages URL path |
