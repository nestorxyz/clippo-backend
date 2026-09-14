import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyLinkAnalysisState,
  guardLinkRegistration,
  recordLinkAnalysis,
} from './link-registration-guard';

test('allows the same normalized URL after successful analysis', () => {
  const state = recordLinkAnalysis('https://example.com/page#section', {
    success: true,
  });

  assert.deepEqual(guardLinkRegistration(state, 'https://example.com/page'), {
    allowed: true,
  });
});

test('blocks registration before URL analysis', () => {
  const result = guardLinkRegistration(
    emptyLinkAnalysisState(),
    'https://example.com/page',
  );

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.response.error, 'URL_ANALYSIS_REQUIRED');
  }
});

test('propagates analysis failure instead of saving', () => {
  const state = recordLinkAnalysis('http://127.0.0.1/admin', {
    success: false,
    error: 'BLOCKED_ADDRESS: URL resolves to a non-public address',
  });
  const result = guardLinkRegistration(state, 'http://127.0.0.1/admin');

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.response.error, 'URL_ANALYSIS_FAILED');
    assert.match(result.response.message, /BLOCKED_ADDRESS/);
  }
});

test('blocks registration when the model changes the analyzed URL', () => {
  const state = recordLinkAnalysis('https://example.com/one', {
    success: true,
  });
  const result = guardLinkRegistration(state, 'https://example.org/two');

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.response.error, 'URL_MISMATCH');
  }
});
