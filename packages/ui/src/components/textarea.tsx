import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        // Théo DS §2.13 — même anatomie que `Input` : rayon 8, bordure `--border2`, halo de focus 3 px.
        'flex min-h-[80px] w-full rounded-control border border-[var(--bellum-border-strong)] bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background transition-[border-color,box-shadow] duration-immediate ease-bellum-out placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--bellum-text-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--bellum-accent-bg)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})
