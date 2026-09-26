import { describe, expect, it } from 'vitest';
import type { SpecificationGap } from '../../../shared/analysis';
import type { KnowledgeBase } from '../../../shared/knowledge';
import { evaluateCertification } from '../../src/engine/certification';
import { readinessScore } from '../../src/engine/gaps';
import { runPipeline } from '../../src/engine/pipeline';
import { seedKnowledgeBase } from '../../src/seed';

const kb = seedKnowledgeBase();

async function analyse(text: string, base: KnowledgeBase = kb) {
  return runPipeline({ analysisId: 't', orgId: 'o', mode: 'SPECIFICATION', text, form: { technicalSpecification: text } }, base, null, {}, new Date('2026-09-25T00:00:00Z'));
}

describe('certification intelligence', () => {
  it('caps unverified rules at "potentially applicable"', async () => {
    const out = await analyse('Supply of 500 MT OPC 43 grade cement in 50 kg bags');
    const qco = out.result.certificationFindings.find((f) => f.ruleId === 'qco-cement-2003')!;
    expect(qco.classification).toBe('POTENTIALLY_APPLICABLE');
    expect(qco.verificationNote).toMatch(/verify against the current official requirement/);
  });

  it('reports "applicable" only when the rule has been verified', async () => {
    const verified = { ...kb, certificationRules: kb.certificationRules.map((r) => (r.id === 'qco-cement-2003' ? { ...r, verification: { status: 'VERIFIED' as const } } : r)) };
    const out = await analyse('Supply of 500 MT OPC 43 grade cement in 50 kg bags', verified);
    expect(out.result.certificationFindings.find((f) => f.ruleId === 'qco-cement-2003')!.classification).toBe('APPLICABLE');
  });

  it('requires manual verification when a rule condition cannot be confirmed', async () => {
    const out = await analyse('22 kW AC EV charger, Type 2 socket');
    const mop = out.result.certificationFindings.find((f) => f.ruleId === 'mop-evci-guidelines-2024')!;
    expect(mop.classification).toBe('MANUAL_VERIFICATION');
  });

  it('never turns an AI "not met" inference into "not applicable"', async () => {
    const out = await analyse('22 kW AC EV charger for public charging station');
    const findings = evaluateCertification(out.result.specification, out.result.recommendations, kb, '22 kW AC EV charger, Type 2 socket', {
      assessments: [{ ruleId: 'mop-evci-guidelines-2024', conditionStatus: 'NOT_MET', supportingQuote: null, reasoning: 'x' }],
    });
    expect(findings.find((f) => f.ruleId === 'mop-evci-guidelines-2024')!.classification).toBe('MANUAL_VERIFICATION');
  });

  it('ignores AI "met" assessments whose quote is not in the text', async () => {
    const out = await analyse('22 kW AC EV charger');
    const findings = evaluateCertification(out.result.specification, out.result.recommendations, kb, '22 kW AC EV charger', {
      assessments: [{ ruleId: 'mop-evci-guidelines-2024', conditionStatus: 'MET', supportingQuote: 'installed at a public charging station', reasoning: 'x' }],
    });
    expect(findings.find((f) => f.ruleId === 'mop-evci-guidelines-2024')!.classification).toBe('MANUAL_VERIFICATION');
  });

  it('shows explicit "not detected" entries so absence is not mistaken for clearance', async () => {
    const out = await analyse('Submersible pumpset 7.5 HP, 300 lpm at 60 m head');
    const notDetected = out.result.certificationFindings.filter((f) => f.classification === 'NOT_DETECTED');
    expect(notDetected.length).toBeGreaterThan(0);
    expect(notDetected.every((f) => /does not establish|re-check/.test(f.verificationNote))).toBe(true);
  });
});

describe('specification gap analysis', () => {
  it('raises template gaps with justification and escalates IP rating outdoors', async () => {
    const out = await analyse('11 kW outdoor AC EV charger for public charging.');
    const ip = out.gaps.find((g) => g.code === 'MISSING_PARAMETER:ip_rating')!;
    expect(ip.severity).toBe('CRITICAL');
    expect(ip.evidence?.statement).toMatch(/parameter template/);
    const indoor = await analyse('11 kW indoor AC EV charger for a parking basement');
    expect(indoor.gaps.find((g) => g.code === 'MISSING_PARAMETER:ip_rating')!.severity).toBe('WARNING');
  });

  it('quotes ambiguous language from the input', async () => {
    const out = await analyse('Pump shall be of good quality and reputed make, as per requirement.');
    const vague = out.gaps.filter((g) => g.category === 'AMBIGUOUS_REQUIREMENT');
    expect(vague.map((g) => g.code)).toEqual(expect.arrayContaining(['AMBIGUOUS:good quality', 'AMBIGUOUS:reputed make', 'AMBIGUOUS:as per requirement']));
    expect(vague.every((g) => g.quote && g.quote.length > 0)).toBe(true);
  });

  it('detects conflicting values of the same parameter', async () => {
    const out = await analyse('AC EV charger. Enclosure IP54. The enclosure shall be IP65.');
    expect(out.gaps.some((g) => g.category === 'CONFLICTING_REQUIREMENT')).toBe(true);
  });

  it('does not report gaps for parameters that are stated', async () => {
    const out = await analyse('22 kW AC EV charger, 415 V three phase 50 Hz, 32 A, Type 2 socket, IP55, IK10, Type A RCD with MCB, OCPP 1.6J, energy meter, RFID, -5 °C to 50 °C, Mode 3, dual output, quantity 10 nos, warranty 3 years.');
    const missing = out.gaps.filter((g) => g.category === 'MISSING_PARAMETER').map((g) => g.code);
    expect(missing).toEqual([]);
  });

  it('computes an explainable readiness score and never labels a spec with critical gaps as ready', () => {
    const gap = (severity: SpecificationGap['severity'], category: SpecificationGap['category'] = 'AMBIGUOUS_REQUIREMENT'): SpecificationGap => ({
      id: Math.random().toString(), code: 'x', category, severity, issue: '', whyItMatters: '', suggestion: '', quote: null, evidence: null, relatedStandardIds: [], origin: 'RULE', status: 'OPEN', statusNote: null, updatedBy: null,
    });
    expect(readinessScore([], 10, 10, true).score).toBe(100);
    const withCritical = readinessScore([gap('CRITICAL')], 10, 10, true);
    expect(withCritical.score).toBe(94);
    expect(withCritical.label).toBe('NEEDS_IMPROVEMENT');
    // Missing parameters are measured by coverage, not double-penalised.
    expect(readinessScore([gap('CRITICAL', 'MISSING_PARAMETER')], 9, 10, true).score).toBe(94);
    expect(readinessScore([], 0, 0, false).parameterCoverage.total).toBe(0);
  });
});
