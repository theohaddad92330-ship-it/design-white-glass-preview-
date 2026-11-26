import type { CSSProperties } from 'react'
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner'

/**
 * Toaster — sonner host that defaults to the BellumAI dark theme. Apps that
 * want light/dark switching can pass an explicit `theme` prop.
 *
 * `--normal-bg/text/border` map to the same CSS variables used by the rest of
 * `@bellum/ui`, so the toast surface stays consistent with other primitives.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { toast }
export type { ToasterProps }
