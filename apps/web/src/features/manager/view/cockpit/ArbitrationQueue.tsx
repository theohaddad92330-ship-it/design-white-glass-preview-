import type { ManagerCoverageMap, ManagerTeamStats } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { revealTarget } from '@/lib/reveal-target'

/**
 * « À traiter » — #4158 (complément BU) (lot L7, Louis 14/10/2026), héritier de la file
 * d'arbitrages de #1461.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ LE 14/10
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce bloc est TOUJOURS ouvert et vient EN PREMIER (il vivait replié dans
 * « Aujourd'hui »). Il fusionne trois sources qui disaient la même chose à deux
 * endroits : les arbitrages d'« Aujourd'hui », les doublons de couverture de
 * « Staffing » (une carte PAR compte, nommé), et deux entrées neuves —
 * invitations en attente (vers Réglages › Équipe) et collègues qui attendent la
 * description de l'ESN (même règle que L3 #18).
 *
 * Une carte = un sujet, UNE phrase, UN bouton vers l'action. Triées par
 * URGENCE, dans cet ordre écrit (et non par ampleur, qui classerait des
 * personnes) : actions en retard (une échéance est déjà passée) → comptes
 * travaillés en double (deux commerciaux brûlent le même client) → collègues
 * bloqués faute de description de l'ESN → comptes sans responsable → comptes
 * en veille → périmètres non couverts → invitations sans réponse.
 *
 * Vide : UNE ligne discrète « Rien à arbitrer », pas un bloc (#4158 (complément BU)).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'A PAS CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'ajoute AUCUNE mesure qu'il ne lit pas dans `GET /manager/team-stats`, et
 * il ne DÉCIDE rien : chaque carte mène à l'endroit qui porte déjà le geste.
 * Une situation qu'on ne peut pas MESURER n'apparaît pas — pas de carte
 * « charge déséquilibrée », qui serait un jugement sur des personnes déguisé en
 * mesure. Un champ absent (API plus ancienne) ne fait aucune carte : on NARROW,
 * on ne replie jamais sur zéro (GA-19).
 */

/** Où chaque arbitrage envoie. Les destinations sont posées par la page. */
export const TEAM_ANCHORS = {
  unassigned: 'team-unassigned',
  sharedActions: 'team-shared-actions',
  members: 'team-members',
  coverageMap: 'team-coverage-map',
  activity: 'team-activity',
} as const

type TeamAnchor = (typeof TEAM_ANCHORS)[keyof typeof TEAM_ANCHORS]

/** Au-delà, les doublons se résument en une ligne : le bloc reste lisible. */
const DUPLICATE_CARDS_LIMIT = 3

/** Le seuil de veille du service (`STALE_ACCOUNT_DAYS`), dit à l'écran. */
const STALE_DAYS = 14

type Card = {
  kind: string
  key: string
  sentence: string
  /** Le geste : une ancre de la page (bouton), ou une route (lien déjà rendu). */
  action: { label: string; anchor: TeamAnchor } | { link: ReactNode }
}

export function ArbitrationQueue({ data }: { data: ManagerTeamStats }) {
  const { t } = useTranslation('manager')
  const nameOf = (id: string) => data.members.find(m => m.user_id === id)?.name ?? id
  const cards: Card[] = []

  if (data.shared_actions && data.shared_actions.overdue > 0) {
    cards.push({
      kind: 'overdue',
      key: 'overdue',
      sentence: t('board.toHandle.overdue.title', { count: data.shared_actions.overdue }),
      action: { label: t('board.toHandle.overdue.cta'), anchor: TEAM_ANCHORS.sharedActions },
    })
  }

  const duplicates = data.duplicate_coverage?.accounts ?? []
  for (const account of duplicates.slice(0, DUPLICATE_CARDS_LIMIT)) {
    cards.push({
      kind: 'duplicate',
      key: `duplicate-${account.account_id}`,
      sentence: t('board.toHandle.duplicate.title', {
        company: account.company_name,
        names: account.reps.map(nameOf).join(', '),
      }),
      action: {
        link: (
          <Link to="/accounts/$id" params={{ id: account.account_id }} className={CTA_CLASS}>
            {t('board.toHandle.duplicate.cta')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ),
      },
    })
  }

  for (const userId of data.awaiting_esn_profile ?? []) {
    cards.push({
      kind: 'awaiting-esn',
      key: `awaiting-${userId}`,
      sentence: t('board.toHandle.awaitingEsn.title', { name: nameOf(userId) }),
      action: {
        link: (
          <Link to="/settings/profile" className={CTA_CLASS}>
            {t('board.toHandle.awaitingEsn.cta')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ),
      },
    })
  }

  if (data.coverage && data.coverage.unassigned > 0) {
    cards.push({
      kind: 'unassigned',
      key: 'unassigned',
      sentence: t('board.toHandle.unassigned.title', { count: data.coverage.unassigned }),
      action: { label: t('board.toHandle.unassigned.cta'), anchor: TEAM_ANCHORS.unassigned },
    })
  }

  // ⚠️ `stale_accounts` est OPTIONNEL : un repli sur zéro serait un faux zéro.
  const stale = data.members.reduce(
    (sum, m) => sum + (typeof m.stale_accounts === 'number' && m.stale_accounts > 0 ? m.stale_accounts : 0),
    0,
  )
  if (stale > 0) {
    cards.push({
      kind: 'stale',
      key: 'stale',
      sentence: t('board.toHandle.stale.title', { count: stale, days: STALE_DAYS }),
      action: { label: t('board.toHandle.stale.cta'), anchor: TEAM_ANCHORS.members },
    })
  }

  const uncovered = data.coverage_map ? countUncoveredScopes(data.coverage_map) : 0
  if (uncovered > 0) {
    cards.push({
      kind: 'white-space',
      key: 'white-space',
      sentence: t('board.toHandle.whiteSpace.title', { count: uncovered }),
      action: { label: t('board.toHandle.whiteSpace.cta'), anchor: TEAM_ANCHORS.coverageMap },
    })
  }

  if (typeof data.pending_invitations === 'number' && data.pending_invitations > 0) {
    cards.push({
      kind: 'pending-invitations',
      key: 'pending-invitations',
      sentence: t('board.toHandle.pendingInvitations.title', { count: data.pending_invitations }),
      action: {
        link: (
          <Link to="/settings/team" className={CTA_CLASS}>
            {t('board.toHandle.pendingInvitations.cta')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ),
      },
    })
  }

  const moreDuplicates = Math.max(0, duplicates.length - DUPLICATE_CARDS_LIMIT)

  return (
    <section aria-label={t('board.toHandle.eyebrow')} data-board-block="to-handle" className="space-y-3">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t('board.toHandle.eyebrow')}
      </Text>
      {cards.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('board.toHandle.clear')}
        </Text>
      ) : (
        <>
          <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('board.toHandle.title', { count: cards.length })}
          </Text>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map(card => (
              <article
                key={card.key}
                data-kind={card.kind}
                className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
              >
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {card.sentence}
                </Text>
                {'anchor' in card.action ? (
                  // Ce qui se clique se tabule (GA-35) : un vrai bouton, et une
                  // destination qui prend le FOCUS, pas seulement le défilement.
                  <AnchorButton label={card.action.label} anchor={card.action.anchor} />
                ) : (
                  card.action.link
                )}
              </article>
            ))}
          </div>
          {moreDuplicates > 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('board.toHandle.duplicateMore', { count: moreDuplicates })}
            </Text>
          ) : null}
        </>
      )}
    </section>
  )
}

function AnchorButton({ label, anchor }: { label: string; anchor: TeamAnchor }) {
  return (
    <button type="button" onClick={() => revealTarget(anchor)} className={CTA_CLASS}>
      {label}
      <ArrowRight className="size-3.5" aria-hidden />
    </button>
  )
}

// `min-h-11` = 44 px : la cible tient au doigt (GA-30), pas seulement au pointeur.
const CTA_CLASS =
  'mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-[var(--bellum-text-accent)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

/**
 * Une ZONE BLANCHE = un segment qui pèse des comptes et que personne ne porte.
 * ⚠️ `owners.length === 0` ET `total > 0` : un segment vide n'est pas un
 * périmètre non couvert, c'est un segment vide.
 */
function countUncoveredScopes(map: ManagerCoverageMap): number {
  return [...map.sectors, ...map.territories, ...map.personas].filter(
    segment => segment.total > 0 && segment.owners.length === 0,
  ).length
}
