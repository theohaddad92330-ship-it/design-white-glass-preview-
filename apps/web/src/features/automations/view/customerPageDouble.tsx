import type { ReactNode } from 'react'

/**
 * Le double de `CustomerPage` des tests des écrans Automatisations : la coque rend le titre, la phrase et les actions
 * de l'en-tête — le double les montre pour qu'un test lise ce que l'écran DÉCLARE à la coque.
 */
export function CustomerPage({
  children,
  pageTitle,
  pageSubtitle,
  headerActions,
}: {
  children: ReactNode
  pageTitle?: string
  pageSubtitle?: string
  headerActions?: ReactNode
}) {
  return (
    <main>
      <header data-testid="page-head">
        <h1>{pageTitle}</h1>
        <p>{pageSubtitle}</p>
        {headerActions}
      </header>
      {children}
    </main>
  )
}
