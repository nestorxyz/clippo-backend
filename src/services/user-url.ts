const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Accept a public-looking domain without a scheme at the user-input boundary. */
export const normalizeUserUrl = (input: unknown): string => {
  if (typeof input !== 'string') throw new Error('A URL is required');
  const value = input.trim();
  if (!value || /\s/.test(value) || value.startsWith('//')) {
    throw new Error('A valid URL is required');
  }

  const hasHttpScheme = /^https?:\/\//i.test(value);
  if (!hasHttpScheme && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error('Only HTTP and HTTPS links are supported');
  }

  let url: URL;
  try {
    url = new URL(hasHttpScheme ? value : `https://${value}`);
  } catch {
    throw new Error('A valid URL is required');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    (!hasHttpScheme && !BARE_DOMAIN.test(url.hostname))
  ) {
    throw new Error('A valid HTTP or HTTPS URL is required');
  }
  return url.toString();
};

const cleanMatch = (value: string): string => value.replace(/[.,!?;:)}\]]+$/, '');

/** Find a URL pasted alone or in chat text, without treating email as a link. */
export const findUserUrl = (message: string): string | null => {
  const pattern = /(?:^|[\s(<])(https?:\/\/[^\s<>]+|(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[/?#][^\s<>]*)?)(?![@.a-z0-9:-])/gi;
  for (const match of message.matchAll(pattern)) {
    try {
      return normalizeUserUrl(cleanMatch(match[1]));
    } catch {
      // A domain-looking token is not necessarily a valid URL.
    }
  }
  return null;
};
