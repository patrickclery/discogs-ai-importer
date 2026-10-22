// Stub until Plan 04-04 Task 2 GREEN.
export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return Response.json({ error: 'not_implemented' }, { status: 501 });
}
