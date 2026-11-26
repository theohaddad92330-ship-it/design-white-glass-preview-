import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Standard shadcn/ui className merger: clsx for conditional classes, then
 * tailwind-merge to dedupe conflicting Tailwind utilities (last write wins).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
