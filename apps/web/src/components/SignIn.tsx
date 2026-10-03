import { useState, type FormEvent } from "react";
import { AstigApiError, type CognitoAuth, type NewPasswordChallenge } from "@astig/api-client";
import styles from "./SignIn.module.css";

interface Props {
  auth: Pick<CognitoAuth, "signIn" | "completeNewPassword">;
  onSignedIn: () => void;
}

const message = (e: unknown) => (e instanceof AstigApiError ? e.message : "Sign-in failed. Check your connection and try again.");

/** Officer sign-in (Cognito). Handles the first-login "set a new password" step. */
export function SignIn({ auth, onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [challenge, setChallenge] = useState<NewPasswordChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await auth.completeNewPassword(challenge, newPassword);
        onSignedIn();
      } else {
        const r = await auth.signIn(username.trim(), password);
        if ("kind" in r) setChallenge(r);
        else onSignedIn();
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit} aria-labelledby="signin-title" noValidate>
        <p className={styles.brand}>
          ASTIG <span className={styles.tag}>OPS</span>
        </p>
        <h1 id="signin-title" className={styles.title}>
          {challenge ? "Set a new password" : "Sign in"}
        </h1>
        {challenge ? (
          <>
            <p className={styles.help}>First sign-in for {challenge.username}: choose a new password (at least 12 characters, with upper- and lower-case letters and a digit).</p>
            <label className={styles.field}>
              <span>New password</span>
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} />
            </label>
          </>
        ) : (
          <>
            <label className={styles.field}>
              <span>Username</span>
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label className={styles.field}>
              <span>Password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={busy || (challenge ? newPassword.length < 12 : !username || !password)}>
          {busy ? "Please wait…" : challenge ? "Set password and continue" : "Sign in"}
        </button>
        <p className={styles.note}>Officer accounts are created by the administrator. AI findings are advisory; officers decide.</p>
      </form>
    </main>
  );
}
