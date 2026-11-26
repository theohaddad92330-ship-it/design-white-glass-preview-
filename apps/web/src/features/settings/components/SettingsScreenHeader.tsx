import type { ReactNode } from 'react'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

export type SettingsGuide = {
  title: string
  heading: string
  intro: string
  stepsTitle: string
  steps: readonly string[]
  keepTitle: string
  keep: string
}

export type SettingsScope = 'personal' | 'space' | 'laura'

/** « Paramètres · Personnel » : où l'on est, avant le titre (un seul rendu pour tous les écrans de Réglages). */
export function SettingsEyebrow({ scope }: { scope: SettingsScope }) {
  const { t } = useTranslation('settingsHub')
  return (
    <Text
      element="p"
      size="xs"
      weight="semibold"
      className="mb-1 uppercase tracking-widest text-[var(--bellum-text-accent)]"
    >
      {t(`eyebrow.${scope}`)}
    </Text>
  )
}

type SettingsScreenHeaderProps = {
  /** Sans `scope`, pas d'eyebrow (l'écran Intégrations n'en porte pas dans sa maquette). */
  scope?: SettingsScope
  title: string
  description?: string
  actions?: ReactNode
  /** « Comment travailler ici ? » — le parcours utile, REPLIÉ au-dessus du titre (un clic, jamais caché). */
  guide?: SettingsGuide
}

/**
 * L'en-tête commun des écrans de Réglages (maquettes Théo V22) : le repli « Comment travailler ici ? » (s'il existe),
 * l'eyebrow, le titre de niveau 1 — Réglages ne monte aucun `PageHeader`, c'est le seul — et sa phrase.
 */
export function SettingsScreenHeader({ scope, title, description, actions, guide }: SettingsScreenHeaderProps) {
  return (
    <div className="space-y-4">
      {guide ? (
        <details className="group rounded-lg">
          <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium text-[var(--bellum-text-accent)]">
            {guide.title}
          </summary>
          <div className="mt-2 space-y-3 rounded-lg border border-[var(--bellum-border)] bg-card px-4 py-3">
            <div>
              <Text element="h2" size="sm" weight="semibold">
                {guide.heading}
              </Text>
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {guide.intro}
              </Text>
            </div>
            <div>
              <Text element="h3" size="sm" weight="medium">
                {guide.stepsTitle}
              </Text>
              <ol className="list-decimal pl-5 text-sm text-[var(--bellum-text-secondary)]">
                {guide.steps.map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div>
              <Text element="h3" size="sm" weight="medium">
                {guide.keepTitle}
              </Text>
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {guide.keep}
              </Text>
            </div>
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {scope ? <SettingsEyebrow scope={scope} /> : null}
          <Text element="h1" weight="bold" size="2xl">
            {title}
          </Text>
          {description ? (
            <Text element="p" size="base" className="mt-1 text-[var(--bellum-text-secondary)]">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
