import { cn } from "@/lib/utils.ts";
import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightIcon, type, ...props }, ref) => {
    if (leftIcon ?? rightIcon) {
      return (
        <div className="relative flex items-center">
          {leftIcon !== undefined && (
            <span className="absolute left-3 text-sesame-text-muted pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            type={type}
            className={cn(
              "w-full bg-sesame-surface border-2 border-sesame-text rounded",
              "text-sesame-text text-sm font-body placeholder:text-sesame-text-muted",
              "h-10",
              "focus:outline-none focus:border-sesame-accent focus:ring-2 focus:ring-sesame-accent/20",
              "disabled:bg-sesame-surface-muted disabled:cursor-not-allowed",
              leftIcon !== undefined ? "pl-10 pr-3" : "px-3",
              rightIcon !== undefined ? "pr-10" : "",
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon !== undefined && (
            <span className="absolute right-3 text-sesame-text-muted">{rightIcon}</span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          "w-full bg-sesame-surface border-2 border-sesame-text rounded",
          "text-sesame-text text-sm font-body placeholder:text-sesame-text-muted",
          "h-10 px-3",
          "focus:outline-none focus:border-sesame-accent focus:ring-2 focus:ring-sesame-accent/20",
          "disabled:bg-sesame-surface-muted disabled:cursor-not-allowed",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
