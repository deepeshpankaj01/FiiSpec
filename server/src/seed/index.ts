/**
 * Validated seed bundle. Every record is parsed with the canonical Zod schema
 * so invalid benchmark data fails loudly in tests and in the seed script.
 */
import {
  BenchmarkCaseSchema,
  CertificationRuleSchema,
  type KnowledgeBase,
  ProductCategorySchema,
  RelationshipRecordSchema,
  StandardRecordSchema,
} from '../../../shared/knowledge';
import { BENCHMARK_CASES } from './benchmarks';
import { CATEGORIES } from './categories';
import { CERTIFICATION_RULES } from './certification';
import { RELATIONSHIPS } from './relationships';
import { STANDARDS } from './standards';

export function validatedSeed() {
  const standards = STANDARDS.map((s) => StandardRecordSchema.parse(s));
  const relationships = RELATIONSHIPS.map((r) => RelationshipRecordSchema.parse(r));
  const certificationRules = CERTIFICATION_RULES.map((r) => CertificationRuleSchema.parse(r));
  const categories = CATEGORIES.map((c) => ProductCategorySchema.parse(c));
  const benchmarkCases = BENCHMARK_CASES.map((b) => BenchmarkCaseSchema.parse(b));

  const standardIds = new Set(standards.map((s) => s.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const problems: string[] = [];
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Duplicate ${label} id ${id}`);
      seen.add(id);
    }
  };
  unique('standard', standards.map((s) => s.id));
  unique('relationship', relationships.map((r) => r.id));
  unique('rule', certificationRules.map((r) => r.id));
  unique('category', categories.map((c) => c.id));
  unique('benchmark', benchmarkCases.map((b) => b.id));

  for (const r of relationships) {
    if (!standardIds.has(r.fromId)) problems.push(`Relationship ${r.id}: unknown fromId ${r.fromId}`);
    if (!standardIds.has(r.toId)) problems.push(`Relationship ${r.id}: unknown toId ${r.toId}`);
  }
  for (const s of standards) {
    for (const t of s.productTypes) if (!categoryIds.has(t)) problems.push(`Standard ${s.id}: unknown product type ${t}`);
    if (s.supersededBy?.standardId && !standardIds.has(s.supersededBy.standardId)) problems.push(`Standard ${s.id}: unknown successor`);
    for (const old of s.supersedes) if (old.standardId && !standardIds.has(old.standardId)) problems.push(`Standard ${s.id}: unknown predecessor ${old.standardId}`);
  }
  for (const rule of certificationRules) {
    for (const id of rule.standardIds) if (!standardIds.has(id)) problems.push(`Rule ${rule.id}: unknown standard ${id}`);
    for (const id of rule.productCategories) if (!categoryIds.has(id)) problems.push(`Rule ${rule.id}: unknown category ${id}`);
  }
  for (const cat of categories) {
    if (cat.parentId && !categoryIds.has(cat.parentId)) problems.push(`Category ${cat.id}: unknown parent`);
    for (const p of cat.parameterTemplate) for (const id of p.relatedStandardIds) if (!standardIds.has(id)) problems.push(`Category ${cat.id}/${p.key}: unknown standard ${id}`);
  }
  for (const b of benchmarkCases) {
    for (const id of [...b.expectedStandardIds, ...b.expectedPrimaryIds]) if (!standardIds.has(id)) problems.push(`Benchmark ${b.id}: unknown standard ${id}`);
  }
  if (problems.length) throw new Error(`Seed data integrity errors:\n${problems.join('\n')}`);

  return { standards, relationships, certificationRules, categories, benchmarkCases };
}

export function seedKnowledgeBase(): KnowledgeBase {
  const seed = validatedSeed();
  return {
    standards: seed.standards,
    relationships: seed.relationships,
    certificationRules: seed.certificationRules,
    categories: seed.categories,
    loadedAt: '2026-09-25T00:00:00.000Z',
  };
}
