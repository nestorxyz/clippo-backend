import {
  fetchPublicResource,
  PublicResourceError,
  type PublicResourceDependencies,
} from './public-resource';
import { classifySourceUrl } from './source-url';

const MAX_RESPONSE_BYTES = 64_000;
const MAX_SNIPPET_CHARS = 500;

export interface XEmbedExtraction {
  authorName: string;
  handle: string | null;
  snippet: string;
}

const decodeHtml = (value: string): string =>
  value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex: string, decimal: string) => {
      const point = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');

const postTextFromHtml = (html: string): string => {
  const paragraph = html.match(/<blockquote\b[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (!paragraph) return '';
  return decodeHtml(
    paragraph.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SNIPPET_CHARS);
};

const canonicalPost = (input: string): { url: string; handle: string | null; id: string } => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'x') throw new Error('URL must identify an X post');

  const url = new URL(source.normalizedUrl);
  const match = url.pathname.match(/^\/([a-z0-9_]{1,15}|i)\/status\/(\d{1,20})\/?$/i);
  if (!match) throw new Error('URL must identify an individual X post');

  const handle = match[1].toLowerCase() === 'i' ? null : match[1];
  return {
    url: `https://x.com/${match[1]}/status/${match[2]}`,
    handle,
    id: match[2],
  };
};

export const hasUsefulXContext = (snippet: string): boolean => {
  const withoutUrls = snippet.replace(/https?:\/\/\S+/gi, ' ');
  const words = withoutUrls.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 4 && withoutUrls.replace(/[^\p{L}\p{N}]/gu, '').length >= 20;
};

export const extractXEmbed = async (
  input: string,
  dependencies: PublicResourceDependencies = {},
): Promise<XEmbedExtraction> => {
  const post = canonicalPost(input);
  const endpoint = new URL('https://publish.x.com/oembed');
  endpoint.searchParams.set('url', post.url);
  endpoint.searchParams.set('omit_script', 'true');
  endpoint.searchParams.set('dnt', 'true');

  const response = await fetchPublicResource(
    endpoint.toString(),
    {
      accept: 'application/json',
      maxBytes: MAX_RESPONSE_BYTES,
      maxRedirects: 2,
      timeoutMs: 6_000,
    },
    dependencies,
  );
  const contentType = String(response.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw new PublicResourceError(
      'UNSUPPORTED_CONTENT_TYPE',
      'X embed did not return JSON',
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.body.toString('utf8'));
  } catch {
    throw new Error('X embed returned invalid JSON');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('X embed returned invalid metadata');
  }
  const result = payload as Record<string, unknown>;
  const returnedUrl = typeof result.url === 'string' ? result.url : '';
  let returnedPostId: string | null = null;
  try {
    returnedPostId = canonicalPost(returnedUrl).id;
  } catch {
    // A provider response is not trusted evidence for the requested post.
  }
  if (
    typeof result.author_name !== 'string' ||
    !result.author_name.trim() ||
    typeof result.html !== 'string' ||
    returnedPostId !== post.id
  ) {
    throw new Error('X embed returned mismatched or incomplete metadata');
  }

  return {
    authorName: result.author_name.trim().slice(0, 100),
    handle: post.handle,
    snippet: postTextFromHtml(result.html),
  };
};
