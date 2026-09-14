import { lookup } from 'node:dns/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { isIP } from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';

export type PublicResourceErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_ADDRESS'
  | 'DNS_FAILURE'
  | 'FETCH_FAILURE'
  | 'HTTP_ERROR'
  | 'REDIRECT_LIMIT'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'RESPONSE_TOO_LARGE';

export class PublicResourceError extends Error {
  constructor(
    readonly code: PublicResourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicResourceError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

interface ResourceResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface PublicResource {
  requestedUrl: string;
  finalUrl: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface PublicResourceOptions {
  accept: string;
  maxBytes: number;
  maxRedirects: number;
  timeoutMs: number;
}

interface RequestLimits {
  accept: string;
  maxBytes: number;
  timeoutMs: number;
}

export interface PublicResourceDependencies {
  resolveHostname?: (hostname: string) => Promise<ResolvedAddress[]>;
  requestResource?: (
    url: URL,
    address: ResolvedAddress,
    limits: RequestLimits,
  ) => Promise<ResourceResponse>;
}

const parseIpv4 = (address: string): number[] | null => {
  const parts = address.split('.');
  const octets = parts.map(Number);
  if (
    octets.length !== 4 ||
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== parts[index],
    )
  ) {
    return null;
  }
  return octets;
};

const isPublicIpv4 = (address: string): boolean => {
  const octets = parseIpv4(address);
  if (!octets) return false;

  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
};

const expandIpv6 = (address: string): number[] | null => {
  const withoutZone = address.toLowerCase().split('%')[0];
  const halves = withoutZone.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const groups: number[] = [];
    for (const part of half.split(':')) {
      if (part.includes('.')) {
        const ipv4 = parseIpv4(part);
        if (!ipv4) return null;
        groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else if (!/^[0-9a-f]{1,4}$/.test(part)) {
        return null;
      } else {
        groups.push(Number.parseInt(part, 16));
      }
    }
    return groups;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return null;

  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || omitted < 0) return null;
  return [...left, ...Array(omitted).fill(0), ...right];
};

const isPublicIpv6 = (address: string): boolean => {
  const groups = expandIpv6(address);
  if (!groups || groups.length !== 8) return false;

  // Only globally routable unicast space is useful for public webpage fetches.
  if ((groups[0] & 0xe000) !== 0x2000) return false;
  // Documentation prefix 2001:db8::/32 must never be fetched.
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  // Reject 6to4 so an embedded private IPv4 address cannot bypass the guard.
  if (groups[0] === 0x2002) return false;
  return true;
};

export const isPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  return family === 4
    ? isPublicIpv4(address)
    : family === 6 && isPublicIpv6(address);
};

const parseFetchUrl = (input: string): URL => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new PublicResourceError('INVALID_URL', 'URL must be absolute');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicResourceError(
      'INVALID_URL',
      'Only HTTP and HTTPS URLs can be fetched',
    );
  }
  if (url.username || url.password) {
    throw new PublicResourceError(
      'INVALID_URL',
      'URLs containing credentials are not allowed',
    );
  }
  if (
    url.port &&
    !(
      (url.protocol === 'http:' && url.port === '80') ||
      (url.protocol === 'https:' && url.port === '443')
    )
  ) {
    throw new PublicResourceError(
      'INVALID_URL',
      'Only standard HTTP and HTTPS ports are allowed',
    );
  }
  url.hash = '';
  return url;
};

const resolvePublicAddress = async (
  url: URL,
  resolveHostname: (hostname: string) => Promise<ResolvedAddress[]>,
  timeoutMs: number,
): Promise<ResolvedAddress> => {
  const normalizedHostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(normalizedHostname)) {
    if (!isPublicAddress(normalizedHostname)) {
      throw new PublicResourceError(
        'BLOCKED_ADDRESS',
        'URL resolves to a non-public address',
      );
    }
    return {
      address: normalizedHostname,
      family: isIP(normalizedHostname) as 4 | 6,
    };
  }

  const hostname = normalizedHostname.toLowerCase();
  if (
    !hostname.includes('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new PublicResourceError(
      'BLOCKED_ADDRESS',
      'Local hostnames are not allowed',
    );
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await new Promise<ResolvedAddress[]>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('DNS lookup timed out')),
        timeoutMs,
      );
      resolveHostname(hostname).then(
        (resolvedAddresses) => {
          clearTimeout(timeout);
          resolve(resolvedAddresses);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  } catch {
    throw new PublicResourceError(
      'DNS_FAILURE',
      'The webpage hostname could not be resolved',
    );
  }

  if (addresses.length === 0) {
    throw new PublicResourceError(
      'DNS_FAILURE',
      'The webpage hostname did not resolve to an address',
    );
  }
  if (addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new PublicResourceError(
      'BLOCKED_ADDRESS',
      'URL resolves to a non-public address',
    );
  }
  return addresses[0];
};

const defaultResolveHostname = async (
  hostname: string,
): Promise<ResolvedAddress[]> => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
};

const defaultRequestResource = (
  url: URL,
  address: ResolvedAddress,
  limits: RequestLimits,
): Promise<ResourceResponse> =>
  new Promise((resolve, reject) => {
    const request = url.protocol === 'https:' ? requestHttps : requestHttp;
    const req = request(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername:
          url.protocol === 'https:' &&
          !isIP(url.hostname.replace(/^\[|\]$/g, ''))
            ? url.hostname
            : undefined,
        headers: {
          Accept: limits.accept,
          'Accept-Encoding': 'identity',
          Host: url.host,
          'User-Agent': 'DoryAI-LinkExtractor/1.0',
        },
      },
      (response) => {
        const declaredLength = Number(response.headers['content-length']);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > limits.maxBytes
        ) {
          response.destroy();
          reject(
            new PublicResourceError(
              'RESPONSE_TOO_LARGE',
              'Webpage response exceeds the allowed size',
            ),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > limits.maxBytes) {
            response.destroy(
              new PublicResourceError(
                'RESPONSE_TOO_LARGE',
                'Webpage response exceeds the allowed size',
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      },
    );

    req.setTimeout(limits.timeoutMs, () => {
      req.destroy(
        new PublicResourceError(
          'FETCH_FAILURE',
          'Webpage request timed out',
        ),
      );
    });
    req.on('error', (error) => {
      reject(
        error instanceof PublicResourceError
          ? error
          : new PublicResourceError(
              'FETCH_FAILURE',
              'Webpage request failed',
            ),
      );
    });
    req.end();
  });

export const fetchPublicResource = async (
  input: string,
  options: PublicResourceOptions,
  dependencies: PublicResourceDependencies = {},
): Promise<PublicResource> => {
  const resolveHostname =
    dependencies.resolveHostname ?? defaultResolveHostname;
  const requestResource = dependencies.requestResource ?? defaultRequestResource;
  const requestedUrl = parseFetchUrl(input);
  let currentUrl = requestedUrl;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const address = await resolvePublicAddress(
      currentUrl,
      resolveHostname,
      options.timeoutMs,
    );
    let response: ResourceResponse;
    try {
      response = await requestResource(currentUrl, address, {
        accept: options.accept,
        maxBytes: options.maxBytes,
        timeoutMs: options.timeoutMs,
      });
    } catch (error) {
      if (error instanceof PublicResourceError) throw error;
      throw new PublicResourceError('FETCH_FAILURE', 'Webpage request failed');
    }

    if (response.body.length > options.maxBytes) {
      throw new PublicResourceError(
        'RESPONSE_TOO_LARGE',
        'Webpage response exceeds the allowed size',
      );
    }

    if (
      [301, 302, 303, 307, 308].includes(response.statusCode) &&
      response.headers.location
    ) {
      if (redirectCount >= options.maxRedirects) {
        throw new PublicResourceError(
          'REDIRECT_LIMIT',
          'Webpage redirected too many times',
        );
      }
      currentUrl = parseFetchUrl(
        new URL(response.headers.location, currentUrl).toString(),
      );
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new PublicResourceError(
        'HTTP_ERROR',
        `Webpage returned HTTP ${response.statusCode}`,
      );
    }

    return {
      requestedUrl: requestedUrl.toString(),
      finalUrl: currentUrl.toString(),
      headers: response.headers,
      body: response.body,
    };
  }
};
