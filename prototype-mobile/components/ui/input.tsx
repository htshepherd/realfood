import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-[var(--line)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted-2)] focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
