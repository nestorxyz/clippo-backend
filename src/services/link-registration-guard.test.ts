import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyLinkAnalysisState,
  guardLinkRegistration,
  nextChatToolRound,
  recordLinkAnalysis,
  recordLinkRegistration,
  selectChatToolDirective,
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

test('forces the analyze-register-text sequence for URL messages', () => {
  const initial = emptyLinkAnalysisState();
  assert.deepEqual(
    selectChatToolDirective({
      message: 'Save https://example.com for later',
      linkAnalysis: initial,
      registrationAttempted: false,
      retrievalCompleted: false,
    }),
    { mode: 'tool', name: 'get_url_info' },
  );

  const analyzed = recordLinkAnalysis('https://example.com', { success: true });
  assert.deepEqual(
    selectChatToolDirective({
      message: 'Save https://example.com for later',
      linkAnalysis: analyzed,
      registrationAttempted: false,
      retrievalCompleted: false,
    }),
    { mode: 'tool', name: 'register_link' },
  );

  assert.deepEqual(
    selectChatToolDirective({
      message: 'Save https://example.com for later',
      linkAnalysis: analyzed,
      registrationAttempted: true,
      retrievalCompleted: false,
    }),
    { mode: 'text' },
  );
});

test('forces a final text response after one retrieval', () => {
  assert.deepEqual(
    selectChatToolDirective({
      message: 'Find my saved JavaScript links',
      linkAnalysis: emptyLinkAnalysisState(),
      registrationAttempted: false,
      retrievalCompleted: true,
    }),
    { mode: 'text' },
  );
});

test('forces a final explanation after analysis or registration failure', () => {
  const failedAnalysis = recordLinkAnalysis('https://example.com', {
    success: false,
    error: 'Page blocked',
  });
  assert.deepEqual(
    selectChatToolDirective({
      message: 'Save https://example.com',
      linkAnalysis: failedAnalysis,
      registrationAttempted: false,
      retrievalCompleted: false,
    }),
    { mode: 'text' },
  );

  assert.deepEqual(
    selectChatToolDirective({
      message: 'Save https://example.com',
      linkAnalysis: recordLinkAnalysis('https://example.com', { success: true }),
      registrationAttempted: true,
      retrievalCompleted: false,
    }),
    { mode: 'text' },
  );
});

test('allows normal model choice for chat without a URL', () => {
  assert.deepEqual(
    selectChatToolDirective({
      message: 'What can you do?',
      linkAnalysis: emptyLinkAnalysisState(),
      registrationAttempted: false,
      retrievalCompleted: false,
    }),
    { mode: 'auto' },
  );
});

test('searches stored links before answering questions about saved content', () => {
  assert.deepEqual(
    selectChatToolDirective({
      message: 'Del Short de Alex Hormozi que guardé, ¿cuál es el consejo número 4?',
      linkAnalysis: emptyLinkAnalysisState(),
      registrationAttempted: false,
      retrievalCompleted: false,
    }),
    { mode: 'tool', name: 'get_links' },
  );
});
