import assert from 'node:assert/strict';
import test from 'node:test';
import type { RequestInit, Response } from 'node-fetch';
import { extractWithFirecrawl } from './firecrawl.service';

const firecrawlResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

test('requires an explicit server-side Firecrawl key', async () => {
  await assert.rejects(
    extractWithFirecrawl('https://example.com', { apiKey: '' }),
    /not configured/,
  );
});

test('requests bounded main-content markdown and normalizes metadata', async () => {
  let requestUrl = '';
  let requestOptions: RequestInit | undefined;
  const result = await extractWithFirecrawl('https://example.com/article', {
    apiKey: 'test-key',
    request: (async (url, options) => {
      requestUrl = String(url);
      requestOptions = options;
      return firecrawlResponse({
        success: true,
        data: {
          markdown: '# Useful article\n\nRendered content.',
          metadata: {
            title: 'Useful article',
            description: 'Rendered description',
            ogImage: 'https://cdn.example.com/preview.png',
            sourceURL: 'https://example.com/article/',
            statusCode: 200,
            contentType: 'text/html',
          },
        },
      });
    }),
  });

  assert.equal(requestUrl, 'https://api.firecrawl.dev/v2/scrape');
  const headers = requestOptions?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(String(requestOptions?.body)), {
    url: 'https://example.com/article',
    formats: ['markdown'],
    onlyMainContent: true,
    timeout: 20_000,
  });
  assert.equal(result.title, 'Useful article');
  assert.equal(result.description, 'Rendered description');
  assert.equal(result.imageUrl, 'https://cdn.example.com/preview.png');
  assert.equal(result.provenance.method, 'firecrawl');
});

test('rejects failed target pages and truncates oversized content', async () => {
  const request = (async () =>
    firecrawlResponse({
      success: true,
      data: {
        markdown: 'x'.repeat(25_000),
        metadata: { statusCode: 200 },
      },
    }));
  const result = await extractWithFirecrawl('https://example.com', {
    apiKey: 'test-key',
    request,
  });
  assert.equal(result.text.length, 20_000);

  await assert.rejects(
    extractWithFirecrawl('https://example.com/missing', {
      apiKey: 'test-key',
      request: (async () =>
        firecrawlResponse({
          success: true,
          data: { markdown: 'not found', metadata: { statusCode: 404 } },
        })),
    }),
    /successful page/,
  );
});
