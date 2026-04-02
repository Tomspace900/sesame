import { cn } from "@/lib/utils.ts";
import React from "react";

export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <p
      className={cn(
        "font-body font-medium text-xs text-sesame-text-muted uppercase tracking-wider mb-3",
        className
      )}
    >
      {children}
    </p>
  );
}
