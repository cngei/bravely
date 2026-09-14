import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { currentActor } from '@/lib/service';
import { pool, mutate, readState } from '@/lib/db';
import { checkOrigin } from '@/lib/auth';
import { AppError, assert } from '@/lib/errors';
import {
  active,
  evidenceView,
  dashboard,
  skillDetail,
  canReadEvidence,
  canReadUpload,
  execute,
  skillById,
  writable,
} from '@/lib/domain';
import { commandSchema } from '@/lib/commands';
import { boundedBody, MAX_FILE_SIZE, validateMedia } from '@/lib/files';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
function fail(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message } }, e.status);
  if (e instanceof ZodError)
    return json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dati non validi.', issues: e.issues } },
      400,
    );
  if (e instanceof SyntaxError)
    return json({ error: { code: 'INVALID_JSON', message: 'JSON non valido.' } }, 400);
  console.error('Bravely request failed:', e instanceof Error ? e.message : 'unknown');
  return json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Errore interno. Verifica i servizi e le migrazioni.',
      },
    },
    500,
  );
}
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const a = await currentActor(),
      s = await readState(),
      path = (await params).path;
    if (path.length === 1 && path[0] === 'dashboard') return json(dashboard(s, a));
    active(s, a);
    if (path.length === 1 && path[0] === 'skills') return json(s.skills);
    if (path.length === 2 && path[0] === 'skills') return json(skillDetail(s, a, path[1]));
    if (path.length === 2 && path[0] === 'evidence') {
      const e = s.evidence.find((e) => e.id === path[1]);
      assert(e && canReadEvidence(s, a, e), 404, 'NOT_FOUND', 'Prova non trovata.');
      return json(evidenceView(s, a, e));
    }
    if (path.length === 2 && path[0] === 'files') {
      const u = s.uploads.find((u) => u.id === path[1]);
      assert(u && canReadUpload(s, a, u), 404, 'NOT_FOUND', 'File non trovato.');
      const { rows } = await pool.query('SELECT data FROM files WHERE id=$1', [u.id]);
      assert(rows[0], 404, 'NOT_FOUND', 'File non trovato.');
      return new Response(new Uint8Array(rows[0].data), {
        headers: {
          'Content-Type': u.type,
          'Content-Length': String(u.size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(u.name).replace(/'/g, '%27')}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Endpoint non trovato.' } }, 404);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    checkOrigin(request);
    const a = await currentActor(),
      path = (await params).path;
    if (path.length === 1 && path[0] === 'commands') {
      assert(
        request.headers.get('content-type')?.includes('application/json'),
        415,
        'CONTENT_TYPE',
        'Usare application/json.',
      );
      const command = commandSchema.parse(
        JSON.parse((await boundedBody(request, 1024 * 1024)).toString()),
      );
      return json(await mutate((s) => execute(s, a, command)));
    }
    if (path.length === 1 && path[0] === 'files') {
      const url = new URL(request.url),
        skillId = url.searchParams.get('skillId'),
        targetId = url.searchParams.get('targetId'),
        name = url.searchParams.get('name');
      assert(
        skillId && targetId && name && name.length <= 255,
        400,
        'INVALID_UPLOAD',
        'Specificare skillId, targetId e name.',
      );
      const s = await readState();
      writable(s, a, skillById(s, skillId), targetId);
      const bytes = await boundedBody(request, MAX_FILE_SIZE),
        type = validateMedia(bytes);
      return json(
        await mutate(async (s, client) => {
          const skill = skillById(s, skillId);
          writable(s, a, skill, targetId);
          assert(
            s.uploads.filter((u) => u.skillId === skillId && u.targetId === targetId).length < 100,
            409,
            'UPLOAD_LIMIT',
            'Limite di 100 allegati per prova raggiunto.',
          );
          execute(s, a, { type: 'startSkill', skillId, targetId });
          const upload = {
            id: randomUUID(),
            skillId,
            targetId,
            targetType: skill.scope,
            name: name.replace(/[\x00-\x1f/\\]/g, '_'),
            type,
            size: bytes.length,
            createdBy: a.id,
            createdAt: new Date().toISOString(),
          };
          await client.query('INSERT INTO files VALUES($1,$2)', [upload.id, bytes]);
          s.uploads.push(upload);
          return { ...upload, url: `/api/files/${upload.id}` };
        }),
        201,
      );
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Endpoint non trovato.' } }, 404);
  } catch (e) {
    return fail(e);
  }
}
