import { getUserProfile } from "@/lib/firebase/firestore";

export async function fetchProfileEmails(ids: string[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;

  await Promise.all(
    unique.map(async (id) => {
      try {
        const profile = await getUserProfile(id);
        map.set(id, profile?.email ?? null);
      } catch {
        map.set(id, null);
      }
    }),
  );

  return map;
}
