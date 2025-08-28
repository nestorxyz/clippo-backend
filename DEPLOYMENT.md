# 🚀 Deployment Guide for DoryAI Backend

## Railway Deployment Setup

This guide covers deploying the DoryAI backend on Railway with full social media processing capabilities.

### 📋 Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Environment Variables**: Prepare all required environment variables
3. **retired-provider Setup**: Ensure your retired-provider project is configured

### 🔧 Railway Configuration

The `railway.toml` file is already configured with the necessary dependencies:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"

[build.env]
# Install system dependencies for yt-dlp and ffmpeg
NIXPACKS_INSTALL_PHASE = "apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp"

# Ensure Python is available in PATH
PYTHON_VERSION = "3.11"
```

### 🌍 Environment Variables

Set these environment variables in your Railway project dashboard:

#### Required Variables:

```env
# retired-provider Configuration
retired-provider_URL=your_retired-provider_project_url
retired-provider_ANON_KEY=your_retired-provider_anon_key
retired-provider_SERVICE_ROLE_KEY=your_retired-provider_service_role_key

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# LemonSqueezy (if using billing)
LEMONSQUEEZY_API_KEY=your_lemonsqueezy_api_key
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret

# Other configurations
NODE_ENV=production
PORT=8080
```

### 📁 retired-provider Storage Setup

Ensure your retired-provider project has the following storage bucket:

1. **Create `link-previews` bucket**:

   ```sql
   -- In retired-provider SQL Editor
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('link-previews', 'link-previews', true);
   ```

2. **Set bucket policies** (make it publicly readable):

   ```sql
   -- Allow public read access
   CREATE POLICY "Public read access" ON storage.objects
   FOR SELECT USING (bucket_id = 'link-previews');

   -- Allow authenticated uploads
   CREATE POLICY "Authenticated uploads" ON storage.objects
   FOR INSERT WITH CHECK (bucket_id = 'link-previews' AND auth.role() = 'authenticated');
   ```

### 🗄️ Database Schema

Ensure your database has the required schema updates:

```sql
-- Add content column to links table (if not already added)
ALTER TABLE links ADD COLUMN IF NOT EXISTS content TEXT;

-- Remove role constraint from chat_messages (if exists)
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
```

### 🚀 Deployment Steps

1. **Connect Repository**:

   - Go to Railway dashboard
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your backend repository

2. **Configure Build**:

   - Railway will automatically detect the `railway.toml` configuration
   - Ensure the build directory is set to your backend folder

3. **Set Environment Variables**:

   - Go to project settings → Variables
   - Add all required environment variables listed above

4. **Deploy**:
   - Push your code to the main branch
   - Railway will automatically build and deploy

### 🧪 Testing the Deployment

After deployment, test the social media processing:

```bash
# Test endpoint (replace with your Railway URL)
curl -X POST https://your-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "https://www.tiktok.com/@user/video/1234567890",
    "sessionId": "test-session",
    "userId": "test-user"
  }'
```

### 🔍 Monitoring & Debugging

1. **Check Logs**:

   - In Railway dashboard → Deployments → View Logs
   - Look for social media processing logs

2. **Common Issues**:

   **Python not found**:

   ```
   Error: yt-dlp exited with code 127: /usr/bin/env: 'python3': No such file or directory
   ```

   - Solution: Ensure `railway.toml` has correct NIXPACKS_INSTALL_PHASE

   **FFmpeg not found**:

   ```
   Error: Cannot find ffmpeg
   ```

   - Solution: Verify ffmpeg is in NIXPACKS_INSTALL_PHASE

   **Storage permissions**:

   ```
   Error: Could not upload thumbnail
   ```

   - Solution: Check retired-provider storage bucket permissions

### 📊 Performance Optimization

1. **Memory Limits**:

   - Social media processing uses temporary files
   - Ensure adequate memory allocation (512MB+ recommended)

2. **Timeout Settings**:

   - Video processing can take 30-60 seconds
   - Configure appropriate timeout limits

3. **Cleanup**:
   - Temporary files are automatically cleaned up
   - Monitor disk usage in Railway metrics

### 🛠️ Advanced Configuration

#### Custom Docker (Alternative)

If you prefer Docker over nixpacks, create a `Dockerfile`:

```dockerfile
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

EXPOSE 8080

CMD ["npm", "start"]
```

#### Environment-Specific Settings

For different environments, you can modify the configuration:

```toml
# railway.toml for staging
[environments.staging]
NIXPACKS_INSTALL_PHASE = "apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp==2023.12.30"

# railway.toml for production
[environments.production]
NIXPACKS_INSTALL_PHASE = "apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp"
```

### ✅ Deployment Checklist

- [ ] `railway.toml` configured with dependencies
- [ ] All environment variables set in Railway
- [ ] retired-provider `link-previews` bucket created
- [ ] retired-provider storage policies configured
- [ ] Database schema updated with `content` column
- [ ] Repository connected to Railway
- [ ] First deployment successful
- [ ] Social media processing tested
- [ ] Logs checked for errors
- [ ] Performance monitoring set up

### 🆘 Support

If you encounter issues:

1. Check Railway build logs
2. Verify environment variables
3. Test retired-provider connectivity
4. Validate Gemini API key
5. Monitor resource usage

The deployment should now fully support Instagram Reels and TikTok video processing with transcription and thumbnail generation! 🎉
