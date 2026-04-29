import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { LP_EXCEL_REQUIRED_HEADERS } from "@vendorstream/contracts";
import { Prisma, prisma, type Prisma as PrismaType } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

const MANAGEABLE_LP_ROLES = ["LP_ADMIN", "LP_MANAGER", "LP_VIEWER"] as const;

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join("; ")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

function jsonObject(value: PrismaType.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function listToText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("; ");
  }

  return typeof value === "string" ? value : "";
}

function errorsToText(value: PrismaType.JsonValue | null) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("; ");
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildPrevalidationCsvRows(summary: Record<string, unknown>) {
  return [
    [
      "Failure Type",
      "Worksheet Name",
      "Error Message",
      "Missing Required Columns",
      "Found Columns",
      "Suggested Action",
    ],
    [
      "Workbook structure/header validation failed",
      typeof summary.worksheetName === "string" ? summary.worksheetName : "",
      typeof summary.errorMessage === "string"
        ? summary.errorMessage
        : listToText(summary.errors),
      listToText(summary.missingHeaders),
      listToText(summary.foundHeaders),
      "Use the required LP workbook headers exactly, then upload the corrected workbook again.",
    ],
  ];
}

function buildRowValidationCsvRows(
  rows: Array<{
    sourceRowNumber: number;
    rawData: PrismaType.JsonValue;
    parseErrors: PrismaType.JsonValue | null;
  }>,
) {
  const header = ["Source Row Number", "Errors", ...LP_EXCEL_REQUIRED_HEADERS];

  if (rows.length === 0) {
    return [
      header,
      [
        "",
        "Failed row details are no longer retained for this batch.",
        ...LP_EXCEL_REQUIRED_HEADERS.map(() => ""),
      ],
    ];
  }

  return [
    header,
    ...rows.map((row) => {
      const rawData = jsonObject(row.rawData);

      return [
        row.sourceRowNumber,
        errorsToText(row.parseErrors),
        ...LP_EXCEL_REQUIRED_HEADERS.map((column) => {
          const value = rawData[column] ?? "";
          if (column === "Order Date" && typeof value === "string") {
            return value.slice(0, 10);
          }
          return value;
        }),
      ];
    }),
  ];
}

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

  const { batchId } = await context.params;
  const batch = await prisma.importBatch.findUnique({
    where: {
      id: batchId,
    },
    select: {
      id: true,
      sourceType: true,
      status: true,
      validationSummary: true,
      cycle: {
        select: {
          lp: {
            select: {
              memberships: {
                where: {
                  userId: session.user.id,
                  role: {
                    in: [...MANAGEABLE_LP_ROLES],
                  },
                },
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
      rawLpRows: {
        where: {
          parseErrors: {
            not: Prisma.DbNull,
          },
        },
        orderBy: {
          sourceRowNumber: "asc",
        },
        select: {
          sourceRowNumber: true,
          rawData: true,
          parseErrors: true,
        },
      },
    },
  });

  if (!batch || batch.sourceType !== "LP") {
    return NextResponse.json(
      {
        error: "LP import batch was not found.",
      },
      { status: 404 },
    );
  }

  const isAdmin = session.user.systemRole === "ADMIN";
  const hasAccess = isAdmin || batch.cycle.lp.memberships.length > 0;

  if (!hasAccess) {
    return NextResponse.json(
      {
        error: "You do not have access to this import batch.",
      },
      { status: 403 },
    );
  }

  if (
    batch.status !== "PREVALIDATION_FAILED" &&
    batch.status !== "VALIDATION_FAILED"
  ) {
    return NextResponse.json(
      {
        error: "This import batch does not have downloadable validation errors.",
      },
      { status: 409 },
    );
  }

  const csvRows =
    batch.status === "PREVALIDATION_FAILED"
      ? buildPrevalidationCsvRows(jsonObject(batch.validationSummary))
      : buildRowValidationCsvRows(batch.rawLpRows);

  const csv = csvRows
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lp-upload-${batch.id}-validation-errors.csv"`,
    },
  });
}
