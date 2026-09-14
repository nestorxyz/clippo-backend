import {
  fetchPublicResource,
  PublicResourceError,
  type PublicResourceDependencies,
} from './public-resource';

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MAX_TEXT_CHARS = 20_000;
const TIMEOUT_MS = 8_000;

export interface WebPageExtraction {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  imageUrl: string | null;
  text: string;
  provenance: {
    method: 'server-html';
    contentType: string;
  };
}

const decodeHtml = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');

const cleanText = (value: string, maxChars: number): string =>
  decodeHtml(value).replace(/\s+/g, ' ').trim().slice(0, maxChars);

const readAttributes = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
};

const extractMetadata = (html: string, finalUrl: URL) => {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const metadata = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = readAttributes(tag);
    const key = (attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !metadata.has(key)) {
      metadata.set(key, attributes.content);
    }
  }

  const rawImage = metadata.get('og:image');
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const parsedImage = new URL(rawImage, finalUrl);
      if (parsedImage.protocol === 'http:' || parsedImage.protocol === 'https:') {
        imageUrl = parsedImage.toString();
      }
    } catch {
      imageUrl = null;
    }
  }

  const text = cleanText(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
    MAX_TEXT_CHARS,
  );

  return {
    title: cleanText(
      metadata.get('og:title') || titleMatch?.[1] || finalUrl.hostname,
      300,
    ),
    description: cleanText(
      metadata.get('og:description') || metadata.get('description') || '',
      1_000,
    ),
    imageUrl,
    text,
  };
};

export const extractWebPage = async (
  input: string,
  dependencies: PublicResourceDependencies = {},
): Promise<WebPageExtraction> => {
  const resource = await fetchPublicResource(
    input,
    {
      accept: 'text/html,application/xhtml+xml',
      maxBytes: MAX_BYTES,
      maxRedirects: MAX_REDIRECTS,
      timeoutMs: TIMEOUT_MS,
    },
    dependencies,
  );
  const contentType = String(resource.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') {
    throw new PublicResourceError(
      'UNSUPPORTED_CONTENT_TYPE',
      'URL did not return an HTML webpage',
    );
  }

  const finalUrl = new URL(resource.finalUrl);
  return {
    requestedUrl: resource.requestedUrl,
    finalUrl: resource.finalUrl,
    ...extractMetadata(resource.body.toString('utf8'), finalUrl),
    provenance: { method: 'server-html', contentType },
  };
};
