"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CommonNavbar from "@/components/commonNavbar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Notice = {
  type: "error" | "success" | "warning";
  text: string;
};

const DEFAULT_REDIRECT_PATH = "/dashboard";
const RESEND_COOLDOWN_SECONDS = 30;
const AUTH_ROUTES = new Set(["/login", "/signup", "/verify-email"]);

function normalizeNextPath(value: string | null) {
  if (!value) {
    return DEFAULT_REDIRECT_PATH;
  }

  const candidate = value.trim();

  if (!candidate.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const normalizedUrl = new URL(candidate, "https://vendorstream.local");

    if (
      normalizedUrl.origin !== "https://vendorstream.local" ||
      normalizedUrl.pathname.startsWith("/api/") ||
      AUTH_ROUTES.has(normalizedUrl.pathname)
    ) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

async function getResponsePayload(response: Response) {
  return (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;
}

function VerifyEmailPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const nextPath = normalizeNextPath(searchParams.get("next"));

  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const isCodeComplete = code.length === 6;
  const canResend = Boolean(email) && cooldown === 0 && !isResending && !isVerified;

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldown((currentCooldown) => Math.max(0, currentCooldown - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!isVerified) {
      return;
    }

    const timer = window.setTimeout(() => {
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [isVerified, nextPath, router]);

  const handleVerify = async () => {
    if (!email) {
      setNotice({
        type: "error",
        text: "A valid email address is required to verify this account.",
      });
      return;
    }

    if (!isCodeComplete || isVerifying || isVerified) {
      return;
    }

    setIsVerifying(true);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          code,
        }),
      });

      const payload = await getResponsePayload(response);

      if (!response.ok) {
        setNotice({
          type: "error",
          text: payload?.error || "Unable to verify that code.",
        });
        return;
      }

      setIsVerified(true);
      setNotice({
        type: "success",
        text:
          payload?.message ||
          "Email verified successfully. Redirecting to sign in...",
      });
    } catch (error) {
      console.error("[verify-email] verification failed", error);
      setNotice({
        type: "error",
        text: "Something went wrong while verifying your email.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend) {
      return;
    }

    setIsResending(true);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = await getResponsePayload(response);

      if (!response.ok) {
        setNotice({
          type: "error",
          text: payload?.error || "Unable to resend the verification code.",
        });
        return;
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice({
        type: "success",
        text:
          payload?.message ||
          "A new verification code has been sent to your email.",
      });
    } catch (error) {
      console.error("[verify-email] resend failed", error);
      setNotice({
        type: "error",
        text: "Something went wrong while sending a new code.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.55),transparent_42%)]" />
        <div className="absolute left-[-10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.72)_0%,rgba(6,17,31,0.96)_100%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <CommonNavbar />

        <main className="flex flex-1 items-center justify-center px-6 pb-12 pt-24 sm:px-8 sm:pt-32">
          <Card className="w-full max-w-md border border-white/10 bg-white/7 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-4">
              <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                VendorStream
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold tracking-tight text-white">
                  Verify your email
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Confirm your account access before continuing into your VendorStream workspace.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {notice ? (
                <div
                  className={[
                    "rounded-xl border px-4 py-3 text-sm leading-6",
                    notice.type === "error"
                      ? "border-red-400/30 bg-red-500/10 text-red-100"
                      : notice.type === "warning"
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                        : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
                  ].join(" ")}
                >
                  {notice.text}
                </div>
              ) : null}

              {email ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300">
                    Verification code sent to
                    <div className="mt-1 break-all font-medium text-white">
                      {email}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-200">
                      6-digit code
                    </div>
                    <Input
                      value={code}
                      onChange={(event) => {
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        );

                        if (notice?.type === "error") {
                          setNotice(null);
                        }
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="h-14 border-white/10 bg-slate-950/60 text-center text-2xl tracking-[0.4em] text-white placeholder:text-slate-500 focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  This verification link is missing an email address. Go back to sign in and request a new verification email.
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col items-stretch gap-3">
              <Button
                type="button"
                onClick={handleVerify}
                disabled={!email || !isCodeComplete || isVerifying || isVerified}
                className="h-11 w-full bg-white text-slate-950 hover:bg-slate-100"
              >
                {isVerified
                  ? "Verified"
                  : isVerifying
                    ? "Verifying..."
                    : "Verify email"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleResendCode}
                disabled={!canResend}
                className="h-11 w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                {isResending
                  ? "Sending code..."
                  : cooldown > 0
                    ? `Resend Code in ${cooldown}s`
                    : "Resend Code"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleBackToLogin}
                className="h-10 w-full text-slate-300 hover:bg-white/5 hover:text-white"
              >
                Back to sign in
              </Button>
            </CardFooter>
          </Card>
        </main>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}
