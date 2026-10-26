import { cn } from 'cn';
import type * as React from 'react';

type CardVariant = 'default' | 'mini' | 'featured';

/**
 * `mini` and `featured` are awesomer's gradient cards (07-UI-SPEC v2 Card
 * treatments): the `.card-mini` / `.card-featured` component classes draw the
 * fill, border and glow, so the default's border, bg-card and shadow-sm go.
 * `relative isolate overflow-hidden` hosts a CornerNumeral behind the content.
 */
function Card({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & { variant?: CardVariant }) {
  if (variant === 'default') {
    return (
      <div
        data-slot="card"
        className={cn(
          'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        'relative isolate flex flex-col gap-6 overflow-hidden rounded-xl py-6 text-card-foreground',
        variant === 'mini' ? 'card-mini' : 'card-featured',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-medium', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('font-prose text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
