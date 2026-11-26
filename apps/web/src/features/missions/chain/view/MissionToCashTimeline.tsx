import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import {
  currentMissionToCashStage,
  missionToCashNoGo,
  type MissionChainState,
  type MissionToCashStage,
} from '../missionChain'

/**
 * LA TIMELINE MISSION-TO-CASH — #2421.
 *
 * Le DÉTAIL de la bande, jamais une seconde chaîne : les quatorze étapes sont
 * dérivées par `deriveMissionToCash` (même fichier, mêmes calculs que les cinq
 * maillons, GA-26). Elle vit REPLIÉE sous la bande — « ne pas forcer
 * l'utilisateur à lire toutes les timelines saines », dit l'issue — et son
 * résumé nomme l'étape ACTUELLE exacte : c'est la réponse au NO-GO (« la
 * mission affiche "facturation en cours" sans indiquer l'étape exacte, le
 * blocage, le responsable et la preuve »).
 *
 * Chaque ligne dit : l'étape, son état, son motif (bloqueur ou raison), son
 * RESPONSABLE (une règle, un nom résolu — jamais deviné ; sans nom, l'étape
 * ouverte est une EXCEPTION), DEPUIS QUAND elle attend, et la PREUVE qui l'a
 * fait avancer (avec sa source, c80).
 *
 * ⚠️ Aucun taux, aucun « 9 étapes sur 14 » : ce serait un taux de complétude de
 * NOS données déguisé en avancement (garde de la bande, même raison).
 */

const STATE_VARIANT: Readonly<
  Record<Exclude<MissionChainState, 'not_measured'>, 'default' | 'warning' | 'success' | 'secondary'>
> = {
  done: 'success',
  pending: 'default',
  blocked: 'warning',
  not_applicable: 'secondary',
  not_due: 'secondary',
  in_progress: 'default',
}

const DAY_MS = 86_400_000

export function MissionToCashTimeline({ stages, now }: { stages: readonly MissionToCashStage[]; now: Date }) {
  const { t } = useTranslation('missions')
  const current = currentMissionToCashStage(stages)
  const title = t('chain.timeline.toggle')
  // #2421.7 — LA GARDE NO-GO, appelée pour de vrai : une étape incohérente
  // (bloquée sans motif, ouverte sans responsable ni exception, franchie sans
  // preuve) ne se tait plus, elle se DIT — c'est la réponse au NO-GO
  // (« jamais "facturation en cours" sans étape, blocage, responsable et
  // preuve »).
  const violations = missionToCashNoGo(stages)
  return (
    <details className="mt-3 rounded-md border border-border/60 p-2">
      {/* ⚠️ `<summary>` est tabulable et s'ouvre au clavier sans une ligne de
          script (GA-35) ; `pointer-coarse:min-h-11` tient la cible tactile. */}
      <summary className="cursor-pointer pointer-coarse:min-h-11">
        <Text element="span" size="sm" weight="medium">
          {title}
        </Text>
        <Text element="span" size="xs" className="ml-2 text-[var(--bellum-text-secondary)]">
          {current
            ? t('chain.timeline.current', { stage: t(`chain.stages.${current.stage}`) })
            : t('chain.timeline.noCurrent')}
        </Text>
      </summary>
      {violations.length > 0 ? <NoGoWarning violations={violations} /> : null}
      <ol aria-label={title} className="mt-2 flex list-none flex-col gap-2">
        {stages.map(stage => (
          <StageRow key={stage.stage} stage={stage} now={now} />
        ))}
      </ol>
    </details>
  )
}

/**
 * #2421.7 — l'appelant réel de `missionToCashNoGo` : une liste de violations
 * nommées (`<étape>:<défaut>`), jamais comptées (aucun taux, même règle que la
 * bande). Chaque défaut est traduit avec l'étape en clair.
 */
function NoGoWarning({ violations }: { violations: readonly string[] }) {
  const { t } = useTranslation('missions')
  return (
    <Box className="mt-2 flex flex-col gap-1 rounded-md border border-border/60 p-2">
      <Badge variant="warning">{t('chain.timeline.noGo.title')}</Badge>
      <ul className="flex list-none flex-col gap-0.5">
        {violations.map(violation => {
          const [stageName, reason] = violation.split(':')
          return (
            <li key={violation}>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`chain.timeline.noGo.${reason}`, { stage: t(`chain.stages.${stageName}`) })}
              </Text>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}

function StageRow({ stage, now }: { stage: MissionToCashStage; now: Date }) {
  const { t } = useTranslation('missions')
  const detail = stage.blocker
    ? t(`readiness.blockers.${stage.blocker}`)
    : stage.reasonKey
      ? t(`chain.why.${stage.reasonKey}`)
      : null
  const open = stage.state === 'pending' || stage.state === 'in_progress' || stage.state === 'blocked'
  return (
    <li className="flex min-w-0 flex-col gap-1 border-b border-border/40 pb-2 last:border-b-0">
      <Box className="flex min-w-0 flex-wrap items-center gap-2">
        <Text size="sm" weight="medium" className="min-w-0">
          {t(`chain.stages.${stage.stage}`)}
        </Text>
        {stage.state === 'not_measured' ? null : (
          <Badge variant={STATE_VARIANT[stage.state]}>{t(`chain.state.${stage.state}`)}</Badge>
        )}
        {stage.exception ? <Badge variant="warning">{t('chain.timeline.exception')}</Badge> : null}
      </Box>
      {stage.state === 'not_measured' ? (
        <UnknownValue reason={detail ?? undefined} />
      ) : detail ? (
        <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
          {detail}
        </Text>
      ) : null}
      {/* #2421.6 — le responsable n'est dit que là où il reste quelque chose à
          faire : sur une étape franchie, il n'y a plus personne à relancer. */}
      {open ? <OwnerLine stage={stage} /> : null}
      {open ? <SinceLine since={stage.since} now={now} /> : null}
      {stage.proof ? <ProofLine proof={stage.proof} /> : null}
    </li>
  )
}

function OwnerLine({ stage }: { stage: MissionToCashStage }) {
  const { t } = useTranslation('missions')
  const { rule, name } = stage.owner
  const text =
    name === undefined
      ? t('chain.owner.unread')
      : name === null
        ? t(`chain.owner.missing.${rule}`)
        : t(`chain.owner.${rule}`, { name })
  return (
    <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
      {text}
    </Text>
  )
}

/** #2421.3 — la DURÉE dans l'étape. Sans date connue, rien : jamais « 0 j ». */
function SinceLine({ since, now }: { since: string | null; now: Date }) {
  const { t } = useTranslation('missions')
  const date = formatDate(since)
  if (!since || !date) return null
  const days = Math.floor((now.getTime() - new Date(since).getTime()) / DAY_MS)
  if (days < 0) return null
  return (
    <Text size="xs" className="min-w-0 text-[var(--bellum-text-muted)]">
      {t('chain.since', { date, count: days })}
    </Text>
  )
}

function ProofLine({ proof }: { proof: NonNullable<MissionToCashStage['proof']> }) {
  const { t } = useTranslation('missions')
  const parts = [
    t(`chain.proof.${proof.key}`, {
      date: formatDate(proof.at) ?? '',
      by: proof.by ?? t('chain.proof.unknownAuthor'),
    }),
  ]
  if (proof.reference) parts.push(t('chain.proof.reference', { reference: proof.reference }))
  // Un montant absent ne s'écrit pas — jamais « 0 € » (GA-18).
  if (proof.amountCents !== undefined && proof.amountCents !== null) {
    parts.push(t('chain.proof.amount', { amount: formatCents(proof.amountCents) }))
  }
  return (
    <Text size="xs" className="min-w-0 text-[var(--bellum-text-muted)]">
      {parts.join(' · ')}
    </Text>
  )
}
