import { needFramingOf, type OpenNeedRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { formatCents } from '@/lib/money'

/**
 * #4270.3 (18/10) — un besoin se lit comme un PROJET À CADRER : périmètre, sponsor, budget, échéance.
 * RV4-E-FIX 4291.7 — pour TOUS les espaces, plus seulement le profil forfait / conseil ; chaque absence est
 * nommée « à cadrer », jamais inventée.
 *
 * Aucun champ neuf (`needFramingOf`) : le périmètre est le contexte du besoin,
 * le sponsor son décideur déclaré, le budget son budget. La fiche ne les rend
 * plus plus bas quand cette carte est montée — l'ordre change, rien n'apparaît
 * deux fois (GA-26). Chaque absence se NOMME, jamais un « 0 » (GA-18 / GA-19).
 */
export function NeedFramingCard({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const framing = needFramingOf(need)
  // #4291.7 — « à cadrer » dure tant qu'un des quatre éléments manque ; cadré, le titre ne porte plus la mention.
  const framed =
    framing.scope !== null && !!need.decision_maker_name && !!need.deadline_at && framing.budgetCents !== null
  return (
    <Card className="p-4">
      <Text element="h2" size="sm" weight="semibold">
        {t(framed ? 'needSheet.framing.titleFramed' : 'needSheet.framing.title')}
      </Text>
      <dl className="mt-2 grid gap-2">
        <FramingField label={t('needSheet.framing.scope')}>
          {framing.scope ?? <UnknownValue reason={t('needSheet.framing.scopeToFrame')} />}
        </FramingField>
        <FramingField label={t('needSheet.framing.sponsor')}>
          {need.decision_maker_name ?? <UnknownValue reason={t('needSheet.framing.sponsorToFrame')} />}
        </FramingField>
        <FramingField label={t('needSheet.framing.deadline')}>
          {need.deadline_at ? (
            formatDate(need.deadline_at)
          ) : (
            <UnknownValue reason={t('needSheet.framing.deadlineToFrame')} />
          )}
        </FramingField>
        <FramingField label={t('needSheet.budget')}>
          {framing.budgetCents === null ? (
            <UnknownValue reason={t('needSheet.framing.budgetToFrame')} />
          ) : (
            formatCents(Number(framing.budgetCents))
          )}
        </FramingField>
      </dl>
    </Card>
  )
}

/** Même rendu que le `Field` de la fiche besoin (échelle 12/14 px, jetons de thème). */
function FramingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="min-w-[7rem] text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}
