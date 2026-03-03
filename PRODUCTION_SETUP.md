# 🚀 Production Setup Guide

## Step 1: Database Setup (PostgreSQL)

Choose either **Supabase** or **Neon** for free PostgreSQL hosting.

### Option A: Supabase (Recommended)
1. Go to https://supabase.com and sign up
2. Create new project
3. Copy the **PostgreSQL Connection String** from Project Settings → Database → Connection Pooler
4. Format: `postgresql://[user]:[password]@[host]:[port]/[database]`

### Option B: Neon
1. Go to https://neon.tech and sign up
2. Create new project
3. Copy the **Connection String** (it should look like above)

---

## Step 2: Configure Environment Variables

### Create `.env.local` in project root
```bash
# Database (from Step 1)
DATABASE_URL="postgresql://user:password@host:port/database"

# Pusher credentials (get from https://pusher.com)
PUSHER_APP_ID="your_app_id"
NEXT_PUBLIC_PUSHER_KEY="your_public_key"
PUSHER_SECRET="your_secret_key"
NEXT_PUBLIC_PUSHER_CLUSTER="mt1"  # or your region: us2, eu, ap1, etc
TOTP_SECRET="replace_with_strong_base32_secret"

# Optional: API URL (for Vercel production)
NEXT_PUBLIC_API_URL="https://your-domain.vercel.app"
```

### Get Pusher Keys:
1. Go to https://pusher.com and sign up (free tier available)
2. Create new app
3. Copy App ID, Key, Secret, and Cluster
4. Add to `.env.local`

---

## Step 3: Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Create database tables from schema
npx prisma migrate dev --name init

# (Optional) Seed with sample data
npx prisma db seed
```

---

## Step 4: Run Development Server

```bash
npm run dev
```

Open: http://localhost:3000

---

## Step 5: Test the Application

### Basic Test Flow:
1. **Create Quiz** - Click "Create Quiz" → Add title → Add 3+ questions → Publish
2. **Join Game** - Copy join code → Open in new tab → Enter code & name → Join
3. **Play** - Wait in lobby → Answer questions → See results

---

## Step 6: Deploy to Vercel

### Prerequisites:
- GitHub repository (already set up ✅)
- Vercel account (https://vercel.com)
- Database URL ready
- Pusher keys ready

### Deployment Steps:

1. **Create Vercel Project**
   - Go to https://vercel.com/new
   - Select "Import Git Repository"
   - Choose your GitHub repo (quizzspace)
   - Click Import

2. **Configure Environment Variables**
   - In Vercel project settings → Environment Variables
   - Add all variables from `.env.local`:
     ```
     DATABASE_URL
     PUSHER_APP_ID
     PUSHER_SECRET
     NEXT_PUBLIC_PUSHER_KEY
     NEXT_PUBLIC_PUSHER_CLUSTER
   TOTP_SECRET
     NEXT_PUBLIC_API_URL (optional)
     ```

3. **Deploy**
   - Vercel will automatically deploy on git push
   - Builds take ~2-3 minutes
   - Your URL: `https://quizzspace-{random}.vercel.app`

---

## Troubleshooting

### Database Connection Error
**Error:** `Error connecting to PostgreSQL`
- Check `DATABASE_URL` format is correct
- Verify credentials and host are accessible
- Test connection: `npx prisma db execute --stdin < test.sql`

### Prisma Migration Error
**Error:** `P1001 Can't reach database`
- Ensure DATABASE_URL is set in `.env.local`
- Verify PostgreSQL server is running
- Check connection string format

### Pusher Not Connecting
**Error:** JavaScript console shows Pusher connection error
- Verify all Pusher keys in `.env.local`
- Check cluster matches Pusher app settings
- Enable JavaScript in browser

### Build Fails on Vercel
- Ensure build command is `prisma generate && next build`
- Ensure database migrations are applied before traffic cutover:
   ```bash
   npm run prisma:migrate:deploy
   ```

### Health Check Fails
**Error:** `/api/health` returns non-200
- Confirm `DATABASE_URL` is valid and database is reachable
- Verify required env vars are configured in Vercel

---

## Verification Checklist

- [ ] Database created and connection string obtained
- [ ] Pusher app created and keys obtained
- [ ] `.env.local` file created with all variables
- [ ] `npm install` completed without errors
- [ ] `npx prisma generate` ran successfully
- [ ] `npx prisma migrate dev` completed
- [ ] `npm run dev` starts without errors
- [ ] http://localhost:3000 loads in browser
- [ ] `GET /api/health` returns `{ status: "ok" }`
- [ ] Can create quiz without errors
- [ ] Can join game with code
- [ ] Real-time updates work (leaderboard updates)
- [ ] GitHub repo is up to date
- [ ] Vercel deployment linked and configured

---

## Production Checklist Before Launch

- [ ] Test all quiz flows end-to-end
- [ ] Test with multiple players simultaneously
- [ ] Verify real-time updates work correctly
- [ ] Check accessibility (tab navigation, screen reader)
- [ ] Test error scenarios (invalid codes, network issues)
- [ ] Monitor Vercel logs for any errors
- [ ] Set up database backups
- [ ] Monitor Pusher usage and costs
- [ ] Enable HTTPS (Vercel default)
- [ ] Configure custom domain (optional)

---

## Commands Reference

```bash
# Development
$env:NEXT_DISABLE_SWC=1; npm run dev

# Build
$env:NEXT_DISABLE_SWC=1; npm run build

# Database
npx prisma migrate dev --name <name>    # Create migration
npx prisma studio                       # Open database UI
npx prisma generate                     # Regenerate client

# Git
git status
git add .
git commit -m "message"
git push origin main
```
