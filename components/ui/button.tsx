import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 btn-press',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground btn-glow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_4px_16px_-4px_hsl(var(--destructive)/0.3)] hover:bg-destructive/90 hover:shadow-[0_6px_24px_-4px_hsl(var(--destructive)/0.45)] hover:-translate-y-px',
        outline:
          'border border-border/60 bg-card/40 backdrop-blur-md text-foreground hover:bg-card/70 hover:border-primary/30 focus-glow',
        secondary:
          'bg-secondary/60 text-secondary-foreground backdrop-blur-md border border-border/40 hover:bg-secondary/80',
        ghost:
          'hover:bg-white/[0.04] hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-10 rounded-md px-7',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
