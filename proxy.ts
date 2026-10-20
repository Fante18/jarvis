import { NextResponse } from "next/server";
import { PROJECT_CLOSED } from "./lib/project-state";

// Reject every application request before page/API code can contact Supabase,
// OpenAI or other services. Existing source and persisted data remain intact.
export function proxy() {
  if (PROJECT_CLOSED)
    return NextResponse.json(
      { error: "JARVIS är avstängt." },
      {
        status: 410,
        headers: {
          "Cache-Control": "public, max-age=3600",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };
