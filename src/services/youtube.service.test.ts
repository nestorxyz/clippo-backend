import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildYouTubeMetadataArgs,
  extractYouTubeOEmbed,
  extractYouTubeVideo,
  type YouTubeMetadata,
} from './youtube.service';
import type { ResolvedAddress } from './public-resource';

const fixtureDirectory = join(__dirname, '__fixtures__');
const info = JSON.parse(
  readFileSync(join(fixtureDirectory, 'youtube-info.json'), 'utf8'),
) as YouTubeMetadata;
const manualCaptions = readFileSync(
  join(fixtureDirectory, 'youtube-captions.vtt'),
  'utf8',
);
const automaticCaptions = readFileSync(
  join(fixtureDirectory, 'youtube-auto-captions.json'),
  'utf8',
);
const publicAddress: ResolvedAddress = { address: '142.250.72.206', family: 4 };

test('builds a bounded cookie-free metadata command', () => {
  const args = buildYouTubeMetadataArgs(
    'https://youtube.com/watch?v=dory123',
    '/usr/local/bin/node',
  );

  assert.ok(args.includes('--no-cookies'));
  assert.ok(args.includes('--no-cookies-from-browser'));
  assert.ok(args.includes('--skip-download'));
  assert.deepEqual(
    args.slice(args.indexOf('--js-runtimes'), args.indexOf('--js-runtimes') + 2),
    ['--js-runtimes', 'node:/usr/local/bin/node'],
  );
  assert.equal(args.at(-1), 'https://youtube.com/watch?v=dory123');
});

test('extracts fixture metadata and deduplicated manual captions', async () => {
  const result = await extractYouTubeVideo(
    'https://www.youtube.com/watch?v=dory123#intro',
    {
      getInfo: async (url) => {
        assert.equal(url, 'https://www.youtube.com/watch?v=dory123');
        return info;
      },
      fetchCaption: async (track) => {
        assert.equal(track.ext, 'vtt');
        return manualCaptions;
      },
    },
  );

  assert.equal(result.title, 'How DoryAI remembers useful links');
  assert.equal(result.duration, 742);
  assert.equal(result.channel, 'DoryAI');
  assert.equal(result.transcriptSource, 'manual');
  assert.equal(result.transcriptLanguage, 'en');
  assert.equal(result.transcriptTruncated, false);
  assert.equal(
    result.transcript,
    'Save useful links without folders. Find them later with DoryAI & natural language.',
  );
  assert.deepEqual(result.limitations, []);
});

test('labels automatic captions when manual captions are absent', async () => {
  const automaticInfo: YouTubeMetadata = {
    ...info,
    subtitles: {},
    automatic_captions: {
      es: [
        {
          ext: 'json3',
          url: 'https://www.youtube.com/api/timedtext?v=dory123&lang=es',
        },
      ],
    },
  };
  const result = await extractYouTubeVideo('https://youtu.be/dory123', {
    getInfo: async () => automaticInfo,
    fetchCaption: async () => automaticCaptions,
    preferredLanguages: ['es'],
  });

  assert.equal(result.transcriptSource, 'automatic');
  assert.equal(result.transcriptLanguage, 'es');
  assert.equal(
    result.transcript,
    'Automatic captions work too. But the result is labeled.',
  );
});

test('prefers a requested automatic language over an unrelated manual language', async () => {
  const mixedInfo: YouTubeMetadata = {
    ...info,
    subtitles: {
      de: [
        {
          ext: 'vtt',
          url: 'https://www.youtube.com/api/timedtext?v=dory123&lang=de',
        },
      ],
    },
    automatic_captions: {
      es: [
        {
          ext: 'json3',
          url: 'https://www.youtube.com/api/timedtext?v=dory123&lang=es',
        },
      ],
    },
  };
  const result = await extractYouTubeVideo('https://youtu.be/dory123', {
    getInfo: async () => mixedInfo,
    fetchCaption: async () => automaticCaptions,
    preferredLanguages: ['es'],
  });

  assert.equal(result.transcriptSource, 'automatic');
  assert.equal(result.transcriptLanguage, 'es');
});

test('falls back to another caption candidate when the first fetch fails', async () => {
  const fallbackInfo: YouTubeMetadata = {
    ...info,
    subtitles: {
      en: [
        {
          ext: 'json3',
          url: 'https://www.youtube.com/api/timedtext?format=json3',
        },
        {
          ext: 'vtt',
          url: 'https://www.youtube.com/api/timedtext?format=vtt',
        },
      ],
    },
  };
  const result = await extractYouTubeVideo(
    'https://youtube.com/watch?v=dory123',
    {
      getInfo: async () => fallbackInfo,
      fetchCaption: async (track) => {
        if (track.ext === 'json3') throw new Error('expired caption URL');
        return manualCaptions;
      },
    },
  );

  assert.equal(result.transcriptSource, 'manual');
  assert.equal(result.transcriptLanguage, 'en');
  assert.match(result.transcript ?? '', /Find them later/);
  assert.deepEqual(result.limitations, []);
});

test('returns honest metadata-only limitations when captions are unavailable', async () => {
  const result = await extractYouTubeVideo(
    'https://youtube.com/watch?v=dory123',
    {
      getInfo: async () => ({
        ...info,
        subtitles: {},
        automatic_captions: {},
      }),
    },
  );

  assert.equal(result.transcript, null);
  assert.equal(result.transcriptSource, 'none');
  assert.equal(result.transcriptTruncated, false);
  assert.deepEqual(result.limitations, [
    'No supported manual or automatic captions were available',
  ]);
});

test('accepts Shorts and rejects playlist-shaped metadata', async () => {
  const short = await extractYouTubeVideo(
    'https://youtube.com/shorts/dory123',
    {
      getInfo: async (url) => {
        assert.equal(url, 'https://youtube.com/shorts/dory123');
        return info;
      },
      fetchCaption: async () => manualCaptions,
    },
  );
  assert.equal(short.title, 'How DoryAI remembers useful links');
  assert.equal(short.transcriptSource, 'manual');

  await assert.rejects(
    extractYouTubeVideo('https://youtube.com/watch?v=dory123', {
      getInfo: async () => ({ ...info, _type: 'playlist' }),
    }),
    /single video/,
  );
});

test('uses bounded YouTube oEmbed metadata without reading the video webpage', async () => {
  const result = await extractYouTubeOEmbed(
    'https://youtube.com/shorts/H1e5BhMmmi0?si=share-token',
    {
      resolveHostname: async (hostname) => {
        assert.equal(hostname, 'www.youtube.com');
        return [publicAddress];
      },
      requestResource: async (url, address, limits) => {
        assert.deepEqual(address, publicAddress);
        assert.equal(url.pathname, '/oembed');
        assert.equal(url.searchParams.get('format'), 'json');
        assert.equal(
          url.searchParams.get('url'),
          'https://youtube.com/shorts/H1e5BhMmmi0?si=share-token',
        );
        assert.equal(limits.maxBytes, 100_000);
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(
            JSON.stringify({
              type: 'video',
              title: 'Before You Make Content WATCH THIS',
              author_name: 'Alex Hormozi',
              thumbnail_url:
                'https://i.ytimg.com/vi/H1e5BhMmmi0/hq2.jpg',
            }),
          ),
        };
      },
    },
  );

  assert.deepEqual(result, {
    title: 'Before You Make Content WATCH THIS',
    channel: 'Alex Hormozi',
    thumbnailUrl: 'https://i.ytimg.com/vi/H1e5BhMmmi0/hq2.jpg',
  });
});

test('rejects malformed YouTube oEmbed responses', async () => {
  await assert.rejects(
    extractYouTubeOEmbed('https://youtube.com/shorts/dory123', {
      resolveHostname: async () => [publicAddress],
      requestResource: async () => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ type: 'photo' })),
      }),
    }),
    /oEmbed response was invalid/,
  );
});
