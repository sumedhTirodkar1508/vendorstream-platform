import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@vendorstream/database";
import bcryptjs from "bcryptjs";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: {
          label: "Email:",
          type: "text",
          placeholder: "your-cool-username",
        },
        password: {
          label: "Password:",
          type: "password",
          placeholder: "your-awesome-password",
        },
      },
      async authorize(
        credentials?: Record<"email" | "password", string> | undefined,
      ) {
        try {
          const email = normalizeEmail(credentials?.email);
          const password =
            typeof credentials?.password === "string"
              ? credentials.password
              : "";

          if (!email || !password) {
            throw new Error("Email and password are required.");
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              systemRole: true,
              emailVerified: true,
            },
          });

          if (!user || !user.passwordHash) {
            throw new Error("Invalid email or password.");
          }

          const isPasswordValid = await bcryptjs.compare(
            password,
            user.passwordHash,
          );

          if (!isPasswordValid) {
            throw new Error("Invalid email or password.");
          }

          if (!user.emailVerified) {
            throw new Error("Please verify your email address first.");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            systemRole: user.systemRole,
            isEmailVerified: true,
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to complete sign in.";
          throw new Error(message);
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id?.toString();
        token.email = user.email;
        token.name = user.name;
        token.systemRole = user.systemRole;
        token.isEmailVerified = user.isEmailVerified;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : undefined;
        session.user.email =
          typeof token.email === "string" ? token.email : undefined;
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name;
        session.user.systemRole =
          typeof token.systemRole === "string" ? token.systemRole : undefined;
        session.user.isEmailVerified = Boolean(token.isEmailVerified);
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
