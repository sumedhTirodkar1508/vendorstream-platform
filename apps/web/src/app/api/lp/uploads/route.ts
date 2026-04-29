import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Legacy LP upload endpoint is no longer supported. Use the direct upload flow via /api/uploads/direct/*. For LP uploads, use the client-side direct upload form.",
    },
    { status: 410 },
  );
}
