import { classifySourceUrl } from './source-url';

export interface LinkAnalysisState {
  analyzedUrl: string | null;
  error: string | null;
  registeredUrls: string[];
}

export type ChatToolDirective =
  | { mode: 'auto' }
  | { mode: 'tool'; name: 'get_url_info' | 'register_link' }
  | { mode: 'text' };

type GuardResult =
  | { allowed: true }
  | {
      allowed: false;
      response: { success: false; error: string; message: string };
    };

export const emptyLinkAnalysisState = (): LinkAnalysisState => ({
  analyzedUrl: null,
  error: null,
  registeredUrls: [],
});

export const recordLinkAnalysis = (
  url: unknown,
  result: unknown,
  currentState: LinkAnalysisState = emptyLinkAnalysisState(),
): LinkAnalysisState => {
  const analysis = result as { success?: unknown; error?: unknown } | null;
  if (!analysis || analysis.success !== true) {
    return {
      analyzedUrl: null,
      error:
        typeof analysis?.error === 'string'
          ? analysis.error
          : 'URL analysis failed',
      registeredUrls: currentState.registeredUrls,
    };
  }

  try {
    return {
      analyzedUrl: classifySourceUrl(String(url)).normalizedUrl,
      error: null,
      registeredUrls: currentState.registeredUrls,
    };
  } catch {
    return {
      analyzedUrl: null,
      error: 'URL analysis returned an invalid URL',
      registeredUrls: currentState.registeredUrls,
    };
  }
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

  if (state.registeredUrls.includes(normalizedRegistrationUrl)) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'LINK_ALREADY_REGISTERED',
        message: 'This link was already saved in the current request',
      },
    };
  }

  if (normalizedRegistrationUrl !== state.analyzedUrl) {
    return {
      allowed: false,
      response: {
        success: false,
        error: 'URL_MISMATCH',
        message: 'The saved URL must match the successfully analyzed URL',
      },
    };
  }
  return { allowed: true };
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

  return { mode: 'auto' };
};
