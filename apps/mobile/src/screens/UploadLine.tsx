/**
 * One line of upload status, in words (the chip colour only repeats them). Never claims an
 * upload that did not finish: "uploaded" counts only captures the server accepted.
 */
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { Chip, Muted } from "../ui";
import type { UploadStatus } from "../useUploader";

export function UploadLine(props: { upload: UploadStatus; signedIn: boolean; uploaded: number; waiting: number }) {
  const { upload, signedIn, uploaded, waiting } = props;
  const chip = !signedIn
    ? ({ label: "Upload: not signed in", tone: "warning" } as const)
    : upload.phase === "UPLOADING"
      ? ({ label: "Uploading…", tone: "neutral" } as const)
      : upload.phase === "WAITING_RETRY"
        ? ({ label: "Upload paused, retrying", tone: "warning" } as const)
        : waiting === 0
          ? ({ label: "All uploaded", tone: "ok" } as const)
          : ({ label: "Waiting to upload", tone: "neutral" } as const);
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <Chip label={chip.label} tone={chip.tone} />
      <Muted>
        {uploaded} uploaded · {waiting} waiting{!signedIn ? " · captures stay on this phone until an operator signs in" : ""}
      </Muted>
      {upload.lastError && signedIn && (
        <Text style={styles.error}>
          {upload.lastError.text}
          {upload.lastError.requestId ? ` (ref ${upload.lastError.requestId})` : ""}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2] },
  error: { fontFamily: theme.font.family, fontSize: theme.font.size.bodySm, fontWeight: theme.font.weight.semibold, color: theme.color.danger },
});
