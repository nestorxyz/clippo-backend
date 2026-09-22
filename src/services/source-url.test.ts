import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySourceUrl, describeSourceExtraction } from './source-url';

test('classifies the source types in the DoryAI roadmap', () => {
  const cases = [
    ['https://www.instagram.com/reel/ABC_123/', 'instagram-reel', 'short-video'],
    ['https://vm.tiktok.com/ZM123/', 'tiktok-video', 'short-video'],
    [
      'https://www.youtube.com/watch?v=abc123',
      'youtube-video',
      'youtube-metadata',
    ],
    ['https://youtu.be/abc123?t=20', 'youtube-video', 'youtube-metadata'],
    [
      'https://youtube.com/shorts/abc123',
      'youtube-short',
      'youtube-metadata',
    ],
    ['https://www.linkedin.com/posts/example', 'linkedin', 'planned'],
    ['https://x.com/example/status/123', 'x', 'planned'],
    ['https://twitter.com/example/status/123', 'x', 'planned'],
    ['https://example.com/articles/dory#section', 'web-page', 'web-page'],
  ] as const;

  for (const [url, kind, extractionStrategy] of cases) {
    const result = classifySourceUrl(url);
    assert.equal(result.kind, kind);
    assert.equal(result.extractionStrategy, extractionStrategy);
  }
});

test('removes fragments from normalized URLs', () => {
  assert.equal(
    classifySourceUrl('https://example.com/article#comments').normalizedUrl,
    'https://example.com/article',
  );
});

test('does not accept lookalike social domains', () => {
  assert.equal(
    classifySourceUrl('https://x.com.example.org/post').kind,
    'web-page',
  );
});

test('rejects relative and non-HTTP URLs', () => {
  assert.throws(
    () => classifySourceUrl('/relative'),
    /valid absolute URL/,
  );
  assert.throws(
    () => classifySourceUrl('file:///tmp/private'),
    /HTTP or HTTPS/,
  );
});

test('reports the extraction strategy that actually ran', () => {
  assert.deepEqual(
    describeSourceExtraction('https://example.com/article', 'web-page'),
    {
      kind: 'web-page',
      usedStrategy: 'web-page',
      degraded: false,
      limitation: 'Full-page AI summarization is not enabled',
    },
  );
  assert.deepEqual(
    describeSourceExtraction(
      'https://youtube.com/shorts/ABC123',
      'youtube-gemini',
    ),
    {
      kind: 'youtube-short',
      usedStrategy: 'youtube-gemini',
      degraded: true,
      limitation:
        'YouTube blocked direct caption extraction; Gemini video understanding was used',
    },
  );
  assert.deepEqual(
    describeSourceExtraction(
      'https://youtube.com/watch?v=abc123',
      'youtube-metadata',
    ),
    {
      kind: 'youtube-video',
      usedStrategy: 'youtube-metadata',
      degraded: false,
      limitation: null,
    },
  );
  assert.deepEqual(
    describeSourceExtraction('https://x.com/dory/status/123', 'web-page'),
    {
      kind: 'x',
      usedStrategy: 'web-page',
      degraded: true,
      limitation: 'Specialized x extraction is not implemented',
    },
  );
  assert.deepEqual(
    describeSourceExtraction('https://x.com/dory/status/123', 'url-only'),
    {
      kind: 'x',
      usedStrategy: 'url-only',
      degraded: true,
      limitation:
        'Content for x could not be extracted; URL-only metadata was used',
    },
  );
  assert.deepEqual(
    describeSourceExtraction(
      'https://instagram.com/reel/ABC123',
      'short-video',
    ),
    {
      kind: 'instagram-reel',
      usedStrategy: 'short-video',
      degraded: false,
      limitation: null,
    },
  );
  assert.deepEqual(
    describeSourceExtraction('https://example.com/app', 'firecrawl'),
    {
      kind: 'web-page',
      usedStrategy: 'firecrawl',
      degraded: false,
      limitation: null,
    },
  );
  assert.deepEqual(
    describeSourceExtraction(
      'https://youtube.com/shorts/ABC123',
      'short-video',
    ),
    {
      kind: 'youtube-short',
      usedStrategy: 'short-video',
      degraded: true,
      limitation:
        'YouTube captions were unavailable; audio transcription fallback was used',
    },
  );
  assert.deepEqual(
    describeSourceExtraction(
      'https://youtube.com/shorts/ABC123',
      'youtube-oembed',
    ),
    {
      kind: 'youtube-short',
      usedStrategy: 'youtube-oembed',
      degraded: true,
      limitation:
        'Full YouTube metadata and captions were unavailable; oEmbed metadata was used',
    },
  );
});
