# 🚀 Quick Deployment Checklist

## ☑️ Pre-Deployment Checklist

- [ ] **Environment Variables Set**

  - [ ] `GEMINI_API_KEY` configured
  - [ ] `retired-provider_URL` configured
  - [ ] `retired-provider_SERVICE_ROLE_KEY` configured
  - [ ] `NODE_ENV=production`

- [ ] **retired-provider Storage Setup**

  - [ ] `link-previews` bucket created
  - [ ] Bucket set to public
  - [ ] RLS policies configured

- [ ] **Code Committed**
  - [ ] All changes committed and pushed
  - [ ] `railway.toml` includes Python/yt-dlp installation
  - [ ] `Dockerfile` updated (if using Docker)

## 🔧 Railway Deployment Options

### Option 1: Nixpacks (Recommended)

Uses the `railway.toml` configuration for automatic dependency installation.

### Option 2: Dockerfile

If nixpacks fails, Railway will automatically use the Dockerfile.

## 🧪 Post-Deployment Testing

1. **Health Check**

   ```bash
   curl https://your-app.railway.app/health
   ```

2. **Social Media Test**
   Send a TikTok or Instagram URL via the chat API and check logs for:

   ```
   ✅ Video downloaded successfully
   ✅ Audio extracted and transcribed
   ✅ Thumbnail uploaded to retired-provider
   ✅ Link registered with transcript
   ```

3. **Error Monitoring**
   Watch Railway logs for any Python/yt-dlp related errors.

## 🐛 Quick Fixes

**If Python errors persist:**

1. Check Railway build logs for dependency installation
2. Verify `railway.toml` syntax
3. Try redeploying from Railway dashboard
4. Check environment variables are set correctly

**If video processing fails:**

1. Test with a simple, public TikTok/Instagram video
2. Check retired-provider storage bucket permissions
3. Monitor Railway memory usage during processing

---

**Need help?** Check the full `DEPLOYMENT_GUIDE.md` for detailed troubleshooting.
