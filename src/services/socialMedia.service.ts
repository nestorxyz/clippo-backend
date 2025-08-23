import { YtDlp } from 'ytdlp-nodejs';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { supabaseAdmin } from '../config/supabase';

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

  constructor() {
    this.ytdlp = new YtDlp();
    this.genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
    this.tempDir = path.join(os.tmpdir(), 'clippo-social-media');
  }

  /**
   * Check if URL is from supported social media platforms
   */
  isSocialMediaUrl(url: string): boolean {
    const socialMediaPatterns = [
      /https?:\/\/(?:www\.)?instagram\.com\/reel\/[^/?]+/,
      /https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
    ];

    return socialMediaPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): 'instagram' | 'tiktok' | null {
    if (url.includes('instagram.com/reel/')) return 'instagram';
    if (url.includes('tiktok.com')) return 'tiktok';
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
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Failed to delete temp file ${filePath}:`, error);
      }
    });
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Extract audio from video using ffmpeg
   */
  private async extractAudio(
    videoPath: string,
    audioPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('mp3')
        .audioBitrate('128k')
        .noVideo()
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Extract thumbnail from video
   */
  private async extractThumbnail(
    videoPath: string,
    thumbnailPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['50%'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '1280x720',
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
  }

  /**
   * Upload thumbnail to Supabase Storage
   */
  private async uploadThumbnail(
    thumbnailPath: string,
    fileName: string
  ): Promise<string | null> {
    try {
      const fileBuffer = await fs.readFile(thumbnailPath);

      const { error } = await supabaseAdmin.storage
        .from('link-previews')
        .upload(fileName, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('Failed to upload thumbnail:', error);
        return null;
      }

      // Get public URL
      const { data: publicData } = supabaseAdmin.storage
        .from('link-previews')
        .getPublicUrl(fileName);

      return publicData.publicUrl;
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
      // Upload audio file to Gemini
      const uploadResult = await this.genAI.files.upload({
        file: audioPath,
        config: { mimeType: 'audio/mpeg' },
      });

      // Generate transcript
      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
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

      return result.text || '';
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

    let tempFiles: string[] = [];

    try {
      await this.ensureTempDir();

      // Generate unique file names
      const timestamp = Date.now();
      const videoPath = path.join(this.tempDir, `video_${timestamp}.mp4`);
      const audioPath = path.join(this.tempDir, `audio_${timestamp}.mp3`);
      const thumbnailPath = path.join(
        this.tempDir,
        `thumbnail_${timestamp}.jpg`
      );

      tempFiles = [videoPath, audioPath, thumbnailPath];

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
          setTimeout(() => reject(new Error('Download timeout')), 60000)
        ),
      ]);

      // Extract audio for transcription
      console.log('🎵 Extracting audio...');
      await this.extractAudio(videoPath, audioPath);

      // Extract thumbnail
      console.log('🖼️ Extracting thumbnail...');
      await this.extractThumbnail(videoPath, thumbnailPath);

      // Transcribe audio
      console.log('📝 Transcribing audio...');
      const transcript = await this.transcribeAudio(audioPath);

      // Upload thumbnail to Supabase
      console.log('☁️ Uploading thumbnail...');
      const thumbnailFileName = `social_${platform}_${timestamp}.jpg`;
      const thumbnailUrl = await this.uploadThumbnail(
        thumbnailPath,
        thumbnailFileName
      );

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
}

export const socialMediaService = new SocialMediaService();
