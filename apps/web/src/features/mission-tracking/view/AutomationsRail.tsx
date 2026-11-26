import type { RoutineKey } from '@bellum/contracts'
import { Box, Skeleton, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useRoutines } from '@/features/routines/api'
import type { AutomationGap } from '../derive'

/**
 * LES AUTOMATISATIONS DE MISSION — un GARDE-FOU CONTEXTUEL, plus une colonne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1380 — CE QUE CE LOT CHANGE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * « Le panneau Automatisations permanent prend trop de largeur au tableau.
 * Conserver sa valeur mais le transformer en bloc compact : "3 automatisations
 * actives · 1 inactive", CTA "Voir / gérer". Sur Suivi, ne montrer directement
 * qu'une automatisation si elle est liée à un problème visible. Objectif :
 * garde-fou contextuel, pas deuxième colonne de configuration permanente. »
 *
 * C'est aussi la décision du 04/09 recopiée telle quelle : « Pilotage garde une
 * synthèse "2 actives · 1 inactive → Gérer" ». Le rail cesse donc d'occuper
 * 320 px à droite de la table — il devient une ligne au-dessus d'elle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun interrupteur ici. Un réglage vit à un seul endroit (loi 1 du tome 7,
 * GA-26) : la porte d'écriture d'une routine EST Réglages › Routines
 * (`RoutineFunctioningDialog.tsx`, `useUpdateRoutine`). Ce bloc AFFICHE l'état et RENVOIE
 * au réglage ; il ne l'édite pas. Compacter un panneau n'est pas une raison de
 * lui donner un pouvoir qu'il n'avait pas.
 *
 * ⚠️ **Un manque n'est PAS le compte des routines éteintes.** Il n'apparaît que
 * si la routine est inactive ET qu'au moins une ligne de la file porte le
 * problème qu'elle aurait couvert (`automationGaps`) : « 1 CRA manquant aurait
 * dû déclencher une relance » est l'exemple du retour, et une routine éteinte
 * sans aucun problème visible n'a rien à reprocher à personne.
 */
export const MISSION_ROUTINE_KEYS: readonly RoutineKey[] = [
  'timesheet_chase',
  'invoice_readiness',
  'mission_ending',
  'margin_alert',
]

export function AutomationsRail({ gaps }: { gaps: readonly AutomationGap[] }) {
  const { t, i18n } = useTranslation('missionTracking')
  const { data, isLoading, isError } = useRoutines()
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'

  if (isLoading) return <Skeleton className="h-12 w-full" />

  if (isError || !data) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('automations.error')}
      </Text>
    )
  }

  const rows = data.filter(view => MISSION_ROUTINE_KEYS.includes(view.definition.key))
  if (rows.length === 0) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('automations.empty')}
      </Text>
    )
  }

  const active = rows.filter(view => view.subscription.enabled).length
  const nameOf = (key: string) => rows.find(view => view.definition.key === key)?.definition.name[locale] ?? key

  return (
    <Box className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] px-4 py-3">
      <Box className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Text element="span" size="sm" weight="medium">
          {t('automations.summary', { active, inactive: rows.length - active })}
        </Text>
        <Link
          to="/settings/routines"
          className="text-sm text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center"
        >
          {t('automations.manage')}
        </Link>
      </Box>

      {/* Le garde-fou ÉTEINT que la file rend visible. Un seul par routine, et
          seulement quand un problème le montre. */}
      {gaps.map(gap => (
        <Text key={gap.routine} size="xs" color="text-[var(--warning-soft-text)]">
          {t(`automations.gaps.${gap.routine}`, { count: gap.count, name: nameOf(gap.routine) })}
        </Text>
      ))}
    </Box>
  )
}
