"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-border-strong bg-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 font-medium transition-colors duration-150",
              size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
              selected ? "bg-accent-subtle text-accent" : "text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors duration-150",
        selected
          ? "bg-accent-subtle text-accent"
          : "border border-border-strong text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "success" | "muted" | "danger" | "accent";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
        tone === "success" && "bg-success/15 text-success",
        tone === "muted" && "bg-surface-2 text-muted",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "accent" && "bg-accent-subtle text-accent",
      )}
    >
      {children}
    </span>
  );
}
