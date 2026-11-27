// Сообщение о результате последнего действия (кладётся в cookie серверным действием на полминуты)
import { cookies } from "next/headers";

export async function Flash() {
  const text = (await cookies()).get("flash")?.value;
  if (!text) return null;
  return <p className="rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white">{text}</p>;
}
