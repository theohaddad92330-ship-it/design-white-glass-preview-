import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * Théo C sequences-* — `.page-head` des écrans Séquences : sur-titre éventuel, h1 30 px, une phrase, les actions à
 * droite (elles passent dessous sur mobile).
 *
 * Pourquoi l'écran le porte lui-même : Actions est une section à onglets, et l'en-tête de la coque y tait le titre
 * (le mot vit dans l'onglet, loi 4). La maquette, elle, nomme chaque vue — « Tes séquences », « Ta bibliothèque de
 * modèles », « Créer une séquence », le nom d'une campagne. L'écran passe donc `titleInScreen` à `CustomerPage` et
 * rend ce h1 unique (GA-347 : jamais deux h1), avec la typographie de `PageHeader`.
 */
export function SequencesPageHead({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4" data-testid="sequences-page-head">
      <Box className="flex min-w-0 flex-col gap-1.5">
        {eyebrow ? (
          <Text size="xs" weight="semibold" className="uppercase tracking-widest text-[var(--bellum-text-muted)]">
            {eyebrow}
          </Text>
        ) : null}
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)]">
          {title}
        </h1>
        {subtitle ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {subtitle}
          </Text>
        ) : null}
      </Box>
      {actions ? <Box className="flex flex-wrap items-center gap-2">{actions}</Box> : null}
    </header>
  )
}
