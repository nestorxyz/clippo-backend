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
