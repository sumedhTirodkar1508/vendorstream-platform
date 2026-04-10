import Link from "next/link";
import CommonNavbar from "@/components/commonNavbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    title: "Secure monthly file ingestion",
    description:
      "Upload LP and store spreadsheets with a structured monthly workflow designed for operational teams.",
  },
  {
    title: "Automated reconciliation",
    description:
      "Normalize data, compare LP and store records, and surface discrepancies before they become statement problems.",
  },
  {
    title: "Collaborative mismatch resolution",
    description:
      "Let LP teams, store organizations, and admins review and resolve mismatches in one shared system.",
  },
  {
    title: "Statement generation",
    description:
      "Generate settlement-ready monthly statements once reconciliation passes and required data is complete.",
  },
  {
    title: "Auditability and traceability",
    description:
      "Preserve file history, processing states, and decision trails for finance, operations, and compliance.",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "LP uploads monthly file",
    description:
      "Licensed Producer users upload their monthly spreadsheet for the selected reporting month.",
  },
  {
    step: "02",
    title: "Store uploads matching file",
    description:
      "Store Organization users select LP, store location, and month, then upload their matching file.",
  },
  {
    step: "03",
    title: "VendorStream validates and reconciles",
    description:
      "The platform validates structure, normalizes rows, compares records, and flags mismatches for review.",
  },
  {
    step: "04",
    title: "Statements are generated",
    description:
      "Once reconciliation passes, VendorStream prepares statement-ready outputs for the month.",
  },
];

const roleCards = [
  {
    title: "For LP teams",
    description:
      "Track uploads, monitor monthly cycle status, review mismatches, and access generated statements.",
  },
  {
    title: "For Store Organizations",
    description:
      "Submit store-side files, resolve mismatches collaboratively, and maintain clean monthly reporting.",
  },
  {
    title: "For Admin, Finance, and Operations",
    description:
      "Manage access, assignments, business rules, and system-wide visibility across reconciliation activity.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#020015] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_0%,rgba(99,102,241,0.24),rgba(2,0,21,0)_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_15%_25%,rgba(236,72,153,0.14),rgba(2,0,21,0)_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_85%_20%,rgba(34,211,238,0.12),rgba(2,0,21,0)_60%)]" />
      </div>

      <div className="relative z-10">
        <CommonNavbar />

        <main>
          <section className="mx-auto flex min-h-[88vh] w-full max-w-7xl flex-col items-center justify-center px-6 pt-28 pb-20 text-center sm:px-8 lg:px-10">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1 text-sm text-white/75 backdrop-blur-md">
              VendorStream for LP and Store Reconciliation
            </div>

            <h1 className="mt-8 max-w-5xl text-5xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
              Monthly reconciliation without spreadsheet chaos.
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-7 text-white/70 sm:text-lg">
              VendorStream helps Licensed Producers and Store Organizations
              upload, validate, reconcile, and resolve monthly spreadsheet data
              before generating statement-ready outputs.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                className="rounded-full border border-white bg-white px-8 text-black hover:bg-white/90"
              >
                <Link href="/signup">Request Access</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 px-8 text-white hover:bg-white/10"
              >
                <Link href="/login">Sign In</Link>
              </Button>
            </div>

            <div className="mt-16 grid w-full max-w-6xl gap-4 md:grid-cols-3">
              <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
                <CardContent className="p-6 text-left">
                  <p className="text-sm text-white/50">Designed for</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Operations and Finance Teams
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
                <CardContent className="p-6 text-left">
                  <p className="text-sm text-white/50">Handles</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Monthly LP and Store Uploads
                  </p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
                <CardContent className="p-6 text-left">
                  <p className="text-sm text-white/50">Built for</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    Traceability and Statement Accuracy
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.22em] text-white/45">
                The problem
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                Spreadsheet-based monthly reconciliation is slow, fragile, and
                difficult to audit.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">
                When LP and store teams exchange spreadsheets manually, the
                process quickly breaks down. File versions drift, rows do not
                match, prices become hard to verify, and statement generation
                turns into a manual investigation. VendorStream creates a single
                controlled workflow for ingestion, validation, reconciliation,
                and review.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-12">
              <div className="max-w-3xl">
                <p className="text-sm uppercase tracking-[0.22em] text-white/45">
                  How it works
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                  A structured monthly flow from upload to statement.
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                {workflowSteps.map((item) => (
                  <Card
                    key={item.step}
                    className="border-white/10 bg-white/5 backdrop-blur-xl"
                  >
                    <CardContent className="p-6">
                      <div className="text-sm font-medium text-cyan-300">
                        {item.step}
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-white/65">
                        {item.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.22em] text-white/45">
                Capabilities
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                Built for operational control, not manual cleanup.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="border-white/10 bg-white/5 backdrop-blur-xl"
                >
                  <CardContent className="p-6">
                    <h3 className="text-xl font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/65">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.22em] text-white/45">
                Who it is for
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                One system for everyone involved in the monthly cycle.
              </h2>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {roleCards.map((card) => (
                <Card
                  key={card.title}
                  className="border-white/10 bg-white/5 backdrop-blur-xl"
                >
                  <CardContent className="p-6">
                    <h3 className="text-xl font-semibold text-white">
                      {card.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/65">
                      {card.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
            <Card className="border-white/10 bg-white/5 backdrop-blur-xl">
              <CardContent className="flex flex-col items-start justify-between gap-8 p-8 md:flex-row md:items-center md:p-10">
                <div className="max-w-2xl">
                  <p className="text-sm uppercase tracking-[0.22em] text-white/45">
                    Get started
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                    Bring your monthly reconciliation workflow into one system.
                  </h2>
                  <p className="mt-4 text-base leading-7 text-white/65">
                    Request access for your team or sign in if your organization
                    is already onboarded.
                  </p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <Button
                    asChild
                    className="rounded-full border border-white bg-white px-8 text-black hover:bg-white/90"
                  >
                    <Link href="/signup">Request Access</Link>
                  </Button>

                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-white/20 bg-white/5 px-8 text-white hover:bg-white/10"
                  >
                    <Link href="/login">Sign In</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-[#020015]">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-white/55 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div>
              © {new Date().getFullYear()} VendorStream. All rights reserved.
            </div>
            <div className="flex gap-5">
              <Link href="/login" className="hover:text-white">
                Sign In
              </Link>
              <Link href="/signup" className="hover:text-white">
                Request Access
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
