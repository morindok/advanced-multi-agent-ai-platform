/**
 * Next.js هنگام بالا آمدن سرور یک‌بار این تابع را صدا می‌زند.
 * کارگر پس‌زمینه اینجا روشن می‌شود تا اجراها حتی بدون هیچ درخواست کاربر ادامه یابند.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWorker } = await import("@/lib/meta/worker");
  startWorker();
}
