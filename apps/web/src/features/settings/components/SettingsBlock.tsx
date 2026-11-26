import type { ReactNode } from 'react'
import { cn, Text } from '@bellum/ui'

type SettingsBlockProps = {
  /** Le titre du bloc, DANS la carte (Théo V22 : titre, phrase, filet, puis les réglages). */
  label: string
  description?: string
  children: ReactNode
  /** `danger` : bordure et titre rouges — la zone de suppression. */
  tone?: 'default' | 'danger'
  /** Un geste du bloc, à droite du titre (« Ajouter », « Exporter »…). */
  actions?: ReactNode
  className?: string
  /** Sans carte ni titre : les lignes seules, pour qu'un bloc en accueille un autre (« Rythme et canaux »). */
  bare?: boolean
  testId?: string
}

/**
 * Le bloc de Réglages des maquettes Théo V22 : UNE carte arrondie, le titre et sa phrase en tête, un filet, puis les
 * lignes. `SettingsGroup` de `@bellum/ui` pose le titre AU-DESSUS de la carte (forme Linear) : la maquette ne l'a
 * jamais montré ainsi.
 */
export function SettingsBlock({
  label,
  description,
  children,
  tone = 'default',
  actions,
  className,
  testId,
}: SettingsBlockProps) {
  const isDanger = tone === 'danger'
  return (
    <section
      data-testid={testId}
      className={cn(
        'mb-6 overflow-hidden rounded-xl border bg-card last:mb-0',
        isDanger ? 'border-[var(--danger-soft-text)]/30' : 'border-[var(--bellum-border)]',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <Text element="h2" weight="semibold" size="base" className={isDanger ? 'text-[var(--danger-soft-text)]' : ''}>
            {label}
          </Text>
          {description ? (
            <Text element="p" size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  )
}
