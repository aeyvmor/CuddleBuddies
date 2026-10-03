import { useEffect, useRef, useState, type FormEvent } from "react";
import { AstigApiError } from "@astig/api-client";
import styles from "./SignInScreen.module.css";

const message = (e: unknown) => (e instanceof AstigApiError || e instanceof Error ? e.message : "Sign-in failed.");

/**
 * Officer sign-in (Cognito user pool via @astig/api-client). Labels on every field, Enter submits,
 * errors are announced and stay visible. Passwords are never stored or logged.
 */
export function SignInScreen(props: {
  step: "credentials" | "new-password";
  /** Shown above the form, e.g. after the session ended. */
  notice: string | null;
  onSignIn: (username: string, password: string) => Promise<void>;
  onNewPassword: (password: string) => Promise<void>;
  onCancelNewPassword: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Moving between the two steps puts focus on the new heading, so the change is announced.
  useEffect(() => {
    setError(null);
    if (props.step === "new-password") titleRef.current?.focus();
  }, [props.step]);

  async function submit(e: FormEvent, action: () => Promise<void>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <p className={styles.brand}>ASTIG</p>
        {props.step === "credentials" ? (
          <>
            <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
              Sign in to the operations dashboard
            </h1>
            <p className={styles.muted}>For officers who review issues and manage work orders.</p>
            {props.notice && (
              <p role="status" className={styles.notice}>
                {props.notice}
              </p>
            )}
            <form
              className={styles.form}
              aria-label="Sign in"
              onSubmit={(e) =>
                void submit(e, async () => {
                  if (!username.trim() || !password) throw new Error("Enter your username and password.");
                  await props.onSignIn(username.trim(), password);
                })
              }
            >
              <label className={styles.field}>
                <span>Username</span>
                <input
                  className={styles.input}
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Password</span>
                <input
                  className={styles.input}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primary} aria-disabled={busy || undefined}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 ref={titleRef} tabIndex={-1} className={styles.title}>
              Set a new password
            </h1>
            <p className={styles.muted}>This account must choose a new password before its first sign-in.</p>
            <form
              className={styles.form}
              aria-label="Set a new password"
              onSubmit={(e) =>
                void submit(e, async () => {
                  if (!newPassword) throw new Error("Enter a new password.");
                  if (newPassword !== confirm) throw new Error("The two passwords do not match.");
                  try {
                    await props.onNewPassword(newPassword);
                  } catch (err) {
                    throw new Error(`${message(err)} Check that the new password meets the account's password rules.`);
                  }
                })
              }
            >
              <label className={styles.field}>
                <span>New password</span>
                <input className={styles.input} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Confirm new password</span>
                <input className={styles.input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primary} aria-disabled={busy || undefined}>
                {busy ? "Saving…" : "Set password and sign in"}
              </button>
              <button type="button" className={styles.link} onClick={props.onCancelNewPassword}>
                Back to sign-in
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
