import { bootstrap } from "@/lib/meta/config";
import { cancelRunRow } from "@/lib/meta/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** توقف دستی (قابل ادامه): موتور در گام بعدی متوقف می‌شود و وضعیت حفظ می‌گردد */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const id = Number((await ctx.params).id);
  await cancelRunRow(id);
  return Response.json({ ok: true });
}
