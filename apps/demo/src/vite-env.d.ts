/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INVARIANCE_REGISTRY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
