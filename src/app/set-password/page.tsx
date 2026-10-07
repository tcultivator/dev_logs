"use client";

import { FormEvent, useState } from "react";
import { signOut, useSession } from "next-auth/react";

export default function SetPasswordPage() {
  const { data: session, update } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save the password.");
        return;
      }
      await update();
      window.location.assign("/");
    } catch {
      setError("Could not save the password.");
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
            <span>Set a password</span>
          </span>
        </div>
        <h1>Set a password</h1>
        <p className="auth-lead">
          {session?.user?.email
            ? `${session.user.email} signed in with Google, so the account has no password yet.`
            : "This Google account has no password yet."}{" "}
          Set one before using the app. Until it is saved, signing in with this
          email and a blank password is rejected.
        </p>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="btn auth-submit" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
        <p className="auth-switch">
          <button
            type="button"
            className="btn btn--ghost auth-submit"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </p>
      </section>
    </main>
  );
}
