/**
 * Deterministic technical-parameter extraction and unit normalisation.
 *
 * Every parameter keeps the exact text it was read from so evidence can quote
 * the input. Normalised units: kW, kVA, V, A, Hz, °C, %, m, mm², m³/h, m, kPa,
 * rpm, kg, MPa, kWh, Ah, years.
 */
import type { ExtractedParameter } from '../../../shared/analysis';
import type { QuantityKind } from '../../../shared/constants';
import { QUANTITY_KIND_LABELS } from '../../../shared/constants';
import { normalizeText, shortHash } from './text';

interface Match {
  kind: QuantityKind;
  index: number;
  rawText: string;
  value: number | null;
  valueMax: number | null;
  unit: string | null;
  normalizedValue: number | null;
  normalizedValueMax: number | null;
  normalizedUnit: string | null;
  textValue: string | null;
  confidence: ExtractedParameter['confidence'];
  note: string | null;
  label?: string;
}

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`;
const RANGE = String.raw`${NUM}(?:\s*(?:-|–|to|~)\s*${NUM})?`;

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value: number | null, digits = 3): number | null {
  if (value === null) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

type UnitRule = { pattern: RegExp; kind: QuantityKind; convert: (unit: string) => { factor: number; unit: string; offset?: number } };

const unitRules: UnitRule[] = [
  {
    kind: 'APPARENT_POWER',
    pattern: new RegExp(String.raw`${RANGE}\s*(kVA|MVA|VA)\b`, 'gi'),
    convert: (u) => ({ factor: u.toLowerCase() === 'mva' ? 1000 : u.toLowerCase() === 'va' ? 0.001 : 1, unit: 'kVA' }),
  },
  {
    kind: 'ENERGY',
    pattern: new RegExp(String.raw`${RANGE}\s*(kWh|MWh|Wh)\b`, 'gi'),
    convert: (u) => ({ factor: u.toLowerCase() === 'mwh' ? 1000 : u.toLowerCase() === 'wh' ? 0.001 : 1, unit: 'kWh' }),
  },
  {
    kind: 'POWER',
    pattern: new RegExp(String.raw`${RANGE}\s*(kW|MW|kilowatts?|watts?|W|BHP|HP)(?![A-Za-z])`, 'g'),
    convert: (u) => {
      const unit = u.toLowerCase();
      if (unit === 'mw') return { factor: 1000, unit: 'kW' };
      if (unit === 'w' || unit.startsWith('watt')) return { factor: 0.001, unit: 'kW' };
      if (unit === 'hp' || unit === 'bhp') return { factor: 0.7457, unit: 'kW' };
      return { factor: 1, unit: 'kW' };
    },
  },
  {
    kind: 'VOLTAGE',
    pattern: new RegExp(String.raw`${RANGE}\s*(kV|V|volts?)(?:\s*(?:AC|DC|a\.c\.|d\.c\.))?(?![A-Za-z])`, 'g'),
    convert: (u) => ({ factor: u.toLowerCase() === 'kv' ? 1000 : 1, unit: 'V' }),
  },
  {
    kind: 'CAPACITY_AH',
    pattern: new RegExp(String.raw`${RANGE}\s*(Ah|AH|mAh)\b`, 'g'),
    convert: (u) => ({ factor: u === 'mAh' ? 0.001 : 1, unit: 'Ah' }),
  },
  {
    kind: 'CURRENT',
    pattern: new RegExp(String.raw`${RANGE}\s*(mA|A|amps?|amperes?)(?![A-Za-z])`, 'g'),
    convert: (u) => ({ factor: u === 'mA' ? 0.001 : 1, unit: 'A' }),
  },
  {
    kind: 'FREQUENCY',
    pattern: new RegExp(String.raw`${RANGE}\s*(Hz|hz|HZ)\b`, 'g'),
    convert: () => ({ factor: 1, unit: 'Hz' }),
  },
  {
    kind: 'TEMPERATURE',
    pattern: new RegExp(String.raw`([-+−]?\d+(?:\.\d+)?)(?:\s*°?\s*[CF]?\s*(?:-|to|–|~)\s*([-+−]?\d+(?:\.\d+)?))?\s*(?:°\s*|deg(?:ree)?s?\.?\s*)(C|F)\b`, 'gi'),
    convert: (u) => (u.toUpperCase() === 'F' ? { factor: 5 / 9, unit: '°C', offset: -32 } : { factor: 1, unit: '°C' }),
  },
  {
    kind: 'CROSS_SECTION',
    pattern: new RegExp(String.raw`${RANGE}\s*(sq\.?\s*mm|mm²|mm2|sqmm)\b`, 'gi'),
    convert: () => ({ factor: 1, unit: 'mm²' }),
  },
  {
    kind: 'FLOW_RATE',
    pattern: new RegExp(String.raw`${RANGE}\s*(lpm|LPM|l\/min|litres?\s*per\s*minute|lps|LPS|l\/s|lph|LPH|l\/h|m3\/h|m³\/h|m3\/hr|cum\/hr)`, 'gi'),
    convert: (u) => {
      const unit = u.toLowerCase().replace(/\s+/g, '');
      if (unit === 'lpm' || unit === 'l/min' || unit.startsWith('litre')) return { factor: 0.06, unit: 'm³/h' };
      if (unit === 'lps' || unit === 'l/s') return { factor: 3.6, unit: 'm³/h' };
      if (unit === 'lph' || unit === 'l/h') return { factor: 0.001, unit: 'm³/h' };
      return { factor: 1, unit: 'm³/h' };
    },
  },
  {
    kind: 'SPEED',
    pattern: new RegExp(String.raw`${RANGE}\s*(rpm|RPM|r\/min)`, 'g'),
    convert: () => ({ factor: 1, unit: 'rpm' }),
  },
  {
    kind: 'MASS',
    pattern: new RegExp(String.raw`${RANGE}\s*(kg|kgs|tonnes?|MT)\b`, 'g'),
    convert: (u) => ({ factor: /^(tonne|mt)/i.test(u) ? 1000 : 1, unit: 'kg' }),
  },
];

function pushUnitMatches(text: string, out: Match[]): void {
  for (const rule of unitRules) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const unit = m[3] ?? '';
      const value = num(m[1]?.replace('−', '-'));
      const valueMax = num(m[2]?.replace('−', '-'));
      const conv = rule.convert(unit);
      const offset = conv.offset ?? 0;
      const index = m.index ?? 0;
      // Avoid matching the number inside a standard designation such as "IS 732" or "IEC 61851-1".
      const before = text.slice(Math.max(0, index - 8), index);
      if (/\b(IS|IEC|ISO|Part|Sec)\s*[:/]?\s*$/i.test(before)) continue;
      out.push({
        kind: rule.kind,
        index,
        rawText: m[0].trim(),
        value,
        valueMax,
        unit,
        normalizedValue: value === null ? null : roundTo((value + offset) * conv.factor),
        normalizedValueMax: valueMax === null ? null : roundTo((valueMax + offset) * conv.factor),
        normalizedUnit: conv.unit,
        textValue: null,
        confidence: 'HIGH',
        note: conv.factor !== 1 || offset !== 0 ? `Converted from ${unit} to ${conv.unit}` : null,
      });
    }
  }
}

type PatternRule = { kind: QuantityKind; pattern: RegExp; build: (m: RegExpMatchArray) => Partial<Match> };

const patternRules: PatternRule[] = [
  {
    kind: 'IP_RATING',
    pattern: /\bIP\s?-?([0-6X])([0-9X])(K|M|W)?\b/gi,
    build: (m) => ({ textValue: `IP${m[1]}${m[2]}${m[3] ?? ''}`.toUpperCase() }),
  },
  { kind: 'IK_RATING', pattern: /\bIK\s?-?(\d{2})\b/gi, build: (m) => ({ textValue: `IK${m[1]}` }) },
  {
    kind: 'PHASE',
    pattern: /\b(single|three|1|3)[\s-]*(?:phase|ph|Ø)\b/gi,
    build: (m) => {
      const three = /^(three|3)$/i.test(m[1] ?? '');
      return { textValue: three ? 'Three-phase' : 'Single-phase', value: three ? 3 : 1 };
    },
  },
  {
    kind: 'HUMIDITY',
    pattern: /(\d{1,3})\s*%\s*(?:RH|relative humidity|humidity)|(?:relative humidity|humidity)[^.\n\d]{0,30}(\d{1,3})\s*%/gi,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return { value, normalizedValue: value, unit: '%', normalizedUnit: '% RH' };
    },
  },
  {
    kind: 'ALTITUDE',
    pattern: /(?:altitude[^.\n\d]{0,25}(\d{2,5})\s*m\b)|(\d{2,5})\s*m(?:etres?)?\s*(?:above\s*(?:mean\s*)?sea\s*level|amsl)/gi,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return { value, normalizedValue: value, unit: 'm', normalizedUnit: 'm' };
    },
  },
  {
    kind: 'HEAD',
    pattern: /(?:(?:total\s+)?head[^.\n\d]{0,20}(\d+(?:\.\d+)?)\s*(?:m|mtr|metres?|meters?)\b)|(\d+(?:\.\d+)?)\s*(?:m|mtr|metres?|meters?)\s*(?:total\s+)?head\b/gi,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return { value, normalizedValue: value, unit: 'm', normalizedUnit: 'm' };
    },
  },
  {
    kind: 'PRESSURE',
    pattern: /(\d+(?:\.\d+)?)\s*(bar|kPa|psi|kg\/cm2|kg\/cm²)\b/gi,
    build: (m) => {
      const value = num(m[1]);
      const unit = (m[2] ?? '').toLowerCase();
      const factor = unit === 'bar' ? 100 : unit === 'psi' ? 6.895 : unit.startsWith('kg/cm') ? 98.07 : 1;
      return {
        value,
        unit: m[2] ?? null,
        normalizedValue: value === null ? null : roundTo(value * factor),
        normalizedUnit: 'kPa',
        note: factor !== 1 ? `Converted from ${m[2]} to kPa` : null,
      };
    },
  },
  {
    kind: 'STRENGTH',
    pattern: /(\d+(?:\.\d+)?)\s*(MPa|N\/mm2|N\/mm²)/gi,
    build: (m) => {
      const value = num(m[1]);
      return { value, unit: m[2] ?? null, normalizedValue: value, normalizedUnit: 'MPa' };
    },
  },
  {
    kind: 'GRADE',
    pattern: /\b(?:(Fe\s?\d{3}[A-Z]{0,2})|(M\s?\d{2})(?=\s*(?:grade|concrete|\b))|(\d{2})\s*grade|grade\s*(\d{2}))\b/g,
    build: (m) => ({ textValue: (m[1] ?? m[2] ?? (m[3] ? `${m[3]} grade` : `${m[4]} grade`)).replace(/\s+/g, ' ') }),
  },
  {
    kind: 'EFFICIENCY_CLASS',
    pattern: /\b(IE\s?[1-5])\b|\b([1-5])\s*[-]?\s*star\b|\bBEE\s*([1-5])\s*star\b/gi,
    build: (m) => ({ textValue: m[1] ? m[1].replace(/\s/, '').toUpperCase() : `${m[2] ?? m[3]}-star (BEE)` }),
  },
  {
    kind: 'EFFICIENCY',
    pattern: /efficiency[^.\n\d%]{0,25}(\d{2,3}(?:\.\d+)?)\s*%|(\d{2,3}(?:\.\d+)?)\s*%\s*efficien/gi,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return { value, unit: '%', normalizedValue: value, normalizedUnit: '%' };
    },
  },
  {
    kind: 'POWER_FACTOR',
    pattern: /(?:power factor|\bp\.?f\.?)\s*(?:of|>=|≥|>|:|=|not less than|minimum)?\s*(0?\.\d{1,3}|1(?:\.0+)?)/gi,
    build: (m) => {
      const value = num(m[1]);
      return { value, normalizedValue: value, normalizedUnit: '' };
    },
  },
  {
    kind: 'DURATION',
    pattern: /(\d{1,2})\s*[- ]?(?:years?|yrs?)\s*(?:of\s*)?(?:comprehensive\s*)?(warranty|guarantee|amc|maintenance|design life|life)|(warranty|guarantee|amc|design life)[^.\n\d]{0,25}(\d{1,2})\s*(?:years?|yrs?)/gi,
    build: (m) => {
      const value = num(m[1] ?? m[4]);
      const what = (m[2] ?? m[3] ?? '').toLowerCase();
      return { value, unit: 'years', normalizedValue: value, normalizedUnit: 'years', label: `Duration (${what})` };
    },
  },
  {
    kind: 'CONNECTOR',
    pattern: /\b(Type[\s-]?[126]|CCS[\s-]?[12]|CHAdeMO|GB\/T|Bharat\s*(?:AC|DC)[\s-]?00\d|IEC\s*60309|industrial socket|LEV\s*AC)\b/gi,
    build: (m) => ({ textValue: (m[1] ?? '').replace(/\s+/g, ' ') }),
  },
  {
    kind: 'COMMUNICATION_PROTOCOL',
    pattern: /\b(OCPP\s*(?:1\.6J?|2\.0(?:\.1)?)?|ISO\s*15118|RFID|Modbus|RS[\s-]?485|Ethernet|4G|LTE|GPRS|Wi-?Fi|Bluetooth)\b/gi,
    build: (m) => ({ textValue: (m[1] ?? '').replace(/\s+/g, ' ') }),
  },
  { kind: 'CHARGING_MODE', pattern: /\bMode[\s-]?([1-4])\b/gi, build: (m) => ({ textValue: `Mode ${m[1]}`, value: num(m[1]) }) },
  {
    kind: 'PROTECTION_DEVICE',
    pattern: /\b(RCD|RCCB|RCBO|MCB|MCCB|SPD|surge protect(?:ion|ive device)|earth leakage|over[\s-]?current protection|short[\s-]?circuit protection|type\s*[AB]\s*RCD|emergency stop)\b/gi,
    build: (m) => ({ textValue: (m[1] ?? '').replace(/\s+/g, ' ') }),
  },
  {
    kind: 'QUANTITY',
    pattern: /\b(?:qty|quantity)\s*[:\-]?\s*(\d{1,6})\b|\b(\d{1,6})\s*(?:nos\.?|numbers|units|sets)\b/gi,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return { value, normalizedValue: value, normalizedUnit: 'units' };
    },
  },
];

function pushPatternMatches(text: string, out: Match[]): void {
  for (const rule of patternRules) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const built = rule.build(m);
      out.push({
        kind: rule.kind,
        index: m.index ?? 0,
        rawText: m[0].trim(),
        value: built.value ?? null,
        valueMax: built.valueMax ?? null,
        unit: built.unit ?? null,
        normalizedValue: built.normalizedValue ?? null,
        normalizedValueMax: built.normalizedValueMax ?? null,
        normalizedUnit: built.normalizedUnit ?? null,
        textValue: built.textValue ?? null,
        confidence: 'HIGH',
        note: built.note ?? null,
        label: built.label,
      });
    }
  }
}

/** Does a numeric match overlap an earlier accepted match (e.g. "kVA" also matching "VA" or "V")? */
function overlaps(a: Match, b: Match): boolean {
  const aEnd = a.index + a.rawText.length;
  const bEnd = b.index + b.rawText.length;
  return a.index < bEnd && b.index < aEnd;
}

const KIND_PRIORITY: QuantityKind[] = [
  'TEMPERATURE',
  'APPARENT_POWER',
  'ENERGY',
  'CAPACITY_AH',
  'POWER',
  'FLOW_RATE',
  'CROSS_SECTION',
  'HEAD',
  'ALTITUDE',
  'HUMIDITY',
  'EFFICIENCY',
  'STRENGTH',
  'PRESSURE',
  'VOLTAGE',
  'CURRENT',
  'FREQUENCY',
];

function priority(kind: QuantityKind): number {
  const idx = KIND_PRIORITY.indexOf(kind);
  return idx === -1 ? KIND_PRIORITY.length : idx;
}

/** Contextual label refinement, e.g. "rated output power" vs "input power". */
function labelFor(match: Match, text: string): string {
  if (match.label) return match.label;
  const context = text.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
  const base = QUANTITY_KIND_LABELS[match.kind];
  if (match.kind === 'VOLTAGE' && /input|supply|mains/.test(context)) return 'Input / supply voltage';
  if (match.kind === 'VOLTAGE' && /output/.test(context)) return 'Output voltage';
  if (match.kind === 'POWER' && /output|rated|charging/.test(context)) return 'Rated power';
  if (match.kind === 'CURRENT' && /output|charging/.test(context)) return 'Output / charging current';
  if (match.kind === 'TEMPERATURE' && /ambient|operating/.test(context)) return 'Operating ambient temperature';
  return base;
}

export function extractParameters(input: string): ExtractedParameter[] {
  const text = normalizeText(input);
  const matches: Match[] = [];
  pushUnitMatches(text, matches);
  pushPatternMatches(text, matches);

  // Resolve overlaps: keep the higher-priority / longer match.
  matches.sort((a, b) => a.index - b.index || priority(a.kind) - priority(b.kind) || b.rawText.length - a.rawText.length);
  const accepted: Match[] = [];
  for (const match of matches) {
    const clash = accepted.find((existing) => overlaps(existing, match));
    if (!clash) {
      accepted.push(match);
      continue;
    }
    const numericKinds = new Set<QuantityKind>(KIND_PRIORITY);
    // Pattern matches (IP, connector...) may legitimately overlap numeric matches; keep both unless same family.
    if (!numericKinds.has(match.kind) || !numericKinds.has(clash.kind)) {
      if (clash.kind !== match.kind) accepted.push(match);
      continue;
    }
    if (priority(match.kind) < priority(clash.kind)) accepted.splice(accepted.indexOf(clash), 1, match);
  }

  // De-duplicate identical readings of the same kind.
  const seen = new Set<string>();
  const result: ExtractedParameter[] = [];
  for (const match of accepted) {
    const key = `${match.kind}|${match.normalizedValue ?? ''}|${match.normalizedValueMax ?? ''}|${(match.textValue ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `p-${shortHash(`${match.kind}-${match.index}-${match.rawText}`)}`,
      kind: match.kind,
      label: labelFor(match, text),
      rawText: match.rawText,
      value: match.value,
      valueMax: match.valueMax,
      unit: match.unit,
      normalizedValue: match.normalizedValue,
      normalizedValueMax: match.normalizedValueMax,
      normalizedUnit: match.normalizedUnit,
      textValue: match.textValue,
      confidence: match.confidence,
      origin: 'DETERMINISTIC',
      note: match.note,
    });
  }
  return result;
}

/** Format a parameter for display: "11 kW", "IP55", "−10 to 55 °C". */
export function formatParameter(p: ExtractedParameter): string {
  if (p.textValue) return p.textValue;
  if (p.normalizedValue === null) return p.rawText;
  const unit = p.normalizedUnit ?? p.unit ?? '';
  const range = p.normalizedValueMax !== null ? `${p.normalizedValue} to ${p.normalizedValueMax}` : `${p.normalizedValue}`;
  return unit ? `${range} ${unit}` : range;
}

/**
 * Numbers stated against a quantity keyword but without any unit, e.g.
 * "Rated power: 11" or "voltage 415". Used by the gap analyser.
 */
export function findUnitlessQuantities(input: string): { quote: string; quantity: string }[] {
  const text = normalizeText(input);
  const keywords = ['power', 'voltage', 'current', 'capacity', 'frequency', 'head', 'discharge', 'flow', 'rating', 'temperature', 'length', 'size'];
  const results: { quote: string; quantity: string }[] = [];
  // (?![\d.,]) stops the engine backtracking into a shorter number ("200-1000 V" must not yield "20").
  const pattern = new RegExp(String.raw`\b(${keywords.join('|')})\b\s*(?:[:=\-]|of|is)?\s*(\d+(?:\.\d+)?)(?![\d.,])(?!\s*(?:[-–~]\s*\d|to\s*\d|%|°|[A-Za-z²³/]))`, 'gi');
  for (const m of text.matchAll(pattern)) {
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 3);
    if (/^\s*[A-Za-z°%]/.test(after)) continue;
    results.push({ quote: m[0].trim(), quantity: (m[1] ?? '').toLowerCase() });
  }
  return results;
}
