import { classifySourceUrl } from './source-url';
import { findUserUrl, normalizeUserUrl } from './user-url';

export interface LinkAnalysisState {
  analyzedUrl: string | null;
  error: string | null;
  registeredUrls: string[];
  verifiedContent: string | null;
  verifiedImage: string | null;
  contentScope?: 'partial-preview' | 'metadata-only';
}

export type ChatToolDirective =
  | { mode: 'auto' }
  | { mode: 'tool'; name: 'get_url_info' | 'register_link' | 'get_links' | 'get_link' }
  | { mode: 'text' };

type GuardResult =
  | { allowed: true; saveUrl: string }
  | {
      allowed: false;
      response: { success: false; error: string; message: string };
    };

export const emptyLinkAnalysisState = (): LinkAnalysisState => ({
  analyzedUrl: null,
  error: null,
  registeredUrls: [],
  verifiedContent: null,
  verifiedImage: null,
});

const safeImageUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export const recordLinkAnalysis = (
  url: unknown,
  result: unknown,
  currentState: LinkAnalysisState = emptyLinkAnalysisState(),
): LinkAnalysisState => {
  const analysis = result as {
    success?: unknown;
    error?: unknown;
    content?: unknown;
    urlMetadata?: { image?: unknown };
    sourceExtraction?: { kind?: unknown; usedStrategy?: unknown };
  } | null;
  if (!analysis || analysis.success !== true) {
    return {
      analyzedUrl: null,
      error:
        typeof analysis?.error === 'string'
          ? analysis.error
          : 'URL analysis failed',
      registeredUrls: currentState.registeredUrls,
      verifiedContent: null,
      verifiedImage: null,
    };
  }

  try {
    const source = classifySourceUrl(normalizeUserUrl(url));
    const strategy = analysis.sourceExtraction?.usedStrategy;
    const content = typeof analysis.content === 'string' ? analysis.content : '';
    const linkedIn =
      source.kind === 'linkedin' ||
      analysis.sourceExtraction?.kind === 'linkedin';
    const linkedInPage = linkedIn && strategy === 'web-page';
    return {
      analyzedUrl: source.normalizedUrl,
      error: null,
      registeredUrls: currentState.registeredUrls,
      verifiedContent:
        source.kind === 'x' && strategy === 'x-oembed'
          ? content.slice(0, 500) || null
          : linkedInPage ||
              (source.kind === 'web-page' &&
                (strategy === 'firecrawl' || strategy === 'web-page'))
            ? content.slice(0, 20_000) || null
            : null,
      verifiedImage: safeImageUrl(analysis.urlMetadata?.image),
      ...(linkedIn && (strategy === 'web-page' || strategy === 'url-only')
        ? {
            contentScope:
              linkedInPage && content ? 'partial-preview' : 'metadata-only',
          }
        : {}),
    };
  } catch {
    return {
      analyzedUrl: null,
      error: 'URL analysis returned an invalid URL',
      registeredUrls: currentState.registeredUrls,
      verifiedContent: null,
      verifiedImage: null,
    };
  }
};

export const withVerifiedAnalyzedContent = <T extends { url?: unknown; content?: unknown; img_preview?: unknown }>(
  state: LinkAnalysisState,
  args: T,
): T => {
  let source;
  try {
    source = classifySourceUrl(String(args.url));
  } catch {
    return args;
  }
  // The model may omit or invent content. Save only extraction from the same
  // successfully analyzed URL, regardless of what it passes to register_link.
  const {
    contentScope: _modelContentScope,
    img_preview: _modelImage,
    ...withoutModelScope
  } = args as T & { contentScope?: unknown };
  const withVerifiedImage = {
    ...withoutModelScope,
    ...(source.normalizedUrl === state.analyzedUrl && state.verifiedImage
      ? { img_preview: state.verifiedImage }
      : {}),
  };
  if (
    source.kind !== 'x' &&
    source.kind !== 'web-page' &&
    source.kind !== 'linkedin'
  ) return withVerifiedImage as T;

  const { content: _modelContent, ...withoutModelContent } = withVerifiedImage;
  return {
    ...withoutModelContent,
    ...(source.normalizedUrl === state.analyzedUrl && state.verifiedContent
      ? { content: state.verifiedContent }
      : {}),
    ...(source.normalizedUrl === state.analyzedUrl && state.contentScope
      ? { contentScope: state.contentScope }
      : {}),
  } as T;
};

export const recordLinkRegistration = (
  state: LinkAnalysisState,
  registrationUrl: unknown,
  result: unknown,
): LinkAnalysisState => {
  const response = result as { success?: unknown } | null;
  if (response?.success !== true) return state;

  try {
    const normalizedUrl = classifySourceUrl(
      normalizeUserUrl(registrationUrl),
    ).normalizedUrl;
    return state.registeredUrls.includes(normalizedUrl)
      ? state
      : { ...state, registeredUrls: [...state.registeredUrls, normalizedUrl] };
  } catch {
    return state;
  }
};

const youtubeVideoId = (input: string): string | null => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'youtube-video' && source.kind !== 'youtube-short') {
    return null;
  }

  const url = new URL(source.normalizedUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (url.hostname === 'youtu.be' && parts.length === 1) {
    id = parts[0];
  } else if (parts.length === 1 && parts[0] === 'watch') {
    id = url.searchParams.get('v');
  } else if (
    parts.length === 2 &&
    (parts[0] === 'shorts' || parts[0] === 'live')
  ) {
    id = parts[1];
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
};

const matchesAnalyzedUrl = (
  analyzedUrl: string,
  candidateUrl: string,
): boolean => {
  if (analyzedUrl === candidateUrl) return true;

  // YouTube share links may change shape between model calls; only the video ID
  // may match, and the caller still persists the URL that was actually analyzed.
  const analyzedVideoId = youtubeVideoId(analyzedUrl);
  return (
    analyzedVideoId !== null &&
    analyzedVideoId === youtubeVideoId(candidateUrl)
  );
};

export const guardLinkRegistration = (
  state: LinkAnalysisState,
  registrationUrl: unknown,
): GuardResult => {
  if (state.error) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'URL_ANALYSIS_FAILED',
        message: state.error,
      },
    };
  }
  if (!state.analyzedUrl) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'URL_ANALYSIS_REQUIRED',
        message: 'Analyze this URL successfully before saving it',
      },
    };
  }

  let normalizedRegistrationUrl: string;
  try {
    normalizedRegistrationUrl = classifySourceUrl(
      normalizeUserUrl(registrationUrl),
    ).normalizedUrl;
  } catch {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'URL_MISMATCH',
        message: 'The link registration URL is invalid',
      },
    };
  }

  if (
    state.registeredUrls.some((registeredUrl) =>
      matchesAnalyzedUrl(registeredUrl, normalizedRegistrationUrl),
    )
  ) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'LINK_ALREADY_REGISTERED',
        message: 'This link was already saved in the current request',
      },
    };
  }

  if (!matchesAnalyzedUrl(state.analyzedUrl, normalizedRegistrationUrl)) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'URL_MISMATCH',
        message: 'The saved URL must match the successfully analyzed URL',
      },
    };
  }
  return { allowed: true, saveUrl: state.analyzedUrl };
};

export const MAX_CHAT_TOOL_ROUNDS = 6;

export const nextChatToolRound = (
  completedRounds: number,
  maximumRounds = MAX_CHAT_TOOL_ROUNDS,
): number => {
  if (completedRounds >= maximumRounds) {
    throw new Error(
      `Chat stopped after ${maximumRounds} tool rounds without a final response`,
    );
  }
  return completedRounds + 1;
};

const refersToSavedLinks = (message: string): boolean =>
  /\b(?:saved|bookmarked|my links|my bookmarks|guarde|guardad[oa]s?|mis enlaces|mis links)\b/i.test(
    message.normalize('NFD').replace(/\p{M}/gu, ''),
  );

export const wantsSavedLinkDetail = (message: string): boolean =>
  /\b(?:what (?:did|does|was)|tell me|summari[sz]e|explain|specific|content|que (?:dice|decia|decía)|de que trata|dime|resume|explica|contenido)\b/i.test(
    message.normalize('NFD').replace(/\p{M}/gu, ''),
  );

export const selectChatToolDirective = (args: {
  message: string;
  linkAnalysis: LinkAnalysisState;
  registrationAttempted: boolean;
  retrievalCompleted: boolean;
  retrievalHasResults?: boolean;
  detailRead?: boolean;
}): ChatToolDirective => {
  if (args.retrievalCompleted) {
    return args.retrievalHasResults && wantsSavedLinkDetail(args.message) && !args.detailRead
      ? { mode: 'tool', name: 'get_link' }
      : { mode: 'text' };
  }
  if (
    args.registrationAttempted ||
    args.linkAnalysis.error
  ) {
    return { mode: 'text' };
  }

  if (args.linkAnalysis.analyzedUrl) {
    return { mode: 'tool', name: 'register_link' };
  }

  if (findUserUrl(args.message)) {
    return { mode: 'tool', name: 'get_url_info' };
  }

  if (refersToSavedLinks(args.message)) {
    return { mode: 'tool', name: 'get_links' };
  }

  return { mode: 'auto' };
};
