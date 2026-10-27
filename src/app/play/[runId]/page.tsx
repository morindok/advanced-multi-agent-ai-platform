import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** دکمه‌ی اجرا: خودِ برنامه، تمام‌صفحه، بدون iframe و بدون دکمه‌ی تودرتو */
export default async function PlayPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) redirect("/");
  redirect(`/api/projects/${id}/index.html`);
}
