import { YtDlp } from 'ytdlp-nodejs';
import { spawn } from 'node:child_process';
import {
  fetchPublicResource,
  type PublicResourceDependencies,
} from './public-resource';
import { classifySourceUrl } from './source-url';

const CAPTION_MAX_BYTES = 2_000_000;
const CAPTION_MAX_CHARS = 100_000;
const CAPTION_TIMEOUT_MS = 10_000;
const METADATA_MAX_BYTES = 5_000_000;
const METADATA_TIMEOUT_MS = 30_000;
const OEMBED_MAX_BYTES = 100_000;
const OEMBED_TIMEOUT_MS = 8_000;
const GEMINI_CONTENT_MAX_CHARS = 100_000;

interface CaptionTrack {
  ext: string;
  url: string;
  name?: string;
}

type CaptionMap = Record<string, CaptionTrack[]>;

export interface YouTubeMetadata {
  _type: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  duration?: number;
  channel?: string;
  uploader?: string;
  webpage_url?: string;
  subtitles?: CaptionMap;
  automatic_captions?: CaptionMap;
}

export interface YouTubeExtraction {
  title: string;
  description: string;
  thumbnailUrl: string | null;
  duration: number | null;
  channel: string | null;
  transcript: string | null;
  transcriptLanguage: string | null;
  transcriptSource: 'manual' | 'automatic' | 'none';
  transcriptTruncated: boolean;
  limitations: string[];
}

export interface YouTubeOEmbedExtraction {
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
}

interface GeminiTextOutput {
  type: string;
  text?: string;
}

interface GeminiYouTubeInteraction {
  status: string;
  output_text?: string;
  outputs?: GeminiTextOutput[];
}

export interface YouTubeGeminiDependencies {
  createInteraction: (params: {
    model: string;
    input: Array<
      | { type: 'text'; text: string }
      | { type: 'video'; uri: string }
    >;
    generation_config: {
      max_output_tokens: number;
      temperature: number;
    };
    store: false;
  }) => Promise<GeminiYouTubeInteraction>;
  model?: string;
}

export interface YouTubeDependencies {
  getInfo?: (url: string) => Promise<YouTubeMetadata>;
  fetchCaption?: (track: CaptionTrack) => Promise<string>;
  preferredLanguages?: string[];
}

let ytdlp: YtDlp | null = null;

export const buildYouTubeMetadataArgs = (
  url: string,
  nodePath = process.execPath,
): string[] => [
  '--dump-single-json',
  '--quiet',
  '--flat-playlist',
  '--no-playlist',
  '--skip-download',
  '--js-runtimes',
  `node:${nodePath}`,
  '--no-cookies',
  '--no-cookies-from-browser',
  '--retries',
  '1',
  '--socket-timeout',
  '10',
  url,
];

const getDefaultInfo = async (url: string): Promise<YouTubeMetadata> => {
  ytdlp ??= new YtDlp();
  const child = spawn(
    ytdlp.binaryPath,
    buildYouTubeMetadataArgs(url),
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  return new Promise((resolve, reject) => {
    let output = '';
    let outputBytes = 0;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('YouTube metadata request timed out')));
    }, METADATA_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += buffer.length;
      if (outputBytes > METADATA_MAX_BYTES) {
        child.kill('SIGKILL');
        finish(() => reject(new Error('YouTube metadata response is too large')));
        return;
      }
      output += buffer.toString();
    });
    child.stderr.on('data', () => undefined);
    child.on('error', () => {
      finish(() => reject(new Error('YouTube metadata process failed')));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        finish(() => reject(new Error('YouTube metadata request failed')));
        return;
      }
      finish(() => {
        try {
          resolve(JSON.parse(output) as YouTubeMetadata);
        } catch {
          reject(new Error('YouTube metadata response was invalid'));
        }
      });
    });
  });
};

const fetchDefaultCaption = async (track: CaptionTrack): Promise<string> => {
  const resource = await fetchPublicResource(track.url, {
    accept: 'text/vtt,application/json,text/plain',
    maxBytes: CAPTION_MAX_BYTES,
    maxRedirects: 3,
    timeoutMs: CAPTION_TIMEOUT_MS,
  });
  return resource.body.toString('utf8');
};

const normalizeCaptionText = (value: string): string =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const deduplicateLines = (
  lines: string[],
): { text: string; truncated: boolean } => {
  const output: string[] = [];
  for (const line of lines) {
    const normalized = normalizeCaptionText(line);
    const previous = output.at(-1);
    if (!normalized || normalized === previous) continue;
    if (previous && normalized.startsWith(previous)) {
      output[output.length - 1] = normalized;
    } else if (!previous?.startsWith(normalized)) {
      output.push(normalized);
    }
  }
  const joined = output.join(' ');
  return {
    text: joined.slice(0, CAPTION_MAX_CHARS),
    truncated: joined.length > CAPTION_MAX_CHARS,
  };
};

const parseVtt = (
  content: string,
): { text: string; truncated: boolean } => {
  const lines = content.replace(/\r/g, '').split('\n');
  const textLines: string[] = [];
  let insideNote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('NOTE')) {
      insideNote = true;
      continue;
    }
    if (insideNote) {
      if (!trimmed) insideNote = false;
      continue;
    }
    if (
      !trimmed ||
      trimmed === 'WEBVTT' ||
      trimmed.startsWith('Kind:') ||
      trimmed.startsWith('Language:') ||
      trimmed.includes('-->') ||
      /^\d+$/.test(trimmed)
    ) {
      continue;
    }
    textLines.push(trimmed);
  }
  return deduplicateLines(textLines);
};

const parseJson3 = (
  content: string,
): { text: string; truncated: boolean } => {
  const parsed = JSON.parse(content) as {
    events?: Array<{ segs?: Array<{ utf8?: string }> }>;
  };
  const lines = (parsed.events ?? []).map((event) =>
    (event.segs ?? []).map((segment) => segment.utf8 ?? '').join(''),
  );
  return deduplicateLines(lines);
};

interface SelectedCaption {
  language: string;
  track: CaptionTrack;
  source: 'manual' | 'automatic';
}

const preferredLanguageOrder = (
  captions: CaptionMap | undefined,
  preferredLanguages: string[],
): string[] => {
  if (!captions) return [];
  const languages = Object.keys(captions);
  return [
    ...preferredLanguages.flatMap((preferred) => [
      ...languages.filter((language) => language === preferred),
      ...languages.filter((language) => language.startsWith(`${preferred}-`)),
    ]),
  ];
};

const listCaptionTracks = (
  captions: CaptionMap | undefined,
  orderedLanguages: string[],
): Array<{ language: string; track: CaptionTrack }> => {
  if (!captions) return [];
  const selected: Array<{ language: string; track: CaptionTrack }> = [];
  for (const language of [...new Set(orderedLanguages)]) {
    const tracks = captions[language] ?? [];
    for (const extension of ['json3', 'vtt']) {
      for (const track of tracks.filter(({ ext }) => ext === extension)) {
        selected.push({ language, track });
      }
    }
  }
  return selected;
};

const listCaptionCandidates = (
  info: YouTubeMetadata,
  preferredLanguages: string[],
): SelectedCaption[] => {
  const withSource = (
    entries: Array<{ language: string; track: CaptionTrack }>,
    source: SelectedCaption['source'],
  ): SelectedCaption[] => entries.map((entry) => ({ ...entry, source }));
  const candidates = [
    ...withSource(
      listCaptionTracks(
        info.subtitles,
        preferredLanguageOrder(info.subtitles, preferredLanguages),
      ),
      'manual',
    ),
    ...withSource(
      listCaptionTracks(
        info.automatic_captions,
        preferredLanguageOrder(info.automatic_captions, preferredLanguages),
      ),
      'automatic',
    ),
    ...withSource(
      listCaptionTracks(info.subtitles, Object.keys(info.subtitles ?? {})),
      'manual',
    ),
    ...withSource(
      listCaptionTracks(
        info.automatic_captions,
        Object.keys(info.automatic_captions ?? {}),
      ),
      'automatic',
    ),
  ];

  const seenUrls = new Set<string>();
  return candidates.filter(({ track }) => {
    if (seenUrls.has(track.url)) return false;
    seenUrls.add(track.url);
    return true;
  });
};

const parseCaption = (
  track: CaptionTrack,
  content: string,
): { text: string; truncated: boolean } =>
  track.ext === 'json3' ? parseJson3(content) : parseVtt(content);

const safeThumbnail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

export const extractYouTubeOEmbed = async (
  input: string,
  dependencies: PublicResourceDependencies = {},
): Promise<YouTubeOEmbedExtraction> => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'youtube-video' && source.kind !== 'youtube-short') {
    throw new Error('URL must identify a YouTube video or Short');
  }

  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', source.normalizedUrl);
  endpoint.searchParams.set('format', 'json');
  const resource = await fetchPublicResource(
    endpoint.toString(),
    {
      accept: 'application/json',
      maxBytes: OEMBED_MAX_BYTES,
      maxRedirects: 2,
      timeoutMs: OEMBED_TIMEOUT_MS,
    },
    dependencies,
  );
  const payload = JSON.parse(resource.body.toString('utf8')) as {
    type?: unknown;
    title?: unknown;
    author_name?: unknown;
    thumbnail_url?: unknown;
  };
  if (payload.type !== 'video' || typeof payload.title !== 'string') {
    throw new Error('YouTube oEmbed response was invalid');
  }

  return {
    title: payload.title.trim() || 'Untitled YouTube video',
    channel:
      typeof payload.author_name === 'string'
        ? payload.author_name.trim() || null
        : null,
    thumbnailUrl: safeThumbnail(payload.thumbnail_url),
  };
};

export const extractYouTubeWithGemini = async (
  input: string,
  dependencies: YouTubeGeminiDependencies,
): Promise<{ content: string; truncated: boolean }> => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'youtube-video' && source.kind !== 'youtube-short') {
    throw new Error('URL must identify a YouTube video or Short');
  }

  const interaction = await dependencies.createInteraction({
    model: dependencies.model ?? 'gemini-3.8-flash',
    input: [
      {
        type: 'text',
        text: [
          'Create a faithful content record for this video so it can be searched and answered about later.',
          'Include a concise summary, the complete spoken transcript in the original language, meaningful on-screen text, and only important non-verbal context.',
          'Do not infer speech or details that are not present. Clearly label summary, transcript, on-screen text, and visual context.',
        ].join(' '),
      },
      {
        type: 'video',
        uri: source.normalizedUrl,
      },
    ],
    generation_config: {
      max_output_tokens: 16_384,
      temperature: 0,
    },
    store: false,
  });

  if (interaction.status !== 'completed') {
    throw new Error('Gemini YouTube analysis did not complete');
  }

  const content =
    interaction.output_text?.trim() ||
    (interaction.outputs ?? [])
      .filter(
        (output) => output.type === 'text' && typeof output.text === 'string',
      )
      .map((output) => output.text?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n');
  if (!content) {
    throw new Error('Gemini YouTube analysis returned no content');
  }

  return {
    content: content.slice(0, GEMINI_CONTENT_MAX_CHARS),
    truncated: content.length > GEMINI_CONTENT_MAX_CHARS,
  };
};

export const extractYouTubeVideo = async (
  input: string,
  dependencies: YouTubeDependencies = {},
): Promise<YouTubeExtraction> => {
  const source = classifySourceUrl(input);
  if (source.kind !== 'youtube-video' && source.kind !== 'youtube-short') {
    throw new Error('URL must identify a YouTube video or Short');
  }

  const getInfo = dependencies.getInfo ?? getDefaultInfo;
  const fetchCaption = dependencies.fetchCaption ?? fetchDefaultCaption;
  const preferredLanguages = dependencies.preferredLanguages ?? ['en', 'es'];
  const info = await getInfo(source.normalizedUrl);
  if (info._type !== 'video') {
    throw new Error('YouTube URL did not resolve to a single video');
  }

  const candidates = listCaptionCandidates(info, preferredLanguages);
  let selected: SelectedCaption | null = null;
  let transcript: string | null = null;
  let transcriptTruncated = false;
  const limitations: string[] = [];

  for (const candidate of candidates) {
    try {
      const parsedCaption = parseCaption(
        candidate.track,
        await fetchCaption(candidate.track),
      );
      if (!parsedCaption.text) continue;
      selected = candidate;
      transcript = parsedCaption.text;
      transcriptTruncated = parsedCaption.truncated;
      if (transcriptTruncated) {
        limitations.push('Transcript was truncated at 100000 characters');
      }
      break;
    } catch {
      continue;
    }
  }

  if (!selected && candidates.length > 0) {
    limitations.push('Available captions could not be retrieved');
  } else if (candidates.length === 0) {
    limitations.push('No supported manual or automatic captions were available');
  }

  return {
    title: info.title?.trim() || 'Untitled YouTube video',
    description: info.description?.trim().slice(0, 5_000) || '',
    thumbnailUrl: safeThumbnail(info.thumbnail),
    duration:
      typeof info.duration === 'number' && Number.isFinite(info.duration)
        ? info.duration
        : null,
    channel: (info.channel || info.uploader)?.trim() || null,
    transcript,
    transcriptLanguage: selected?.language ?? null,
    transcriptSource: selected?.source ?? 'none',
    transcriptTruncated,
    limitations,
  };
};
