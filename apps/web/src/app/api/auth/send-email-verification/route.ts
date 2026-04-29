import { createHash, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma, Prisma } from "@vendorstream/database";
import { sendVerificationEmail } from "@/lib/email/send-verification-email";
import {
  EmailConfigurationError,
  EmailDeliveryError,
} from "@/lib/email/transactional";

const VERIFICATION_CODE_EXPIRY_MS = 10 * 60 * 1000;

type ApiSuccess = {
  ok: true;
  message: string;
};

type ApiError = {
  ok: false;
  error: string;
};

function successResponse(message: string, status = 200) {
  return NextResponse.json<ApiSuccess>(
    {
      ok: true,
      message,
    },
    { status },
  );
}

function errorResponse(message: string, status: number) {
  return NextResponse.json<ApiError>(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateVerificationCode() {
  return randomInt(100000, 1000000).toString();
}

function hashVerificationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function buildVerificationUrl(request: Request, email: string) {
  const origin = new URL(request.url).origin;
  const verificationUrl = new URL("/verify-email", origin);

  verificationUrl.searchParams.set("email", email);

  return verificationUrl.toString();
}

export async function POST(request: Request) {
  let email = "";

  try {
    const requestBody = await request.json().catch(() => null);
    email = normalizeEmail(requestBody?.email);

    if (!email || !isValidEmail(email)) {
      return errorResponse("A valid email address is required.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return errorResponse("User not found.", 404);
    }

    if (user.emailVerified) {
      return errorResponse("Email is already verified.", 400);
    }

    const verificationCode = generateVerificationCode();
    const codeHash = hashVerificationCode(verificationCode);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.emailVerificationCode.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      });

      await tx.emailVerificationCode.create({
        data: {
          userId: user.id,
          codeHash,
          expiresAt,
        },
      });
    });

    await sendVerificationEmail({
      email: user.email,
      code: verificationCode,
      verificationUrl: buildVerificationUrl(request, user.email),
    });

    return successResponse("Verification code sent successfully.");
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      console.error("[auth/send-email-verification] email configuration error", {
        email,
        message: error.message,
      });
      return errorResponse("Email delivery is not configured.", 503);
    }

    if (error instanceof EmailDeliveryError) {
      console.error("[auth/send-email-verification] delivery failed", {
        email,
        message: error.message,
      });
      return errorResponse(
        "Verification email could not be sent right now. Please try again shortly.",
        502,
      );
    }

    console.error("[auth/send-email-verification] failed", error);
    return errorResponse("Failed to send verification code.", 500);
  }
}
