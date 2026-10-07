import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      authType: "google" | "gmail";
      needsPassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    authType?: "google" | "gmail";
    needsPassword?: boolean;
  }
}
