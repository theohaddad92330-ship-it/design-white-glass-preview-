import { createContext, useContext, type ReactNode } from 'react'
import { SettingsScreenHeader, type SettingsGuide, type SettingsScope } from './SettingsScreenHeader'

/**
 * Vrai quand la vue est un ONGLET d'une page de Réglages : la page porte déjà l'eyebrow, le titre et la phrase (maquettes
 * Théo V22 : titre, phrase, onglets, puis des blocs). La vue ne remet pas un second h1 — seulement ses gestes.
 */
export const SettingsEmbeddedContext = createContext(false)

type SettingsViewHeaderProps = {
  scope: SettingsScope
  title: string
  subtitle?: string
  actions?: ReactNode
  guide?: SettingsGuide
}

/** L'en-tête d'une vue de Réglages : complet seule, réduit à ses gestes quand la page d'onglets le porte. */
export function SettingsViewHeader({ scope, title, subtitle, actions, guide }: SettingsViewHeaderProps) {
  const embedded = useContext(SettingsEmbeddedContext)
  if (embedded) return actions ? <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div> : null
  return (
    <div className="mb-5">
      <SettingsScreenHeader scope={scope} title={title} description={subtitle} actions={actions} guide={guide} />
    </div>
  )
}
