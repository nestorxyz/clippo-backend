import sharp from 'sharp';
import fetch from 'node-fetch';
import { convex, api } from '../config/convex';

type Job = {
  userId: string;
  linkId: string;
  sourceUrl: string;
};

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
  const { linkId, sourceUrl } = job;
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

    // 1. Generate upload URL
    const uploadUrl = await convex.mutation(
      api.storage.generateUploadUrlForBackend,
      {
        secret: process.env.CONVEX_BACKEND_SECRET,
      },
    );

    if (!uploadUrl) {
      console.warn('thumbnail: failed to generate upload URL');
      return;
    }

    // 2. Upload file to Convex
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'image/webp' },
      body: out,
    });

    if (!uploadRes.ok) {
      console.warn('thumbnail: failed to upload to storage');
      return;
    }

    const { storageId } = (await uploadRes.json()) as { storageId: string };
    if (!storageId) return;

    // 3. Construct public URL (served via our HTTP action)
    const publicUrl = `${process.env.CONVEX_URL!.replace(/\/$/, '').replace('cloud', 'site')}/images?id=${storageId}`;

    // 4. Update link record
    await convex.mutation(api.links.updateLinkPreviewForBackend, {
      linkId: linkId as any,
      imgPreview: publicUrl,
      secret: process.env.CONVEX_BACKEND_SECRET,
    });
  } finally {
    clearTimeout(timeout);
  }
}
