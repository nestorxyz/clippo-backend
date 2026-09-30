import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicResourceError } from './public-resource';
import { extractRestrictedPlatform } from './restricted-platform.service';
import {
  recordLinkAnalysis,
  withVerifiedAnalyzedContent,
} from './link-registration-guard';

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
  assert.equal(result.content, 'Visible public post text.');
  assert.equal(result.contentScope, 'partial-preview');
  assert.match(result.limitation, /completeness/);
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

test('does not activate raw X snippet storage from an environment switch', async () => {
  const previous = process.env.X_OEMBED_INGESTION_ENABLED;
  process.env.X_OEMBED_INGESTION_ENABLED = 'true';
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

test('keeps an X embed snippet when the optional media preview fetch fails', async () => {
  const result = await extractRestrictedPlatform(
    'https://x.com/dory/status/123',
    {
      extractXPost: async () => ({
        authorName: 'Dory AI',
        handle: 'dory',
        snippet: 'Raise prices and advertise more to reach customers.',
      }),
      extractPage: async () => {
        throw new Error('public page unavailable');
      },
    },
  );

  assert.equal(result.usedStrategy, 'x-oembed');
  assert.equal(result.contentAvailable, true);
  assert.equal(result.content, 'Raise prices and advertise more to reach customers.');
  assert.equal(result.imageUrl, null);
  assert.match(result.title, /@dory/);
  assert.match(result.limitation, /media were not analyzed/);
});

test('saves media preview from the same X post alongside verified embed text', async () => {
  const postUrl = 'https://x.com/dory/status/123?s=20';
  const imageUrl = 'https://pbs.twimg.com/media/post123?format=webp&name=large';
  const result = await extractRestrictedPlatform(postUrl, {
    extractXPost: async () => ({
      authorName: 'Dory AI',
      handle: 'dory',
      snippet: 'A useful post with a chart.',
    }),
    extractPage: async (requestedUrl) => {
      assert.equal(requestedUrl, 'https://x.com/dory/status/123');
      return {
        requestedUrl,
        finalUrl: requestedUrl,
        title: 'X post',
        description: '',
        imageUrl,
        text: 'Page text is not used for the X snapshot.',
        provenance: { method: 'server-html', contentType: 'text/html' },
      };
    },
  });

  assert.equal(result.usedStrategy, 'x-oembed');
  assert.equal(result.content, 'A useful post with a chart.');
  assert.equal(result.imageUrl, imageUrl);
  const state = recordLinkAnalysis(postUrl, {
    success: true,
    content: result.content,
    urlMetadata: { image: result.imageUrl },
    sourceExtraction: { kind: 'x', usedStrategy: result.usedStrategy },
  });
  assert.deepEqual(
    withVerifiedAnalyzedContent(state, { url: postUrl, img_preview: 'https://evil.example/fake.png' }),
    { url: postUrl, img_preview: imageUrl, content: result.content },
  );
});

test('ignores X images from a different post or a profile avatar', async () => {
  for (const [finalUrl, imageUrl] of [
    ['https://x.com/dory/status/456', 'https://pbs.twimg.com/media/other.jpg'],
    ['https://x.com/dory/status/123', 'https://pbs.twimg.com/profile_images/avatar.jpg'],
    ['https://x.com/dory/status/123', 'https://evil.example/media/fake.jpg'],
  ]) {
    const result = await extractRestrictedPlatform('https://x.com/dory/status/123', {
      extractXPost: async () => ({
        authorName: 'Dory AI',
        handle: 'dory',
        snippet: 'Verified text.',
      }),
      extractPage: async (requestedUrl) => ({
        requestedUrl,
        finalUrl,
        title: 'X post',
        description: '',
        imageUrl,
        text: '',
        provenance: { method: 'server-html', contentType: 'text/html' },
      }),
    });
    assert.equal(result.imageUrl, null);
    assert.equal(result.content, 'Verified text.');
  }
});

test('saves short X post text as returned by the embed', async () => {
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

  assert.equal(result.usedStrategy, 'x-oembed');
  assert.equal(result.contentAvailable, true);
  assert.equal(result.content, 'Yes https://t.co/example');
});

test('falls back when the X embed contains no post text', async () => {
  const result = await extractRestrictedPlatform(
    'https://x.com/dory/status/123',
    {
      extractXPost: async () => ({
        authorName: 'Dory AI',
        handle: 'dory',
        snippet: '',
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
  assert.equal(result.contentScope, 'metadata-only');
});

test('rejects sources outside LinkedIn and X', async () => {
  await assert.rejects(
    extractRestrictedPlatform('https://example.com/article'),
    /LinkedIn or X/,
  );
});
