import { PRODUCT_NAME } from "@/lib/constants";

export function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
    >
      <span
        className="select-none text-[64px] font-semibold tracking-tight"
        style={{
          color: "var(--watermark)",
          transform: "rotate(-45deg)",
        }}
      >
        {PRODUCT_NAME}
      </span>
    </div>
  );
}
