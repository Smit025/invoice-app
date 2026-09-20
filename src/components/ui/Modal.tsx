"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="panel-in relative z-10 w-full max-w-[480px] rounded-xl border border-border bg-bg p-5 dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
      >
        {title ? (
          <h2 id={labelledBy} className="mb-3 text-lg font-semibold leading-7">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close templates"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "panel-in relative z-10 w-full rounded-t-xl border border-border bg-bg p-5 sm:max-w-3xl sm:rounded-xl",
          "dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold leading-7">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-muted hover:text-text"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
