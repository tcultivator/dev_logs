import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

const publicPages = new Set(["/login", "/signup"]);

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.authType =
          token.authType === "google" || token.authType === "gmail"
            ? token.authType
            : "gmail";
        session.user.needsPassword = token.needsPassword === true;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/auth")) return true;

      const isLoggedIn = Boolean(auth?.user?.id);
      const needsPassword = Boolean(auth?.user?.needsPassword);
      const isPublic = publicPages.has(pathname);
      const isSetPassword = pathname === "/set-password";

      if (!isLoggedIn) {
        if (isPublic) return true;
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return false;
      }

      if (needsPassword) {
        if (isSetPassword) return true;
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "Set a password before using the app" },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL("/set-password", request.nextUrl));
      }

      if (isPublic || isSetPassword) {
        return NextResponse.redirect(new URL("/", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
