/** DOCX renderer using the `docx` package (loaded lazily). Unicode (including Devanagari) is preserved. */
import type { Paragraph as ParagraphType, Table as TableType } from 'docx';
import type { ReportModel, ReportStandardRow } from './model';

const NAVY = '0B2545';
const SAFFRON = 'D9731A';
const MUTED = '52606D';

export async function renderDocx(model: ReportModel): Promise<Buffer> {
  const { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx');

  const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size, italics: opts.italics })] });

  const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) =>
    new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, color: NAVY, bold: true })] });

  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text, size: 20 })] });

  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const note = (text: string, fill: string) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill },
              borders: { left: { style: BorderStyle.SINGLE, size: 18, color: SAFFRON }, top: none, bottom: none, right: none },
              children: [p(text, { size: 19 })],
            }),
          ],
        }),
      ],
    });

  const kvTable = (rows: { label: string; value: string }[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        (r) =>
          new TableRow({
            children: [
              new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F7FA' }, children: [p(r.label, { bold: true, color: MUTED, size: 18 })] }),
              new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [p(r.value, { size: 20 })] }),
            ],
          }),
      ),
    });

  const standard = (row: ReportStandardRow): ParagraphType[] => [
    p(`${row.designation} — ${row.title}`, { bold: true, color: NAVY }),
    p(`${row.relationship} · ${row.relevance} · ${row.confidence} · ${row.status}`, { color: MUTED, size: 18 }),
    p(row.why, { size: 20 }),
    ...row.evidence.map(bullet),
    p(`Source: ${row.source}`, { color: MUTED, size: 17 }),
    p(`Action: ${row.action}`, { italics: true, size: 19 }),
  ];

  const children: (ParagraphType | TableType)[] = [
    new Paragraph({ children: [new TextRun({ text: 'FiiSpec', bold: true, size: 44, color: NAVY })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Standards Intelligence Report', size: 24, color: SAFFRON })] }),
    kvTable([
      { label: 'Analysis', value: model.title },
      { label: 'Analysis ID', value: model.analysisId },
      { label: 'Product', value: model.product },
      { label: 'Analysis date', value: model.analysisDate },
      { label: 'Status', value: model.status },
      { label: 'Prepared by', value: model.createdBy },
      { label: 'Analysis mode', value: model.aiMode },
    ]),
    new Paragraph({ text: '' }),
    note(`Prototype data notice: ${model.dataNotice}`, 'FFF8EB'),
  ];
  if (model.abstention) children.push(new Paragraph({ text: '' }), note(model.abstention, 'FFF5F5'));

  children.push(h('Summary'), kvTable([...model.summary, { label: 'Specification readiness', value: `${model.readiness.score}/100 (${model.readiness.label})` }]), p(model.readiness.explanation, { color: MUTED, size: 18 }));

  children.push(h('1. Specification understanding'), kvTable(model.specificationSummary));
  if (model.parameters.length) children.push(p('Technical parameters extracted', { bold: true, color: NAVY }), kvTable(model.parameters));

  children.push(h('2. Primary standards'));
  if (!model.primary.length) children.push(p('No primary standard could be established with sufficient evidence.', { color: MUTED }));
  for (const r of model.primary) children.push(...standard(r));

  children.push(h('3. Related standards'));
  for (const g of model.related) {
    children.push(h(g.group, HeadingLevel.HEADING_3));
    for (const r of g.rows) children.push(...standard(r));
  }

  children.push(h('4. Version and amendment status'));
  for (const v of model.versions) children.push(p(`${v.designation} — ${v.state}`, { bold: true }), p(v.message, { color: MUTED, size: 19 }));

  children.push(h('5. Certification context'));
  for (const c of model.certification) children.push(p(`${c.classification}: ${c.title}`, { bold: true }), p(c.why, { size: 20 }), p(`${c.note} Source: ${c.source}`, { color: MUTED, size: 18 }));

  children.push(h('6. Specification gaps'));
  if (!model.gaps.length) children.push(p('No open specification gaps.', { color: MUTED }));
  for (const g of model.gaps) {
    children.push(p(`${g.severity} · ${g.category}`, { bold: true, color: g.severity === 'Critical' ? 'C53030' : g.severity === 'Warning' ? 'B7791F' : MUTED, size: 18 }));
    children.push(p(g.issue, { bold: true }));
    if (g.quote) children.push(p(`Quoted: “${g.quote}”`, { italics: true, color: MUTED, size: 19 }));
    children.push(p(`Why it matters: ${g.why}`, { size: 20 }), p(`Suggested improvement: ${g.suggestion}`, { size: 20 }));
  }

  if (model.specification) {
    children.push(h(`7. ${model.specification.heading}`), note(`Status: ${model.specification.status}. This draft is decision-support output and is not official government text.`, 'FFF8EB'));
    for (const section of model.specification.sections) {
      children.push(h(section.title, HeadingLevel.HEADING_3));
      for (const i of section.items) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: i.text, size: 20 }), new TextRun({ text: `  (${i.origin})`, size: 16, color: MUTED })] }));
      }
    }
  }

  children.push(h('Disclaimer'), note(model.disclaimer, 'F5F7FA'));

  const doc = new Document({
    creator: 'FiiSpec',
    title: `FiiSpec report — ${model.title}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `FiiSpec · Analysis ${model.analysisId} · Decision-support output · Page `, size: 14, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 14, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
