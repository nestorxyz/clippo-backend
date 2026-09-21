import {
  extractWithFirecrawl,
  hasFirecrawlConfiguration,
  type FirecrawlDependencies,
  type FirecrawlExtraction,
} from './firecrawl.service';
import {
  extractWebPage,
  type WebPageExtraction,
} from './web-page-extractor';
import {
  PublicResourceError,
  type PublicResourceDependencies,
} from './public-resource';

export type WebPageContent = WebPageExtraction | FirecrawlExtraction;

export interface WebPageContentDependencies {
  native?: PublicResourceDependencies;
  firecrawl?: FirecrawlDependencies;
}

const needsRenderedContent = (page: WebPageExtraction): boolean =>
  page.text.length < 500 || (!page.description && page.text.length < 1_000);

const canUseFirecrawlAfter = (error: unknown): boolean =>
  error instanceof PublicResourceError &&
  ['FETCH_FAILURE', 'HTTP_ERROR', 'UNSUPPORTED_CONTENT_TYPE'].includes(
    error.code,
  );

export const extractWebPageContent = async (
  input: string,
  dependencies: WebPageContentDependencies = {},
): Promise<WebPageContent> => {
  const firecrawlConfigured = hasFirecrawlConfiguration(
    dependencies.firecrawl?.apiKey,
  );

  let nativePage: WebPageExtraction;
  try {
    nativePage = await extractWebPage(input, dependencies.native);
  } catch (error) {
    if (!firecrawlConfigured || !canUseFirecrawlAfter(error)) throw error;
    return extractWithFirecrawl(input, dependencies.firecrawl);
  }

  if (!firecrawlConfigured || !needsRenderedContent(nativePage)) {
    return nativePage;
  }

  try {
    return await extractWithFirecrawl(input, dependencies.firecrawl);
  } catch {
    return nativePage;
  }
};
