import React from 'react';
import { cn } from '@/lib/utils.ts';

export function TextLink({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'font-body text-sm text-sesame-text-muted underline underline-offset-2',
        'cursor-pointer bg-transparent border-none p-0',
        'hover:opacity-70 transition-opacity',
        className,
      )}
    >
      {children}
    </button>
  );
}
