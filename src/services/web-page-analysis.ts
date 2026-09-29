import { describeSourceExtraction, isLinkedInPageUrl } from './source-url';
import type { WebPageContent } from './web-page-content';

export const toWebPageAnalysis = (
  url: string,
  page: WebPageContent,
  focus?: string,
) => {
  const linkedInPage = isLinkedInPageUrl(page.finalUrl);
  const sourceExtraction = describeSourceExtraction(
    linkedInPage ? page.finalUrl : url,
    page.provenance.method === 'firecrawl' ? 'firecrawl' : 'web-page',
  );
  const limitations = [
    focus && page.provenance.method !== 'firecrawl'
      ? 'Focused AI summarization is not enabled for general webpages'
      : null,
    sourceExtraction.limitation,
  ].filter((limitation): limitation is string => limitation !== null);

  return {
    success: true,
    summary: page.description || page.text.slice(0, 500),
    urlMetadata: {
      title: page.title,
      description: page.description,
      image: page.imageUrl,
    },
    finalUrl: page.finalUrl,
    provenance: page.provenance,
    sourceExtraction,
    limitations,
    ...(linkedInPage
      ? {
          platform: 'LinkedIn',
          contentScope: page.text ? 'partial-preview' : 'metadata-only',
        }
      : {}),
    ...(page.text ? { content: page.text } : {}),
  };
};
