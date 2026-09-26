/**
 * Document validation and text extraction (PDF, DOCX).
 * Files are validated by magic bytes, not just by declared content type.
 */
import { createHash } from 'node:crypto';
import { MAX_SPEC_TEXT_CHARS, MAX_UPLOAD_BYTES } from '../../../shared/constants';
import { PipelineFailure } from '../lib/errors';

export type DetectedFormat = 'PDF' | 'DOCX';

export function detectFormat(buffer: Buffer): DetectedFormat | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  // DOCX is a ZIP container that must contain word/document.xml.
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    if (buffer.includes(Buffer.from('word/document.xml'))) return 'DOCX';
  }
  return null;
}

export function expectedFormatFor(contentType: string): DetectedFormat | null {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
  return null;
}

export interface ExtractionResult {
  text: string;
  truncated: boolean;
  pageCount: number | null;
  method: 'PDF_TEXT' | 'DOCX';
  tables: string[][][];
  warnings: string[];
  contentHash: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Parse <table> elements from mammoth HTML into rows of cell text. */
export function tablesFromHtml(html: string): string[][][] {
  const tables: string[][][] = [];
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows: string[][] = [];
    for (const rowMatch of (tableMatch[1] ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...(rowMatch[1] ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        decodeEntities((c[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
      );
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables.slice(0, 30);
}

/** Render extracted tables as "Header: value" lines so parameters inside tables are analysed. */
export function tablesToText(tables: string[][][]): string {
  const lines: string[] = [];
  for (const table of tables) {
    for (const row of table) {
      const cells = row.filter(Boolean);
      if (cells.length >= 2) lines.push(`${cells[0]}: ${cells.slice(1).join(' | ')}`);
      else if (cells.length === 1) lines.push(cells[0]!);
    }
  }
  return lines.join('\n');
}

export async function extractDocument(buffer: Buffer, declaredContentType: string): Promise<ExtractionResult> {
  if (buffer.length === 0) throw new PipelineFailure('EMPTY_DOCUMENT');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new PipelineFailure('INVALID_FILE', 'file too large');
  const expected = expectedFormatFor(declaredContentType);
  if (!expected) throw new PipelineFailure('UNSUPPORTED_FORMAT');
  const detected = detectFormat(buffer);
  if (detected !== expected) throw new PipelineFailure('INVALID_FILE', `declared ${expected}, detected ${detected ?? 'unknown'}`);

  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const warnings: string[] = [];
  let text = '';
  let pageCount: number | null = null;
  let tables: string[][][] = [];

  // Parsers are loaded lazily to keep function cold starts and discovery fast.
  if (detected === 'PDF') {
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const extracted = await extractText(pdf, { mergePages: true });
      pageCount = extracted.totalPages;
      text = extracted.text;
    } catch {
      throw new PipelineFailure('INVALID_FILE', 'pdf parse failed');
    }
    warnings.push('Table structure is not preserved for PDF files; table contents are analysed as text.');
  } else {
    try {
      const mammoth = (await import('mammoth')).default;
      const [raw, html] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]);
      text = raw.value;
      tables = tablesFromHtml(html.value);
      if (tables.length) text = `${text}\n\n${tablesToText(tables)}`;
    } catch {
      throw new PipelineFailure('INVALID_FILE', 'docx parse failed');
    }
  }

  text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.replace(/\s/g, '').length < 20) throw new PipelineFailure('EMPTY_DOCUMENT');
  const truncated = text.length > MAX_SPEC_TEXT_CHARS;
  if (truncated) {
    text = text.slice(0, MAX_SPEC_TEXT_CHARS);
    warnings.push(`Document text exceeded ${MAX_SPEC_TEXT_CHARS.toLocaleString('en-IN')} characters; only the first part was analysed.`);
  }
  return { text, truncated, pageCount, method: detected === 'PDF' ? 'PDF_TEXT' : 'DOCX', tables, warnings, contentHash };
}
