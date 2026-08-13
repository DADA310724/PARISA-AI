## Render Deployment Guide — PARISA AI

### Step 1: Prepare Your Repository

```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Create Render Service

1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub account
4. Select `DADA310724/PARISA-AI` repository
5. Fill in settings:

**Basic Settings:**
- Name: `parisa-ai`
- Region: `Singapore` (or nearest)
- Branch: `main`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `node --max-old-space-size=512 server.js`

**Plan:**
- Free or Starter (minimum $7/month for production)
- Memory: 512 MB minimum

### Step 3: Add Environment Variables

In Render Dashboard → Environment:

```bash
# AI API Keys (required — choose at least one)
GEMINI_API_KEY=your-google-gemini-key-here
GROQ_API_KEY=your-groq-key-here
OPENROUTER_API_KEY=your-openrouter-key-here
DEEPSEEK_API_KEY=your-deepseek-key-here

# Google Drive (for screenshot analysis)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}

# Firebase (optional logging)
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# Telegram (optional notifications)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Server
PORT=3000
BASE_PATH=/
```

### Step 4: Deploy

1. Click "Create Web Service"
2. Render will auto-deploy from GitHub
3. Wait for build to complete
4. Your service will be live at: `https://parisa-ai.onrender.com`

### Step 5: Verify Deployment

```bash
# Health check
curl https://parisa-ai.onrender.com/healthz

# Search chat
curl -X POST https://parisa-ai.onrender.com/search-chat \
  -H "Content-Type: application/json" \
  -d '{"query": "জানুয়ারি 2025"}'

# Chat with streaming
curl -X POST https://parisa-ai.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role":"user","text":"4 জানুয়ারি 2025 কী হয়েছিল?"}],
    "userName":"রুবেল"
  }'
```

### Step 6: Set Up Auto-Deploy

**Option A: Automatic (Recommended)**
- Render auto-deploys on GitHub push
- No additional setup needed
- Deployment takes 2-5 minutes

**Option B: Manual Deploy**
```bash
# Push to trigger deploy
git push origin main
```

### Environment Variables Setup

#### Required: At Least One AI Provider

**Google Gemini:**
- Get from: [Google AI Studio](https://makersuite.google.com/app/apikey)
- Format: Simple API key

**Groq:**
- Get from: [console.groq.com](https://console.groq.com)
- Format: Bearer token

**OpenRouter:**
- Get from: [openrouter.ai](https://openrouter.ai/keys)
- Format: API key

**DeepSeek:**
- Get from: [platform.deepseek.com](https://platform.deepseek.com)
- Format: API key

#### Optional: Google Drive (Screenshot Vision)

1. Create Google Cloud Project
2. Enable Google Drive API
3. Create Service Account
4. Download JSON key
5. Copy-paste entire JSON as `GOOGLE_SERVICE_ACCOUNT_JSON`

#### Optional: Telegram Notifications

1. Create Telegram bot: [@BotFather](https://t.me/botfather)
2. Get bot token
3. Get your chat ID: [@userinfobot](https://t.me/userinfobot)

### Troubleshooting

#### Build Fails
- Check `npm install` runs successfully
- Ensure Node 18+ installed
- Check for missing dependencies

#### Service Won't Start
- Check logs in Render Dashboard
- Verify memory allocation (512MB minimum)
- Check PORT environment variable (should be 3000)

#### Database Not Found
- Upload `chat_database.json` to repository
- Ensure file is committed to GitHub
- Verify file path is correct

#### API Not Working
- Check environment variables in Render
- Verify API keys are valid
- Check server logs for errors

#### Slow Response
- Add more memory tier
- Upgrade to paid Render plan
- Check database size (under 50MB recommended)

### Performance Optimization

**For Render Free Tier:**
- Typical response: 5-15 seconds
- First request may timeout (cold start)

**For Render Starter/Standard:**
- Typical response: 1-3 seconds
- No cold start delays

**Memory Settings:**
```
- Free: 512MB max
- Starter: 512MB-2GB
- Standard: 2GB-8GB
```

### Monitoring

**Render Dashboard:**
- View real-time logs
- Monitor CPU/memory usage
- Check deployment history
- View error rates

**Health Check:**
```bash
# Endpoint: /healthz
# Returns JSON with service status
{
  "ok": true,
  "version": "V-26-PROD",
  "tts": true,
  "driveFiles": 47,
  "historyLoaded": true,
  "keys": {
    "gemini": 4,
    "groq": 2,
    "openrouter": 1
  }
}
```

### Cost Estimation

| Tier | Price | Best For |
|------|-------|----------|
| Free | $0 | Development |
| Starter | $7/mo | Light production |
| Standard | $25/mo | Heavy production |
| Pro | Custom | Enterprise |

### Maintenance

**Weekly:**
- Check logs for errors
- Monitor API usage
- Verify health check passing

**Monthly:**
- Update dependencies: `npm update`
- Review API rate limits
- Optimize database size

**Quarterly:**
- Major version updates
- Security patches
- Performance tuning

### Support

- **Issues**: GitHub Issues
- **Render Help**: [render.com/docs](https://render.com/docs)
- **Deploy Logs**: Render Dashboard → Logs tab

---

**Deployed Successfully! 🚀**

Your PARISA AI is now live on Render and ready to serve!
