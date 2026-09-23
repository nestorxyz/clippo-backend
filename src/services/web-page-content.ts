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
  allowFirecrawl?: boolean;
}

const hasSensitiveUrlParameters = (input: string): boolean => {
  try {
    const url = new URL(input);
    if (url.username || url.password) return true;
    return [...url.searchParams.keys()].some((key) =>
      /^(?:access[_-]?token|auth(?:orization)?|api[_-]?key|key|secret|password|passcode|otp|code|state|session|sig(?:nature)?|token)$/i.test(
        key,
      ),
    );
  } catch {
    return true;
  }
};

const canUseFirecrawlAfter = (error: unknown): boolean =>
  error instanceof PublicResourceError &&
  ['FETCH_FAILURE', 'HTTP_ERROR', 'UNSUPPORTED_CONTENT_TYPE'].includes(
    error.code,
  );

export const extractWebPageContent = async (
  input: string,
  dependencies: WebPageContentDependencies = {},
): Promise<WebPageContent> => {
  const firecrawlConfigured =
    dependencies.allowFirecrawl === true &&
    hasFirecrawlConfiguration(dependencies.firecrawl?.apiKey) &&
    !hasSensitiveUrlParameters(input);

  let nativePage: WebPageExtraction;
  try {
    nativePage = await extractWebPage(input, dependencies.native);
  } catch (error) {
    if (!firecrawlConfigured || !canUseFirecrawlAfter(error)) throw error;
    const targetUrl = new URL(input);
    targetUrl.hash = '';
    return extractWithFirecrawl(targetUrl.toString(), dependencies.firecrawl);
  }

  if (!firecrawlConfigured || hasSensitiveUrlParameters(nativePage.finalUrl)) {
    return nativePage;
  }

  try {
    const targetUrl = new URL(nativePage.finalUrl);
    targetUrl.hash = '';
    return await extractWithFirecrawl(
      targetUrl.toString(),
      dependencies.firecrawl,
    );
  } catch {
    return nativePage;
  }
};
