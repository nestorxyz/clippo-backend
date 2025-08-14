import sharp from 'sharp';
import fetch from 'node-fetch';
import { retired-providerAdmin } from '../config/retired-provider';

type Job = {
  userId: string;
  linkId: string;
  sourceUrl: string;
};

const PREVIEW_BUCKET = 'link-previews';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 10_000;
const QUALITY = 70; // WebP quality
const WIDTH = 300; // keep aspect ratio

const queue: Job[] = [];
let running = 0;
const MAX_CONCURRENCY = 2;

export async function enqueueThumbnailJob(job: Job): Promise<void> {
  queue.push(job);
  void drain();
}

async function drain(): Promise<void> {
  if (running >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;
  running++;
  try {
    await processJob(job);
  } catch (err) {
    console.warn('thumbnail job failed:', err);
  } finally {
    running--;
    if (queue.length > 0) void drain();
  }
}

async function processJob(job: Job): Promise<void> {
  const { userId, linkId, sourceUrl } = job;
  // Validate URL
  try {
    new URL(sourceUrl);
  } catch {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: '',
      } as any,
      signal: controller.signal as any,
    } as any);

    if (!res.ok) return;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return;
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_BYTES) return;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return;

    // Process via Sharp - width 300, keep aspect, no upscaling
    const out = await sharp(buf, { failOn: 'none' })
      .rotate() // auto-orient
      .resize({ width: WIDTH, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: QUALITY })
      .toBuffer();

    const path = `${userId}/${linkId}.webp`;
    const { error: upErr } = await retired-providerAdmin.storage
      .from(PREVIEW_BUCKET)
      .upload(path, out, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '31536000',
      });
    if (upErr) return;

    const { data: pub } = retired-providerAdmin.storage
      .from(PREVIEW_BUCKET)
      .getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) return;

    // Update link record
    const { error: updErr } = await retired-providerAdmin
      .from('links')
      .update({ img_preview: publicUrl })
      .eq('id', linkId);
    if (updErr) {
      console.warn('thumbnail: failed to update link', updErr);
    }
  } finally {
    clearTimeout(timeout);
  }
}
