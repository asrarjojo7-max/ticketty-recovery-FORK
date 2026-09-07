import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-12 w-12 border-4",
};

export function Spinner({ size = "md", className, ...rest }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="جارٍ التحميل"
      className={cn(
        "animate-spin rounded-full border-muted border-t-primary",
        sizeMap[size],
        className,
      )}
      {...rest}
    >
      <span className="sr-only">جارٍ التحميل...</span>
    </div>
  );
}