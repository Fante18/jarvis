import { isConfigured } from "@/lib/server/supabase";
import { workerConfiguration } from "@/lib/server-configuration.mjs";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(
    {
      supabase: isConfigured(),
      automation: workerConfiguration(process.env),
      openai: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
