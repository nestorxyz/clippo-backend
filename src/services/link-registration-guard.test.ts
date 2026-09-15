import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyLinkAnalysisState,
  guardLinkRegistration,
  nextChatToolRound,
  recordLinkAnalysis,
  recordLinkRegistration,
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

test('blocks a repeated registration after the first write succeeds', () => {
  let state = recordLinkAnalysis('https://example.com/page', { success: true });
  state = recordLinkRegistration(state, 'https://example.com/page#section', {
    success: true,
  });

  const result = guardLinkRegistration(state, 'https://example.com/page');
  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.response.error, 'LINK_ALREADY_REGISTERED');
  }
});

test('preserves completed registrations across later URL analysis', () => {
  let state = recordLinkAnalysis('https://example.com/one', { success: true });
  state = recordLinkRegistration(state, 'https://example.com/one', {
    success: true,
  });
  state = recordLinkAnalysis(
    'https://example.com/two',
    { success: true },
    state,
  );

  assert.equal(guardLinkRegistration(state, 'https://example.com/two').allowed, true);
  assert.equal(guardLinkRegistration(state, 'https://example.com/one').allowed, false);
});

test('bounds chat tool rounds with a legible error', () => {
  assert.equal(nextChatToolRound(0, 2), 1);
  assert.equal(nextChatToolRound(1, 2), 2);
  assert.throws(() => nextChatToolRound(2, 2), /without a final response/);
});
