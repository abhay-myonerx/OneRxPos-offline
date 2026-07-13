import type { ImgHTMLAttributes } from "react";

// SPA (Vite/React Router) shell: plain <img>, no Next.js image optimization
// pipeline available. Next-only props (fill/priority) are accepted for API
// compatibility with callers but have no effect here.
export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "width" | "height"> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean; // Next-only; ignored (use className for layout)
  priority?: boolean; // Next-only; ignored
}

export function Image({ fill, priority, width, height, style, ...rest }: ImageProps) {
  void priority; // Next-only hint; intentionally ignored in the SPA.
  const fillStyle = fill
    ? { position: "absolute" as const, inset: 0, width: "100%", height: "100%", ...style }
    : style;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- intentional plain-img shim for next/image; src/alt/className are forwarded via ...rest and typed on ImageProps (not visible to static analysis).
  return <img width={width} height={height} style={fillStyle} {...rest} />;
}
