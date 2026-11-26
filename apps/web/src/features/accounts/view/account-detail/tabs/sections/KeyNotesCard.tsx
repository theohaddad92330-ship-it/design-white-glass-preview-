import type { KeyNote } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'

/**
 * FINIR-V2-27-09 — l'affichage GÉNÉRIQUE de `keyNoteSchema` (voir son
 * docblock, `@bellum/contracts`). Monté cinq fois, une par bloc CSV sans
 * champ d'accueil avant ce lot (`structural_reading_axes`,
 * `ecosystem_third_parties`, `opportunity_domains`, `financial_indicators`,
 * `data_reliability_notes`) — le titre et l'icône changent par appel, jamais
 * le composant.
 *
 * ⚠️ Comme partout : une note sans `label` ne fait AUCUNE ligne (« on
 * n'affiche pas ce qu'on n'a pas », doctrine) — jamais une ligne vide. Un
 * champ optionnel absent (`interpretation`/`implication`/`reliability`/
 * `amount`) ne rend PAS non plus « non mesuré » : c'est une ligne de DÉTAIL
 * dans une liste, pas un score — l'absence s'y lit en ne l'affichant pas,
 * jamais en l'inventant.
 */
type KeyNotesCardProps = {
  title: string
  icon: ReactNode
  notes: KeyNote[] | undefined
}

/** Louis 14/10/2026 — les garde-fous ne s'affichent nulle part : une note dont la
 *  fiabilité est « Garde-fou » (donnée stockée) ne fait aucune ligne. */
function isGuardrailNote(note: KeyNote): boolean {
  return typeof note.reliability === 'string' && /garde-?fou/i.test(note.reliability)
}

export function KeyNotesCard({ title, icon, notes }: KeyNotesCardProps) {
  const renderable = (notes ?? []).filter(
    (note): note is KeyNote & { label: string } =>
      typeof note.label === 'string' && note.label.length > 0 && !isGuardrailNote(note),
  )
  if (renderable.length === 0) return null

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-center gap-3 border-b border-[var(--bellum-border)] px-4 py-3">
        {icon}
        <Text element="h3" size="sm" weight="semibold">
          {title}
        </Text>
      </div>
      <ul className="divide-y divide-[var(--bellum-border)]">
        {renderable.map((note, index) => (
          <KeyNoteRow key={`${note.label}-${index}`} note={note} />
        ))}
      </ul>
    </Card>
  )
}

function formatKeyNoteAmount(note: KeyNote, locale: string): string | null {
  if (typeof note.amount !== 'number' || !Number.isFinite(note.amount)) return null
  const formatted = note.currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: note.currency, maximumFractionDigits: 0 }).format(
        note.amount,
      )
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(note.amount)
  return note.period ? `${formatted} — ${note.period}` : formatted
}

function KeyNoteRow({ note }: { note: KeyNote }) {
  const { t } = useTranslation('accountDetail')
  const amount = formatKeyNoteAmount(note, appLocale())

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {note.label}
        </Text>
        {amount ? (
          <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {amount}
          </Text>
        ) : null}
      </div>
      {note.constat ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {note.constat}
        </Text>
      ) : null}
      {note.interpretation ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('keyNotes.interpretationLabel', { value: note.interpretation })}
        </Text>
      ) : null}
      {note.implication ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('keyNotes.implicationLabel', { value: note.implication })}
        </Text>
      ) : null}
      {note.reliability ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('keyNotes.reliabilityLabel', { value: note.reliability })}
        </Text>
      ) : null}
    </li>
  )
}
