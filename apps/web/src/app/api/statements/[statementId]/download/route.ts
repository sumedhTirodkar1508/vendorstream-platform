import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getStatementSignedDownloadUrl } from "@/lib/statement-download-server";

type RouteContext = {
  params: Promise<{
    statementId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: "Authentication is required.",
      },
      { status: 401 },
    );
  }

  const { statementId } = await context.params;

  const result = await getStatementSignedDownloadUrl({
    statementId,
    actor: {
      userId: session.user.id,
      systemRole: session.user.systemRole,
    },
  });

  if (result.kind === "ok") {
    return NextResponse.redirect(result.signedUrl, { status: 302 });
  }

  const status =
    result.kind === "unauthenticated"
      ? 401
      : result.kind === "forbidden"
        ? 403
        : result.kind === "not_found"
          ? 404
          : result.kind === "missing_file"
            ? 409
            : 500;

  return NextResponse.json(
    {
      error: result.message,
    },
    { status },
  );
}
