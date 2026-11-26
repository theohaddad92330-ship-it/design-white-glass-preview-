import type { Intervention } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useInterventions } from '@/features/playbooks/api'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { interventionHref, myQueue, sourceState } from '../cockpit'

/**
 * #2567.K2 — « CE QUI ATTEND TA DÉCISION » (retour client François Thomas,
 * 17/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC EXISTE À PART, ET NE RÉINVENTE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * « Des features à faire tous les jours doivent vivre dans Bellum » : suivi de
 * mission, CRA, facturation, besoins. La file existait déjà — `interventions`,
 * remplie par `InterventionsSweeper` à partir de douze natures (renouvellement
 * à risque, relevé manquant, facturation bloquée, besoin sans shortlist…) — et
 * elle était déjà RENDUE, dans `MyActivityBlock`, bloc 5 « Ce qui m'attend ».
 * Le défaut n'était pas l'absence, c'était la PLACE : neuvième et dernière
 * section d'un écran qui s'ouvre sur la prospection, sous un titre de tableau
 * de bord financier (« Mon activité ») que personne ne lit en cherchant « qu'
 * est-ce qui a besoin de moi aujourd'hui ? ».
 *
 * Ce composant ne recalcule rien : `myQueue` (filtre par propriétaire, ordre
 * du serveur) et `interventionHref` viennent de `../cockpit`, inchangés et
 * toujours testés là. Un second moteur de priorité sur le même objet
 * finirait par contredire le premier — la règle que `cockpit.ts` documente
 * déjà pour ce même bloc.
 */
export function DailyGesturesBlock() {
  const { t } = useTranslation('briefing')
  const { t: tPlaybooks } = useTranslation('playbooks')
  const interventions = useInterventions()
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const state = sourceState(interventions)
  const queue = myQueue(interventions.data ?? [], userId)

  if (state !== 'ready') {
    return (
      <Text size="sm" className="block text-[var(--bellum-text-muted)]">
        {state === 'loading' ? t('activity.loading') : t('state.unavailable')}
      </Text>
    )
  }

  if (queue.total === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('dailyGestures.empty')}
      </Text>
    )
  }

  return (
    <Box className="flex min-w-0 flex-col gap-2">
      {queue.shown.map(item => (
        <GestureRow key={item.id} item={item} t={tPlaybooks} />
      ))}
      {/* La file annonce ce qu'elle REPLIE — couper en silence ferait croire
          qu'il n'y a que ça à faire. */}
      {queue.hidden > 0 ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('dailyGestures.more', { count: queue.hidden })}
        </Text>
      ) : null}
    </Box>
  )
}

const GESTURE_ROW_CLASS = 'flex min-w-0 flex-col rounded-md border border-[var(--bellum-border)] px-3 py-2'

function GestureRow({ item, t }: { item: Intervention; t: (key: string) => string }) {
  const href = interventionHref(item)
  const body = (
    <>
      <Text size="xs" weight="medium" className="block">
        {t(`interventions.kinds.${item.kind}`)}
      </Text>
      {/* Le détail TEL QUEL, avec ses chiffres : « mission à risque » sans le
          nombre de jours n'aide personne à décider quoi faire aujourd'hui. */}
      <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
        {item.detail}
      </Text>
    </>
  )

  // Une ligne sans destination est un CONSTAT, pas un lien mort.
  if (!href) return <Box className={GESTURE_ROW_CLASS}>{body}</Box>
  return (
    <Link to={href} className={`${GESTURE_ROW_CLASS} hover:bg-[var(--bellum-surface-2)]`}>
      {body}
    </Link>
  )
}
