export interface LinkRetrievalTaxonomy {
  name?: string;
}

export interface LinkRetrievalRecord {
  _id?: string;
  url: string;
  title: string;
  description?: string;
  imgPreview?: string;
  content?: string;
  contentScope?: 'partial-preview' | 'metadata-only';
  source?: string;
  createdAt: number;
  updatedAt?: number;
  category?: LinkRetrievalTaxonomy | null;
  subCategory?: LinkRetrievalTaxonomy | null;
  tags?: Array<LinkRetrievalTaxonomy | string>;
  [key: string]: unknown;
}

export interface LinkRetrievalFilters {
  stringQuery?: string;
  source?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface PresentedLinkRetrievalResult {
  id?: string;
  url: string;
  title: string;
  description?: string;
  imgPreview?: string;
  contentExcerpt?: string;
  contentTruncated: boolean;
  contentScope?: 'partial-preview' | 'metadata-only';
  source?: string;
  createdAt: number;
  category?: string;
  subcategory?: string;
  tags: string[];
}

const normalize = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const tokenize = (value: string | undefined): string[] =>
  normalize(value).split(/\s+/).filter(Boolean);

export const toIndexQuery = (value: string): string =>
  tokenize(value).slice(0, 12).join(' ');

const requestWords = new Set([
  'a', 'about', 'an', 'and', 'busca', 'buscar', 'de', 'del', 'dime',
  'el', 'en', 'enlace', 'enlaces', 'encuentra', 'find', 'for', 'from',
  'guardado', 'guardados', 'i', 'la', 'link', 'links', 'me', 'mi',
  'mis', 'muestrame', 'my', 'of', 'on', 'please', 'que', 'quiero',
  'saved', 'show', 'sobre', 'that', 'the', 'this', 'to', 'un',
  'una', 'what', 'which', 'with',
]);

export const constrainFiltersToRequest = (
  filters: LinkRetrievalFilters,
  userMessage: string,
): LinkRetrievalFilters => {
  const request = ` ${normalize(userMessage)} `;
  const mentions = (value: string | undefined): boolean =>
    !value || request.includes(` ${normalize(value)} `);
  const explicitFilters: LinkRetrievalFilters = {
    ...filters,
    category: mentions(filters.category) ? filters.category : undefined,
    subcategory: mentions(filters.subcategory) ? filters.subcategory : undefined,
    tags: filters.tags?.every(mentions) ? filters.tags : undefined,
  };
  const mentionsYouTube = /\b(?:youtube|youtu\.be|yt)\b/i.test(userMessage);
  const excludesYouTube = /\b(?:not|no|except|excluding)\s+(?:a\s+)?(?:youtube|yt)\b/i.test(userMessage);
  const mentionsOtherSource = /\b(?:linkedin|instagram|tiktok|twitter|x\.com)\b/i.test(userMessage);
  if (!mentionsYouTube || excludesYouTube || mentionsOtherSource) return explicitFilters;
  return { ...explicitFilters, source: 'youtube' };
};

export const focusLinkSearchFilters = (
  filters: LinkRetrievalFilters,
): LinkRetrievalFilters => {
  if (!filters.stringQuery) return filters;
  const terms = tokenize(filters.stringQuery).filter(
    (term) =>
      !requestWords.has(term) &&
      (filters.source !== 'youtube' ||
        !['youtube', 'youtu', 'yt', 'video', 'videos'].includes(term)),
  );
  return { ...filters, stringQuery: terms.join(' ') || undefined };
};

const tagNames = (record: LinkRetrievalRecord): string[] =>
  (record.tags ?? [])
    .map((tag) => (typeof tag === 'string' ? tag : tag.name ?? ''))
    .map(normalize)
    .filter(Boolean);

const parseDateBoundary = (value: string, endOfDay: boolean): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid retrieval date: ${value}`);
  }

  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const timestamp = Date.parse(`${value}${suffix}`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid retrieval date: ${value}`);
  }
  return timestamp;
};

const scoreRecord = (
  record: LinkRetrievalRecord,
  query: string,
  tokens: string[],
): number => {
  const fields = {
    title: normalize(record.title),
    description: normalize(record.description),
    content: normalize(record.content),
    source: normalize(record.source),
    url: normalize(record.url),
    category: normalize(record.category?.name),
    subcategory: normalize(record.subCategory?.name),
    tags: tagNames(record).join(' '),
  };
  const fieldTokens = Object.fromEntries(
    Object.entries(fields).map(([name, value]) => [name, new Set(tokenize(value))]),
  ) as Record<keyof typeof fields, Set<string>>;

  let score = fields.title.includes(query) ? 50 : 0;
  for (const token of tokens) {
    if (fieldTokens.title.has(token)) score += 14;
    if (fieldTokens.tags.has(token)) score += 11;
    if (fieldTokens.category.has(token)) score += 8;
    if (fieldTokens.subcategory.has(token)) score += 8;
    if (fieldTokens.description.has(token)) score += 5;
    if (fieldTokens.content.has(token)) score += 3;
    if (fieldTokens.source.has(token)) score += 2;
    if (fieldTokens.url.has(token)) score += 1;
  }
  return score;
};

const matchesFilters = (
  record: LinkRetrievalRecord,
  filters: LinkRetrievalFilters,
): boolean => {
  if (filters.source === 'youtube') {
    const youtubeSource = normalize(record.source).startsWith('youtube');
    const youtubeUrl = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(record.url);
    if (!youtubeSource && !youtubeUrl) return false;
  }

  const category = normalize(filters.category);
  if (category && normalize(record.category?.name) !== category) return false;

  const subcategory = normalize(filters.subcategory);
  if (subcategory && normalize(record.subCategory?.name) !== subcategory) {
    return false;
  }

  const requestedTags = (filters.tags ?? []).map(normalize).filter(Boolean);
  const recordTags = new Set(tagNames(record));
  if (requestedTags.some((tag) => !recordTags.has(tag))) return false;

  const from = filters.dateRange?.from
    ? parseDateBoundary(filters.dateRange.from, false)
    : null;
  const to = filters.dateRange?.to
    ? parseDateBoundary(filters.dateRange.to, true)
    : null;
  if (from !== null && record.createdAt < from) return false;
  if (to !== null && record.createdAt > to) return false;

  return true;
};

export const coerceLinkRetrievalFilters = (
  value: unknown,
): LinkRetrievalFilters => {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const dateRange =
    input.dateRange && typeof input.dateRange === 'object'
      ? (input.dateRange as Record<string, unknown>)
      : null;

  return {
    stringQuery:
      typeof input.stringQuery === 'string' ? input.stringQuery : undefined,
    category: typeof input.category === 'string' ? input.category : undefined,
    subcategory:
      typeof input.subcategory === 'string' ? input.subcategory : undefined,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === 'string')
      : undefined,
    dateRange: dateRange
      ? {
          from: typeof dateRange.from === 'string' ? dateRange.from : undefined,
          to: typeof dateRange.to === 'string' ? dateRange.to : undefined,
        }
      : undefined,
  };
};

export const retrieveLinks = <T extends LinkRetrievalRecord>(
  records: T[],
  filters: LinkRetrievalFilters,
  limit = 20,
): T[] => {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), 20))
    : 20;
  const query = normalize(filters.stringQuery);
  const tokens = tokenize(filters.stringQuery);

  return records
    .filter((record) => matchesFilters(record, filters))
    .map((record) => ({
      record,
      score: tokens.length ? scoreRecord(record, query, tokens) : 0,
    }))
    .filter(({ score }) => !tokens.length || score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.record.updatedAt ?? right.record.createdAt) -
          (left.record.updatedAt ?? left.record.createdAt),
    )
    .slice(0, boundedLimit)
    .map(({ record }) => record);
};

export const presentRetrievedLinks = (
  records: LinkRetrievalRecord[],
): PresentedLinkRetrievalResult[] =>
  records.map((record) => {
    const content = record.content?.slice(0, 2_000);
    return {
      id: record._id,
      url: record.url,
      title: record.title,
      description: record.description?.slice(0, 500),
      imgPreview: record.imgPreview,
      contentExcerpt: content,
      contentTruncated: (record.content?.length ?? 0) > (content?.length ?? 0),
      contentScope: record.contentScope,
      source: record.source,
      createdAt: record.createdAt,
      category: record.category?.name,
      subcategory: record.subCategory?.name,
      tags: tagNames(record),
    };
  });
