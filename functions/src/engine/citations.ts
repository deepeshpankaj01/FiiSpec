/**
 * Parse standard citations that appear literally in the input text.
 * Only citations physically present in the text are ever returned — this is
 * the sole source of "referenced standards" (AI output is never used for it).
 */
import type { CitedStandard } from '../../../shared/analysis';
import { normalizeText } from './text';

const CITATION = new RegExp(
  [
    String.raw`\b(IS\s*\/\s*IEC|IS\s*\/\s*ISO|IS|IEC|ISO)`, // prefix
    String.raw`\s*[:.]?\s*`,
    String.raw`(\d{2,6})`, // base number
    String.raw`(?:\s*\(\s*Part\s*[-:]?\s*(\d{1,3})(?:\s*\/\s*Sec(?:tion)?\.?\s*(\d{1,3}))?\s*\)|-(\d{1,3})(?!\d)(?:-(\d{1,3})(?!\d))?)?`, // (Part x/Sec y) or -x-y
    String.raw`(?:\s*[:\-–]\s*((?:19|20)\d{2})(?!\d))?`, // year
  ].join(''),
  'gi',
);

export function parseCitations(input: string): CitedStandard[] {
  const text = normalizeText(input);
  const results: CitedStandard[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION)) {
    const prefixRaw = (m[1] ?? '').toUpperCase().replace(/\s+/g, '');
    const prefix = (['IS', 'IS/IEC', 'IS/ISO', 'IEC', 'ISO'] as const).find((p) => p === prefixRaw);
    if (!prefix) continue;
    const baseNumber = m[2] ?? '';
    // "ISO 9001" style management-system references are kept; bare 2-digit IS numbers are unlikely citations.
    if (prefix === 'IS' && baseNumber.length < 3) continue;
    const part = m[3] ?? m[5] ?? null;
    const section = m[4] ?? m[6] ?? null;
    const year = m[7] ? Number(m[7]) : null;
    const citedAs = m[0].trim();
    const key = `${prefix}|${baseNumber}|${part ?? ''}|${section ?? ''}|${year ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ citedAs, prefix, baseNumber, part, section, year });
  }
  return results;
}

/** Human-readable canonical designation for a citation, e.g. "IS 1554 (Part 1) : 1988". */
export function formatCitation(c: CitedStandard): string {
  const partText = c.part ? ` (Part ${c.part}${c.section ? `/Sec ${c.section}` : ''})` : '';
  const yearText = c.year ? ` : ${c.year}` : '';
  if (c.prefix === 'IEC' || c.prefix === 'ISO') {
    const partSuffix = c.part ? `-${c.part}${c.section ? `-${c.section}` : ''}` : '';
    return `${c.prefix} ${c.baseNumber}${partSuffix}${c.year ? `:${c.year}` : ''}`;
  }
  return `${c.prefix} ${c.baseNumber}${partText}${yearText}`;
}
