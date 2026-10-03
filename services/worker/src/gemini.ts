import { DETECTION_SCHEMA_VERSION, IssueType, ObstructionType, SeverityEstimate } from "@astig/contracts";
import { ProviderError, type VisionProvider } from "./provider";

/**
 * Gemini vision adapter (REST generateContent, structured JSON output). The model returns the
 * evidence fields only; schemaVersion and modelVersion are set here, and the result is still
 * validated against the shared Detection schema by the ingest handler before persistence.
 * The API key is read at call time from the injected getter (Secrets Manager in Lambda) and is
 * never logged.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const GEMINI_PROMPT = [
  "You inspect one still frame from a vehicle-mounted street camera in Metro Manila for drainage and road-surface problems.",
  "Report only what is visible in this image. Do not guess about things outside the frame and do not predict flooding.",
  "infrastructureVisible: true only if a drain inlet, canal, gutter, or road surface defect area is clearly visible.",
  "issueType: the most significant visible problem, or NONE. If infrastructureVisible is false, issueType must be NONE and blockagePercent null.",
  "blockagePercent: estimated percent of a visible drain opening that is obstructed (0-100), or null when no drain opening is visible.",
  "severityEstimate: NONE, LOW, MODERATE, HIGH, or CRITICAL, for the visible condition only.",
  "confidence: your confidence in this assessment, 0 to 1.",
  "requiresHumanReview: true unless the frame is unambiguous.",
  "evidenceDescription: one or two factual sentences (max 400 characters) describing what you see. Do not describe or identify people, faces, or licence plates.",
].join("\n");

/** JSON Schema sent to Gemini; mirrors the model-supplied part of the Detection contract. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    infrastructureVisible: { type: "boolean" },
    issueType: { type: "string", enum: IssueType.options },
    obstructionType: { type: "string", enum: ObstructionType.options },
    blockagePercent: { type: ["number", "null"], minimum: 0, maximum: 100 },
    severityEstimate: { type: "string", enum: SeverityEstimate.options },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidenceDescription: { type: "string", maxLength: 400 },
    requiresHumanReview: { type: "boolean" },
  },
  required: [
    "infrastructureVisible",
    "issueType",
    "obstructionType",
    "blockagePercent",
    "severityEstimate",
    "confidence",
    "evidenceDescription",
    "requiresHumanReview",
  ],
  additionalProperties: false,
} as const;

export interface GeminiOptions {
  getApiKey: () => Promise<string>;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiProvider implements VisionProvider {
  readonly name = "gemini";
  private readonly model: string;

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    if (!/^[a-z0-9.-]{1,64}$/.test(this.model)) throw new Error("invalid Gemini model id");
  }

  async analyze(input: { image: Uint8Array; contentType: string }): Promise<unknown> {
    if (input.contentType !== "image/jpeg") throw new ProviderError("IMAGE_UNREADABLE", "Only image/jpeg evidence is supported.");
    const key = await this.opts.getApiKey();
    if (!key || key === "NOT_CONFIGURED") throw new ProviderError("PROVIDER_NOT_CONFIGURED", "Gemini API key is not configured.");

    const body = {
      contents: [
        {
          parts: [
            { text: GEMINI_PROMPT },
            { inlineData: { mimeType: "image/jpeg", data: Buffer.from(input.image).toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        // Verified against the live API (2026-10-04): responseMimeType + responseJsonSchema.
        responseMimeType: "application/json",
        responseJsonSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };

    const doFetch = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${ENDPOINT}/${this.model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 25_000),
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("PROVIDER_TIMEOUT", "Gemini request timed out.");
      throw new ProviderError("PROVIDER_ERROR", "Gemini request failed to send.");
    }
    if (!res.ok) {
      // Status only; the response body may echo request details and is not logged or stored.
      throw new ProviderError("PROVIDER_ERROR", `Gemini returned HTTP ${res.status}.`);
    }

    let payload: any;
    try {
      payload = await res.json();
    } catch {
      throw new ProviderError("INVALID_MODEL_OUTPUT", "Gemini response was not JSON.");
    }
    const candidate = payload?.candidates?.[0];
    const text: unknown = candidate?.content?.parts?.find((p: any) => typeof p?.text === "string")?.text;
    if (typeof text !== "string") {
      const reason = String(candidate?.finishReason ?? payload?.promptFeedback?.blockReason ?? "NO_CANDIDATE").slice(0, 40);
      throw new ProviderError("INVALID_MODEL_OUTPUT", `Gemini returned no structured text (${reason}).`);
    }
    let fields: unknown;
    try {
      fields = JSON.parse(text);
    } catch {
      throw new ProviderError("INVALID_MODEL_OUTPUT", "Gemini text was not valid JSON.");
    }
    if (fields === null || typeof fields !== "object" || Array.isArray(fields)) {
      throw new ProviderError("INVALID_MODEL_OUTPUT", "Gemini output was not an object.");
    }
    // Server-controlled fields; the model cannot override them. Unknown model fields stay and
    // cause strict schema validation to fail rather than being silently dropped.
    const detection = { ...(fields as Record<string, unknown>), schemaVersion: DETECTION_SCHEMA_VERSION, modelVersion: `gemini:${this.model}` };
    return detection;
  }
}
