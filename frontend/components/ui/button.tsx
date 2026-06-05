import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-primary hover:bg-primary-dark text-primary-foreground shadow-sm hover:shadow-md active:shadow-none",
        secondary: "border border-border bg-[var(--surface-raised)] text-foreground hover:bg-[var(--surface-strong)]",
        ghost: "text-foreground hover:bg-[var(--surface-raised)]",
        outline: "border border-border text-foreground hover:bg-[var(--surface-raised)] hover:border-primary",
      },
      size: {
        xs: "h-8 px-3 text-xs rounded-md",
        sm: "h-9 px-3.5 text-sm rounded-lg",
        default: "h-10 px-4 text-sm rounded-lg",
        lg: "h-11 px-6 text-base rounded-lg",
        xl: "h-12 px-7 text-base rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    href?: string;
  };

export function Button({ className, variant, size, asChild, href, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild && href) {
    return (
      <Link href={href} className={classes}>
        {props.children}
      </Link>
    );
  }

  return <button className={classes} {...props} />;
}
