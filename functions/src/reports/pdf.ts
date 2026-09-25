/**
 * PDF renderer (pdfkit, built-in Helvetica). Built-in PDF fonts only cover
 * WinAnsi characters, so text is sanitised; non-Latin passages (e.g.
 * Devanagari quotes) are replaced with a marker pointing to the DOCX export.
 */
import type { ReportModel, ReportStandardRow } from './model';

const C = {
  navy: '#0B2545',
  saffron: '#D9731A',
  ink: '#1F2933',
  muted: '#52606D',
  border: '#D9E2EC',
  panel: '#F5F7FA',
  green: '#2F855A',
  amber: '#B7791F',
  red: '#C53030',
  white: '#FFFFFF',
};

const REPLACEMENTS: [RegExp, string][] = [
  [/→/g, '->'],
  [/←/g, '<-'],
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/≈/g, '~'],
  [/−/g, '-'],
  [/×/g, 'x'],
  [/✓/g, 'OK'],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
];

/** Characters outside WinAnsi are not renderable with the standard PDF fonts. */
export function sanitizePdfText(input: string): string {
  let text = input;
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  // Keep Latin-1 plus the WinAnsi extras used in the report (em/en dash, bullet, ellipsis).
  return text.replace(/[^\u0000-ÿ–—•…]+/g, '[non-Latin text — see DOCX export]');
}

export async function renderPdf(model: ReportModel): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 64, left: 54, right: 54 },
    bufferPages: true,
    info: { Title: sanitizePdfText(`FiiSpec report — ${model.title}`), Author: 'FiiSpec', Subject: 'Standards intelligence report' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
  const s = sanitizePdfText;

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > bottomLimit()) doc.addPage();
  };
  const text = (value: string, opts: { size?: number; color?: string; bold?: boolean; gap?: number; indent?: number } = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 9.5).fillColor(opts.color ?? C.ink);
    doc.text(s(value), left + (opts.indent ?? 0), doc.y, { width: width - (opts.indent ?? 0), lineGap: 1.5 });
    if (opts.gap) doc.moveDown(opts.gap);
  };
  const heading = (value: string) => {
    ensureSpace(60);
    doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(left, y, 3, 14).fill(C.saffron);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.navy).text(s(value), left + 10, y, { width: width - 10 });
    doc.moveDown(0.5);
  };
  const keyValues = (rows: { label: string; value: string }[]) => {
    for (const row of rows) {
      ensureSpace(18);
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.muted).text(s(row.label.toUpperCase()), left, y, { width: 150 });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(s(row.value), left + 160, y, { width: width - 160, lineGap: 1.5 });
      doc.y = Math.max(doc.y, y + 12) + 4;
    }
  };
  const box = (lines: string[], color: string, background: string) => {
    doc.font('Helvetica').fontSize(8.8);
    const content = lines.map(s).join('\n');
    const h = doc.heightOfString(content, { width: width - 24, lineGap: 1.5 }) + 16;
    ensureSpace(h + 6);
    const y = doc.y;
    doc.rect(left, y, width, h).fill(background);
    doc.rect(left, y, 3, h).fill(color);
    doc.fillColor(C.ink).text(content, left + 14, y + 8, { width: width - 24, lineGap: 1.5 });
    doc.y = y + h + 8;
  };
  const standardCard = (row: ReportStandardRow) => {
    doc.font('Helvetica').fontSize(8.8);
    const body = [row.why, ...row.evidence.map((e) => `• ${e}`), `Source: ${row.source}`, `Action: ${row.action}`].map(s).join('\n');
    const bodyHeight = doc.heightOfString(body, { width: width - 24, lineGap: 1.5 });
    doc.font('Helvetica-Bold').fontSize(10);
    const titleHeight = doc.heightOfString(s(`${row.designation} — ${row.title}`), { width: width - 24 });
    const h = titleHeight + bodyHeight + 34;
    ensureSpace(Math.min(h, 400) + 6);
    const y = doc.y;
    doc.roundedRect(left, y, width, h, 4).lineWidth(0.8).stroke(C.border);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy).text(s(`${row.designation} — ${row.title}`), left + 12, y + 8, { width: width - 24 });
    doc.font('Helvetica').fontSize(8.3).fillColor(C.muted).text(s(`${row.relationship}  ·  ${row.relevance}  ·  ${row.confidence}  ·  ${row.status}`), left + 12, doc.y + 2, { width: width - 24 });
    doc.font('Helvetica').fontSize(8.8).fillColor(C.ink).text(body, left + 12, doc.y + 4, { width: width - 24, lineGap: 1.5 });
    doc.y = Math.max(doc.y, y + h) + 8;
  };

  // ---- Header band ---------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 96).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.white).text('FiiSpec', left, 28);
  doc.font('Helvetica').fontSize(10).fillColor('#F6AD55').text('Standards Intelligence Report', left, 58);
  doc.font('Helvetica').fontSize(8.5).fillColor('#D9E2EC');
  doc.text(s(`Analysis ID: ${model.analysisId}`), left, 32, { width, align: 'right' });
  doc.text(s(`Analysis date: ${model.analysisDate}`), left, 45, { width, align: 'right' });
  doc.text(s(`Report generated: ${model.generatedAt.slice(0, 16).replace('T', ' ')} UTC`), left, 58, { width, align: 'right' });
  doc.y = 116;

  text(model.title, { size: 16, bold: true, color: C.navy, gap: 0.2 });
  text(`Product: ${model.product}`, { size: 10, color: C.muted });
  text(`Status: ${model.status}  ·  Prepared by: ${model.createdBy}  ·  ${model.aiMode}`, { size: 8.5, color: C.muted, gap: 0.6 });
  box([`Prototype data notice: ${model.dataNotice}`], C.amber, '#FFF8EB');
  if (model.abstention) box([model.abstention], C.red, '#FFF5F5');

  // ---- Summary tiles -------------------------------------------------------
  ensureSpace(70);
  const tiles = [...model.summary, { label: 'Specification readiness', value: `${model.readiness.score}/100` }];
  const tileW = (width - (tiles.length - 1) * 6) / tiles.length;
  const tileY = doc.y + 4;
  tiles.forEach((t, i) => {
    const x = left + i * (tileW + 6);
    const readiness = t.label === 'Specification readiness';
    doc.roundedRect(x, tileY, tileW, 52, 4).fill(readiness ? '#FFF4E8' : C.panel);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(readiness ? C.saffron : C.navy).text(s(t.value), x + 8, tileY + 9, { width: tileW - 16 });
    doc.font('Helvetica').fontSize(7.2).fillColor(C.muted).text(s(t.label), x + 8, tileY + 32, { width: tileW - 16 });
  });
  doc.y = tileY + 62;
  text(model.readiness.explanation, { size: 8.5, color: C.muted });

  // ---- Sections -------------------------------------------------------------
  heading('1. Specification understanding');
  keyValues(model.specificationSummary);
  if (model.parameters.length) {
    doc.moveDown(0.3);
    text('Technical parameters extracted', { size: 9.5, bold: true, color: C.navy, gap: 0.2 });
    keyValues(model.parameters);
  }

  heading('2. Primary standards');
  if (!model.primary.length) text('No primary standard could be established with sufficient evidence.', { color: C.muted });
  model.primary.forEach(standardCard);

  heading('3. Related standards');
  if (!model.related.length) text('No related standards were identified.', { color: C.muted });
  for (const group of model.related) {
    // Keep the group label with (most of) its first card.
    ensureSpace(170);
    text(group.group, { size: 10, bold: true, color: C.navy, gap: 0.2 });
    group.rows.forEach(standardCard);
  }

  heading('4. Version and amendment status');
  for (const v of model.versions) {
    ensureSpace(34);
    text(`${v.designation} — ${v.state}`, { bold: true, size: 9.5 });
    text(v.message, { size: 8.8, color: C.muted, gap: 0.4 });
  }

  heading('5. Certification context');
  for (const c of model.certification) {
    ensureSpace(40);
    const color = c.classification === 'Applicable' ? C.green : c.classification === 'Potentially applicable' ? C.amber : c.classification === 'Not detected' ? C.muted : C.red;
    text(`${c.classification.toUpperCase()}  ·  ${c.title}`, { bold: true, size: 9.5, color });
    text(c.why, { size: 8.8 });
    text(`${c.note} Source: ${c.source}`, { size: 8.3, color: C.muted, gap: 0.4 });
  }

  heading('6. Specification gaps');
  if (!model.gaps.length) text('No open specification gaps.', { color: C.muted });
  for (const g of model.gaps) {
    ensureSpace(46);
    const color = g.severity === 'Critical' ? C.red : g.severity === 'Warning' ? C.amber : C.muted;
    text(`${g.severity.toUpperCase()}  ·  ${g.category}`, { bold: true, size: 8.3, color });
    text(g.issue, { bold: true, size: 9.5 });
    if (g.quote) text(`Quoted: "${g.quote}"`, { size: 8.5, color: C.muted });
    text(`Why it matters: ${g.why}`, { size: 8.8 });
    text(`Suggested improvement: ${g.suggestion}`, { size: 8.8, gap: 0.4 });
  }

  if (model.specification) {
    heading(`7. ${model.specification.heading}`);
    box([`Status: ${model.specification.status}. This draft is decision-support output and is not official government text.`], model.specification.status.startsWith('Human') ? C.green : C.amber, model.specification.status.startsWith('Human') ? '#F0FFF4' : '#FFF8EB');
    for (const section of model.specification.sections) {
      ensureSpace(40);
      text(section.title, { size: 10, bold: true, color: C.navy, gap: 0.15 });
      for (const i of section.items) {
        ensureSpace(20);
        text(`• ${i.text}`, { size: 9, indent: 6 });
        text(i.origin, { size: 7, color: C.muted, indent: 14, gap: 0.1 });
      }
    }
  }

  heading('Disclaimer');
  box([model.disclaimer], C.navy, C.panel);

  // ---- Footers ---------------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise make pdfkit add a new page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 40;
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.5).stroke(C.border);
    doc.font('Helvetica').fontSize(7).fillColor(C.muted);
    doc.text(s(`FiiSpec · Analysis ${model.analysisId} · Decision-support output — verify against current official requirements`), left, y, { width: width - 60, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
