import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';
const MAX_CONTENT_CHARS = 20_000;
const REQUEST_TIMEOUT_MS = 25_000;

interface FirecrawlMetadata {
  title?: unknown;
  description?: unknown;
  ogDescription?: unknown;
  ogImage?: unknown;
  sourceURL?: unknown;
  statusCode?: unknown;
  contentType?: unknown;
}

interface FirecrawlPayload {
  success?: unknown;
  data?: {
    markdown?: unknown;
    metadata?: FirecrawlMetadata;
  };
}

export interface FirecrawlExtraction {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  imageUrl: string | null;
  text: string;
  provenance: {
    method: 'firecrawl';
    contentType: string;
  };
}

export interface FirecrawlDependencies {
  apiKey?: string;
  request?: (url: string, init: RequestInit) => Promise<Response>;
}

const optionalString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const optionalHttpUrl = (value: unknown): string | null => {
  const candidate = optionalString(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export const hasFirecrawlConfiguration = (
  apiKey = process.env.FIRECRAWL_API_KEY,
): boolean => Boolean(apiKey?.trim());

export const extractWithFirecrawl = async (
  input: string,
  dependencies: FirecrawlDependencies = {},
): Promise<FirecrawlExtraction> => {
  const apiKey = dependencies.apiKey ?? process.env.FIRECRAWL_API_KEY;
  if (!apiKey?.trim()) throw new Error('Firecrawl is not configured');

  const request = dependencies.request ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await request(FIRECRAWL_SCRAPE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: input,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 20_000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Firecrawl request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as FirecrawlPayload;
    const metadata = payload.data?.metadata;
    const pageStatus = Number(metadata?.statusCode);
    if (
      payload.success !== true ||
      !metadata ||
      (Number.isFinite(pageStatus) &&
        !((pageStatus >= 200 && pageStatus < 300) || pageStatus === 304))
    ) {
      throw new Error('Firecrawl did not return a successful page');
    }

    const markdown = optionalString(payload.data?.markdown).slice(
      0,
      MAX_CONTENT_CHARS,
    );
    if (!markdown) throw new Error('Firecrawl returned no page content');

    const requestedUrl = new URL(input).toString();
    return {
      requestedUrl,
      finalUrl: optionalHttpUrl(metadata.sourceURL) ?? requestedUrl,
      title: optionalString(metadata.title) || new URL(requestedUrl).hostname,
      description:
        optionalString(metadata.description) ||
        optionalString(metadata.ogDescription),
      imageUrl: optionalHttpUrl(metadata.ogImage),
      text: markdown,
      provenance: {
        method: 'firecrawl',
        contentType: optionalString(metadata.contentType) || 'text/markdown',
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};
