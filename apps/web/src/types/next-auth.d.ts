import type { DefaultSession } from "next-auth";
import "next-auth";

declare module "next-auth" {
  type AppSystemRole = "USER" | "ADMIN" | "FINANCE_VIEWER";

  interface User {
    id?: string;
    isEmailVerified?: boolean;
    email?: string;
    name?: string | null;
    systemRole?: AppSystemRole;
  }

  interface Session {
    user: {
      id?: string;
      isEmailVerified?: boolean;
      email?: string;
      name?: string | null;
      systemRole?: AppSystemRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isEmailVerified?: boolean;
    email?: string;
    name?: string | null;
    systemRole?: "USER" | "ADMIN" | "FINANCE_VIEWER";
  }
}
