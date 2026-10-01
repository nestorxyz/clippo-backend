import assert from 'node:assert/strict';
import test from 'node:test';
import { savedLinkAnswerInstruction } from './saved-link-answer';

test('exact-link instruction contains only the selected saved source and its scope', () => {
  const instruction = savedLinkAnswerInstruction({
    url: 'https://x.com/example/status/123',
    title: 'A post',
    content: 'Only this post text',
    contentScope: 'partial-preview',
  });
  assert.match(instruction, /exactly this one saved link/);
  assert.match(instruction, /incomplete public preview/);
  assert.match(instruction, /Only this post text/);
  assert.match(instruction, /https:\/\/x\.com\/example\/status\/123/);
});

test('exact-link instruction caps stored content and admits missing text', () => {
  const instruction = savedLinkAnswerInstruction({
    url: 'https://example.com',
    title: 'An article',
    content: 'a'.repeat(20010) + 'UNTRUSTED_TRAILER',
    contentScope: 'metadata-only',
  });
  assert.match(instruction, /cannot describe the full source/);
  assert.doesNotMatch(instruction, /UNTRUSTED_TRAILER/);
  const source = JSON.parse(instruction.split('Saved link: ')[1]);
  assert.equal(source.content.length, 20000);
});
