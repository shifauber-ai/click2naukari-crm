import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1 backdrop-blur-sm',
  {
    variants: {
      variant: {
        default:
          'border-primary/25 bg-primary/15 text-primary hover:bg-primary/20',
        secondary:
          'border-border/40 bg-secondary/40 text-secondary-foreground hover:bg-secondary/60',
        destructive:
          'border-destructive/25 bg-destructive/15 text-destructive hover:bg-destructive/20',
        outline: 'border-border/50 text-foreground hover:border-border/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
