/**
 * Loads the published knowledge base from Firestore, validating every record.
 * Cached per function instance for a short TTL to avoid repeated reads.
 */
import type { z } from 'zod';
import type { KnowledgeBase } from '../../../shared/knowledge';
import {
  CertificationRuleSchema,
  ProductCategorySchema,
  RelationshipRecordSchema,
  StandardRecordSchema,
} from '../../../shared/knowledge';
import { db } from '../lib/admin';
import { log } from '../lib/log';

const TTL_MS = 5 * 60 * 1000;
let cached: { kb: KnowledgeBase; at: number; version: string | null } | null = null;

/** Knowledge-base version marker, bumped on every admin write so all function instances refresh their cache. */
const KB_VERSION_DOC = () => db.collection('systemConfig').doc('kb');

async function currentVersion(): Promise<string | null> {
  try {
    return ((await KB_VERSION_DOC().get()).data()?.updatedAt as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function bumpKnowledgeBaseVersion(): Promise<void> {
  cached = null;
  await KB_VERSION_DOC().set({ updatedAt: new Date().toISOString() }, { merge: true });
}

async function loadCollection<T extends z.ZodType>(name: string, schema: T): Promise<z.infer<T>[]> {
  const snap = await db.collection(name).where('lifecycle', 'in', ['PUBLISHED', 'ARCHIVED']).get();
  const out: z.infer<T>[] = [];
  let invalid = 0;
  for (const doc of snap.docs) {
    const parsed = schema.safeParse({ ...doc.data(), id: doc.id });
    if (parsed.success) out.push(parsed.data);
    else invalid += 1;
  }
  if (invalid) log.warn('kb.invalid_records_skipped', { collection: name, invalid });
  return out;
}

export async function loadKnowledgeBase(options: { fresh?: boolean } = {}): Promise<KnowledgeBase> {
  const version = await currentVersion();
  if (!options.fresh && cached && cached.version === version && Date.now() - cached.at < TTL_MS) return cached.kb;
  const [standards, relationships, certificationRules, categories] = await Promise.all([
    loadCollection('standards', StandardRecordSchema),
    loadCollection('standardRelationships', RelationshipRecordSchema),
    loadCollection('certificationRules', CertificationRuleSchema),
    loadCollection('productCategories', ProductCategorySchema),
  ]);
  const kb: KnowledgeBase = { standards, relationships, certificationRules, categories, loadedAt: new Date().toISOString() };
  cached = { kb, at: Date.now(), version };
  return kb;
}

/** Invalidate this instance's cache and signal other instances to reload. */
export function invalidateKnowledgeBaseCache(): Promise<void> {
  return bumpKnowledgeBaseVersion();
}

/** Strip server-only fields before writing a record. */
export function withoutId<T extends { id: string }>(record: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = record;
  return rest;
}
