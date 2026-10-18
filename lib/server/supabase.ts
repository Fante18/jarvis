import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import "server-only";
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function supabase() {
  if (!isConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          for (const { name, value, options } of items)
            store.set(name, value, options);
        },
      },
    },
  );
}
