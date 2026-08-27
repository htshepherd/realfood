import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center rounded px-1.5 font-mono text-[10px] font-medium tracking-[.02em]",
  {
    variants: {
      variant: {
        default: "border border-violet-400/20 bg-violet-400/10 text-violet-200",
        internal: "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
        muted: "border border-[var(--line)] bg-white/[.035] text-[var(--muted)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
