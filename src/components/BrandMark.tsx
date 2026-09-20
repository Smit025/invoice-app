import { PRODUCT_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";

export function BrandMark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[11px] font-semibold text-[#ffffff]">
        IM
      </span>
      {compact ? (
        <span className="sr-only">{PRODUCT_NAME}</span>
      ) : (
        <span className="text-sm font-semibold tracking-tight text-text">{PRODUCT_NAME}</span>
      )}
    </span>
  );
}
