import type { HTMLAttributes } from "react";

export function Badge({
  className = "",
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "destructive" }) {
  return <span className={`bb-badge bb-badge--${tone} ${className}`.trim()} {...props} />;
}

