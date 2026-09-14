import { classifySourceUrl } from './source-url';

export interface LinkAnalysisState {
  analyzedUrl: string | null;
  error: string | null;
}

type GuardResult =
  | { allowed: true }
  | {
      allowed: false;
      response: { success: false; error: string; message: string };
    };

export const emptyLinkAnalysisState = (): LinkAnalysisState => ({
  analyzedUrl: null,
  error: null,
});

export const recordLinkAnalysis = (
  url: unknown,
  result: unknown,
): LinkAnalysisState => {
  const analysis = result as { success?: unknown; error?: unknown } | null;
  if (!analysis || analysis.success !== true) {
    return {
      analyzedUrl: null,
      error:
        typeof analysis?.error === 'string'
          ? analysis.error
          : 'URL analysis failed',
    };
  }

  try {
    return {
      analyzedUrl: classifySourceUrl(String(url)).normalizedUrl,
      error: null,
    };
  } catch {
    return { analyzedUrl: null, error: 'URL analysis returned an invalid URL' };
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
