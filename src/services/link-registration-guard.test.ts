import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyLinkAnalysisState,
  guardLinkRegistration,
  nextChatToolRound,
  recordLinkAnalysis,
  recordLinkRegistration,
  selectChatToolDirective,
  withVerifiedAnalyzedContent,
} from './link-registration-guard';

test('allows the same normalized URL after successful analysis', () => {
  const state = recordLinkAnalysis('https://example.com/page#section', {
    success: true,
  });

  assert.deepEqual(guardLinkRegistration(state, 'https://example.com/page'), {
    allowed: true,
    saveUrl: 'https://example.com/page',
  });
});

test('matches a schemeless registration URL to its HTTPS analysis', () => {
  const state = recordLinkAnalysis('www.make.ad', { success: true });
  assert.deepEqual(guardLinkRegistration(state, 'https://www.make.ad/'), {
    allowed: true,
    saveUrl: 'https://www.make.ad/',
  });
  assert.deepEqual(guardLinkRegistration(state, 'www.make.ad'), {
    allowed: true,
    saveUrl: 'https://www.make.ad/',
  });
  assert.deepEqual(guardLinkRegistration(state, 'make.ad'), {
    allowed: false,
    response: {
      success: false,
      error: 'URL_MISMATCH',
      message: 'The saved URL must match the successfully analyzed URL',
    },
  });
});

test('saves the analyzed YouTube URL when the model rewrites the same video', () => {
  const analyzedUrl = 'https://youtu.be/IBcBKgYUghU?si=Vh3N_9Mvt5yPnW0i';
  const state = recordLinkAnalysis(analyzedUrl, { success: true });

  for (const registrationUrl of [
    'https://youtu.be/IBcBKgYUghU',
    'https://www.youtube.com/watch?v=IBcBKgYUghU',
    'https://youtube.com/shorts/IBcBKgYUghU',
  ]) {
    assert.deepEqual(guardLinkRegistration(state, registrationUrl), {
      allowed: true,
      saveUrl: analyzedUrl,
    });
  }
});

test('rejects a different YouTube video and unrelated URL changes', () => {
  const state = recordLinkAnalysis('https://youtu.be/IBcBKgYUghU?si=share', {
    success: true,
  });

  for (const registrationUrl of [
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://example.com/watch?v=IBcBKgYUghU',
    'https://youtube.com.evil/watch?v=IBcBKgYUghU',
  ]) {
    const result = guardLinkRegistration(state, registrationUrl);
    assert.equal(result.allowed, false);
    if (!result.allowed) assert.equal(result.response.error, 'URL_MISMATCH');
  }

  const webState = recordLinkAnalysis('https://example.com/article?part=1', {
    success: true,
  });
  const changedPage = guardLinkRegistration(
    webState,
    'https://example.com/article?part=2',
  );
  assert.equal(changedPage.allowed, false);
});

test('blocks a second YouTube registration through an equivalent URL', () => {
  const analyzedUrl = 'https://youtu.be/IBcBKgYUghU?si=share';
  let state = recordLinkAnalysis(analyzedUrl, { success: true });
  state = recordLinkRegistration(state, analyzedUrl, { success: true });

  const result = guardLinkRegistration(
    state,
    'https://www.youtube.com/watch?v=IBcBKgYUghU',
  );
  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.response.error, 'LINK_ALREADY_REGISTERED');
  }
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

test('persists only verified X snippet for the analyzed URL', () => {
  const snippet = 'Raise prices and advertise more to reach customers.';
  const state = recordLinkAnalysis('https://x.com/dory/status/123', {
    success: true,
    content: snippet,
    sourceExtraction: { usedStrategy: 'x-oembed' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://x.com/dory/status/123#reply',
      content: 'Invented post details',
      title: 'Business advice',
    }),
    {
      url: 'https://x.com/dory/status/123#reply',
      content: snippet,
      title: 'Business advice',
    },
  );
  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://x.com/dory/status/456',
      content: 'Invented post details',
    }),
    { url: 'https://x.com/dory/status/456' },
  );
});

test('does not persist model-invented X content after metadata-only analysis', () => {
  const state = recordLinkAnalysis('https://x.com/dory/status/123', {
    success: true,
    sourceExtraction: { usedStrategy: 'url-only' },
  });
  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://x.com/dory/status/123',
      content: 'Made up context',
    }),
    { url: 'https://x.com/dory/status/123' },
  );
});

test('persists only the verified LinkedIn preview for short and direct URLs', () => {
  for (const url of [
    'https://lnkd.in/p/example',
    'https://www.linkedin.com/posts/example_activity-123',
  ]) {
    const state = recordLinkAnalysis(url, {
      success: true,
      content: 'Author post text without sign-in UI',
      sourceExtraction: { kind: 'linkedin', usedStrategy: 'web-page' },
    });

    assert.deepEqual(
      withVerifiedAnalyzedContent(state, {
        url,
        content: 'Invented post text',
        contentScope: 'complete',
      }),
      {
        url,
        content: 'Author post text without sign-in UI',
        contentScope: 'partial-preview',
      },
    );
  }
});

test('labels unavailable LinkedIn text as metadata-only without invented content', () => {
  const url = 'https://www.linkedin.com/posts/example_activity-123';
  const state = recordLinkAnalysis(url, {
    success: true,
    sourceExtraction: { kind: 'linkedin', usedStrategy: 'web-page' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url,
      content: 'Invented post text',
      contentScope: 'complete',
    }),
    { url, contentScope: 'metadata-only' },
  );
});

test('labels URL-only LinkedIn saves as metadata-only', () => {
  const url = 'https://www.linkedin.com/posts/example_activity-123';
  const state = recordLinkAnalysis(url, {
    success: true,
    sourceExtraction: { kind: 'linkedin', usedStrategy: 'url-only' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url,
      content: 'Invented post text',
      contentScope: 'complete',
    }),
    { url, contentScope: 'metadata-only' },
  );
});

test('saves extracted webpage text even when the model omits content', () => {
  for (const strategy of ['firecrawl', 'web-page']) {
    const state = recordLinkAnalysis('https://www.make.ad/#home', {
      success: true,
      content: 'Verified page body and pricing details',
      sourceExtraction: { usedStrategy: strategy },
    });

    assert.deepEqual(
      withVerifiedAnalyzedContent(state, {
        url: 'https://www.make.ad/',
        title: 'Make Ad',
      }),
      {
        url: 'https://www.make.ad/',
        title: 'Make Ad',
        content: 'Verified page body and pricing details',
      },
    );
  }
});

test('replaces invented webpage content and never copies it to another URL', () => {
  const state = recordLinkAnalysis('https://www.make.ad/', {
    success: true,
    content: 'Verified page body',
    sourceExtraction: { usedStrategy: 'firecrawl' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://www.make.ad/',
      content: 'Invented page body',
    }),
    { url: 'https://www.make.ad/', content: 'Verified page body' },
  );
  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://example.com/',
      content: 'Invented page body',
    }),
    { url: 'https://example.com/' },
  );
});

test('drops unverified webpage content when extraction returns no text', () => {
  const state = recordLinkAnalysis('https://example.com/', {
    success: true,
    sourceExtraction: { usedStrategy: 'web-page' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://example.com/',
      content: 'Invented page body',
    }),
    { url: 'https://example.com/' },
  );
});

test('clears extracted page text before analyzing another URL', () => {
  const first = recordLinkAnalysis('https://example.com/one', {
    success: true,
    content: 'First page body',
    sourceExtraction: { usedStrategy: 'firecrawl' },
  });
  const second = recordLinkAnalysis(
    'https://example.com/two',
    { success: true, sourceExtraction: { usedStrategy: 'web-page' } },
    first,
  );

  assert.deepEqual(
    withVerifiedAnalyzedContent(second, {
      url: 'https://example.com/two',
      content: 'Invented second page body',
    }),
    { url: 'https://example.com/two' },
  );
});

test('keeps video content handling outside the webpage save fix', () => {
  const state = recordLinkAnalysis('https://youtu.be/IBcBKgYUghU', {
    success: true,
    content: 'Video analysis',
    sourceExtraction: { usedStrategy: 'youtube-gemini' },
  });

  assert.deepEqual(
    withVerifiedAnalyzedContent(state, {
      url: 'https://youtu.be/IBcBKgYUghU',
      content: 'Transcript passed by the video tool',
      contentScope: 'partial-preview',
    }),
    {
      url: 'https://youtu.be/IBcBKgYUghU',
      content: 'Transcript passed by the video tool',
    },
  );
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

test('forces URL analysis for a bare public domain', () => {
  for (const message of ['www.make.ad', 'guarda make.ad', 'save x.com/user/status/123']) {
    assert.deepEqual(
      selectChatToolDirective({
        message,
        linkAnalysis: emptyLinkAnalysisState(),
        registrationAttempted: false,
        retrievalCompleted: false,
      }),
      { mode: 'tool', name: 'get_url_info' },
    );
  }
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
