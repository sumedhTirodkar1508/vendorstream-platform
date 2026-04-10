import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@vendorstream/database";

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

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidVerificationCode(value: string) {
  return /^\d{6}$/.test(value);
}

function hashVerificationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function verificationCodeMatches(inputCode: string, storedHash: string) {
  const inputHash = Buffer.from(hashVerificationCode(inputCode), "utf8");
  const expectedHash = Buffer.from(storedHash, "utf8");

  if (inputHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(inputHash, expectedHash);
}

export async function POST(request: Request) {
  try {
    const requestBody = await request.json().catch(() => null);
    const email = normalizeEmail(requestBody?.email);
    const code = normalizeCode(requestBody?.code);

    if (!email || !isValidEmail(email)) {
      return errorResponse("A valid email address is required.", 400);
    }

    if (!isValidVerificationCode(code)) {
      return errorResponse("Verification code must be a 6-digit string.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return errorResponse("User not found.", 404);
    }

    if (user.emailVerified) {
      return errorResponse("Email is already verified.", 400);
    }

    const verificationRecord = await prisma.emailVerificationCode.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!verificationRecord) {
      return errorResponse("No pending verification code was found.", 400);
    }

    if (verificationRecord.usedAt) {
      return errorResponse("This verification code has already been used.", 400);
    }

    if (verificationRecord.expiresAt.getTime() <= Date.now()) {
      return errorResponse("Verification code has expired.", 400);
    }

    if (!verificationCodeMatches(code, verificationRecord.codeHash)) {
      return errorResponse("Invalid verification code.", 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.update({
        where: { id: verificationRecord.id },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
        },
      });
    });

    return successResponse("Email verified successfully.");
  } catch (error) {
    console.error("[auth/verify-email] failed", error);
    return errorResponse("Failed to verify email.", 500);
  }
}
