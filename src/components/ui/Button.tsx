import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-[#ffffff] hover:bg-accent-hover",
        variant === "secondary" &&
          "border border-border-strong bg-bg text-text hover:bg-surface",
        variant === "ghost" && "text-muted hover:text-text",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
