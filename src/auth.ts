import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
import { LoginError } from "@/lib/login-error";
import { consumeOtp, type OtpPurpose } from "@/lib/otp";
import {
  createUser,
  findUserByEmail,
  hasPassword,
  normalizeEmail,
  type AuthType,
} from "@/lib/users";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asPurpose(value: unknown): OtpPurpose | null {
  return value === "signup" || value === "signin" ? value : null;
}

const googleReady = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

async function loadTokenUser(email: string) {
  const dbUser = await findUserByEmail(email);
  if (!dbUser) return null;
  return {
    sub: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    picture: dbUser.image,
    authType: dbUser.auth_type as AuthType,
    needsPassword: dbUser.auth_type === "google" && !hasPassword(dbUser),
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(googleReady ? [Google] : []),
    Credentials({
      credentials: {
        email: {},
        password: {},
        otp: {},
        purpose: {},
      },
      authorize: async (credentials) => {
        const email = normalizeEmail(text(credentials?.email));
        const password = text(credentials?.password);
        const otp = text(credentials?.otp).trim();
        const purpose = asPurpose(credentials?.purpose);

        if (otp) {
          if (!email || !purpose) throw new LoginError("invalid_otp");
          const existing = await findUserByEmail(email);

          if (purpose === "signup") {
            if (existing?.auth_type === "google") {
              throw new LoginError("google_otp_blocked");
            }
            if (existing) throw new LoginError("already_exists");
            const consumed = await consumeOtp(email, otp, "signup");
            if (!consumed.ok) throw new LoginError("invalid_otp");
            const created = await createUser({
              email,
              authType: "gmail",
              passwordHash: null,
            });
            return {
              id: created.id,
              email: created.email,
              name: created.name,
            };
          }

          if (!existing) throw new LoginError("invalid_otp");
          if (existing.auth_type !== "gmail") {
            throw new LoginError("google_otp_blocked");
          }
          const consumed = await consumeOtp(email, otp, "signin");
          if (!consumed.ok) throw new LoginError("invalid_otp");
          return {
            id: existing.id,
            email: existing.email,
            name: existing.name,
          };
        }

        if (!email || !password) throw new LoginError("invalid_credentials");
        const existing = await findUserByEmail(email);
        if (!existing) throw new LoginError("invalid_credentials");
        if (existing.auth_type === "gmail") {
          throw new LoginError("use_email_code");
        }
        if (!hasPassword(existing)) {
          throw new LoginError("google_no_password");
        }
        const { compare } = await import("bcryptjs");
        const matches = await compare(password, existing.password_hash as string);
        if (!matches) throw new LoginError("invalid_credentials");
        return {
          id: existing.id,
          email: existing.email,
          name: existing.name,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = normalizeEmail(text(profile?.email));
      if (!email) return false;
      if (profile?.email_verified === false) return false;

      const existing = await findUserByEmail(email);
      if (existing?.auth_type === "gmail") {
        return "/login?error=manual_account";
      }
      if (!existing) {
        await createUser({
          email,
          name: text(profile?.name) || null,
          image: text(profile?.picture) || null,
          authType: "google",
          passwordHash: null,
        });
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (!user && !account && trigger !== "update") return token;
      const email = normalizeEmail(text(user?.email || token.email));
      if (!email) return token;
      const loaded = await loadTokenUser(email);
      if (!loaded) return token;
      token.sub = loaded.sub;
      token.email = loaded.email;
      token.name = loaded.name;
      token.picture = loaded.picture;
      token.authType = loaded.authType;
      token.needsPassword = loaded.needsPassword;
      return token;
    },
  },
});
