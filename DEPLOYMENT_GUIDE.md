# 🚀 Railway Deployment Guide for Social Media Processing

This guide covers deploying the enhanced backend with social media video processing capabilities to Railway.

## 📋 Prerequisites

Before deploying, ensure you have:

1. **Railway Account** - [Sign up here](https://railway.app)
2. **GitHub Repository** connected to Railway
3. **Environment Variables** configured
4. **Supabase Storage Bucket** set up

## 🛠️ Railway Configuration

### 1. railway.toml Configuration

The `railway.toml` file in your backend directory should contain:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"

[build.env]
# Install Python3, pip, ffmpeg, and yt-dlp for social media processing
NIXPACKS_INSTALL_PHASE = "apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp"

# Ensure Python3 is available in PATH
NIXPACKS_BUILD_PHASE = "npm ci && python3 --version && yt-dlp --version && ffmpeg -version"
```

### 2. Environment Variables

Set these in your Railway dashboard under **Variables**:

```bash
# Required for AI transcription
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Custom configurations
NODE_ENV=production
PORT=3000
```

## 🗄️ Supabase Storage Setup

### 1. Create Storage Bucket

In your Supabase dashboard:

1. Go to **Storage** → **Buckets**
2. Create a new bucket named `link-previews`
3. Set it to **Public** (for thumbnail access)

### 2. Bucket Policies

Add this RLS policy for the `link-previews` bucket:

```sql
-- Allow public read access to thumbnails
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'link-previews');

-- Allow service role to upload/delete
CREATE POLICY "Service Role Access" ON storage.objects FOR ALL USING (auth.role() = 'service_role');
```

## 🏗️ Deployment Steps

### 1. Push Code Changes

```bash
# Ensure all changes are committed
git add .
git commit -m "Add social media processing with deployment config"
git push origin main
```

### 2. Railway Deployment

1. **Connect Repository**: In Railway dashboard, connect your GitHub repo
2. **Select Backend**: Choose the `backend` folder as the root directory
3. **Environment Variables**: Add all required variables
4. **Deploy**: Railway will automatically build and deploy

### 3. Verify Installation

Check the build logs for these confirmations:

```bash
✅ Python 3.x.x installed
✅ yt-dlp x.x.x installed
✅ ffmpeg version x.x.x installed
✅ npm packages installed
✅ Build successful
```

## 🧪 Testing Social Media Processing

### 1. Test Endpoints

```bash
# Test basic health check
curl https://your-railway-app.railway.app/health

# Test social media processing (via chat)
curl -X POST https://your-railway-app.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "https://www.instagram.com/reel/example",
    "sessionId": "test-session",
    "userId": "test-user"
  }'
```

### 2. Monitor Logs

Watch Railway logs for:

```bash
✅ Social media URL detected
✅ Video downloaded successfully
✅ Audio extracted and transcribed
✅ Thumbnail uploaded to Supabase
✅ Link registered with transcript
```

## 🐛 Troubleshooting

### Common Issues:

#### 1. Python Not Found Error

```bash
Error: yt-dlp exited with code 127: /usr/bin/env: 'python3': No such file or directory
```

**Solution**: Ensure `railway.toml` includes Python3 installation:

```toml
NIXPACKS_INSTALL_PHASE = "apt-get update && apt-get install -y python3 python3-pip ffmpeg && pip3 install yt-dlp"
```

#### 2. FFmpeg Not Found

```bash
Error: FFmpeg not found
```

**Solution**: Add `ffmpeg` to the install phase in `railway.toml`.

#### 3. yt-dlp Download Fails

```bash
Error: Video download failed
```

**Possible causes**:

- Video is private/restricted
- Video exceeds 2-minute limit
- Network timeout

**Solutions**:

- Check video accessibility
- Increase timeout in `socialMedia.service.ts`
- Add retry logic

#### 4. Supabase Storage Upload Fails

```bash
Error: Thumbnail upload failed
```

**Solutions**:

- Verify `link-previews` bucket exists
- Check bucket is public
- Verify `SUPABASE_SERVICE_ROLE_KEY` permissions

#### 5. Memory Issues

```bash
Error: JavaScript heap out of memory
```

**Solution**: Increase Railway memory allocation or optimize video processing.

## 📊 Monitoring & Performance

### 1. Railway Metrics

Monitor in Railway dashboard:

- **CPU Usage**: Should spike during video processing
- **Memory Usage**: Watch for memory leaks
- **Request Duration**: Video processing takes 10-30 seconds
- **Error Rate**: Monitor failed processing attempts

### 2. Logging

The app logs detailed processing steps:

```bash
🎬 Processing social media URL: [URL]
📥 Video downloaded: [size]MB, duration: [time]s
🎵 Audio extracted: [size]KB
📝 Transcript: [length] characters
🖼️ Thumbnail uploaded: [URL]
✅ Processing complete in [time]ms
```

### 3. Performance Optimization

**Tips for better performance**:

1. **Video Duration Limits**: Current limit is 2 minutes
2. **Concurrent Processing**: Limit concurrent video downloads
3. **Cleanup**: Temporary files are auto-cleaned
4. **Caching**: Consider caching popular video transcripts
5. **CDN**: Use Railway's edge locations

## 🔒 Security Considerations

1. **API Keys**: Never commit API keys to code
2. **Storage Access**: Use least-privilege policies
3. **Input Validation**: URLs are validated before processing
4. **Rate Limiting**: Consider adding rate limits for video processing
5. **File Cleanup**: Temporary files are cleaned automatically

## 🎯 Success Metrics

Your deployment is successful when:

✅ **Build Completes**: All dependencies installed  
✅ **App Starts**: Server responds to health checks  
✅ **Social Media Processing**: Videos download and transcribe  
✅ **Storage Works**: Thumbnails upload successfully  
✅ **AI Integration**: Transcripts enhance categorization

## 📞 Support

If you encounter issues:

1. **Check Railway Logs**: Most issues show in build/runtime logs
2. **Verify Environment Variables**: Ensure all keys are set correctly
3. **Test Dependencies**: Verify Python3, yt-dlp, and ffmpeg are available
4. **Monitor Supabase**: Check storage bucket and database connections

---

**🎉 Congratulations!** Your social media processing pipeline is now deployed and ready to enhance your link management with rich video content analysis!
