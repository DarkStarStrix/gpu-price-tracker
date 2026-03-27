# Railway Deployment Guide

## One-Time Setup

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub repo** → choose `DarkStarStrix/gpu-price-tracker`
3. Railway will auto-detect `nixpacks.toml` and configure the build

### 2. Add a MySQL database

1. In your Railway project → **+ New** → **Database** → **MySQL**
2. Railway provisions the DB and injects `DATABASE_URL` automatically

### 3. Set environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Any long random string (e.g. `openssl rand -hex 32`) |
| `DATABASE_URL` | Auto-injected by Railway MySQL plugin |
| `LAMBDA_API_KEY` | Your Lambda Labs API key (optional) |
| `RUNPOD_API_KEY` | Your RunPod API key (optional) |
| `VAST_API_KEY` | Your Vast.ai API key (optional) |

> The Manus OAuth variables (`VITE_APP_ID`, `OAUTH_SERVER_URL`, etc.) are platform-specific and not needed on Railway — the app runs without authentication in production.

### 4. Run database migrations

After first deploy, open Railway's **Shell** tab for your service and run:

```bash
pnpm db:push
```

This creates all tables (`gpu_offers`, `price_snapshots`, `poll_logs`).

### 5. Add `RAILWAY_TOKEN` to GitHub

1. Railway → **Account Settings** → **Tokens** → **Create Token**
2. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
3. Add secret: `RAILWAY_TOKEN` = your token

From this point, every push to `main` runs tests then auto-deploys to Railway.

## How It Works

```
git push main
    └── GitHub Actions
            ├── pnpm install
            ├── tsc --noEmit (type check)
            ├── vitest run (5 tests)
            └── railway up --detach (deploy)
```

## Local Build Test

To verify the production build locally before pushing:

```bash
pnpm build
NODE_ENV=production DATABASE_URL=<your-db-url> JWT_SECRET=test pnpm start
```
