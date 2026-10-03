/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "live" (deployed API, sign-in) or "mock" (built-in synthetic data). See src/main.tsx. */
  readonly VITE_ASTIG_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
