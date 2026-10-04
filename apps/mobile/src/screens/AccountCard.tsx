/**
 * Upload account card on session setup: sign in (Cognito, OPERATOR role), first-login new
 * password, signed-in state with sign-out, and the upload totals. Capture never needs it.
 */
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../theme";
import { Button, Card, Chip, Muted, SectionTitle } from "../ui";
import type { Account } from "../useAccount";
import type { UploadStatus } from "../useUploader";
import { UploadLine } from "./UploadLine";

const { color, space, radius, size, font } = theme;

export interface UploadTotals {
  uploaded: number;
  waiting: number;
  /** Captures from builds before the uploader: kept on the phone, never uploaded. */
  localOnly: number;
}

export function AccountCard({ account, upload, totals }: { account: Account; upload: UploadStatus; totals: UploadTotals }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = account.state;

  async function run(action: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await action();
      setError(err);
      if (!err) {
        setPassword("");
        setNewPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Upload to ASTIG</SectionTitle>
      {s.status === "LOADING" && <Muted>Checking the saved sign-in…</Muted>}

      {s.status === "SIGNED_IN" && (
        <>
          <Chip label={`Signed in: ${s.username}`} tone="ok" />
          {!s.isOperator && <Text style={styles.error}>This account is not an operator account; the API may refuse its uploads.</Text>}
          <UploadLine upload={upload} signedIn uploaded={totals.uploaded} waiting={totals.waiting} />
          <Button kind="secondary" label="Sign out" accessibilityLabel="Sign out of the upload account" onPress={account.signOut} />
        </>
      )}

      {s.status === "SIGNED_OUT" && (
        <>
          {s.notice && <Muted>{s.notice}</Muted>}
          <Muted>Captures are always kept on this phone. Sign in with an operator account to upload them; uploads continue while the app is open.</Muted>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="Username"
            placeholderTextColor={color.textMuted}
            accessibilityLabel="Upload account username"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Password"
            placeholderTextColor={color.textMuted}
            accessibilityLabel="Upload account password"
            style={styles.input}
            onSubmitEditing={() => void run(() => account.signIn(username, password))}
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}
          <Button label={busy ? "Signing in…" : "Sign in"} onPress={() => void run(() => account.signIn(username, password))} disabled={busy} />
          {totals.waiting > 0 && <Muted>{totals.waiting} capture(s) are waiting to upload.</Muted>}
        </>
      )}

      {s.status === "NEW_PASSWORD" && (
        <>
          <Text style={styles.subheading} accessibilityRole="header">
            Set a new password for {s.challenge.username}
          </Text>
          <Muted>First sign-in: choose a new password with at least 12 characters, upper- and lower-case letters and a digit.</Muted>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="New password"
            placeholderTextColor={color.textMuted}
            accessibilityLabel="New password"
            style={styles.input}
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}
          <Button label={busy ? "Saving…" : "Set password and sign in"} onPress={() => void run(() => account.completeNewPassword(newPassword))} disabled={busy} />
          <Button kind="text" label="Back" accessibilityLabel="Back to sign-in" onPress={account.cancelNewPassword} />
        </>
      )}

      {totals.localOnly > 0 && (
        <View style={styles.local}>
          <Muted>
            {totals.localOnly} older test capture(s) from earlier builds stay on this phone only and are not uploaded.
          </Muted>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: size.touch,
    borderWidth: size.borderControl,
    borderColor: color.controlBorder,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    fontFamily: font.family,
    fontSize: font.size.bodyLg,
    color: color.text,
    backgroundColor: color.surface,
  },
  error: { fontFamily: font.family, fontSize: font.size.bodyMd, fontWeight: font.weight.semibold, color: color.danger },
  subheading: { fontFamily: font.family, fontSize: font.size.bodyLg, fontWeight: font.weight.bold, color: color.text },
  local: { paddingTop: space[2], borderTopWidth: size.borderHairline, borderTopColor: color.border },
});
