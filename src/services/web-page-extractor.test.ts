import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { extractWebPage } from './web-page-extractor';
import {
  fetchPublicResource,
  isPublicAddress,
  PublicResourceError,
  type ResolvedAddress,
} from './public-resource';

const fixture = readFileSync(join(__dirname, '__fixtures__/article.html'));
const publicAddress: ResolvedAddress = { address: '93.184.216.34', family: 4 };

const resolvePublic = async (): Promise<ResolvedAddress[]> => [publicAddress];

test('extracts normalized metadata and text from an HTML fixture', async () => {
  const result = await extractWebPage('https://example.com/articles/dory#intro', {
    resolveHostname: resolvePublic,
    requestResource: async (_url, address, limits) => {
      assert.deepEqual(address, publicAddress);
      assert.equal(limits.maxBytes, 1_000_000);
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: fixture,
      };
    },
  });

  assert.equal(result.title, 'DoryAI & useful links');
  assert.equal(result.description, 'A fixture-backed description & summary.');
  assert.equal(result.imageUrl, 'https://example.com/images/preview.png');
  assert.match(result.text, /DoryAI remembers useful links/);
  assert.doesNotMatch(result.text, /privateNoise/);
  assert.equal(result.provenance.method, 'server-html');
});

test('rejects local, private, reserved, and nonstandard-port targets', async () => {
  const blockedInputs = [
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://localhost/admin',
    'https://example.com:8443/admin',
  ];

  for (const input of blockedInputs) {
    await assert.rejects(
      extractWebPage(input, { resolveHostname: resolvePublic }),
      (error: unknown) =>
        error instanceof PublicResourceError &&
        (error.code === 'BLOCKED_ADDRESS' || error.code === 'INVALID_URL'),
    );
  }
});

test('rejects a hostname when any DNS answer is private', async () => {
  await assert.rejects(
    extractWebPage('https://example.com', {
      resolveHostname: async () => [
        publicAddress,
        { address: '10.0.0.4', family: 4 },
      ],
    }),
    (error: unknown) =>
      error instanceof PublicResourceError &&
      error.code === 'BLOCKED_ADDRESS',
  );
});

test('bounds DNS resolution time', async () => {
  await assert.rejects(
    fetchPublicResource(
      'https://example.com',
      {
        accept: 'text/html',
        maxBytes: 1_000,
        maxRedirects: 0,
        timeoutMs: 5,
      },
      {
        resolveHostname: () => new Promise(() => undefined),
      },
    ),
    (error: unknown) =>
      error instanceof PublicResourceError && error.code === 'DNS_FAILURE',
  );
});

test('accepts and pins a public IPv6 literal without DNS resolution', async () => {
  let resolverCalled = false;
  const result = await extractWebPage('https://[2001:4860:4860::8888]/page', {
    resolveHostname: async () => {
      resolverCalled = true;
      return [];
    },
    requestResource: async (_url, address) => {
      assert.deepEqual(address, {
        address: '2001:4860:4860::8888',
        family: 6,
      });
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        body: fixture,
      };
    },
  });

  assert.equal(resolverCalled, false);
  assert.equal(result.title, 'DoryAI & useful links');
});

test('revalidates and pins each redirect target', async () => {
  const resolved: string[] = [];
  const requested: string[] = [];
  const result = await extractWebPage('https://example.com/start', {
    resolveHostname: async (hostname) => {
      resolved.push(hostname);
      return [publicAddress];
    },
    requestResource: async (url) => {
      requested.push(url.toString());
      if (url.hostname === 'example.com') {
        return {
          statusCode: 302,
          headers: { location: 'https://www.example.org/article' },
          body: Buffer.alloc(0),
        };
      }
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        body: fixture,
      };
    },
  });

  assert.deepEqual(resolved, ['example.com', 'www.example.org']);
  assert.deepEqual(requested, [
    'https://example.com/start',
    'https://www.example.org/article',
  ]);
  assert.equal(result.finalUrl, 'https://www.example.org/article');
});

test('enforces HTML content type and response size', async () => {
  await assert.rejects(
    extractWebPage('https://example.com/report.pdf', {
      resolveHostname: resolvePublic,
      requestResource: async () => ({
        statusCode: 200,
        headers: { 'content-type': 'application/pdf' },
        body: Buffer.from('%PDF'),
      }),
    }),
    (error: unknown) =>
      error instanceof PublicResourceError &&
      error.code === 'UNSUPPORTED_CONTENT_TYPE',
  );

  await assert.rejects(
    extractWebPage('https://example.com/large', {
      resolveHostname: resolvePublic,
      requestResource: async () => ({
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
        body: Buffer.alloc(1_000_001),
      }),
    }),
    (error: unknown) =>
      error instanceof PublicResourceError &&
      error.code === 'RESPONSE_TOO_LARGE',
  );
});

test('recognizes only publicly routable fixture addresses', () => {
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('10.0.0.1'), false);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
  assert.equal(isPublicAddress('::1'), false);
  assert.equal(isPublicAddress('2001:db8::1'), false);
});
