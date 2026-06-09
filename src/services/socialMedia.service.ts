import { YtDlp } from 'ytdlp-nodejs';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { convex, api } from '../config/convex';

interface SocialMediaInfo {
  title: string;
  description: string;
  transcript?: string;
  thumbnailUrl?: string;
  duration?: number;
  platform: 'instagram' | 'tiktok';
}

interface ProcessingResult {
  success: boolean;
  info?: SocialMediaInfo;
  error?: string;
}

export class SocialMediaService {
  private ytdlp: YtDlp;
  private genAI: GoogleGenAI;
  private tempDir: string;
  private isProductionWithoutPython: boolean = false;

  constructor() {
    this.ytdlp = new YtDlp();
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY!,
    });
    this.tempDir = path.join(os.tmpdir(), 'social-media-temp');

    // Check if we're in production without Python (async initialization)
    this.checkPythonAvailability();
  }

  private async checkPythonAvailability(): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const python = spawn('python3', ['--version']);

      python.on('error', () => {
        console.log(
          '⚠️ Python3 not available, using fallback mode for social media processing',
        );
        this.isProductionWithoutPython = true;
      });

      python.on('close', (code: number) => {
        if (code !== 0) {
          console.log(
            '⚠️ Python3 check failed, using fallback mode for social media processing',
          );
          this.isProductionWithoutPython = true;
        }
      });
    } catch (error) {
      console.log(
        '⚠️ Unable to check Python availability, using fallback mode',
      );
      this.isProductionWithoutPython = true;
    }
  }

  /**
   * Check if URL is from supported social media platforms
   */
  isSocialMediaUrl(url: string): boolean {
    const socialMediaPatterns = [
      /https?:\/\/(?:www\.)?instagram\.com\/reel\/[^/?]+/,
      /https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
      /https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9]+\/?/,
    ];

    return socialMediaPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): 'instagram' | 'tiktok' | null {
    if (url.includes('instagram.com/reel/')) return 'instagram';
    if (url.includes('tiktok.com') || url.includes('vm.tiktok.com'))
      return 'tiktok';
    return null;
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(filePaths: string[]): Promise<void> {
    const cleanupPromises = filePaths.map(async (filePath) => {
      try {
        await fs.access(filePath); // Check if file exists first
        await fs.unlink(filePath);
        console.log(`🧹 Cleaned up temp file: ${path.basename(filePath)}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(
            `⚠️ Failed to delete temp file ${filePath}:`,
            error.message,
          );
        }
        // ENOENT means file doesn't exist, which is fine - no need to warn
      }
    });
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Extract audio from video using ffmpeg
   */
  private async extractAudio(
    videoPath: string,
    audioPath: string,
  ): Promise<void> {
    // Try multiple audio extraction approaches
    const methods = [
      // Method 1: libmp3lame (most common)
      () => this.extractAudioWithCodec(videoPath, audioPath, 'libmp3lame'),
      // Method 2: aac (fallback)
      () =>
        this.extractAudioWithCodec(
          videoPath,
          audioPath.replace('.mp3', '.aac'),
          'aac',
        ),
      // Method 3: copy audio stream (fastest, no re-encoding)
      () =>
        this.extractAudioWithCodec(
          videoPath,
          audioPath.replace('.mp3', '.aac'),
          'copy',
        ),
    ];

    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`🎵 Trying audio extraction method ${i + 1}...`);
        await methods[i]();
        console.log(`🎵 Audio extraction successful with method ${i + 1}`);
        return;
      } catch (error) {
        console.log(`🎵 Method ${i + 1} failed:`, error);
        if (i === methods.length - 1) {
          throw new Error(
            `All audio extraction methods failed. Last error: ${error}`,
          );
        }
      }
    }
  }

  /**
   * Extract audio with specific codec
   */
  private async extractAudioWithCodec(
    videoPath: string,
    audioPath: string,
    codec: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath).output(audioPath);

      if (codec === 'copy') {
        command.audioCodec('copy');
      } else {
        command.audioCodec(codec).audioBitrate('128k').audioFrequency(44100);
      }

      command
        .noVideo()
        .on('end', () => {
          console.log(`🎵 Audio extraction completed with codec: ${codec}`);
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(
              `🎵 Audio extraction progress: ${Math.round(progress.percent)}%`,
            );
          }
        })
        .run();
    });
  }

  /**
   * Extract thumbnail from video
   */
  private async extractThumbnail(
    videoPath: string,
    thumbnailPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['0.5'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '720x1280',
        })
        .on('end', () => {
          console.log('🖼️ Thumbnail extraction completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('🖼️ Thumbnail extraction failed:', err);
          reject(err);
        });
    });
  }

  /**
   * Upload thumbnail to Convex Storage
   */
  private async uploadThumbnail(thumbnailPath: string): Promise<string | null> {
    try {
      const fileBuffer = await fs.readFile(thumbnailPath);

      // 1. Generate upload URL
      const uploadUrl = await convex.mutation(
        api.storage.generateUploadUrlForBackend,
        {
          secret: process.env.CONVEX_BACKEND_SECRET,
        },
      );

      // 2. Upload file to URL
      const uploadResult = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: fileBuffer,
      });

      if (!uploadResult.ok) {
        throw new Error(`Upload failed: ${uploadResult.statusText}`);
      }

      const { storageId } = (await uploadResult.json()) as any;

      // 3. Get public URL
      const publicUrl = await convex.query(api.storage.getPublicUrl, {
        storageId,
        secret: process.env.CONVEX_BACKEND_SECRET,
      });

      return publicUrl;
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      return null;
    }
  }

  /**
   * Transcribe audio using Gemini
   */
  private async transcribeAudio(audioPath: string): Promise<string> {
    try {
      // Determine MIME type based on file extension
      const extension = path.extname(audioPath).toLowerCase();
      let mimeType = 'audio/mpeg'; // default

      if (extension === '.aac') {
        mimeType = 'audio/aac';
      } else if (extension === '.wav') {
        mimeType = 'audio/wav';
      } else if (extension === '.m4a') {
        mimeType = 'audio/mp4';
      }

      console.log(`🎤 Uploading audio file for transcription (${mimeType})...`);

      // Upload audio file to Gemini
      const uploadResult = await this.genAI.files.upload({
        file: audioPath,
        config: { mimeType },
      });

      console.log(`🎤 Audio uploaded, generating transcript...`);

      // Generate transcript
      const result = await this.genAI.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  mimeType: uploadResult.mimeType,
                  fileUri: uploadResult.uri,
                },
              },
              {
                text: 'Generate a complete and accurate transcript of the speech in this audio. Include all spoken words, but clean up any filler words or false starts to make it more readable.',
              },
            ],
          },
        ],
      });

      // Clean up uploaded file from Gemini
      try {
        if (uploadResult.name) {
          await this.genAI.files.delete({ name: uploadResult.name });
        }
      } catch (deleteError) {
        console.warn('Failed to delete Gemini file:', deleteError);
      }

      const transcript = result.text || '';
      console.log(
        `🎤 Transcription completed (${transcript.length} characters)`,
      );
      return transcript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Failed to transcribe audio: ${error}`);
    }
  }

  /**
   * Process social media video URL
   */
  async processSocialMediaVideo(url: string): Promise<ProcessingResult> {
    const platform = this.detectPlatform(url);
    if (!platform) {
      return { success: false, error: 'Unsupported platform' };
    }

    // Check if Python is available for yt-dlp
    if (this.isProductionWithoutPython) {
      console.log(
        '⚠️ Python not available, using fallback social media processing',
      );
      return this.processSocialMediaFallback(url, platform);
    }

    let tempFiles: string[] = [];
    let actualAudioPath = '';

    try {
      await this.ensureTempDir();

      // Generate unique file names
      const timestamp = Date.now();
      const videoPath = path.join(this.tempDir, `video_${timestamp}.mp4`);
      const baseAudioPath = path.join(this.tempDir, `audio_${timestamp}`);
      const thumbnailPath = path.join(
        this.tempDir,
        `thumbnail_${timestamp}.jpg`,
      );

      tempFiles = [videoPath, thumbnailPath]; // We'll add audio file later when we know the extension

      console.log('🎬 Starting video download from:', platform);

      // Get video info first
      const videoInfo = await this.ytdlp.getInfoAsync(url);

      if (videoInfo._type !== 'video') {
        return { success: false, error: 'Invalid video URL' };
      }

      // Check duration (max 2 minutes = 120 seconds)
      if (videoInfo.duration && videoInfo.duration > 120) {
        return {
          success: false,
          error: 'Video too long (max 2 minutes allowed)',
        };
      }

      // Download video with timeout
      console.log('📥 Downloading video...');
      await Promise.race([
        this.ytdlp.downloadAsync(url, {
          output: videoPath,
          format: 'best[ext=mp4]/best',
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Download timeout')), 60000),
        ),
      ]);

      // Extract audio for transcription (this will determine the final audio path)
      console.log('🎵 Extracting audio...');
      const initialAudioPath = `${baseAudioPath}.mp3`;
      actualAudioPath = initialAudioPath;

      try {
        await this.extractAudio(videoPath, initialAudioPath);
        actualAudioPath = initialAudioPath;
      } catch (error) {
        // Try with .aac extension
        const aacAudioPath = `${baseAudioPath}.aac`;
        await this.extractAudio(videoPath, aacAudioPath);
        actualAudioPath = aacAudioPath;
      }

      tempFiles.push(actualAudioPath); // Add the actual audio file to cleanup list

      // Extract thumbnail
      console.log('🖼️ Extracting thumbnail...');
      await this.extractThumbnail(videoPath, thumbnailPath);

      // Transcribe audio
      console.log('📝 Transcribing audio...');
      const transcript = await this.transcribeAudio(actualAudioPath);

      // Upload thumbnail to retired-provider
      console.log('☁️ Uploading thumbnail...');
      const thumbnailUrl = await this.uploadThumbnail(thumbnailPath);

      const result: SocialMediaInfo = {
        title: videoInfo.title || 'Untitled Video',
        description: videoInfo.description || '',
        transcript: transcript,
        thumbnailUrl: thumbnailUrl || undefined,
        duration: videoInfo.duration,
        platform: platform,
      };

      console.log('✅ Social media processing completed successfully');
      return { success: true, info: result };
    } catch (error: any) {
      console.error('❌ Social media processing error:', error);
      return {
        success: false,
        error: `Failed to process ${platform} video: ${error.message}`,
      };
    } finally {
      // Clean up temporary files
      await this.cleanup(tempFiles);
    }
  }

  /**
   * Fallback processing when Python/yt-dlp is not available
   * Uses basic metadata extraction without video download
   */
  private async processSocialMediaFallback(
    url: string,
    platform: 'instagram' | 'tiktok',
  ): Promise<ProcessingResult> {
    console.log(`🔄 Using fallback processing for ${platform} URL`);

    try {
      // Generate basic info based on URL patterns
      const result: SocialMediaInfo = {
        title: this.generateFallbackTitle(url, platform),
        description: `${
          platform === 'instagram' ? 'Instagram Reel' : 'TikTok Video'
        } - Content not available due to processing limitations`,
        platform: platform,
        transcript: undefined, // No transcript available in fallback
        thumbnailUrl: undefined, // No custom thumbnail
      };

      console.log(`⚠️ Fallback processing completed for ${platform}`);
      return { success: true, info: result };
    } catch (error: any) {
      console.error(`❌ Fallback processing failed for ${platform}:`, error);
      return {
        success: false,
        error: `Fallback processing failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate a basic title from URL when full processing isn't available
   */
  private generateFallbackTitle(
    url: string,
    platform: 'instagram' | 'tiktok',
  ): string {
    if (platform === 'instagram') {
      const match = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
      const reelId = match ? match[1] : 'unknown';
      return `Instagram Reel: ${reelId}`;
    } else if (platform === 'tiktok') {
      const match =
        url.match(/@([^\/]+)\/video\/(\d+)/) ||
        url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/);
      if (match) {
        const identifier = match[1] || match[0];
        return `TikTok Video: @${identifier}`;
      }
      return 'TikTok Video';
    }
    return `${platform} Video`;
  }
}

export const socialMediaService = new SocialMediaService();
