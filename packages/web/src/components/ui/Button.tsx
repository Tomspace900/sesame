import { cn } from "@/lib/utils.ts";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-body font-medium text-sm",
    "border-2 border-sesame-text",
    "rounded cursor-pointer",
    "select-none whitespace-nowrap",
    "transition-[box-shadow,transform] duration-100",
    "focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2",
    "disabled:pointer-events-none disabled:opacity-50",
    "btn-brutal",
  ],
  {
    variants: {
      variant: {
        primary: "bg-sesame-accent text-sesame-surface",
        secondary: "bg-sesame-surface text-sesame-text",
        destructive: "bg-sesame-danger text-sesame-surface",
        ghost: [
          "border-transparent shadow-none",
          "bg-transparent text-sesame-text",
          "hover:bg-sesame-surface-muted",
          "active:transform-none active:shadow-none",
        ],
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);

Button.displayName = "Button";
