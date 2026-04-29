import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type StatementStatus } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { PageErrorState } from "@/components/page-error-state";
import { formatMonthLabel } from "@/lib/format";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StatementLineItemRow = {
  id: string;
  barcode: string | null;
  productName: string | null;
  category: string | null;
  reconciledUnits: number | null;
  unitPrice: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
  notes: string | null;
};

type StoreStatementDetailsState =
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
        totalSalesAmount: number | null;
        totalSalesUnits: number | null;
        totalCommissionAmount: number | null;
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

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function formatDateTime(date: Date | null) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toNumber(
  value: { toNumber?: () => number } | number | string | null | undefined,
) {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : typeof value.toNumber === "function"
          ? value.toNumber()
          : Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCurrency(
  value: { toNumber?: () => number } | number | string | null | undefined,
  currency: string,
) {
  const numericValue = toNumber(value);

  if (numericValue === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatNumber(
  value: { toNumber?: () => number } | number | string | null | undefined,
  maximumFractionDigits = 2,
) {
  const numericValue = toNumber(value);

  if (numericValue === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numericValue);
}

function formatPercent(
  value: { toNumber?: () => number } | number | string | null | undefined,
) {
  const numericValue = toNumber(value);

  if (numericValue === null) {
    return "N/A";
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericValue)}%`;
}

function formatBytes(sizeBytes: bigint | null) {
  if (sizeBytes === null) {
    return "Not available";
  }

  const asNumber = Number(sizeBytes);

  if (!Number.isFinite(asNumber)) {
    return `${sizeBytes.toString()} bytes`;
  }

  if (asNumber >= 1024 * 1024) {
    return `${(asNumber / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (asNumber >= 1024) {
    return `${Math.round(asNumber / 1024)} KB`;
  }

  return `${asNumber} bytes`;
}

function formatStatementStatus(status: StatementStatus) {
  return status.replaceAll("_", " ");
}

function getStatusTone(status: StatementStatus) {
  if (status === "FINAL") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
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

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
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

async function getStoreStatementDetailsState(
  statementId: string,
): Promise<StoreStatementDetailsState> {
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

    const context = await getStoreUploadContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const isAdmin = session.user.systemRole === "ADMIN";
    const allowedPairs = new Set(
      context.options.map(
        (option) => `${option.lpId}:${option.storeLocationId}`,
      ),
    );
    const pairKey = `${statement.cycle.lpId}:${statement.cycle.storeLocation.id}`;

    if (!isAdmin && !allowedPairs.has(pairKey)) {
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
        totalSalesAmount: toNumber(statement.totalSalesAmount),
        totalSalesUnits: toNumber(statement.totalSalesUnits),
        totalCommissionAmount: toNumber(statement.totalCommissionAmount),
        generatedAt: statement.generatedAt,
        createdAt: statement.createdAt,
        updatedAt: statement.updatedAt,
        generatedFile: statement.generatedFile
          ? {
              id: statement.generatedFile.id,
              originalFilename: statement.generatedFile.originalFilename,
              bucket: statement.generatedFile.bucket,
              storagePath: statement.generatedFile.storagePath,
              mimeType: statement.generatedFile.mimeType,
              sizeBytes: statement.generatedFile.sizeBytes,
              uploadedAt: statement.generatedFile.uploadedAt,
            }
          : null,
        lineItems: statement.lineItems.map((item) => ({
          id: item.id,
          barcode: item.barcode ?? item.reconciliationResult?.barcode ?? null,
          productName:
            item.productName ?? item.reconciliationResult?.productName ?? null,
          category:
            item.categoryKey ?? item.reconciliationResult?.categoryKey ?? null,
          reconciledUnits: toNumber(item.reconciledUnits),
          unitPrice: toNumber(item.unitPrice),
          commissionPercent: toNumber(item.commissionPercent),
          commissionAmount: toNumber(item.commissionAmount),
          notes: item.notes,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to load store statement details", error);

    return {
      kind: "error",
      message:
        "We could not load this store statement right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

export default async function StoreStatementDetailsPage({
  params,
}: {
  params: Promise<{ statementId: string }>;
}) {
  const { statementId } = await params;
  const state = await getStoreStatementDetailsState(statementId);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Statement Details
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Statement details
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review the full store-visible statement, including totals,
              generated file metadata, and reconciled line items.
            </p>
          </div>
        </header>

        {state.kind === "missing" ? (
          <PageErrorState
            variant="missing"
            badgeLabel="Statement not found"
            title="No store-visible statement matched this identifier"
            description={
              <>
                The statement ID{" "}
                <span className="font-medium text-white">
                  {state.statementId}
                </span>{" "}
                is not available in the current store workspace.
              </>
            }
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/store/statements">Back to statements</Link>
              </Button>
            }
          />
        ) : null}

        {state.kind === "forbidden" ? (
          <PageErrorState
            variant="forbidden"
            title="You do not have access to this statement"
            description="This statement does not belong to a store location in your current access scope."
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/store/statements">Back to statements</Link>
              </Button>
            }
          />
        ) : null}

        {state.kind === "error" ? (
          <PageErrorState
            variant="error"
            badgeLabel="Statement unavailable"
            title="Store statement details could not be loaded"
            description={state.message}
            actions={
              <>
                <Button
                  asChild
                  className="bg-white text-slate-950 hover:bg-slate-100"
                >
                  <Link href="/store/statements">Back to statements</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  <Link href="/store/dashboard">Back to store dashboard</Link>
                </Button>
              </>
            }
          />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                      {formatMonth(state.statement.month)}
                    </div>
                    <StatusBadge
                      label={formatStatementStatus(state.statement.status)}
                      className={getStatusTone(state.statement.status)}
                    />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-3xl text-white">
                      {state.statement.lpName} ·{" "}
                      {state.statement.storeLocationName}
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Statement version v{state.statement.version} for{" "}
                      {state.statement.storeOrganizationName}.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="LP" value={state.statement.lpName} />
                  <DetailRow
                    label="Store organization"
                    value={state.statement.storeOrganizationName}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.statement.storeLocationName}
                  />
                  <DetailRow
                    label="Month"
                    value={formatMonth(state.statement.month)}
                  />
                  <DetailRow
                    label="Version"
                    value={`v${state.statement.version}`}
                  />
                  <DetailRow
                    label="Status"
                    value={
                      <StatusBadge
                        label={formatStatementStatus(state.statement.status)}
                        className={getStatusTone(state.statement.status)}
                      />
                    }
                  />
                  <DetailRow
                    label="Generated at"
                    value={formatDateTime(state.statement.generatedAt)}
                  />
                  <DetailRow
                    label="Last updated"
                    value={formatDateTime(state.statement.updatedAt)}
                  />
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">Actions</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Continue from this statement into the related cycle or
                    statement history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DetailRow label="Statement ID" value={state.statement.id} />
                  <DetailRow
                    label="Cycle"
                    value={
                      <Link
                        href={`/store/cycles/${state.statement.cycleId}`}
                        className="text-cyan-200 hover:text-cyan-100"
                      >
                        Open related cycle
                      </Link>
                    }
                  />
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      asChild
                      className="bg-white text-slate-950 hover:bg-slate-100"
                    >
                      <Link href="/store/statements">Back to statements</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Link href={`/store/cycles/${state.statement.cycleId}`}>
                        Go to related cycle
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total Sales"
                value={formatCurrency(
                  state.statement.totalSalesAmount,
                  state.statement.currency,
                )}
                detail="Aggregate reconciled sales amount carried by this statement version."
                tone="neutral"
              />
              <SummaryCard
                label="Commission Total"
                value={formatCurrency(
                  state.statement.totalCommissionAmount,
                  state.statement.currency,
                )}
                detail="Total commission amount calculated across all included line items."
                tone="success"
              />
              <SummaryCard
                label="Reconciled Units"
                value={
                  state.statement.totalSalesUnits !== null
                    ? formatNumber(state.statement.totalSalesUnits, 2)
                    : formatNumber(
                        state.statement.lineItems.reduce(
                          (total, item) => total + (item.reconciledUnits ?? 0),
                          0,
                        ),
                        2,
                      )
                }
                detail="Reconciled units included in the current statement scope."
                tone="neutral"
              />
              <SummaryCard
                label="Line Items"
                value={String(state.statement.lineItems.length)}
                detail="Detailed reconciled rows included in this statement version."
                tone="warning"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Download / open file
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Generated statement file metadata for the current version.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DetailRow
                    label="File name"
                    value={
                      state.statement.generatedFile?.originalFilename ??
                      "No generated file linked"
                    }
                  />
                  <DetailRow
                    label="Uploaded at"
                    value={formatDateTime(
                      state.statement.generatedFile?.uploadedAt ?? null,
                    )}
                  />
                  <DetailRow
                    label="Size"
                    value={formatBytes(
                      state.statement.generatedFile?.sizeBytes ?? null,
                    )}
                  />
                  <DetailRow
                    label="MIME type"
                    value={
                      state.statement.generatedFile?.mimeType ?? "Not available"
                    }
                  />
                  <DetailRow
                    label="Bucket"
                    value={
                      state.statement.generatedFile?.bucket ?? "Not available"
                    }
                  />
                  <DetailRow
                    label="Storage path"
                    value={
                      state.statement.generatedFile?.storagePath ??
                      "Not available"
                    }
                  />
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                    {state.statement.generatedFile
                      ? "A generated file is linked and can be downloaded via a short-lived signed URL."
                      : "This statement does not have a generated file attached yet."}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      asChild={Boolean(state.statement.generatedFile)}
                      disabled={!state.statement.generatedFile}
                      className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                    >
                      {state.statement.generatedFile ? (
                        <Link
                          href={`/api/statements/${state.statement.id}/download`}
                        >
                          Download statement file
                        </Link>
                      ) : (
                        <span>Download statement file</span>
                      )}
                    </Button>
                    <Button
                      asChild={Boolean(state.statement.generatedFile)}
                      variant="outline"
                      disabled={!state.statement.generatedFile}
                      className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                    >
                      {state.statement.generatedFile ? (
                        <Link
                          href={`/api/statements/${state.statement.id}/download`}
                        >
                          Open file
                        </Link>
                      ) : (
                        <span>Open file</span>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Statement context
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Operational metadata tied to this generated statement
                    version.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <DetailRow
                    label="Currency"
                    value={state.statement.currency}
                  />
                  <DetailRow
                    label="Created at"
                    value={formatDateTime(state.statement.createdAt)}
                  />
                  <DetailRow
                    label="Generated at"
                    value={formatDateTime(state.statement.generatedAt)}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.statement.storeLocationName}
                  />
                  <DetailRow
                    label="Store organization"
                    value={state.statement.storeOrganizationName}
                  />
                  <DetailRow
                    label="Related cycle"
                    value={
                      <Link
                        href={`/store/cycles/${state.statement.cycleId}`}
                        className="text-cyan-200 hover:text-cyan-100"
                      >
                        {state.statement.cycleId}
                      </Link>
                    }
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Statement line items
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Reconciled line-item detail included in this statement
                  version.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {state.statement.lineItems.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="border-b border-white/8 bg-white/5">
                        <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          <th className="px-4 py-3 font-medium">Barcode</th>
                          <th className="px-4 py-3 font-medium">
                            Product name
                          </th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">
                            Reconciled units
                          </th>
                          <th className="px-4 py-3 font-medium">Unit price</th>
                          <th className="px-4 py-3 font-medium">
                            Commission percent
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Commission amount
                          </th>
                          <th className="px-4 py-3 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.statement.lineItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-white/8 last:border-b-0"
                          >
                            <td className="px-4 py-4 text-sm font-medium text-white">
                              {item.barcode ?? "Not available"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {item.productName ?? "Not available"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {item.category ?? "Not available"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatNumber(item.reconciledUnits, 2)}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatCurrency(
                                item.unitPrice,
                                state.statement.currency,
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatPercent(item.commissionPercent)}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatCurrency(
                                item.commissionAmount,
                                state.statement.currency,
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {item.notes ?? "No notes"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No statement line items have been generated yet for this
                    statement version.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}
