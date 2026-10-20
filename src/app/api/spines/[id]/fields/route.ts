import { connection } from 'next/server';
import { z } from 'zod';
import type { SpineFieldDto } from '@/lib/scan-types';
import { MAX_FIELD_CHARS, normalizeFieldInput } from '@/lib/spine-review';
import { SPINE_FIELDS } from '@/lib/vision-contract';
import { revertSpineField, updateSpineField } from '@/server/scan/fields';

// Edit or revert one spine field (REV-02, D-08..D-10). The AI read is never
// written: an edit sets `value`, a revert copies `ai_value` back into it.
// T-02-18: JSON only (blocks no-preflight cross-site forms), a field enum and
// a 500-character cap; the proxy enforces the same-origin check.

const Edit = z.strictObject({
  field: z.enum(SPINE_FIELDS),
  value: z.string().max(MAX_FIELD_CHARS).nullable(),
});
const Revert = z.strictObject({
  field: z.enum(SPINE_FIELDS),
  revert: z.literal(true),
});
const Body = z.union([Edit, Revert]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const contentType = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    return Response.json(
      { error: 'content-type must be application/json' },
      { status: 415 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { id } = await params;
  const body = parsed.data;
  const result =
    'revert' in body
      ? revertSpineField(id, body.field)
      : updateSpineField(id, body.field, normalizeFieldInput(body.value));
  if (!result.ok) {
    return result.error === 'not_found'
      ? Response.json({ error: 'spine not found' }, { status: 404 })
      : Response.json(
          { error: 'this spine can no longer be edited' },
          { status: 409 },
        );
  }
  const dto: SpineFieldDto = result.field;
  return Response.json(dto);
}
