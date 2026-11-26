import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * Théo B c1-repertoire `.v13-box > .v13-empty` — un état de la liste (aucun résultat, aucun recommandé,
 * vue vide, erreur de chargement) est une CARTE centrée : un titre, une phrase, ses gestes.
 */
export function ContactsStateBox({
  title,
  description,
  actions,
  role,
}: {
  title: string
  description: string
  actions?: ReactNode
  role?: 'alert'
}) {
  return (
    <div role={role} className="rounded-overlay border border-[var(--bellum-border)] bg-card px-6 py-12 text-center">
      <h3 className="mb-2 text-lg font-semibold text-[var(--bellum-text-primary)]">{title}</h3>
      <Text element="p" size="sm" className="mx-auto mb-5 text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
      {actions ? <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
