import { classifySourceUrl } from './source-url';

export interface LinkAnalysisState {
  analyzedUrl: string | null;
  error: string | null;
  registeredUrls: string[];
  verifiedXContent: string | null;
}

export type ChatToolDirective =
  | { mode: 'auto' }
  | { mode: 'tool'; name: 'get_url_info' | 'register_link' | 'get_links' }
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
  verifiedXContent: null,
});

export const recordLinkAnalysis = (
  url: unknown,
  result: unknown,
  currentState: LinkAnalysisState = emptyLinkAnalysisState(),
): LinkAnalysisState => {
  const analysis = result as {
    success?: unknown;
    error?: unknown;
    content?: unknown;
    sourceExtraction?: { usedStrategy?: unknown };
  } | null;
  if (!analysis || analysis.success !== true) {
    return {
      analyzedUrl: null,
      error:
        typeof analysis?.error === 'string'
          ? analysis.error
          : 'URL analysis failed',
      registeredUrls: currentState.registeredUrls,
      verifiedXContent: null,
    };
  }

  try {
    return {
      analyzedUrl: classifySourceUrl(String(url)).normalizedUrl,
      error: null,
      registeredUrls: currentState.registeredUrls,
      verifiedXContent:
        analysis.sourceExtraction?.usedStrategy === 'x-oembed' &&
        typeof analysis.content === 'string'
          ? analysis.content.slice(0, 500)
          : null,
    };
  } catch {
    return {
      analyzedUrl: null,
      error: 'URL analysis returned an invalid URL',
      registeredUrls: currentState.registeredUrls,
      verifiedXContent: null,
    };
  }
};

export const withVerifiedXContent = <T extends { url?: unknown; content?: unknown }>(
  state: LinkAnalysisState,
  args: T,
): T => {
  let source;
  try {
    source = classifySourceUrl(String(args.url));
  } catch {
    return args;
  }
  if (source.kind !== 'x') return args;

  // A model may omit or invent content. Persist only the snippet obtained from
  // the same successfully analyzed X URL.
  const { content: _modelContent, ...withoutModelContent } = args;
  return {
    ...withoutModelContent,
    ...(source.normalizedUrl === state.analyzedUrl && state.verifiedXContent
      ? { content: state.verifiedXContent }
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
      String(registrationUrl),
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
      String(registrationUrl),
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

const containsHttpUrl = (message: string): boolean =>
  /(?:^|\s)https?:\/\/\S+/i.test(message);

const refersToSavedLinks = (message: string): boolean =>
  /\b(?:saved|bookmarked|my links|my bookmarks|guarde|guardad[oa]s?|mis enlaces|mis links)\b/i.test(
    message.normalize('NFD').replace(/\p{M}/gu, ''),
  );

export const selectChatToolDirective = (args: {
  message: string;
  linkAnalysis: LinkAnalysisState;
  registrationAttempted: boolean;
  retrievalCompleted: boolean;
}): ChatToolDirective => {
  if (
    args.registrationAttempted ||
    args.retrievalCompleted ||
    args.linkAnalysis.error
  ) {
    return { mode: 'text' };
  }

  if (args.linkAnalysis.analyzedUrl) {
    return { mode: 'tool', name: 'register_link' };
  }

  if (containsHttpUrl(args.message)) {
    return { mode: 'tool', name: 'get_url_info' };
  }

  if (refersToSavedLinks(args.message)) {
    return { mode: 'tool', name: 'get_links' };
  }

  return { mode: 'auto' };
};
