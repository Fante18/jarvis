import { supabase } from "@/lib/server/supabase";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.APP_URL || url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await supabase();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", origin));
    } catch {}
  }
  return NextResponse.redirect(new URL("/settings?auth=failed", origin));
}
