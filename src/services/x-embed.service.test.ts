import assert from 'node:assert/strict';
import test from 'node:test';
import { extractXEmbed, hasUsefulXContext } from './x-embed.service';
import type { PublicResourceDependencies } from './public-resource';

const response = (
  overrides: Record<string, unknown> = {},
  contentType = 'application/json; charset=utf-8',
): PublicResourceDependencies => ({
  resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }],
  requestResource: async (url, _address, limits) => {
    assert.equal(url.hostname, 'publish.x.com');
    assert.equal(url.pathname, '/oembed');
    assert.equal(url.searchParams.get('url'), 'https://x.com/dory/status/123');
    assert.equal(url.searchParams.get('omit_script'), 'true');
    assert.equal(limits.maxBytes, 64_000);
    return {
      statusCode: 200,
      headers: { 'content-type': contentType },
      body: Buffer.from(
        JSON.stringify({
          url: 'https://x.com/dory/status/123',
          author_name: 'Dory AI',
          html: '<blockquote class="twitter-tweet"><p lang="en">Useful advice &amp; context<br>for saving links.</p></blockquote><script>not content</script>',
          ...overrides,
        }),
      ),
    };
  },
});

test('extracts only the public post paragraph from bounded X embed JSON', async () => {
  const result = await extractXEmbed(
    'https://twitter.com/dory/status/123?access_token=private#reply',
    response(),
  );
  assert.deepEqual(result, {
    authorName: 'Dory AI',
    handle: 'dory',
    snippet: 'Useful advice & context for saving links.',
  });
  assert.equal(hasUsefulXContext(result.snippet), true);
});

test('does not treat a short caption plus link as useful post context', () => {
  assert.equal(hasUsefulXContext('Yes https://t.co/example'), false);
  assert.equal(hasUsefulXContext('Grok'), false);
  assert.equal(hasUsefulXContext('Raise prices and advertise more'), true);
});

test('rejects non-post URLs and mismatched embed responses', async () => {
  await assert.rejects(
    extractXEmbed('https://x.com/dory', response()),
    /individual X post/,
  );
  await assert.rejects(
    extractXEmbed('https://x.com.example.org/dory/status/123', response()),
    /identify an X post/,
  );
  await assert.rejects(
    extractXEmbed(
      'https://x.com/dory/status/123',
      response({ url: 'https://x.com/dory/status/456' }),
    ),
    /mismatched or incomplete/,
  );
  await assert.rejects(
    extractXEmbed('https://x.com/dory/status/123', response({ url: 'not a URL' })),
    /mismatched or incomplete/,
  );
});

test('rejects an unexpected embed content type', async () => {
  await assert.rejects(
    extractXEmbed('https://x.com/dory/status/123', response({}, 'text/html')),
    /did not return JSON/,
  );
});
