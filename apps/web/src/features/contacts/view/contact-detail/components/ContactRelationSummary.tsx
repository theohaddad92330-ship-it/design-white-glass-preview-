import { summarizeContactRelation, type ContactRelationSummary as RelationSummary } from '@bellum/contracts'
import { Box, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Handshake } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { usePlanItems } from '@/features/actions/hooks/usePlanItems'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { useMailboxStatus } from '@/features/mailbox/api'
import { lastExpressedObjection } from './expressed-objection'
import { SectionCard } from './SectionCard'

function formatDate(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // #3688 (recette 10/10, Notes y=776 / Historique y=1078 > 827) — libellé AU-DESSUS de la valeur et
    // lignes en deux colonnes (`dl` ci-dessous) : le résumé tient sur ~la moitié de la hauteur, donc
    // l'éditeur de notes et l'historique remontent dans le premier écran.
    <div className="grid grid-cols-1 gap-y-0.5 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 space-y-0.5">{children}</dd>
    </div>
  )
}

/**
 * #3691 — le résumé compact de la relation : dernière prise de contact, dernier
 * échange réel, prochaine action. Remplace « Cadences de relance » et « Dernier
 * résultat » (deux cartes qui disaient chacune une partie de la même chose).
 *
 * Aucun nouveau calcul ici : `summarizeContactRelation` (contracts) porte les
 * définitions communes ; la prochaine action est la tâche PROPRIÉTAIRE
 * (`action_plan_items`, où la cadence matérialise déjà ses relances) — ouverte
 * pour modification, jamais un second rappel. Une absence ne fait aucune ligne ;
 * sans historique : « Aucun échange enregistré », jamais « Jamais contacté ».
 */
export function ContactRelationSummary({ contactId, accountId }: { contactId: string; accountId: string | null }) {
  const { t } = useTranslation('contacts')
  const { t: tActions } = useTranslation('actions')
  // Un contact à qualifier (#1473) n'a pas de compte, donc pas de plan.
  const { items: planItems } = usePlanItems(accountId ?? '')
  const timeline = useTimeline('contact', contactId)
  // La messagerie est-elle lue ? Sans elle, « sans réponse » ne se garantit pas.
  const mailbox = useMailboxStatus()

  const summary: RelationSummary = useMemo(
    () =>
      summarizeContactRelation({
        activities: (timeline.data?.items ?? []).map(a => ({
          id: a.id,
          kind: a.kind,
          direction: a.direction,
          occurredAt: a.occurredAt,
          verdict: a.verdict ?? null,
          outcome: a.outcome ?? null,
        })),
        planItems: (accountId ? (planItems ?? []) : [])
          .filter(item => item.contact_id === contactId)
          .map(item => ({
            id: item.id,
            label: item.label,
            due_date: item.due_date,
            execution_status: item.execution_status,
            owner_name: item.owner_name,
            outcome: item.outcome,
            result: item.result,
            completed_at: item.completed_at,
          })),
        repliesReadable: mailbox.data?.connected === true,
        now: new Date(),
      }),
    [timeline.data, planItems, accountId, contactId, mailbox.data?.connected],
  )

  // #3697.8 — l'objection RÉELLEMENT exprimée en appel (débrief consigné), avec son appel pour provenance.
  const objection = useMemo(() => lastExpressedObjection(timeline.data?.items ?? []), [timeline.data])

  // Historique pas encore lu : on ne dit pas « aucun échange » sur une lecture en cours.
  if (timeline.isLoading) return null
  const failedToRead = timeline.isError
  const nothing = !summary.hasHistory && !summary.next && !summary.lastOutcome && !objection

  return (
    <SectionCard icon={Handshake} title={t('relationSummary.title')}>
      {failedToRead ? (
        // Échec de lecture ≠ « sans réponse » : on le dit.
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('relationSummary.readError')}
        </Text>
      ) : nothing ? (
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('relationSummary.noHistory')}
        </Text>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 [&>div]:border-b [&>div]:border-border/60">
          {summary.lastAttempt ? (
            <SummaryRow label={t('relationSummary.lastAttempt')}>
              <Text element="p" size="sm" weight="medium">
                {t(`relationSummary.kind.${summary.lastAttempt.kind}`, { defaultValue: summary.lastAttempt.kind })}
                {' · '}
                {formatDate(summary.lastAttempt.at)}
              </Text>
              {summary.awaitingReply === 'yes' ? (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('relationSummary.noReply')}
                </Text>
              ) : null}
              {summary.awaitingReply === 'unverifiable' ? (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('relationSummary.replyUnverifiable')}
                </Text>
              ) : null}
            </SummaryRow>
          ) : null}
          {summary.lastExchange ? (
            <SummaryRow label={t('relationSummary.lastExchange')}>
              <Text element="p" size="sm" weight="medium">
                {t(`relationSummary.kind.${summary.lastExchange.kind}`, { defaultValue: summary.lastExchange.kind })}
                {' · '}
                {formatDate(summary.lastExchange.at)}
              </Text>
            </SummaryRow>
          ) : null}
          {summary.lastOutcome ? (
            <SummaryRow label={t('relationSummary.lastOutcome')}>
              <Text element="p" size="sm" weight="medium">
                {tActions(`outcome.${summary.lastOutcome.outcome}`)}
              </Text>
              {summary.lastOutcome.result ? (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {summary.lastOutcome.result}
                </Text>
              ) : null}
            </SummaryRow>
          ) : null}
          {objection ? (
            <SummaryRow label={t('relationSummary.objection')}>
              <Text element="p" size="sm" weight="medium">
                {objection.text}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('relationSummary.objectionSource', { date: formatDate(objection.at) })}
              </Text>
            </SummaryRow>
          ) : null}
          {summary.next ? (
            <SummaryRow label={t('relationSummary.next')}>
              <Link
                to="/actions/$id"
                params={{ id: summary.next.id }}
                className="block text-sm font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11"
              >
                {summary.next.label}
              </Link>
              <Text
                element="p"
                size="xs"
                color={summary.next.state === 'overdue' ? undefined : 'text-muted-foreground'}
                className={cn(summary.next.state === 'overdue' && 'text-[var(--warning-soft-text)]')}
              >
                {summary.next.dueDate
                  ? t(summary.next.state === 'overdue' ? 'relationSummary.overdue' : 'relationSummary.due', {
                      date: formatDate(summary.next.dueDate),
                    })
                  : t('relationSummary.unscheduled')}
                {summary.next.owner ? ` · ${t('relationSummary.owner', { name: summary.next.owner })}` : ''}
              </Text>
              {summary.otherOpenCount > 0 ? (
                <Link
                  to="/actions"
                  className="inline-block text-xs text-[var(--bellum-text-secondary)] hover:underline pointer-coarse:min-h-11"
                >
                  {t('relationSummary.others', { count: summary.otherOpenCount })}
                </Link>
              ) : null}
            </SummaryRow>
          ) : null}
        </dl>
      )}
    </SectionCard>
  )
}
