/**
 * Text utilities shared by the extraction, retrieval and gap engines.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on',
  'or', 'shall', 'should', 'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with', 'which', 'who', 'all',
  'any', 'can', 'may', 'must', 'not', 'no', 'such', 'these', 'those', 'than', 'then', 'there', 'into', 'per', 'up',
  'upto', 'including', 'include', 'used', 'use', 'using', 'required', 'requirement', 'requirements', 'need', 'needs',
  'i', 'we', 'our', 'you', 'your', 'also', 'etc', 'other', 'part', 'sec', 'section', 'standard', 'standards',
  'specification', 'specifications', 'general', 'type', 'tender', 'supply', 'item', 'items', 'shall', 'be',
  'provided', 'suitable', 'nos', 'number',
]);

/** Lowercase, collapse whitespace, normalise dashes and quotes. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Very light suffix stripping so "chargers" ~ "charger", "installations" ~ "installation". */
export function stem(token: string): string {
  if (token.length <= 4 || /\d/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 5) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('ss')) return token;
  if (token.endsWith('s') && !token.endsWith('us') && !token.endsWith('is')) return token.slice(0, -1);
  return token;
}

/** Tokenise into lowercase stemmed terms, dropping stopwords. Keeps Devanagari tokens intact. */
export function tokenize(text: string): string[] {
  const lowered = normalizeText(text).toLowerCase();
  const raw = lowered.split(/[^\p{L}\p{N}.]+/u);
  const tokens: string[] = [];
  for (const piece of raw) {
    const cleaned = piece.replace(/^\.+|\.+$/g, '');
    if (!cleaned) continue;
    // "a.c." -> "ac", keep decimals like "7.4"
    const token = /^\d+(\.\d+)?$/.test(cleaned) ? cleaned : cleaned.replace(/\./g, '');
    if (token.length < 2 || STOPWORDS.has(token)) continue;
    tokens.push(stem(token));
  }
  return tokens;
}

export function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Escape a literal for use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitive phrase test with word boundaries that also works for
 * phrases containing punctuation (e.g. "a.c.", "IP65").
 */
export function containsPhrase(haystackLower: string, phrase: string): boolean {
  const needle = phrase.toLowerCase().trim();
  if (!needle) return false;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?=$|[^\\p{L}\\p{N}])`, 'u');
  return pattern.test(haystackLower);
}

/** Split text into sentences / clauses for quoting evidence. */
export function splitStatements(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.;!?])\s+|\n+|(?<=:)\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Return the statement that contains the given index, trimmed to a readable quote. */
export function quoteAround(text: string, index: number, maxLength = 220): string {
  const start = Math.max(text.lastIndexOf('\n', index), text.lastIndexOf('. ', index), -1) + 1;
  let end = text.length;
  for (const terminator of ['\n', '. ', '; ']) {
    const found = text.indexOf(terminator, index);
    if (found !== -1 && found < end) end = found + 1;
  }
  const snippet = text.slice(start, end).trim();
  if (snippet.length <= maxLength) return snippet;
  const offset = Math.max(0, index - start - Math.floor(maxLength / 2));
  return `…${snippet.slice(offset, offset + maxLength).trim()}…`;
}

/** Deterministic short hash (FNV-1a) for stable ids. Not for security. */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Truncate at a word boundary where possible. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd().replace(/[,;:]$/, '')}…`;
}
