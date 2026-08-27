import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white shadow-[0_0_0_1px_rgba(255,255,255,.08)_inset] hover:bg-[var(--accent-strong)]",
        secondary: "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
        ghost: "text-[var(--muted)] hover:bg-white/[.055] hover:text-[var(--text)]",
        outline: "border border-[var(--line)] bg-transparent text-[var(--text)] hover:bg-white/[.04]",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 rounded-md px-2.5 text-xs",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
