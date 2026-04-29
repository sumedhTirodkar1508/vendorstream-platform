import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type Prisma,
  type StatementStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageErrorState } from "@/components/page-error-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatCurrency,
  formatDateTime,
  formatEnumLabel,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  formatFileSize,
} from "@/lib/format";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
import { getStatementStatusBadgeClassName } from "@/lib/status-badges";

type StatementLineItemRow = {
  id: string;
  barcode: string | null;
  productName: string | null;
  category: string | null;
  reconciledUnits: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  commissionPercent: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal | null;
  notes: string | null;
};

type LpStatementDetailsState =
  | {
      kind: "ready";
      statement: {
        id: string;
        cycleId: string;
        lpId: string;
        lpName: string;
        storeOrganizationName: string;
        storeLocationId: string;
        storeLocationName: string;
        month: Date;
        version: number;
        status: StatementStatus;
        currency: string;
        totalSalesAmount: Prisma.Decimal | null;
        totalSalesUnits: Prisma.Decimal | null;
        totalCommissionAmount: Prisma.Decimal | null;
        generatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        generatedFile: {
          id: string;
          originalFilename: string;
          bucket: string;
          storagePath: string;
          mimeType: string | null;
          sizeBytes: bigint;
          uploadedAt: Date;
        } | null;
        lineItems: StatementLineItemRow[];
      };
    }
  | {
      kind: "missing";
      statementId: string;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

async function getLpStatementDetailsState(
  statementId: string,
): Promise<LpStatementDetailsState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  try {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
      select: {
        id: true,
        cycleId: true,
        version: true,
        status: true,
        currency: true,
        totalSalesAmount: true,
        totalSalesUnits: true,
        totalCommissionAmount: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
        generatedFile: {
          select: {
            id: true,
            originalFilename: true,
            bucket: true,
            storagePath: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
        },
        cycle: {
          select: {
            id: true,
            lpId: true,
            periodMonth: true,
            lp: {
              select: {
                name: true,
              },
            },
            storeLocation: {
              select: {
                id: true,
                name: true,
                storeOrganization: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            id: true,
            barcode: true,
            productName: true,
            categoryKey: true,
            reconciledUnits: true,
            unitPrice: true,
            commissionPercent: true,
            commissionAmount: true,
            notes: true,
            reconciliationResult: {
              select: {
                barcode: true,
                productName: true,
                categoryKey: true,
              },
            },
          },
        },
      },
    });

    if (!statement) {
      return {
        kind: "missing",
        statementId,
      };
    }

    const context = await getLpAccessContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const isAdmin = session.user.systemRole === "ADMIN";

    if (!isAdmin && !context.lpIds.includes(statement.cycle.lpId)) {
      return {
        kind: "forbidden",
      };
    }

    return {
      kind: "ready",
      statement: {
        id: statement.id,
        cycleId: statement.cycleId,
        lpId: statement.cycle.lpId,
        lpName: statement.cycle.lp.name,
        storeOrganizationName:
          statement.cycle.storeLocation.storeOrganization.name,
        storeLocationId: statement.cycle.storeLocation.id,
        storeLocationName: statement.cycle.storeLocation.name,
        month: statement.cycle.periodMonth,
        version: statement.version,
        status: statement.status,
        currency: statement.currency,
        totalSalesAmount: statement.totalSalesAmount,
        totalSalesUnits: statement.totalSalesUnits,
        totalCommissionAmount: statement.totalCommissionAmount,
        generatedAt: statement.generatedAt,
        createdAt: statement.createdAt,
        updatedAt: statement.updatedAt,
        generatedFile: statement.generatedFile,
        lineItems: statement.lineItems.map((item) => ({
          id: item.id,
          barcode: item.barcode ?? item.reconciliationResult?.barcode ?? null,
          productName:
            item.productName ?? item.reconciliationResult?.productName ?? null,
          category:
            item.categoryKey ?? item.reconciliationResult?.categoryKey ?? null,
          reconciledUnits: item.reconciledUnits,
          unitPrice: item.unitPrice,
          commissionPercent: item.commissionPercent,
          commissionAmount: item.commissionAmount,
          notes: item.notes,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to load LP statement details", error);

    return {
      kind: "error",
      message:
        "We could not load statement details right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "success" | "warning";
}) {
  const accentClass =
    tone === "success"
      ? "from-emerald-400/20 to-transparent"
      : tone === "warning"
        ? "from-amber-400/20 to-transparent"
        : "from-cyan-400/20 to-transparent";

  return (
    <Card className="relative border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accentClass}`}
      />
      <CardHeader className="relative space-y-2">
        <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-300">
          {label}
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight text-white">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-sm leading-6 text-slate-300">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function ReadyState({
  statement,
}: {
  statement: Extract<LpStatementDetailsState, { kind: "ready" }>["statement"];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                {formatMonthLabel(statement.month)}
              </div>
              <StatusBadge
                label={formatEnumLabel(statement.status)}
                className={getStatementStatusBadgeClassName(statement.status)}
              />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl text-white">
                {statement.lpName}
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                {statement.storeOrganizationName} ·{" "}
                {statement.storeLocationName}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            <DetailRow label="Statement ID" value={statement.id} />
            <DetailRow label="Cycle ID" value={statement.cycleId} />
            <DetailRow
              label="Month"
              value={formatMonthLabel(statement.month)}
            />
            <DetailRow label="LP" value={statement.lpName} />
            <DetailRow
              label="Store organization"
              value={statement.storeOrganizationName}
            />
            <DetailRow
              label="Store location"
              value={statement.storeLocationName}
            />
            <DetailRow label="Version" value={`v${statement.version}`} />
            <DetailRow
              label="Status"
              value={
                <StatusBadge
                  label={formatEnumLabel(statement.status)}
                  className={getStatementStatusBadgeClassName(statement.status)}
                />
              }
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Actions</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Move between the cycle, statement list, and generated file context
              for this statement version.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              asChild
              className="bg-white text-slate-950 hover:bg-slate-100"
            >
              <Link href="/lp/statements">Back to statements</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href={`/lp/cycles/${statement.cycleId}`}>View cycle</Link>
            </Button>
            <Button
              asChild={Boolean(statement.generatedFile)}
              variant="outline"
              disabled={!statement.generatedFile}
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
            >
              {statement.generatedFile ? (
                <Link href={`/api/statements/${statement.id}/download`}>
                  Download file
                </Link>
              ) : (
                <span>Download file</span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Sales"
          value={formatCurrency(statement.totalSalesAmount, statement.currency)}
          detail="Aggregate reconciled sales amount for this statement version."
          tone="neutral"
        />
        <SummaryCard
          label="Commission Total"
          value={formatCurrency(
            statement.totalCommissionAmount,
            statement.currency,
          )}
          detail="Total commission value calculated across all included line items."
          tone="success"
        />
        <SummaryCard
          label="Reconciled Units"
          value={formatNumber(statement.totalSalesUnits, {
            maximumFractionDigits: 0,
          })}
          detail="Total reconciled units included in the generated statement."
          tone="neutral"
        />
        <SummaryCard
          label="Line Items"
          value={String(statement.lineItems.length)}
          detail="Statement line items currently attached to this version."
          tone="warning"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Statement metadata
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Operational metadata for the current statement version and
              generated artifact.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Generated at"
              value={formatDateTime(statement.generatedAt)}
            />
            <DetailRow
              label="Created at"
              value={formatDateTime(statement.createdAt)}
            />
            <DetailRow
              label="Last updated"
              value={formatDateTime(statement.updatedAt)}
            />
            <DetailRow label="Currency" value={statement.currency} />
            <DetailRow
              label="Generated file"
              value={
                statement.generatedFile?.originalFilename ?? "Not available"
              }
            />
            <DetailRow
              label="File size"
              value={formatFileSize(statement.generatedFile?.sizeBytes ?? null)}
            />
            <DetailRow
              label="Storage path"
              value={
                statement.generatedFile
                  ? `${statement.generatedFile.bucket}/${statement.generatedFile.storagePath}`
                  : "Not available"
              }
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Line item coverage
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Quick summary of how statement detail is populated for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              label="Items with barcode"
              value={
                statement.lineItems.filter((item) => Boolean(item.barcode))
                  .length
              }
            />
            <DetailRow
              label="Items with category"
              value={
                statement.lineItems.filter((item) => Boolean(item.category))
                  .length
              }
            />
            <DetailRow
              label="Items with notes"
              value={
                statement.lineItems.filter((item) => Boolean(item.notes)).length
              }
            />
            <DetailRow
              label="Items with commission"
              value={
                statement.lineItems.filter(
                  (item) => item.commissionAmount !== null,
                ).length
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Line items</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Reconciled detail rows used to produce this statement version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statement.lineItems.length > 0 ? (
            statement.lineItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
              >
                <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr] xl:items-start">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Barcode
                    </div>
                    <div className="text-sm font-medium text-white">
                      {item.barcode ?? "Not available"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Product name
                    </div>
                    <div className="text-sm text-white">
                      {item.productName ?? "Not available"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Category
                    </div>
                    <div className="text-sm text-slate-300">
                      {item.category ?? "Not available"}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Reconciled units
                    </div>
                    <div className="text-sm text-slate-300">
                      {formatNumber(item.reconciledUnits, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Unit price
                    </div>
                    <div className="text-sm text-slate-300">
                      {formatCurrency(item.unitPrice, statement.currency)}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Commission percent
                    </div>
                    <div className="text-sm text-slate-300">
                      {formatPercent(item.commissionPercent)}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Commission amount
                    </div>
                    <div className="text-sm font-medium text-white">
                      {formatCurrency(
                        item.commissionAmount,
                        statement.currency,
                      )}
                    </div>
                  </div>
                </div>

                {item.notes ? (
                  <div className="mt-4 rounded-xl border border-white/8 bg-slate-950/45 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Notes
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-300">
                      {item.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-6 text-sm leading-6 text-slate-400">
              No statement line items have been generated for this version yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function LpStatementDetailsPage({
  params,
}: {
  params: Promise<{ statementId: string }>;
}) {
  const { statementId } = await params;
  const state = await getLpStatementDetailsState(statementId);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.55),transparent_42%)]" />
        <div className="absolute left-[-10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.72)_0%,rgba(6,17,31,0.96)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            LP Statement Details
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Generated statement detail and line-item breakdown
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review one generated statement version, inspect reconciled line
              items, and verify the financial totals used in VendorStream
              statement output.
            </p>
          </div>
        </header>

        {state.kind === "missing" ? (
          <PageErrorState
            variant="missing"
            badgeLabel="Statement not found"
            title="No generated statement matched this identifier"
            description={
              <>
                The statement ID{" "}
                <span className="font-medium text-white">
                  {state.statementId}
                </span>{" "}
                is not available in the current LP context.
              </>
            }
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/statements">Back to statements</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "forbidden" ? (
          <PageErrorState
            variant="forbidden"
            title="You do not have access to this statement"
            description="This statement does not belong to an LP workspace in your current access scope."
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/statements">Back to statements</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "error" ? (
          <PageErrorState
            variant="error"
            badgeLabel="Statement unavailable"
            title="Statement details could not be loaded"
            description={state.message}
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/statements">Back to statements</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "ready" ? (
          <ReadyState statement={state.statement} />
        ) : null}
      </div>
    </main>
  );
}
