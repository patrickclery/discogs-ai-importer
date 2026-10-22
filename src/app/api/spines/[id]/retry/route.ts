import { connection } from 'next/server';

export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  await connection();
  return Response.json(
    { error: 'not_implemented', message: 'Not implemented.' },
    { status: 501 },
  );
}
