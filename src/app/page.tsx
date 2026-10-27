import ChatShell from "@/components/ChatShell";
import { bootstrap } from "@/lib/meta/config";

export const dynamic = "force-dynamic";

/** تنها صفحه‌ی پلتفرم: چت با مغز یکپارچه‌ی هزار ایجنت */
export default async function HomePage() {
  await bootstrap();
  return <ChatShell />;
}
