import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'node-fetch';
import { PublicResourceError, type ResolvedAddress } from './public-resource';
import { extractWebPageContent } from './web-page-content';

const publicAddress: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const nativeDependencies = (html: string) => ({
  resolveHostname: async () => [publicAddress],
  requestResource: async () => ({
    statusCode: 200,
    headers: { 'content-type': 'text/html' },
    body: Buffer.from(html),
  }),
});
const firecrawlRequest = (markdown: string) =>
  (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          markdown,
          metadata: { title: 'Rendered', statusCode: 200 },
        },
      }),
    }) as Response);

test('does not call Firecrawl outside the explicit save path', async () => {
  let firecrawlCalled = false;
  const result = await extractWebPageContent('https://example.com', {
    native: nativeDependencies(
      `<title>Native</title><meta name="description" content="Description">${'useful '.repeat(150)}`,
    ),
    firecrawl: {
      apiKey: 'test-key',
      request: (async () => {
        firecrawlCalled = true;
        throw new Error('should not run');
      }),
    },
  });

  assert.equal(result.provenance.method, 'server-html');
  assert.equal(firecrawlCalled, false);
});

test('uses Firecrawl for rich public webpages while saving', async () => {
  const rich = await extractWebPageContent('https://example.com/article', {
    native: nativeDependencies(
      `<title>Native</title><meta name="description" content="Description">${'useful '.repeat(150)}`,
    ),
    firecrawl: {
      apiKey: 'test-key',
      request: firecrawlRequest('Clean article body'),
    },
    allowFirecrawl: true,
  });
  assert.equal(rich.provenance.method, 'firecrawl');
  assert.equal(rich.text, 'Clean article body');
});

test('uses Firecrawl for unavailable public webpages while saving', async () => {
  const failedNative = await extractWebPageContent('https://example.com/down', {
    native: {
      resolveHostname: async () => [publicAddress],
      requestResource: async () => {
        throw new PublicResourceError('FETCH_FAILURE', 'connection failed');
      },
    },
    firecrawl: {
      apiKey: 'test-key',
      request: firecrawlRequest('Rendered after native failure'),
    },
    allowFirecrawl: true,
  });
  assert.equal(failedNative.provenance.method, 'firecrawl');
});

test('does not let Firecrawl bypass private-address validation', async () => {
  let firecrawlCalled = false;
  await assert.rejects(
    extractWebPageContent('http://127.0.0.1/private', {
      firecrawl: {
        apiKey: 'test-key',
        request: (async () => {
          firecrawlCalled = true;
          throw new Error('should not run');
        }),
      },
      allowFirecrawl: true,
    }),
    (error: unknown) =>
      error instanceof PublicResourceError && error.code === 'BLOCKED_ADDRESS',
  );
  assert.equal(firecrawlCalled, false);
});

test('retains native metadata when optional Firecrawl enhancement fails', async () => {
  const result = await extractWebPageContent('https://example.com/sparse', {
    native: nativeDependencies(
      '<title>Native fallback</title><meta name="description" content="Kept"><p>Short</p>',
    ),
    firecrawl: {
      apiKey: 'test-key',
      request: (async () => {
        throw new Error('provider unavailable');
      }),
    },
    allowFirecrawl: true,
  });

  assert.equal(result.provenance.method, 'server-html');
  assert.equal(result.title, 'Native fallback');
});

test('does not transmit credential-shaped URL parameters to Firecrawl', async () => {
  let firecrawlCalled = false;
  const result = await extractWebPageContent(
    'https://example.com/article?access_token=private',
    {
      native: nativeDependencies('<title>Private URL</title><p>Public page</p>'),
      firecrawl: {
        apiKey: 'test-key',
        request: (async () => {
          firecrawlCalled = true;
          throw new Error('should not run');
        }),
      },
      allowFirecrawl: true,
    },
  );
  assert.equal(result.provenance.method, 'server-html');
  assert.equal(firecrawlCalled, false);
});
