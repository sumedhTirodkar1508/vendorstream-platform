import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-12 w-96 animate-pulse rounded bg-white/10" />
          <div className="h-5 w-[36rem] animate-pulse rounded bg-white/10" />
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          {[0, 1].map((item) => (
            <Card
              key={item}
              className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
            >
              <CardHeader className="space-y-3">
                <div className="h-8 w-52 animate-pulse rounded bg-white/10" />
                <div className="h-5 w-72 animate-pulse rounded bg-white/10" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="h-14 animate-pulse rounded-xl bg-white/8"
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1].map((item) => (
            <Card
              key={item}
              className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
            >
              <CardHeader className="space-y-3">
                <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
              </CardHeader>
              <CardContent>
                <div className="h-56 animate-pulse rounded-2xl bg-white/8" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
