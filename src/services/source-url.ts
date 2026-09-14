export type SourceKind =
  | 'instagram-reel'
  | 'tiktok-video'
  | 'youtube-video'
  | 'youtube-short'
  | 'linkedin'
  | 'x'
  | 'web-page';

export type ExtractionStrategy = 'short-video' | 'planned' | 'web-page';

export interface ClassifiedSourceUrl {
  kind: SourceKind;
  normalizedUrl: string;
  extractionStrategy: ExtractionStrategy;
}

const trimHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '');

const isHostname = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * Classifies an HTTP(S) source URL without fetching it.
 *
 * `planned` means DoryAI recognizes the source but does not yet promise a
 * specialized extractor. Callers must not turn classification into a success
 * claim.
 */
export const classifySourceUrl = (input: string): ClassifiedSourceUrl => {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Source URL must be a valid absolute URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Source URL must use HTTP or HTTPS');
  }

  url.hash = '';
  const hostname = trimHostname(url.hostname);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (isHostname(hostname, 'instagram.com') && /^\/reels?\//.test(path)) {
    return {
      kind: 'instagram-reel',
      normalizedUrl: url.toString(),
      extractionStrategy: 'short-video',
    };
  }

  if (
    isHostname(hostname, 'tiktok.com') &&
    (/^\/@[^/]+\/video\/\d+/.test(path) || hostname === 'vm.tiktok.com')
  ) {
    return {
      kind: 'tiktok-video',
      normalizedUrl: url.toString(),
      extractionStrategy: 'short-video',
    };
  }

  if (isHostname(hostname, 'youtube.com') && path.startsWith('/shorts/')) {
    return {
      kind: 'youtube-short',
      normalizedUrl: url.toString(),
      extractionStrategy: 'planned',
    };
  }

  if (
    (isHostname(hostname, 'youtube.com') &&
      (path === '/watch' || path.startsWith('/live/'))) ||
    hostname === 'youtu.be'
  ) {
    return {
      kind: 'youtube-video',
      normalizedUrl: url.toString(),
      extractionStrategy: 'planned',
    };
  }

  if (isHostname(hostname, 'linkedin.com')) {
    return {
      kind: 'linkedin',
      normalizedUrl: url.toString(),
      extractionStrategy: 'planned',
    };
  }

  if (isHostname(hostname, 'x.com') || isHostname(hostname, 'twitter.com')) {
    return {
      kind: 'x',
      normalizedUrl: url.toString(),
      extractionStrategy: 'planned',
    };
  }

  return {
    kind: 'web-page',
    normalizedUrl: url.toString(),
    extractionStrategy: 'web-page',
  };
};
