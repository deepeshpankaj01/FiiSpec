/**
 * Deterministic detectors for environment, materials, and the presence of
 * testing / safety / installation / certification / acceptance language.
 * Each detector returns the matched phrases so they can be quoted as evidence.
 */
import type { StructuredSpecification } from '../../../shared/analysis';
import { containsPhrase, normalizeText } from './text';

function findAll(textLower: string, phrases: string[]): string[] {
  return phrases.filter((phrase) => containsPhrase(textLower, phrase));
}

const OUTDOOR = ['outdoor', 'outdoors', 'open air', 'weatherproof', 'weather proof', 'exposed to rain', 'roadside', 'street', 'parking lot', 'open parking', 'kiosk', 'field installation'];
const INDOOR = ['indoor', 'indoors', 'inside building', 'basement', 'control room', 'plant room'];
const CONDITIONS = ['coastal', 'saline', 'dust', 'dusty', 'rain', 'high humidity', 'humid', 'corrosive', 'flood', 'uv', 'direct sunlight', 'high ambient', 'vibration', 'seismic', 'hilly', 'high altitude'];
const MATERIALS = ['stainless steel', 'mild steel', 'galvanised steel', 'galvanized steel', 'cast iron', 'aluminium', 'aluminum', 'copper', 'brass', 'bronze', 'pvc', 'xlpe', 'polycarbonate', 'abs', 'frp', 'grp', 'concrete', 'fly ash', 'cement', 'steel', 'hdpe', 'rubber', 'epoxy'];

const TESTING = ['type test', 'type tested', 'routine test', 'acceptance test', 'test report', 'test certificate', 'tested as per', 'tested in accordance', 'nabl', 'factory acceptance', 'fat', 'sample testing', 'third party inspection', 'third-party inspection', 'performance test', 'test method', 'tests'];
const SAFETY = ['earthing', 'earth fault', 'earth leakage', 'protective earth', 'rcd', 'rccb', 'rcbo', 'electric shock', 'insulation', 'surge protection', 'spd', 'overcurrent', 'over current', 'short circuit', 'emergency stop', 'fire', 'safety', 'protection against', 'interlock', 'isolation'];
const INSTALLATION = ['installation', 'install', 'installed', 'mounting', 'wall mounted', 'wall-mounted', 'pedestal', 'floor mounted', 'floor-mounted', 'foundation', 'civil work', 'cabling', 'commissioning', 'erection', 'site preparation', 'wiring'];
const CERTIFICATION = ['bis', 'isi', 'isi mark', 'isi marked', 'bis certified', 'bis certification', 'bis licence', 'bis license', 'crs', 'compulsory registration', 'bee', 'star label', 'star rated', 'quality control order', 'qco', 'cmvr', 'arai', 'icat', 'type approval', 'ce marked', 'ul listed', 'cea'];
const ACCEPTANCE = ['acceptance criteria', 'acceptance test', 'inspection', 'pre-dispatch', 'pre dispatch', 'warranty', 'guarantee', 'commissioning', 'handover', 'hand over', 'performance guarantee', 'defect liability', 'sat', 'site acceptance'];
const PURPOSE = ['for public', 'for use in', 'for use at', 'intended for', 'to be used', 'for charging', 'for supply', 'for irrigation', 'for water supply', 'for construction', 'purpose', 'application'];

export interface ContextSignals {
  environment: StructuredSpecification['environment'];
  materials: string[];
  testingMentions: string[];
  safetyMentions: string[];
  installationMentions: string[];
  certificationMentions: string[];
  acceptanceMentions: string[];
  purposeMentions: string[];
  publicUse: boolean;
}

export function detectContext(input: string): ContextSignals {
  const lower = normalizeText(input).toLowerCase();
  const outdoor = findAll(lower, OUTDOOR);
  const indoor = findAll(lower, INDOOR);
  const setting: StructuredSpecification['environment']['setting'] =
    outdoor.length && indoor.length ? 'INDOOR_OUTDOOR' : outdoor.length ? 'OUTDOOR' : indoor.length ? 'INDOOR' : 'UNSPECIFIED';

  // "steel" is implied by "stainless steel" — drop generic terms already covered by a longer phrase.
  const materials = findAll(lower, MATERIALS).filter(
    (m, _i, all) => !all.some((other) => other !== m && other.includes(m)),
  );

  return {
    environment: { setting, conditions: [...outdoor, ...indoor, ...findAll(lower, CONDITIONS)] },
    materials,
    testingMentions: findAll(lower, TESTING),
    safetyMentions: findAll(lower, SAFETY),
    installationMentions: findAll(lower, INSTALLATION),
    certificationMentions: findAll(lower, CERTIFICATION),
    acceptanceMentions: findAll(lower, ACCEPTANCE),
    purposeMentions: findAll(lower, PURPOSE),
    publicUse: /\bpublic\b/.test(lower),
  };
}

/** Vague procurement language that makes requirements unverifiable at acceptance. */
export const VAGUE_PHRASES: { phrase: string; why: string }[] = [
  { phrase: 'as per requirement', why: 'The requirement is not stated, so bidders cannot price it and evaluators cannot verify it.' },
  { phrase: 'as required', why: 'The requirement is not stated, so bidders cannot price it and evaluators cannot verify it.' },
  { phrase: 'as per site requirement', why: 'Site conditions are not quantified; bids will not be comparable.' },
  { phrase: 'suitable capacity', why: 'Capacity must be stated as a rated value with unit.' },
  { phrase: 'suitable rating', why: 'Ratings must be stated as values with units.' },
  { phrase: 'adequate', why: 'Adequacy cannot be tested; state a measurable criterion.' },
  { phrase: 'good quality', why: 'Quality must be defined through standards, tests or acceptance criteria.' },
  { phrase: 'best quality', why: 'Quality must be defined through standards, tests or acceptance criteria.' },
  { phrase: 'standard quality', why: 'Name the standard the product must conform to.' },
  { phrase: 'high quality', why: 'Quality must be defined through standards, tests or acceptance criteria.' },
  { phrase: 'reputed make', why: 'Brand reputation is not an objective, verifiable criterion.' },
  { phrase: 'reputed brand', why: 'Brand reputation is not an objective, verifiable criterion.' },
  { phrase: 'latest technology', why: 'Not measurable; specify the required functions or performance values.' },
  { phrase: 'state of the art', why: 'Not measurable; specify the required functions or performance values.' },
  { phrase: 'or equivalent', why: 'Equivalence criteria are not defined; state how equivalence will be established.' },
  { phrase: 'approximately', why: 'Tolerances should be explicit so acceptance testing is objective.' },
  { phrase: 'approx', why: 'Tolerances should be explicit so acceptance testing is objective.' },
  { phrase: 'heavy duty', why: 'Define the duty (rating, cycles, class) that "heavy duty" means.' },
  { phrase: 'user friendly', why: 'Not verifiable at acceptance; specify concrete interface requirements.' },
  { phrase: 'robust', why: 'Not verifiable at acceptance; specify mechanical ratings (e.g. IK code) or tests.' },
  { phrase: 'etc', why: 'Open-ended lists create disputes about scope at acceptance.' },
];
