import { describe, expect, it } from 'vitest';
import { parseCitations } from '../../src/engine/citations';
import { detectContext } from '../../src/engine/entities';
import { detectLanguage } from '../../src/engine/language';
import { extractParameters, findUnitlessQuantities, formatParameter } from '../../src/engine/parameters';
import { deriveProductPhrase, extractIntendedUse } from '../../src/engine/specification';
import { containsPhrase, stem, tokenize, truncate } from '../../src/engine/text';

const byKind = (text: string, kind: string) => extractParameters(text).filter((p) => p.kind === kind);

describe('parameter extraction and unit normalisation', () => {
  it('extracts power and converts HP to kW', () => {
    const [p] = byKind('Motor rating 7.5 HP', 'POWER');
    expect(p?.normalizedValue).toBeCloseTo(5.593, 2);
    expect(p?.normalizedUnit).toBe('kW');
    expect(p?.note).toMatch(/Converted/);
  });

  it('does not confuse kVA with V or VA', () => {
    const params = extractParameters('250 kVA distribution transformer, 11 kV / 433 V');
    expect(params.filter((p) => p.kind === 'APPARENT_POWER').map(formatParameter)).toEqual(['250 kVA']);
    expect(params.filter((p) => p.kind === 'VOLTAGE').map((p) => p.normalizedValue)).toEqual([11000, 433]);
  });

  it('normalises flow rates to m³/h', () => {
    const [flow] = byKind('Discharge 300 lpm at 60 m head', 'FLOW_RATE');
    expect(flow?.normalizedValue).toBe(18);
    expect(flow?.normalizedUnit).toBe('m³/h');
    expect(byKind('Discharge 300 lpm at 60 m head', 'HEAD')[0]?.normalizedValue).toBe(60);
  });

  it('reads temperature ranges and converts Fahrenheit', () => {
    const [range] = byKind('Operating temperature -5 °C to 50 °C', 'TEMPERATURE');
    expect(range?.normalizedValue).toBe(-5);
    expect(range?.normalizedValueMax).toBe(50);
    const [f] = byKind('ambient 122 °F', 'TEMPERATURE');
    expect(f?.normalizedValue).toBe(50);
  });

  it('recognises non-numeric technical parameters', () => {
    const text = '22 kW Type 2 charger, IP55, IK10, OCPP 1.6J, Type A RCD, Mode 3, three phase';
    const kinds = new Set(extractParameters(text).map((p) => p.kind));
    for (const k of ['POWER', 'CONNECTOR', 'IP_RATING', 'IK_RATING', 'COMMUNICATION_PROTOCOL', 'PROTECTION_DEVICE', 'CHARGING_MODE', 'PHASE']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  it('does not read numbers inside standard designations as quantities', () => {
    expect(extractParameters('conforming to IS 732 and IEC 61851-1').filter((p) => p.kind === 'CURRENT' || p.kind === 'VOLTAGE')).toHaveLength(0);
  });

  it('flags numbers stated without units, without backtracking into ranges', () => {
    expect(findUnitlessQuantities('Rated power: 11').map((u) => u.quote)).toEqual(['power: 11']);
    expect(findUnitlessQuantities('Output voltage 200-1000 V DC')).toHaveLength(0);
    expect(findUnitlessQuantities('Discharge 300 lpm')).toHaveLength(0);
    expect(findUnitlessQuantities('Operating temperature -5 °C to 50 °C')).toHaveLength(0);
  });
});

describe('citation parsing', () => {
  it('parses Indian and international designations with parts and years', () => {
    const cites = parseCitations('As per IS 1554 (Part 1):1988, IS:694-2010, IS/IEC 60529, IEC 61851-23 and IS 17017 (Part 2/Sec 2)');
    expect(cites.map((c) => [c.prefix, c.baseNumber, c.part, c.section, c.year])).toEqual([
      ['IS', '1554', '1', null, 1988],
      ['IS', '694', null, null, 2010],
      ['IS/IEC', '60529', null, null, null],
      ['IEC', '61851', '23', null, null],
      ['IS', '17017', '2', '2', null],
    ]);
  });

  it('ignores implausible short IS numbers', () => {
    expect(parseCitations('this is 12 units')).toHaveLength(0);
  });
});

describe('language identification (no translation)', () => {
  it('identifies English, Hindi, and Hinglish', () => {
    expect(detectLanguage('11 kW outdoor AC EV charger for public charging.').detected).toBe('en');
    expect(detectLanguage('सार्वजनिक चार्जिंग स्टेशन के लिए 22 kW एसी चार्जर चाहिए।').detected).toBe('hi');
    expect(detectLanguage('Mujhe public charging ke liye 11 kW EV charger ka tender banana hai.').detected).toBe('hi-Latn');
  });
});

describe('context detection', () => {
  it('detects environment, testing and certification mentions', () => {
    const ctx = detectContext('Outdoor installation in coastal area. Type test reports from NABL lab. BIS certified.');
    expect(ctx.environment.setting).toBe('OUTDOOR');
    expect(ctx.environment.conditions).toContain('coastal');
    expect(ctx.testingMentions).toContain('type test');
    expect(ctx.certificationMentions).toContain('bis certified');
  });

  it('derives a concise product phrase from short descriptions', () => {
    expect(deriveProductPhrase('11 kW outdoor AC EV charger for public charging.')).toBe('11 kW outdoor AC EV charger');
    expect(deriveProductPhrase('Supply of Fe 500D TMT bars conforming to IS 1786, diameters 8 mm to 32 mm')).toBe('Fe 500D TMT bars');
    expect(deriveProductPhrase('Supply of 500 MT Ordinary Portland Cement 43 grade conforming to IS 8112:1989 in 50 kg bags.')).toBe('500 MT Ordinary Portland Cement 43 grade');
    expect(deriveProductPhrase('Turnkey modular prefabricated substation comprising switchgear panels, transformers, cabling and civil works')).toBeNull();
    expect(deriveProductPhrase('Motor as per IS 325')).toBe('Motor');
    expect(deriveProductPhrase('IS 694 cables')).toBeNull();
  });

  it('extracts the intended use phrase', () => {
    expect(extractIntendedUse('11 kW outdoor AC EV charger for public charging.')).toBe('public charging');
    expect(extractIntendedUse('Submersible pumpset for 150 mm borewell')).toBeNull();
  });
});

describe('text utilities', () => {
  it('tokenises with light stemming and stopword removal', () => {
    expect(tokenize('The chargers shall be installed outdoors')).toEqual(['charger', 'installed', 'outdoor']);
    expect(stem('batteries')).toBe('battery');
  });
  it('matches phrases on word boundaries', () => {
    expect(containsPhrase('type 2 connector', 'type 2')).toBe(true);
    expect(containsPhrase('type 22', 'type 2')).toBe(false);
  });
  it('truncates at word boundaries', () => {
    expect(truncate('Version requires verification against the catalogue', 30)).toBe('Version requires verification…');
  });
});
