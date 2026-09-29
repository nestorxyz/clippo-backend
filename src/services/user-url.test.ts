import assert from 'node:assert/strict';
import test from 'node:test';
import { findUserUrl, normalizeUserUrl } from './user-url';

test('defaults schemeless public domains to HTTPS', () => {
  assert.equal(normalizeUserUrl('make.ad'), 'https://make.ad/');
  assert.equal(
    normalizeUserUrl(' www.make.ad/path?campaign=one#part '),
    'https://www.make.ad/path?campaign=one#part',
  );
  assert.equal(
    normalizeUserUrl('youtube.com/shorts/abc123'),
    'https://youtube.com/shorts/abc123',
  );
});

test('preserves explicit HTTP and HTTPS', () => {
  assert.equal(normalizeUserUrl('http://make.ad'), 'http://make.ad/');
  assert.equal(normalizeUserUrl('https://make.ad'), 'https://make.ad/');
});

test('rejects malformed, non-web, and credential-bearing inputs', () => {
  for (const value of [
    '',
    'hello world',
    'localhost',
    '//make.ad',
    'javascript:alert(1)',
    'ftp://make.ad',
    'https://user:pass@make.ad',
    'user@make.ad',
  ]) {
    assert.throws(() => normalizeUserUrl(value));
  }
});

test('finds a pasted bare domain in chat without mistaking email for a link', () => {
  assert.equal(findUserUrl('www.make.ad'), 'https://www.make.ad/');
  assert.equal(
    findUserUrl('Guarda make.ad/path?source=chat.'),
    'https://make.ad/path?source=chat',
  );
  assert.equal(
    findUserUrl('Save http://example.com/article'),
    'http://example.com/article',
  );
  assert.equal(findUserUrl('Email me at user@example.com'), null);
  assert.equal(findUserUrl('Save make.ad@other.example'), null);
  assert.equal(findUserUrl('Save make.ad:8080'), null);
  assert.equal(
    findUserUrl('Save make.ad, not https://other.example'),
    'https://make.ad/',
  );
  assert.equal(findUserUrl('What did the saved link say?'), null);
});
