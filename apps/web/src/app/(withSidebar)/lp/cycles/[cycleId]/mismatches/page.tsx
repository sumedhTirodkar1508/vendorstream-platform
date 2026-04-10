import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MismatchType =
  | "MISSING_COUNTERPART"
  | "FIELD_DIFFERENCE"
  | "DUPLICATE_ROW"
  | "BARCODE_NORMALIZATION"
  | "PRICE_RULE";

type MismatchStatus = "OPEN" | "RESOLVED" | "WAIVED";
type ResolutionAction =
  | "Accept LP"
  | "Accept Store"
  | "Manual Override"
  | "Waive"
  | "Comment";
type ReviewTab = "open" | "resolved" | "waived";

type MismatchRow = {
  id: string;
  mismatchType: MismatchType;
  status: MismatchStatus;
  fieldName: string;
  message: string;
  barcode: string | null;
  productName: string | null;
  lpValue: string | null;
  storeValue: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  comments: string[];
  resolutionSummary: string | null;
  availableActions: ResolutionAction[];
};

type CycleMismatchState =
  | {
      kind: "ready";
      cycle: {
        id: string;
        lpName: string;
        storeOrganization: string;
        storeLocation: string;
        month: string;
        cycleStatus: string;
      };
      activeTab: ReviewTab;
      mismatches: MismatchRow[];
      selectedMismatch: MismatchRow | null;
      counts: Record<ReviewTab, number>;
    }
  | {
      kind: "empty";
      cycle: {
        id: string;
        lpName: string;
        storeOrganization: string;
        storeLocation: string;
        month: string;
        cycleStatus: string;
      };
      activeTab: ReviewTab;
      counts: Record<ReviewTab, number>;
    }
  | {
      kind: "missing";
      cycleId: string;
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockCycleMismatchData = {
  cycle_apr_downtown: {
    cycle: {
      id: "cycle_apr_downtown",
      lpName: "Northstar Beverage Group",
      storeOrganization: "Maple Retail Group",
      storeLocation: "Toronto Downtown",
      month: "2026-04",
      cycleStatus: "MISMATCHES_FOUND",
    },
    mismatches: [
      {
        id: "mm_001",
        mismatchType: "MISSING_COUNTERPART",
        status: "OPEN",
        fieldName: "sales_units",
        message:
          "LP row exists but no matching store counterpart row was found.",
        barcode: "0062811045123",
        productName: "Northstar Lager 473ml",
        lpValue: "24",
        storeValue: null,
        resolvedBy: null,
        resolvedAt: null,
        comments: [
          "Counterpart row may be missing due to store-side barcode alias handling.",
        ],
        resolutionSummary: null,
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
      {
        id: "mm_002",
        mismatchType: "FIELD_DIFFERENCE",
        status: "OPEN",
        fieldName: "net_sales",
        message: "LP and store values differ outside configured tolerance.",
        barcode: "0062811045981",
        productName: "Northstar IPA 355ml",
        lpValue: "$1,426.17",
        storeValue: "$1,399.44",
        resolvedBy: null,
        resolvedAt: null,
        comments: ["Review monthly discount treatment before resolution."],
        resolutionSummary: null,
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
      {
        id: "mm_003",
        mismatchType: "BARCODE_NORMALIZATION",
        status: "OPEN",
        fieldName: "barcode",
        message: "Barcode normalization produced multiple possible matches.",
        barcode: "628110478001",
        productName: "Northstar Citrus Ale",
        lpValue: "628110478001",
        storeValue: "00628110478001",
        resolvedBy: null,
        resolvedAt: null,
        comments: [
          "Store workbook used a padded UPC variant; verify canonical barcode.",
        ],
        resolutionSummary: null,
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
      {
        id: "mm_004",
        mismatchType: "DUPLICATE_ROW",
        status: "RESOLVED",
        fieldName: "row_identity",
        message: "Duplicate LP row was detected during normalization.",
        barcode: "0062811034102",
        productName: "Northstar Pilsner 6-pack",
        lpValue: "2 duplicate rows",
        storeValue: "1 matched row",
        resolvedBy: "Avery Chen",
        resolvedAt: "Apr 9, 2026 03:12 PM",
        comments: ["Resolved by keeping the latest LP export row."],
        resolutionSummary:
          "Accepted LP latest row and closed duplicate exception.",
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
      {
        id: "mm_005",
        mismatchType: "PRICE_RULE",
        status: "WAIVED",
        fieldName: "per_unit_price",
        message: "Fallback pricing formula produced a non-blocking variance.",
        barcode: "0062811047609",
        productName: "Northstar Session Ale",
        lpValue: "$2.19",
        storeValue: "$2.17",
        resolvedBy: "Jordan Patel",
        resolvedAt: "Apr 9, 2026 09:48 AM",
        comments: ["Waived per monthly pricing exception policy."],
        resolutionSummary: "Waived after policy review; no statement impact.",
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
      {
        id: "mm_006",
        mismatchType: "FIELD_DIFFERENCE",
        status: "RESOLVED",
        fieldName: "sales_units",
        message:
          "Unit count mismatch was resolved after store-side correction.",
        barcode: "0062811047129",
        productName: "Northstar Amber Ale",
        lpValue: "18",
        storeValue: "16",
        resolvedBy: "Dana Brooks",
        resolvedAt: "Apr 9, 2026 11:05 AM",
        comments: [
          "Store accepted LP count after audit against source invoices.",
        ],
        resolutionSummary: "Accepted LP units and synced store-side value.",
        availableActions: [
          "Accept LP",
          "Accept Store",
          "Manual Override",
          "Waive",
          "Comment",
        ],
      },
    ] satisfies MismatchRow[],
  },
  cycle_mar_mississauga: {
    cycle: {
      id: "cycle_mar_mississauga",
      lpName: "Northstar Beverage Group",
      storeOrganization: "Summit Stores",
      storeLocation: "Mississauga Central",
      month: "2026-03",
      cycleStatus: "STATEMENT_READY",
    },
    mismatches: [] satisfies MismatchRow[],
  },
} as const;

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function normalizeTab(value: string | undefined): ReviewTab {
  if (value === "resolved" || value === "waived") {
    return value;
  }

  return "open";
}

function buildTabHref(
  cycleId: string,
  tab: ReviewTab,
  mismatchId?: string | null,
) {
  const params = new URLSearchParams();
  params.set("view", tab);

  if (mismatchId) {
    params.set("mismatchId", mismatchId);
  }

  return `/lp/cycles/${cycleId}/mismatches?${params.toString()}`;
}

function formatMismatchType(value: MismatchType) {
  return value.replaceAll("_", " ");
}

function getStatusTone(status: MismatchStatus) {
  if (status === "RESOLVED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "WAIVED") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getTypeTone(type: MismatchType) {
  if (type === "FIELD_DIFFERENCE" || type === "PRICE_RULE") {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  }

  if (type === "MISSING_COUNTERPART" || type === "DUPLICATE_ROW") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

async function getCycleMismatchState(
  cycleId: string,
  searchParams?: {
    view?: string;
    mismatchId?: string;
  },
): Promise<CycleMismatchState> {
  const mockMode = process.env.MOCK_LP_CYCLE_MISMATCHES_STATE;
  const activeTab = normalizeTab(searchParams?.view);

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load mismatch review data right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const cycleRecord =
    mockCycleMismatchData[cycleId as keyof typeof mockCycleMismatchData];

  if (!cycleRecord) {
    return {
      kind: "missing",
      cycleId,
    };
  }

  const counts: Record<ReviewTab, number> = {
    open: cycleRecord.mismatches.filter((entry) => entry.status === "OPEN")
      .length,
    resolved: cycleRecord.mismatches.filter(
      (entry) => entry.status === "RESOLVED",
    ).length,
    waived: cycleRecord.mismatches.filter((entry) => entry.status === "WAIVED")
      .length,
  };

  const filteredMismatches = cycleRecord.mismatches.filter((entry) => {
    if (activeTab === "resolved") {
      return entry.status === "RESOLVED";
    }

    if (activeTab === "waived") {
      return entry.status === "WAIVED";
    }

    return entry.status === "OPEN";
  });

  if (filteredMismatches.length === 0) {
    return {
      kind: "empty",
      cycle: cycleRecord.cycle,
      activeTab,
      counts,
    };
  }

  const selectedMismatch =
    filteredMismatches.find((entry) => entry.id === searchParams?.mismatchId) ??
    filteredMismatches[0] ??
    null;

  return {
    kind: "ready",
    cycle: cycleRecord.cycle,
    activeTab,
    mismatches: filteredMismatches,
    selectedMismatch,
    counts,
  };
}

function Badge({ label, className }: { label: string; className: string }) {
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

function LoadingState() {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-10 w-72 animate-pulse rounded bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-white/8" />
          <div className="h-12 animate-pulse rounded-xl bg-white/8" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-8 w-64 animate-pulse rounded bg-white/10" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-2xl bg-white/8"
              />
            ))}
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-xl bg-white/8"
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Mismatch review unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Cycle mismatches could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Return to cycles</Link>
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

function MissingState({ cycleId }: { cycleId: string }) {
  return (
    <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          Cycle not found
        </div>
        <CardTitle className="text-2xl text-white">
          No mismatch review data is available for this cycle
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-amber-100/90">
          The cycle ID <span className="font-medium text-white">{cycleId}</span>{" "}
          does not match a cycle in the current LP context.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Return to cycles</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  cycle,
  activeTab,
  counts,
}: Extract<CycleMismatchState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            {cycle.lpName} · {cycle.storeLocation}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {cycle.storeOrganization} · {formatMonthLabel(cycle.month)} ·{" "}
            {cycle.cycleStatus.replaceAll("_", " ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {(["open", "resolved", "waived"] as ReviewTab[]).map((tab) => (
            <Button
              key={tab}
              asChild
              variant={activeTab === tab ? "default" : "outline"}
              className={
                activeTab === tab
                  ? "bg-white text-slate-950 hover:bg-slate-100"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10"
              }
            >
              <Link href={buildTabHref(cycle.id, tab)}>
                {tab[0]?.toUpperCase()}
                {tab.slice(1)} ({counts[tab]})
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No mismatches in this view
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            There are no {activeTab} mismatches for this reconciliation cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
            <Link href={`/lp/cycles/${cycle.id}`}>Back to cycle details</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href={`/lp/cycles/${cycle.id}/mismatches?view=open`}>
              View open mismatches
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadyState({
  cycle,
  activeTab,
  mismatches,
  selectedMismatch,
  counts,
}: Extract<CycleMismatchState, { kind: "ready" }>) {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
            VendorStream
          </div>
          <CardTitle className="text-3xl text-white">
            {cycle.lpName} · {cycle.storeLocation}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Review mismatches for {cycle.storeOrganization} in{" "}
            {formatMonthLabel(cycle.month)}. Use the filtered queue and details
            panel to prepare LP-side resolution decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <DetailRow
            label="Cycle status"
            value={cycle.cycleStatus.replaceAll("_", " ")}
          />
          <DetailRow label="Open" value={counts.open} />
          <DetailRow label="Resolved" value={counts.resolved} />
          <DetailRow label="Waived" value={counts.waived} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {(["open", "resolved", "waived"] as ReviewTab[]).map((tab) => (
          <Button
            key={tab}
            asChild
            variant={activeTab === tab ? "default" : "outline"}
            className={
              activeTab === tab
                ? "bg-white text-slate-950 hover:bg-slate-100"
                : "border-white/15 bg-white/5 text-white hover:bg-white/10"
            }
          >
            <Link href={buildTabHref(cycle.id, tab, selectedMismatch?.id)}>
              {tab[0]?.toUpperCase()}
              {tab.slice(1)} ({counts[tab]})
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Mismatch queue</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Filtered mismatch list for this cycle. Select an item to inspect
              barcode, source values, and placeholder resolution actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mismatches.map((mismatch) => {
              const isSelected = mismatch.id === selectedMismatch?.id;

              return (
                <div
                  key={mismatch.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    isSelected
                      ? "border-cyan-400/30 bg-cyan-400/10"
                      : "border-white/8 bg-slate-950/35"
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr_0.8fr_1.2fr_1fr_0.8fr_0.8fr_auto] xl:items-start">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Mismatch type
                      </div>
                      <Badge
                        label={formatMismatchType(mismatch.mismatchType)}
                        className={getTypeTone(mismatch.mismatchType)}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Status
                      </div>
                      <Badge
                        label={mismatch.status}
                        className={getStatusTone(mismatch.status)}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Field name
                      </div>
                      <div className="text-sm text-white">
                        {mismatch.fieldName}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Message
                      </div>
                      <div className="text-sm leading-6 text-slate-300">
                        {mismatch.message}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Related barcode / product
                      </div>
                      <div className="text-sm text-slate-300">
                        {mismatch.barcode ?? "N/A"}
                      </div>
                      <div className="text-sm text-white">
                        {mismatch.productName ?? "No product linked"}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Resolved by
                      </div>
                      <div className="text-sm text-slate-300">
                        {mismatch.resolvedBy ?? "Pending"}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Resolved at
                      </div>
                      <div className="text-sm text-slate-300">
                        {mismatch.resolvedAt ?? "Pending"}
                      </div>
                    </div>

                    <div className="flex justify-start xl:justify-end">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Link
                          href={buildTabHref(cycle.id, activeTab, mismatch.id)}
                        >
                          Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Details panel</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Review field-level context and prepare a future resolution action.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedMismatch ? (
              <>
                <DetailRow
                  label="Mismatch type"
                  value={
                    <Badge
                      label={formatMismatchType(selectedMismatch.mismatchType)}
                      className={getTypeTone(selectedMismatch.mismatchType)}
                    />
                  }
                />
                <DetailRow
                  label="Status"
                  value={
                    <Badge
                      label={selectedMismatch.status}
                      className={getStatusTone(selectedMismatch.status)}
                    />
                  }
                />
                <DetailRow
                  label="Field name"
                  value={selectedMismatch.fieldName}
                />
                <DetailRow
                  label="Barcode"
                  value={selectedMismatch.barcode ?? "Not available"}
                />
                <DetailRow
                  label="Product"
                  value={selectedMismatch.productName ?? "Not available"}
                />
                <DetailRow
                  label="LP value"
                  value={selectedMismatch.lpValue ?? "Not available"}
                />
                <DetailRow
                  label="Store value"
                  value={selectedMismatch.storeValue ?? "Not available"}
                />

                <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                  <div className="text-sm text-slate-400">Message</div>
                  <div className="mt-1 text-sm leading-6 text-white">
                    {selectedMismatch.message}
                  </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                  <div className="text-sm text-slate-400">Comments</div>
                  <div className="mt-2 space-y-2">
                    {selectedMismatch.comments.length > 0 ? (
                      selectedMismatch.comments.map((comment) => (
                        <div
                          key={comment}
                          className="text-sm leading-6 text-white"
                        >
                          {comment}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-300">
                        No comments recorded yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                  <div className="text-sm text-slate-400">
                    Resolution summary
                  </div>
                  <div className="mt-1 text-sm leading-6 text-white">
                    {selectedMismatch.resolutionSummary ??
                      "No resolution has been recorded for this mismatch."}
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-dashed border-white/15 bg-slate-950/25 px-4 py-4">
                  <div className="text-sm font-medium text-white">
                    Placeholder resolution actions
                  </div>
                  <div className="grid gap-2">
                    {selectedMismatch.availableActions.map((action) => (
                      <Button
                        key={action}
                        type="button"
                        variant="outline"
                        disabled
                        className="justify-start border-white/15 bg-white/5 text-white disabled:opacity-70"
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs leading-5 text-slate-400">
                    These actions are placeholders until the mismatch resolution
                    API and audit logging flow are connected.
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-6 text-sm text-slate-300">
                Select a mismatch to view details.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function LpCycleMismatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<{
    view?: string;
    mismatchId?: string;
  }>;
}) {
  const { cycleId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getCycleMismatchState(cycleId, resolvedSearchParams);

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
            LP Mismatch Review
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Reconciliation mismatch operations
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review cycle-level mismatches, inspect field comparisons, and
              prepare resolution decisions for LP-side reconciliation workflows.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "missing" ? (
          <MissingState cycleId={state.cycleId} />
        ) : null}
        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            cycle={state.cycle}
            activeTab={state.activeTab}
            counts={state.counts}
          />
        ) : null}
        {state.kind === "ready" ? (
          <ReadyState
            kind="ready"
            cycle={state.cycle}
            activeTab={state.activeTab}
            mismatches={state.mismatches}
            selectedMismatch={state.selectedMismatch}
            counts={state.counts}
          />
        ) : null}
      </div>
    </main>
  );
}
