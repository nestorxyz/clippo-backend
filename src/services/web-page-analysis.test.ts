import assert from 'node:assert/strict';
import test from 'node:test';
import { toWebPageAnalysis } from './web-page-analysis';

const url = 'https://example.com/article';

test('persists bounded native webpage text as searchable content', () => {
  const result = toWebPageAnalysis(url, {
    requestedUrl: url,
    finalUrl: url,
    title: 'Article',
    description: 'Short description',
    imageUrl: null,
    text: 'The detailed article body',
    provenance: { method: 'server-html', contentType: 'text/html' },
  });

  assert.equal(result.summary, 'Short description');
  assert.equal(result.content, 'The detailed article body');
  assert.equal(result.sourceExtraction.usedStrategy, 'web-page');
});

test('preserves Firecrawl markdown and its extraction provenance', () => {
  const result = toWebPageAnalysis(url, {
    requestedUrl: url,
    finalUrl: url,
    title: 'Article',
    description: '',
    imageUrl: null,
    text: '# Article\n\nDetailed content',
    provenance: { method: 'firecrawl', contentType: 'text/markdown' },
  });

  assert.equal(result.content, '# Article\n\nDetailed content');
  assert.equal(result.sourceExtraction.usedStrategy, 'firecrawl');
  assert.deepEqual(result.limitations, []);
});

test('labels a redirected LinkedIn post as an unverified public preview', () => {
  const result = toWebPageAnalysis('https://lnkd.in/p/example', {
    requestedUrl: 'https://lnkd.in/p/example',
    finalUrl: 'https://www.linkedin.com/posts/example_activity-123',
    title: 'Example post',
    description: 'The opening of the post',
    imageUrl: null,
    text: 'The complete publicly exposed preview text',
    provenance: { method: 'server-html', contentType: 'text/html' },
  });

  assert.equal(result.platform, 'LinkedIn');
  assert.equal(result.content, 'The complete publicly exposed preview text');
  assert.equal(result.contentScope, 'partial-preview');
  assert.equal(result.sourceExtraction.kind, 'linkedin');
  assert.equal(result.sourceExtraction.degraded, true);
  assert.match(result.limitations.join(' '), /completeness/);
});
