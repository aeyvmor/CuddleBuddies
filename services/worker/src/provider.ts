import type { ProcessingFailureCode } from "@astig/contracts";

/**
 * Provider-neutral vision adapter. Implementations return the raw (untrusted) model output;
 * the ingest handler validates it against the shared Detection schema before it can persist.
 */
export interface VisionProvider {
  readonly name: string;
  analyze(input: { image: Uint8Array; contentType: string }): Promise<unknown>;
}

export class ProviderError extends Error {
  override readonly name = "ProviderError";
  constructor(
    readonly code: ProcessingFailureCode,
    message: string,
  ) {
    super(message);
  }
}

/** Default until a real provider is configured: every image fails explicitly (never a fake detection). */
export class NotConfiguredProvider implements VisionProvider {
  readonly name = "none";
  async analyze(): Promise<unknown> {
    throw new ProviderError("PROVIDER_NOT_CONFIGURED", "No vision provider is configured for this environment.");
  }
}

export interface ProviderFactories {
  gemini: () => VisionProvider;
}

export function providerFromEnv(env: NodeJS.ProcessEnv, factories: ProviderFactories): VisionProvider {
  const name = env.VISION_PROVIDER ?? "none";
  if (name === "none") return new NotConfiguredProvider();
  if (name === "gemini") return factories.gemini();
  throw new Error(`Unknown VISION_PROVIDER "${name}".`);
}
