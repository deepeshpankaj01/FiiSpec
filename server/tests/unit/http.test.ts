import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('../../src/lib/admin', () => ({
  adminAuth: { verifyIdToken },
  adminAppCheck: () => ({ verifyToken: vi.fn() }),
  db: {},
  nowIso: () => '2026-09-25T00:00:00.000Z',
}));

const { handleCallable, handleDocumentUpload, handleSweepCron } = await import('../../src/http/handlers');

const call = (name: string, data: unknown, token?: string) =>
  handleCallable(
    name,
    new Request(`http://localhost/api/fn/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data }),
    }),
  );

const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error;

beforeEach(() => {
  verifyIdToken.mockReset();
});

describe('callable HTTP layer', () => {
  it('rejects unknown and inherited names', async () => {
    for (const name of ['doesNotExist', 'constructor', '__proto__']) {
      const res = await call(name, {});
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'not-found', message: 'Unknown function.' } });
    }
  });

  it('requires a signed-in caller', async () => {
    const res = await call('createAnalysis', { mode: 'DESCRIPTION', form: { description: 'EV charger' } });
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('unauthenticated');
  });

  it('rejects an invalid ID token without revealing why', async () => {
    verifyIdToken.mockRejectedValue(new Error('Firebase ID token has expired'));
    const res = await call('updateProfile', {}, 'expired-token');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: 'Your session has expired. Please sign in again.' } });
  });

  it('passes verified claims to the handler and maps validation errors to 400', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'officer@example.gov.in', role: 'PROCUREMENT_OFFICER', orgId: 'org1' });
    const res = await call('updateProfile', { displayName: 'A', language: 'en', notifications: { analysisCompleted: true, reviewAssigned: true } }, 'good-token');
    expect(verifyIdToken).toHaveBeenCalledWith('good-token');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'invalid-argument', message: 'displayName: Enter your name' } });
  });

  it('refuses uploads above the size limit before reading the body', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', role: 'PROCUREMENT_OFFICER', orgId: 'org1' });
    const res = await handleDocumentUpload(
      'a1',
      new Request('http://localhost/api/analyses/a1/document', {
        method: 'PUT',
        headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/pdf', 'Content-Length': String(5 * 1024 * 1024) },
        body: new Uint8Array(8),
      }),
    );
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid-argument');
  });

  it('requires an organisation role to upload', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1' });
    const res = await handleDocumentUpload('a1', new Request('http://localhost/api/analyses/a1/document', { method: 'PUT', headers: { Authorization: 'Bearer t' }, body: new Uint8Array(8) }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('failed-precondition');
  });

  it('only runs the sweep with the cron secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const res = await handleSweepCron(new Request('http://localhost/api/cron/sweep', { headers: { Authorization: 'Bearer wrong' } }));
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
    const unset = await handleSweepCron(new Request('http://localhost/api/cron/sweep', { headers: { Authorization: 'Bearer undefined' } }));
    expect(unset.status).toBe(401);
  });
});
