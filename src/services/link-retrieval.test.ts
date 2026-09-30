import assert from 'node:assert/strict';
import test from 'node:test';
import evaluation from '../fixtures/retrieval-evaluation.json';
import {
  coerceLinkRetrievalFilters,
  focusLinkSearchFilters,
  presentRetrievedLinks,
  retrieveLinks,
  toIndexQuery,
  constrainFiltersToRequest,
  type LinkRetrievalFilters,
  type LinkRetrievalRecord,
} from './link-retrieval';

const records = evaluation.records as LinkRetrievalRecord[];

for (const evaluationCase of evaluation.cases) {
  test(`retrieval evaluation: ${evaluationCase.name}`, () => {
    const results = retrieveLinks(
      records,
      evaluationCase.filters as LinkRetrievalFilters,
    );
    assert.equal(results[0]?._id ?? null, evaluationCase.expectedFirst);
  });
}

test('uses recency as the deterministic tie-breaker', () => {
  const results = retrieveLinks(records, { category: 'work' });
  assert.equal(results[0]?._id, 'next-performance');
});

test('an older link remains rankable when the index returns it', () => {
  const newer = Array.from({ length: 250 }, (_, index) => ({
    _id: `newer-${index}`,
    url: `https://example.test/newer-${index}`,
    title: 'Generic saved link',
    createdAt: 1789160400000 + index,
  }));
  const older = {
    _id: 'older-link',
    url: 'https://example.test/older',
    title: 'Practical solar generator guide',
    createdAt: 1780000000000,
  };
  const results = retrieveLinks([...newer, older], {
    stringQuery: 'solar generator',
  });
  assert.equal(results[0]?._id, 'older-link');
});

test('an explicit YouTube request focuses the topic and excludes unrelated sources', () => {
  const filters = focusLinkSearchFilters(
    constrainFiltersToRequest(
      { stringQuery: 'find my saved YouTube business video' },
      'Find the saved YouTube business video',
    ),
  );
  assert.equal(filters.source, 'youtube');
  assert.equal(filters.stringQuery, 'business');
  const matches = retrieveLinks(
    [
      {
        _id: 'linkedin',
        url: 'https://linkedin.com/posts/business-video',
        title: 'Business video advice',
        source: 'LinkedIn',
        createdAt: 3,
      },
      {
        _id: 'youtube',
        url: 'https://youtu.be/fixture',
        title: 'If I started a business today',
        createdAt: 1,
      },
    ],
    filters,
  );
  assert.deepEqual(matches.map(({ _id }) => _id), ['youtube']);
});

test('a platform-only request becomes a source-only filter', () => {
  const filters = focusLinkSearchFilters(
    constrainFiltersToRequest(
      { stringQuery: 'show my saved YouTube videos' },
      'Show my saved YouTube videos',
    ),
  );
  assert.equal(filters.stringQuery, undefined);
  assert.equal(filters.source, 'youtube');
});

test('Spanish search phrasing retains the meaningful topic', () => {
  const filters = focusLinkSearchFilters(
    constrainFiltersToRequest(
      { stringQuery: 'busca el video guardado de YouTube sobre negocios' },
      'Busca el video guardado de YouTube sobre negocios',
    ),
  );
  assert.equal(filters.source, 'youtube');
  assert.equal(filters.stringQuery, 'negocios');
});

test('negated or multi-platform requests do not force YouTube', () => {
  assert.equal(
    constrainFiltersToRequest({}, 'Find the business post, not YouTube').source,
    undefined,
  );
  assert.equal(
    constrainFiltersToRequest({}, 'Compare YouTube and LinkedIn').source,
    undefined,
  );
});

test('model-inferred taxonomy cannot silently narrow a broad search', () => {
  const filters = constrainFiltersToRequest(
    {
      stringQuery: 'business video',
      category: 'startups',
      subcategory: 'marketing',
      tags: ['entrepreneurship'],
    },
    'Find the saved YouTube business video',
  );
  assert.equal(filters.source, 'youtube');
  assert.equal(filters.category, undefined);
  assert.equal(filters.subcategory, undefined);
  assert.equal(filters.tags, undefined);
  assert.equal(
    constrainFiltersToRequest(
      { category: 'work', tags: ['video'] },
      'Find my work links tagged video',
    ).category,
    'work',
  );
});

test('normalizes accents and bounds indexed query terms', () => {
  assert.equal(toIndexQuery('síndrome del impostor'), 'sindrome del impostor');
  assert.equal(
    toIndexQuery('a b c d e f g h i j k l m n'),
    'a b c d e f g h i j k l',
  );
});

test('applies inclusive UTC date filters', () => {
  const results = retrieveLinks(records, {
    dateRange: { from: '2026-09-09', to: '2026-09-09' },
  });
  assert.deepEqual(results.map(({ _id }) => _id), ['peru-hike']);
});

test('rejects malformed date filters', () => {
  assert.throws(
    () => retrieveLinks(records, { dateRange: { from: 'last week' } }),
    /Invalid retrieval date/,
  );
  assert.throws(
    () => retrieveLinks(records, { dateRange: { from: '2026-02-31' } }),
    /Invalid retrieval date/,
  );
});

test('matches whole tokens instead of arbitrary substrings', () => {
  const peruRecord = records.filter(({ _id }) => _id === 'peru-hike');
  assert.deepEqual(retrieveLinks(peruRecord, { stringQuery: 'AI' }), []);
});

test('presents bounded results without internal user data', () => {
  const [result] = presentRetrievedLinks([
    {
      ...records[0],
      userId: 'private-user-id',
      imgPreview: 'https://cdn.example.test/preview.jpg',
      content: 'x'.repeat(2_001),
      contentScope: 'partial-preview',
    },
  ]);

  assert.equal(result.contentExcerpt?.length, 2_000);
  assert.equal(result.contentTruncated, true);
  assert.equal(result.contentScope, 'partial-preview');
  assert.equal(result.imgPreview, 'https://cdn.example.test/preview.jpg');
  assert.equal('userId' in result, false);
});

test('coerces model arguments without trusting unexpected value types', () => {
  assert.deepEqual(
    coerceLinkRetrievalFilters({
      stringQuery: 'captions',
      category: 12,
      tags: ['video', false],
      dateRange: { from: '2026-09-01', to: null },
    }),
    {
      stringQuery: 'captions',
      category: undefined,
      subcategory: undefined,
      tags: ['video'],
      dateRange: { from: '2026-09-01', to: undefined },
    },
  );
});
