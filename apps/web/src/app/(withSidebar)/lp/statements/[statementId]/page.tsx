import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StatementStatus = "DRAFT" | "FINAL" | "FAILED";

type StatementLineItem = {
  id: string;
  barcode: string;
  productName: string;
  category: string;
  reconciledUnits: number;
  unitPrice: number;
  commissionPercent: number;
  commissionAmount: number;
};

type StatementDetail = {
  id: string;
  cycleId: string;
  lpName: string;
  storeOrganization: string;
  storeLocation: string;
  month: string;
  version: number;
  status: StatementStatus;
  generatedAt: string;
  fileName: string | null;
  totals: {
    totalSalesAmount: number;
    totalCommissionAmount: number;
    totalUnits: number;
    lineItemCount: number;
  };
  lineItems: StatementLineItem[];
};

type StatementDetailsState =
  | {
      kind: "ready";
      statement: StatementDetail;
    }
  | {
      kind: "missing";
      statementId: string;
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockStatements: StatementDetail[] = [
  {
    id: "stmt_apr_downtown_v2",
    cycleId: "cycle_apr_downtown",
    lpName: "Northstar Beverage Group",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Downtown",
    month: "2026-04",
    version: 2,
    status: "FINAL",
    generatedAt: "Apr 10, 2026 09:18 AM",
    fileName: "statement_apr_2026_toronto_downtown_v2.pdf",
    totals: {
      totalSalesAmount: 21452.19,
      totalCommissionAmount: 2788.64,
      totalUnits: 9358,
      lineItemCount: 5,
    },
    lineItems: [
      {
        id: "line_001",
        barcode: "0062811045123",
        productName: "Northstar Lager 473ml",
        category: "Beer",
        reconciledUnits: 2210,
        unitPrice: 2.49,
        commissionPercent: 13.2,
        commissionAmount: 726.99,
      },
      {
        id: "line_002",
        barcode: "0062811045981",
        productName: "Northstar IPA 355ml",
        category: "Beer",
        reconciledUnits: 1890,
        unitPrice: 2.71,
        commissionPercent: 12.9,
        commissionAmount: 661.25,
      },
      {
        id: "line_003",
        barcode: "0062811047609",
        productName: "Northstar Session Ale",
        category: "Beer",
        reconciledUnits: 1548,
        unitPrice: 2.17,
        commissionPercent: 12.5,
        commissionAmount: 419.90,
      },
      {
        id: "line_004",
        barcode: "0062811047129",
        productName: "Northstar Amber Ale",
        category: "Beer",
        reconciledUnits: 1736,
        unitPrice: 2.39,
        commissionPercent: 13.4,
        commissionAmount: 555.60,
      },
      {
        id: "line_005",
        barcode: "0062811034102",
        productName: "Northstar Pilsner 6-pack",
        category: "Multipack",
        reconciledUnits: 1974,
        unitPrice: 3.62,
        commissionPercent: 13.7,
        commissionAmount: 424.90,
      },
    ],
  },
  {
    id: "stmt_mar_mississauga_v3",
    cycleId: "cycle_mar_mississauga",
    lpName: "Northstar Beverage Group",
    storeOrganization: "Summit Stores",
    storeLocation: "Mississauga Central",
    month: "2026-03",
    version: 3,
    status: "FINAL",
    generatedAt: "Apr 3, 2026 02:16 PM",
    fileName: "statement_mar_2026_mississauga_central_v3.pdf",
    totals: {
      totalSalesAmount: 19874.54,
      totalCommissionAmount: 2571.83,
      totalUnits: 8611,
      lineItemCount: 4,
    },
    lineItems: [
      {
        id: "line_101",
        barcode: "0062811045123",
        productName: "Northstar Lager 473ml",
        category: "Beer",
        reconciledUnits: 2144,
        unitPrice: 2.44,
        commissionPercent: 13.0,
        commissionAmount: 680.14,
      },
      {
        id: "line_102",
        barcode: "0062811045981",
        productName: "Northstar IPA 355ml",
        category: "Beer",
        reconciledUnits: 1828,
        unitPrice: 2.68,
        commissionPercent: 12.8,
        commissionAmount: 626.90,
      },
      {
        id: "line_103",
        barcode: "00628110478001",
        productName: "Northstar Citrus Ale",
        category: "Beer",
        reconciledUnits: 2086,
        unitPrice: 2.22,
        commissionPercent: 12.7,
        commissionAmount: 588.11,
      },
      {
        id: "line_104",
        barcode: "0062811034102",
        productName: "Northstar Pilsner 6-pack",
        category: "Multipack",
        reconciledUnits: 2553,
        unitPrice: 3.42,
        commissionPercent: 13.2,
        commissionAmount: 676.68,
      },
    ],
  },
];

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

async function getStatementDetailsState(
  statementId: string,
): Promise<StatementDetailsState> {
  const mockMode = process.env.MOCK_LP_STATEMENT_DETAILS_STATE;

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load this statement right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const statement = mockStatements.find((entry) => entry.id === statementId);

  if (!statement) {
    return {
      kind: "missing",
      statementId,
    };
  }

  return {
    kind: "ready",
    statement,
  };
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

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        {[0, 1].map((item) => (
          <Card
            key={item}
            className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
          >
            <CardHeader className="space-y-3">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-64 animate-pulse rounded bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/6"
          />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-5 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-2xl bg-white/8"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Statement unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Statement details could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/statements">Return to statements</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MissingState({ statementId }: { statementId: string }) {
  return (
    <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          Statement not found
        </div>
        <CardTitle className="text-2xl text-white">
          No generated statement matched this identifier
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-amber-100/90">
          The statement ID{" "}
          <span className="font-medium text-white">{statementId}</span> is not
          available in the current LP context.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/statements">Return to statements</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReadyState({ statement }: { statement: StatementDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
              VendorStream
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl text-white">
                {statement.lpName} · {statement.storeLocation}
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                Detailed statement view for {statement.storeOrganization} in{" "}
                {formatMonthLabel(statement.month)}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="LP" value={statement.lpName} />
            <DetailRow
              label="Store organization"
              value={statement.storeOrganization}
            />
            <DetailRow label="Store location" value={statement.storeLocation} />
            <DetailRow label="Month" value={formatMonthLabel(statement.month)} />
            <DetailRow label="Version" value={`v${statement.version}`} />
            <DetailRow
              label="Status"
              value={
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(statement.status)}`}
                >
                  {statement.status}
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Controls</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Quick actions for navigating and exporting this statement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Generated at" value={statement.generatedAt} />
            <DetailRow
              label="Download file"
              value={statement.fileName ?? "Pending file generation"}
            />
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link href="/lp/statements">Back to statements</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!statement.fileName}
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
              >
                Download file
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Sales"
          value={formatCurrency(statement.totals.totalSalesAmount)}
          detail="Aggregate reconciled sales amount for this statement version."
          tone="neutral"
        />
        <SummaryCard
          label="Commission Total"
          value={formatCurrency(statement.totals.totalCommissionAmount)}
          detail="Aggregate commission amount calculated across all line items."
          tone="success"
        />
        <SummaryCard
          label="Reconciled Units"
          value={String(statement.totals.totalUnits)}
          detail="Total reconciled units carried into this statement version."
          tone="neutral"
        />
        <SummaryCard
          label="Line Items"
          value={String(statement.totals.lineItemCount)}
          detail="Unique reconciled statement rows included in the detail table."
          tone="warning"
        />
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Line items</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Reconciled line-item detail used to produce this statement version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statement.lineItems.map((item) => (
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
                    {item.barcode}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Product name
                  </div>
                  <div className="text-sm text-white">{item.productName}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Category
                  </div>
                  <div className="text-sm text-slate-300">{item.category}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Reconciled units
                  </div>
                  <div className="text-sm text-slate-300">
                    {item.reconciledUnits}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Unit price
                  </div>
                  <div className="text-sm text-slate-300">
                    {formatCurrency(item.unitPrice)}
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
                    {formatCurrency(item.commissionAmount)}
                  </div>
                </div>
              </div>
            </div>
          ))}
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
  const state = await getStatementDetailsState(statementId);

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
              Review one generated statement version, inspect reconciled line items,
              and verify the financial totals used for downstream finance workflows.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "missing" ? (
          <MissingState statementId={state.statementId} />
        ) : null}
        {state.kind === "ready" ? <ReadyState statement={state.statement} /> : null}
      </div>
    </main>
  );
}
