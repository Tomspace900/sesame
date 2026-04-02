import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5',
    'rounded-pill px-3 py-1',
    'text-xs font-body font-medium',
    'border border-transparent',
  ],
  {
    variants: {
      variant: {
        detected: 'bg-sesame-surface-muted text-sesame-text-muted',
        confirmed: 'bg-sesame-transit/15 text-sesame-text',
        in_progress: 'bg-sesame-accent/15 text-sesame-text',
        completed: 'bg-sesame-positive/15 text-sesame-text',
        returned: 'bg-sesame-transit/15 text-sesame-text',
        cancelled: 'bg-sesame-surface-muted text-sesame-text-muted',
        // Generic outline for filter chips
        outline:
          'border-2 border-sesame-text bg-transparent text-sesame-text',
      },
    },
    defaultVariants: {
      variant: 'detected',
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({
  className,
  variant,
  children,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
