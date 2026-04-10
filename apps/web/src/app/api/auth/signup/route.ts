import bcryptjs from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma, prisma } from "@vendorstream/database";

const MIN_PASSWORD_LENGTH = 8;

type ApiSuccess = {
  ok: true;
  message: string;
  email: string;
  verifyEmailUrl: string;
};

type ApiError = {
  ok: false;
  error: string;
};

function successResponse(payload: ApiSuccess, status = 200) {
  return NextResponse.json<ApiSuccess>(payload, { status });
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

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildVerifyEmailUrl(email: string) {
  return `/verify-email?email=${encodeURIComponent(email)}`;
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  let normalizedEmail = "";

  try {
    const requestBody = await request.json().catch(() => null);

    normalizedEmail = normalizeEmail(requestBody?.email);
    const normalizedName = normalizeName(requestBody?.name);
    const password = normalizePassword(requestBody?.password);

    if (!normalizedName) {
      return errorResponse("Name is required.", 400);
    }

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return errorResponse("A valid email address is required.", 400);
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return errorResponse(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        400,
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return errorResponse("Email is already registered.", 409);
    }

    const passwordHash = await bcryptjs.hash(password, 12);

    const createdUser = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        emailVerified: null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    createdUserId = createdUser.id;

    const verificationRouteUrl = new URL(
      "/api/auth/send-email-verification",
      request.url,
    );

    const verificationResponse = await fetch(verificationRouteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: createdUser.email,
      }),
      cache: "no-store",
    });

    if (!verificationResponse.ok) {
      const verificationPayload = (await verificationResponse
        .json()
        .catch(() => null)) as { error?: string } | null;

      await prisma.user.delete({
        where: { id: createdUser.id },
      });

      return errorResponse(
        verificationPayload?.error ||
          "Unable to start email verification for this account.",
        500,
      );
    }

    return successResponse(
      {
        ok: true,
        message: "Signup successful. Please verify your email.",
        email: createdUser.email,
        verifyEmailUrl: buildVerifyEmailUrl(createdUser.email),
      },
      201,
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return errorResponse("Email is already registered.", 409);
    }

    if (createdUserId) {
      try {
        await prisma.user.delete({
          where: { id: createdUserId },
        });
      } catch (cleanupError) {
        console.error("[auth/signup] cleanup failed", {
          email: normalizedEmail,
          userId: createdUserId,
          cleanupError,
        });
      }
    }

    console.error("[auth/signup] failed", error);
    return errorResponse("Failed to create account.", 500);
  }
}
