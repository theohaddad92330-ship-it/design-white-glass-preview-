import type { ReactNode } from 'react'
import { Box, Text, cn } from '@bellum/ui'

/**
 * Refonte Théo (PR12) — la grammaire « bibliothèque » des maquettes Découvrir
 * (`decouvrir-historique.html` : `.d3-library-title`, `.d3-quiet-card`), reprise
 * par les écrans qui n'ont pas de maquette propre (lots d'analyse, radar).
 *
 * `LibraryTitle` : le titre d'une section (h2 `text-xl`), et à droite son repère
 * discret (un compte, une période) ou ses commandes.
 */
export function LibraryTitle({ id, title, aside }: { id?: string; title: string; aside?: ReactNode }) {
  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <Text element="h2" id={id} size="xl" weight="semibold" className="tracking-tight">
        {title}
      </Text>
      {typeof aside === 'string' ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {aside}
        </Text>
      ) : (
        aside
      )}
    </Box>
  )
}

/**
 * `.d3-quiet-card` — l'état vide qui DIT quoi faire, sur le fond d'accent doux :
 * jamais un tableau vide et muet, jamais un « 0 ».
 */
export function QuietCard({
  title,
  children,
  action,
  className,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Box
      display="flex"
      className={cn(
        'flex-col gap-2 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-5',
        className,
      )}
    >
      <Text element="h3" size="lg" weight="semibold">
        {title}
      </Text>
      {children ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {children}
        </Text>
      ) : null}
      {action ? <Box className="pt-1">{action}</Box> : null}
    </Box>
  )
}
