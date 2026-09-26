import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicResourceError } from './public-resource';
import { extractRestrictedPlatform } from './restricted-platform.service';

test('returns guarded webpage metadata while labeling specialized support', async () => {
  const result = await extractRestrictedPlatform(
    'https://www.linkedin.com/posts/dory_example',
    {
      extractPage: async () => ({
        requestedUrl: 'https://www.linkedin.com/posts/dory_example',
        finalUrl: 'https://www.linkedin.com/posts/dory_example',
        title: 'A public LinkedIn post',
        description: 'Public metadata from the page.',
        imageUrl: 'https://media.licdn.com/preview.png',
        text: 'Visible public post text.',
        provenance: { method: 'server-html', contentType: 'text/html' },
      }),
    },
  );

  assert.equal(result.platform, 'LinkedIn');
  assert.equal(result.usedStrategy, 'web-page');
  assert.equal(result.contentAvailable, true);
  assert.match(result.limitation, /not implemented/);
});

test('returns honest URL-only metadata when X blocks extraction', async () => {
  const result = await extractRestrictedPlatform(
    'https://x.com/dory/status/123',
    {
      extractXPost: async () => {
        throw new Error('embed unavailable');
      },
      extractPage: async () => {
        throw new PublicResourceError('HTTP_ERROR', 'Resource returned HTTP 403');
      },
    },
  );

  assert.equal(result.title, 'X post by @dory');
  assert.equal(result.usedStrategy, 'url-only');
  assert.equal(result.contentAvailable, false);
  assert.equal(result.failureCode, 'HTTP_ERROR');
  assert.match(result.summary, /URL-only metadata/);
});

test('keeps the X embed pilot disabled by default', async () => {
  const previous = process.env.X_OEMBED_INGESTION_ENABLED;
  delete process.env.X_OEMBED_INGESTION_ENABLED;
  try {
    const result = await extractRestrictedPlatform(
      'https://x.com/dory/status/123',
      {
        extractPage: async () => {
          throw new PublicResourceError('HTTP_ERROR', 'Resource returned HTTP 403');
        },
      },
    );
    assert.equal(result.usedStrategy, 'url-only');
  } finally {
    if (previous === undefined) {
      delete process.env.X_OEMBED_INGESTION_ENABLED;
    } else {
      process.env.X_OEMBED_INGESTION_ENABLED = previous;
    }
  }
});

test('uses a useful X embed snippet without claiming quoted or media content', async () => {
  const result = await extractRestrictedPlatform(
    'https://x.com/dory/status/123',
    {
      extractXPost: async () => ({
        authorName: 'Dory AI',
        handle: 'dory',
        snippet: 'Raise prices and advertise more to reach customers.',
      }),
      extractPage: async () => {
        throw new Error('native page should not be fetched');
      },
    },
  );

  assert.equal(result.usedStrategy, 'x-oembed');
  assert.equal(result.contentAvailable, true);
  assert.equal(result.content, 'Raise prices and advertise more to reach customers.');
  assert.match(result.title, /@dory/);
  assert.match(result.limitation, /media were not analyzed/);
});

test('falls back when X embed text is too brief to identify a topic', async () => {
  const result = await extractRestrictedPlatform(
    'https://x.com/dory/status/123',
    {
      extractXPost: async () => ({
        authorName: 'Dory AI',
        handle: 'dory',
        snippet: 'Yes https://t.co/example',
      }),
      extractPage: async () => {
        throw new PublicResourceError('HTTP_ERROR', 'Resource returned HTTP 403');
      },
    },
  );

  assert.equal(result.usedStrategy, 'url-only');
  assert.equal(result.contentAvailable, false);
  assert.equal(result.content, null);
});

test('uses a conservative LinkedIn title without inventing post content', async () => {
  const result = await extractRestrictedPlatform(
    'https://linkedin.com/posts/person_activity-123',
    {
      extractPage: async () => {
        throw new Error('platform denied request');
      },
    },
  );

  assert.equal(result.title, 'LinkedIn post');
  assert.equal(result.imageUrl, null);
  assert.equal(result.failureCode, 'FETCH_FAILURE');
});

test('rejects sources outside LinkedIn and X', async () => {
  await assert.rejects(
    extractRestrictedPlatform('https://example.com/article'),
    /LinkedIn or X/,
  );
});
