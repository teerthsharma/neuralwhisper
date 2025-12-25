# 🚀 NeuralWhisper CI/CD Pipeline

## Deployment Modes

### ⚡ Speed Mode
**Trigger:** Manual dispatch only  
**Use when:** Hot fixes, quick updates, "just ship it"

```bash
# Via GitHub Actions UI
# Go to: Actions → ⚡ Speed Mode → Run workflow
```

**What it does:**
- ✅ Install dependencies (cached)
- ✅ Build production bundle
- ✅ Deploy to Vercel
- ❌ Skip lint
- ❌ Skip tests
- ❌ Skip health checks

**Time:** ~2 minutes

---

### 🚀 All Power Mode
**Trigger:** Every push to `master`/`main`  
**Use when:** Normal development, PRs, releases

```bash
# Automatic on push, or manual:
# Actions → 🚀 All Power Mode → Run workflow
```

**What it does:**
- ✅ ESLint check
- ✅ Build production bundle
- ✅ Run test suite
- ✅ Build Rust/WASM (if exists)
- ✅ Deploy to Vercel
- ✅ Health check deployed site
- ✅ Lighthouse audit (optional)

**Time:** ~5 minutes

---

## Required Secrets

Set these in: **Settings → Secrets and Variables → Actions**

| Secret | Description | How to Get |
|--------|-------------|------------|
| `VERCEL_TOKEN` | Vercel deployment token | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Your Vercel org ID | `vercel link` → `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Project ID | `vercel link` → `.vercel/project.json` |
| `VITE_GEMINI_API_KEY` | Gemini API key | Your API key |

---

## Quick Commands

```bash
# Local build before pushing
npm run build

# Deploy manually via CLI
vercel --prod

# Check deployment status
vercel ls
```

---

## Architecture

```
Push to master
      │
      ▼
┌─────────────────────────────────────┐
│        ALL POWER MODE               │
├─────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐          │
│  │  Lint   │  │  Test   │  (parallel)
│  └────┬────┘  └────┬────┘          │
│       │            │                │
│       ▼            ▼                │
│  ┌─────────────────────┐           │
│  │       Build         │           │
│  └──────────┬──────────┘           │
│             │                       │
│             ▼                       │
│  ┌─────────────────────┐           │
│  │   Deploy Vercel     │           │
│  └──────────┬──────────┘           │
│             │                       │
│             ▼                       │
│  ┌─────────────────────┐           │
│  │   Health Check      │           │
│  └─────────────────────┘           │
└─────────────────────────────────────┘
```

---

## Troubleshooting

### Build fails
```bash
# Clear cache and rebuild
npm ci
npm run build
```

### Vercel deploy fails
```bash
# Re-link project
vercel link
# Check token is valid
vercel whoami
```

### WASM build fails
```bash
# Ensure Rust is installed
rustup update stable
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```
