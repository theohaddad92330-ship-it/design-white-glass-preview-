import type { ReactNode } from 'react'

export type PageProps = {
  children: ReactNode
}

/**
 * Page — base page wrapper.
 */
export function Page({ children }: PageProps) {
  return <>{children}</>
}
