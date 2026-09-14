import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySourceUrl } from './source-url';

test('classifies the source types in the DoryAI roadmap', () => {
  const cases = [
    ['https://www.instagram.com/reel/ABC_123/', 'instagram-reel', 'short-video'],
    ['https://vm.tiktok.com/ZM123/', 'tiktok-video', 'short-video'],
    ['https://www.youtube.com/watch?v=abc123', 'youtube-video', 'planned'],
    ['https://youtu.be/abc123?t=20', 'youtube-video', 'planned'],
    ['https://youtube.com/shorts/abc123', 'youtube-short', 'planned'],
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
