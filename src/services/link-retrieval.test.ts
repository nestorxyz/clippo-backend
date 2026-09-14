import assert from 'node:assert/strict';
import test from 'node:test';
import evaluation from '../fixtures/retrieval-evaluation.json';
import {
  coerceLinkRetrievalFilters,
  presentRetrievedLinks,
  retrieveLinks,
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
    assert.equal(results[0]?._id, evaluationCase.expectedFirst);
  });
}

test('uses recency as the deterministic tie-breaker', () => {
  const results = retrieveLinks(records, { category: 'work' });
  assert.equal(results[0]?._id, 'next-performance');
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
      content: 'x'.repeat(2_001),
    },
  ]);

  assert.equal(result.contentExcerpt?.length, 2_000);
  assert.equal(result.contentTruncated, true);
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
