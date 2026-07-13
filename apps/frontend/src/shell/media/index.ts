// Next.js shell: re-export next/image so callers of "@/shell/media" get the
// optimized <Image> in the Next build and a plain <img> under the SPA build
// (see media.router.tsx, aliased in vite.config.ts).
export { default as Image } from "next/image";
export type { ImageProps } from "next/image";
