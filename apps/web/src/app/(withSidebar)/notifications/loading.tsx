import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="h-6 w-36 animate-pulse rounded bg-white/10" />
          <div className="h-12 w-[26rem] animate-pulse rounded bg-white/10" />
          <div className="h-5 w-[38rem] animate-pulse rounded bg-white/10" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/8" />
        </header>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-6 w-36 animate-pulse rounded bg-white/10" />
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-11 animate-pulse rounded-xl bg-white/8"
                />
              ))}
            </div>
          </CardHeader>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-xl bg-white/8"
              />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
          {[0, 1].map((item) => (
            <Card
              key={item}
              className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
            >
              <CardHeader className="space-y-3">
                <div className="h-6 w-44 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-16 animate-pulse rounded-xl bg-white/8"
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
