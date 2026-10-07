"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loginErrorMessage } from "@/lib/login-error";

type Mode = "login" | "signup";

export default function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "manual_account") {
      setError(
        "This email already uses email-code sign-in. Google sign-in is blocked so the two logins stay separate."
      );
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((providers) => setGoogleEnabled(Boolean(providers?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  async function finishSignIn(result: { error?: string | null; code?: string } | undefined) {
    if (result?.error) {
      setError(loginErrorMessage(result.code));
      return;
    }
    const session = await getSession();
    if (session?.user?.needsPassword) {
      window.location.assign("/set-password");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          purpose: mode === "signup" ? "signup" : "signin",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send the code.");
        return;
      }
      setCodeSent(true);
      setDevCode(typeof data.devCode === "string" ? data.devCode : "");
    } catch {
      setError("Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await signIn("credentials", {
        email,
        otp: code,
        purpose: mode === "signup" ? "signup" : "signin",
        redirect: false,
      });
      await finishSignIn(result);
    } catch {
      setError("Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      await finishSignIn(result);
    } catch {
      setError("Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="masthead-brand">
          <span className="masthead-mark" aria-hidden>
            &lt;/&gt;
          </span>
          <span>
            <strong>DevLog</strong>
            <span>{mode === "signup" ? "Create account" : "Sign in"}</span>
          </span>
        </div>

        <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-lead">
          {mode === "signup"
            ? "Use Google, or confirm a new email with a code. A Google email that already exists cannot be signed up again this way."
            : "Google accounts stay on Google until you set a password. Manual accounts sign in with an email code."}
        </p>

        {error ? <div className="error">{error}</div> : null}

        {googleEnabled ? (
          <button
            type="button"
            className="btn btn--ghost auth-google"
            disabled={busy}
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            Continue with Google
          </button>
        ) : (
          <p className="auth-note">
            Google sign-in needs <code>AUTH_GOOGLE_ID</code> and{" "}
            <code>AUTH_GOOGLE_SECRET</code> in <code>.env</code>.
          </p>
        )}

        <div className="auth-divider">or email</div>

        {mode === "login" && usePassword ? (
          <form onSubmit={signInWithPassword}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <p className="auth-note">
              This is only for a Google account after you have set a password.
              An empty password never signs you in.
            </p>
            <button className="btn auth-submit" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in with password"}
            </button>
            <button
              type="button"
              className="btn btn--ghost auth-submit"
              onClick={() => {
                setUsePassword(false);
                setError("");
              }}
            >
              Use an email code instead
            </button>
          </form>
        ) : (
          <form onSubmit={codeSent ? verifyCode : sendCode}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCodeSent(false);
                  setDevCode("");
                }}
                required
              />
            </div>
            {codeSent ? (
              <div className="field">
                <label htmlFor="code">6-digit code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            ) : null}
            {devCode ? (
              <p className="auth-note">
                Email is not configured, so this local code is{" "}
                <strong>{devCode}</strong>. Add Gmail SMTP in <code>.env</code>{" "}
                to send it for real. Sending through Gmail is free.
              </p>
            ) : null}
            <button className="btn auth-submit" type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : codeSent
                  ? mode === "signup"
                    ? "Create account"
                    : "Sign in"
                  : "Send code"}
            </button>
            {mode === "login" ? (
              <button
                type="button"
                className="btn btn--ghost auth-submit"
                onClick={() => {
                  setUsePassword(true);
                  setError("");
                }}
              >
                Sign in with password
              </button>
            ) : null}
          </form>
        )}

        <p className="auth-switch">
          {mode === "signup" ? (
            <>
              Already have an account? <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/signup">Create an account</Link>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
