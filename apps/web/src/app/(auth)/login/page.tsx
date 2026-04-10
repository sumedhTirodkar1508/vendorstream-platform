"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
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
import { Label } from "@/components/ui/label";

type Notice = {
  type: "error" | "success" | "warning";
  text: string;
};

const DEFAULT_REDIRECT_PATH = "/dashboard";
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

async function waitForSession() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const session = await getSession();

    if (session?.user) {
      return session;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
  }

  return null;
}

async function getSessionSnapshot() {
  const session = await waitForSession();

  if (!session?.user) {
    return null;
  }

  return {
    email: String(session.user.email || "").trim().toLowerCase(),
    isEmailVerified: Boolean(session.user.isEmailVerified),
  };
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = normalizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);

  const emailValue = email.trim().toLowerCase();
  const isSubmitDisabled = !emailValue || !password || isSubmitting;

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const sessionSnapshot = await getSessionSnapshot();

      if (!isActive || !sessionSnapshot) {
        return;
      }

      if (sessionSnapshot.email) {
        setEmail((currentEmail) => {
          const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
          return sessionSnapshot.email !== normalizedCurrentEmail
            ? sessionSnapshot.email
            : currentEmail;
        });
      }

      if (!sessionSnapshot.isEmailVerified) {
        setShowVerificationPrompt(true);
        setNotice({
          type: "warning",
          text: "Your email address is not verified yet. Resend a verification email to continue.",
        });
        return;
      }

      setShowVerificationPrompt(false);
      setNotice({
        type: "success",
        text: "Sign-in successful. Redirecting to your workspace...",
      });
      router.replace(nextPath);
      router.refresh();
    })();

    return () => {
      isActive = false;
    };
  }, [nextPath, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    setIsSubmitting(true);
    setNotice(null);
    setShowVerificationPrompt(false);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: emailValue,
        password,
      });

      if (result?.error) {
        const needsVerification = result.error.toLowerCase().includes("verify");

        setShowVerificationPrompt(needsVerification);
        setNotice({
          type: needsVerification ? "warning" : "error",
          text: result.error || "Unable to sign in with those credentials.",
        });
        return;
      }

      const sessionSnapshot = await getSessionSnapshot();

      if (sessionSnapshot?.email) {
        setEmail((currentEmail) => {
          const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
          return sessionSnapshot.email !== normalizedCurrentEmail
            ? sessionSnapshot.email
            : currentEmail;
        });
      }

      if (sessionSnapshot && !sessionSnapshot.isEmailVerified) {
        setShowVerificationPrompt(true);
        setNotice({
          type: "warning",
          text: "Your email address is not verified yet. Resend a verification email to continue.",
        });
        return;
      }

      setNotice({
        type: "success",
        text: "Sign-in successful. Redirecting to your workspace...",
      });
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error("[login] sign-in failed", error);
      setNotice({
        type: "error",
        text: "Something went wrong while signing in. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!emailValue || isResendingVerification) {
      return;
    }

    setIsResendingVerification(true);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/send-email-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: emailValue }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        setNotice({
          type: "error",
          text: payload?.error || "Failed to resend the verification email.",
        });
        return;
      }

      setNotice({
        type: "success",
        text:
          payload?.message ||
          "Verification email sent. Check your inbox and then sign in again.",
      });
    } catch (error) {
      console.error("[login] resend verification failed", error);
      setNotice({
        type: "error",
        text: "Unable to resend the verification email right now.",
      });
    } finally {
      setIsResendingVerification(false);
    }
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
              <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium tracking-[0.18em] text-cyan-100 uppercase">
                VendorStream
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold tracking-tight text-white">
                  Sign in to your workspace
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Access reconciliation workflows, statement generation, and monthly LP-store review activity.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
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

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-200">
                    Work email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@vendorstream.com"
                    className="h-11 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="h-11 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500 focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className="h-11 w-full bg-white text-slate-950 hover:bg-slate-100"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col items-stretch gap-4">
              {showVerificationPrompt ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={!emailValue || isResendingVerification}
                  className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  {isResendingVerification
                    ? "Sending verification email..."
                    : "Resend verification email"}
                </Button>
              ) : null}

              <div className="space-y-2 text-center text-sm text-slate-400">
                <p>
                  Need to verify your account?{" "}
                  <Link
                    href="/verify-email"
                    className="font-medium text-cyan-200 underline underline-offset-4"
                  >
                    Go to verification
                  </Link>
                </p>
                <p>
                  Need access?{" "}
                  <Link
                    href="/signup"
                    className="font-medium text-cyan-200 underline underline-offset-4"
                  >
                    Create an account
                  </Link>
                </p>
              </div>
            </CardFooter>
          </Card>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
