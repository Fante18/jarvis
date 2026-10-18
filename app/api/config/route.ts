import { isConfigured } from "@/lib/server/supabase";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(
    {
      supabase: isConfigured(),
      openai: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
