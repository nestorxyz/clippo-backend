import { extractWebPage, type WebPageExtraction } from './web-page-extractor';
import { classifySourceUrl, type SourceKind } from './source-url';
import { hasUsefulXContext, type XEmbedExtraction } from './x-embed.service';

type RestrictedSourceKind = Extract<SourceKind, 'linkedin' | 'x'>;

export interface RestrictedPlatformExtraction {
  kind: RestrictedSourceKind;
  platform: 'LinkedIn' | 'X';
  title: string;
  description: string;
  imageUrl: string | null;
  summary: string;
  content: string | null;
  contentAvailable: boolean;
  usedStrategy: 'x-oembed' | 'web-page' | 'url-only';
  limitation: string;
  failureCode: string | null;
}

export interface RestrictedPlatformDependencies {
  extractPage?: (url: string) => Promise<WebPageExtraction>;
  extractXPost?: (url: string) => Promise<XEmbedExtraction>;
}

const humanizeSlug = (value: string): string => {
  try {
    return decodeURIComponent(value)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
};

const urlOnlyTitle = (url: URL, kind: RestrictedSourceKind): string => {
  const parts = url.pathname.split('/').filter(Boolean);
  if (kind === 'x') {
    const username = parts[0];
    return username && parts[1] === 'status'
      ? `X post by @${username}`
      : 'X link';
  }

  if (parts[0] === 'in' && parts[1]) {
    const profileName = humanizeSlug(parts[1]);
    if (profileName) return `LinkedIn profile: ${profileName}`;
  }
  return 'LinkedIn post';
};

const platformName = (kind: RestrictedSourceKind): 'LinkedIn' | 'X' =>
  kind === 'linkedin' ? 'LinkedIn' : 'X';

export const extractRestrictedPlatform = async (
  input: string,
  dependencies: RestrictedPlatformDependencies = {},
): Promise<RestrictedPlatformExtraction> => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'linkedin' && source.kind !== 'x') {
    throw new Error('URL must identify a LinkedIn or X resource');
  }

  const platform = platformName(source.kind);
  if (source.kind === 'x' && dependencies.extractXPost !== undefined) {
    try {
      const post = await dependencies.extractXPost(source.normalizedUrl);
      if (hasUsefulXContext(post.snippet)) {
        const author = post.handle ? `@${post.handle}` : post.authorName;
        return {
          kind: 'x',
          platform,
          title: `X post by ${author}: ${post.snippet.slice(0, 90)}`,
          description: post.snippet,
          imageUrl: null,
          summary: post.snippet,
          content: post.snippet,
          contentAvailable: true,
          usedStrategy: 'x-oembed',
          limitation:
            'Only the public post text was available; quotes, threads, and media were not analyzed',
          failureCode: null,
        };
      }
    } catch {
      // The public embed can be unavailable; preserve the guarded page fallback.
    }
  }

  const extractPage = dependencies.extractPage ?? extractWebPage;
  try {
    const page = await extractPage(source.normalizedUrl);
    return {
      kind: source.kind,
      platform,
      title: page.title,
      description: page.description,
      imageUrl: page.imageUrl,
      summary: page.description || page.text.slice(0, 500),
      content: null,
      contentAvailable: true,
      usedStrategy: 'web-page',
      limitation: `Specialized ${source.kind} extraction is not implemented`,
      failureCode: null,
    };
  } catch (error) {
    const failureCode =
      error instanceof Error && 'code' in error
        ? String((error as Error & { code: unknown }).code)
        : 'FETCH_FAILURE';
    const title = urlOnlyTitle(new URL(source.normalizedUrl), source.kind);
    const limitation = `${platform} content could not be extracted; URL-only metadata was used`;
    return {
      kind: source.kind,
      platform,
      title,
      description: limitation,
      imageUrl: null,
      summary: limitation,
      content: null,
      contentAvailable: false,
      usedStrategy: 'url-only',
      limitation,
      failureCode,
    };
  }
};
