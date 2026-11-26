import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, type, ...props }, ref) {
  return (
    <input
      type={type}
      className={cn(
        // Théo DS §2.13 — rayon de contrôle 8 px, bordure `--border2`, focus = bordure
        // accent + halo 3 px `--accent-bg`. Le fond reste le CREUX de la page
        // (`bg-background`) : un contrôle au repos se tient par son fond (tokens.css).
        'flex h-10 w-full rounded-control border border-[var(--bellum-border-strong)] bg-background px-3 py-2 text-sm ring-offset-background transition-[border-color,box-shadow] duration-immediate ease-bellum-out file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--bellum-text-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--bellum-accent-bg)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
