import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * Théo B m1 / m2 — l'espace de travail de la Messagerie (`.v13-mail-workspace`), le MÊME pour les quatre vues : la
 * liste à gauche, le volet de lecture à droite. Sur mobile, la liste PUIS l'élément ouvert (`reading`), avec son
 * « ← Retour aux messages ».
 */
export function MailWorkspace({ list, reader, reading }: { list: ReactNode; reader: ReactNode; reading: boolean }) {
  return (
    <Box
      data-testid="mailbox-workspace"
      className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
    >
      <Box className={reading ? 'hidden md:block' : 'block'}>{list}</Box>
      {reader ? <Box className={reading ? 'block' : 'hidden md:block'}>{reader}</Box> : null}
    </Box>
  )
}

/** La liste d'une vue (`.v13-mail-list`) : son titre en capitales, son compte, ses lignes denses, son pied. */
export function MailListPanel({
  titleId,
  title,
  count,
  listLabel,
  headerExtra,
  foot,
  children,
}: {
  titleId: string
  title: string
  count: number
  listLabel: string
  headerExtra?: ReactNode
  foot?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card"
    >
      <Box className="flex items-center justify-between gap-2 border-b border-[var(--bellum-border)] px-4 py-3">
        <Text
          element="h2"
          id={titleId}
          size="xs"
          weight="semibold"
          className="uppercase tracking-wide text-[var(--bellum-text-secondary)]"
        >
          {title}
        </Text>
        <Box className="flex items-center gap-3">
          {headerExtra}
          <Text element="span" size="xs" weight="semibold" className="tabular-nums text-[var(--bellum-text-secondary)]">
            {count}
          </Text>
        </Box>
      </Box>
      <ul className="flex flex-col divide-y divide-[var(--bellum-border)]" aria-label={listLabel}>
        {children}
      </ul>
      {foot}
    </section>
  )
}

/** Le volet de lecture (`.v13-mail-reader`) : une carte aérée, le même cadre pour un fil, un brouillon, un envoi. */
export function MailReaderFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-testid="mailbox-reader"
      className="flex min-w-0 flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-6"
    >
      {children}
    </section>
  )
}
