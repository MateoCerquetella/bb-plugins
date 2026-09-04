import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "default", size = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      className={`bb-button bb-button--${variant} bb-button--${size} ${className}`.trim()}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

