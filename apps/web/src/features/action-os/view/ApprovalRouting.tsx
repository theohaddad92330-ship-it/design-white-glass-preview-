import { useTranslation } from 'react-i18next'
import { AlarmClock, BellRing, UserCheck } from 'lucide-react'
import { Button, Card, SelectField, Text } from '@bellum/ui'
import { toast } from 'sonner'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatDate } from '@/lib/locale'
import type { ApprovalRequestView } from '../api'
import { assignableMembers, snoozeChoices } from '../approvalRouting'

/**
 * Ce que le composant lit RÉELLEMENT sur une demande — pas la carte entière.
 * Une approbation Action OS (`ApprovalRequestView`) la porte déjà ; une
 * écriture CRM/ERP (#2864 / #2856, reste du lot précédent) la porte
 * désormais aussi, sous les mêmes trois noms. Un contrôle qui ne lit que ce
 * qu'il lui faut se réutilise sans dupliquer le composant par file (GA-26).
 */
type RoutableRequest = { id: string; assigned_to?: string | null; expires_at: string }

/**
 * #2864 / #2856 — LE CIRCUIT d'une demande en attente : à qui elle est
 * confiée, et jusqu'à quand elle est reportée.
 *
 * Ces gestes ne touchent JAMAIS le contenu : le résumé/la prévisualisation
 * figés et les boutons de décision restent ceux de la carte. Une écriture
 * CRM/ERP passe toujours par la porte — reporter ne décide rien, confier
 * désigne qui regarde. Le serveur reste le juge (`canAssign` / `canSnooze`) :
 * ce composant n'offre que les choix qui ont une chance d'être acceptés.
 */
export function ApprovalRoutingControls({
  approval,
  currentUserId,
  members,
  onAssign,
  onSnooze,
  pending,
}: {
  approval: RoutableRequest
  currentUserId: string | undefined
  members: readonly WorkspaceMember[]
  onAssign: (id: string, assigneeId: string | null) => void
  onSnooze: (id: string, until: string | null) => void
  pending: boolean
}) {
  const { t } = useTranslation('actions')
  const assignable = assignableMembers(members)
  const assignedTo = approval.assigned_to ?? null
  const choices = snoozeChoices(approval.expires_at, new Date())
  const assigneeName = assignedTo
    ? (members.find(member => member.userId === assignedTo)?.fullName ??
      members.find(member => member.userId === assignedTo)?.email ??
      null)
    : null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {assignedTo ? (
        <Text size="xs" weight="medium" color="text-[var(--bellum-text-accent)]" className="flex items-center gap-1">
          <UserCheck className="size-3.5" aria-hidden="true" />
          {assignedTo === currentUserId
            ? t('center.routing.assignedToYou')
            : assigneeName
              ? t('center.routing.assignedTo', { name: assigneeName })
              : t('center.routing.assignedToColleague')}
        </Text>
      ) : null}
      {assignable.length > 0 ? (
        <SelectField
          ariaLabel={t('center.routing.assignAria')}
          size="sm"
          value={assignedTo && assignable.some(option => option.value === assignedTo) ? assignedTo : ''}
          onChange={next => onAssign(approval.id, next === '' ? null : next)}
          options={assignable}
          emptyOption={{ label: t('center.routing.assignNobody') }}
          placeholder={t('center.routing.assignPlaceholder')}
          disabled={pending}
          className="min-w-[12rem]"
        />
      ) : (
        // Lot L-A (#4164) — la ligne « Aucun collègue… » se répétait sur CHAQUE carte.
        // Elle se dit désormais UNE fois (identifiant de toast fixe), au moment où
        // l'on essaie de confier.
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => toast.info(t('center.routing.noColleague'), { id: 'routing-no-colleague' })}
        >
          <UserCheck className="size-3.5" aria-hidden="true" />
          {t('today.card.delegate')}
        </Button>
      )}
      {choices.map(choice => (
        <Button
          key={choice.key}
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => onSnooze(approval.id, choice.until)}
        >
          <AlarmClock className="size-3.5" aria-hidden="true" />
          {t(`center.routing.snooze.${choice.key}`)}
        </Button>
      ))}
    </div>
  )
}

/**
 * #2856 — LES DEMANDES REPORTÉES : hors de la file active, jamais cachées.
 * Chacune garde son résumé figé et sa date de réveil ; « Réveiller » la remet
 * dans la file tout de suite. Aucune liste = aucune section (on n'affiche pas
 * ce qu'on n'a pas).
 */
export function SnoozedApprovalList({
  approvals,
  onWake,
  pendingId,
}: {
  approvals: readonly ApprovalRequestView[]
  onWake: (id: string) => void
  pendingId?: string
}) {
  const { t } = useTranslation('actions')
  if (approvals.length === 0) return null
  return (
    <section aria-label={t('center.routing.snoozedTitle')} className="space-y-2">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
        {t('center.routing.snoozedTitle')}
      </Text>
      <ul className="space-y-2">
        {approvals.map(approval => (
          <li key={approval.id}>
            <Card className="p-3">
              <Text size="sm" className="whitespace-pre-wrap">
                {approval.summary}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                {approval.snoozed_until
                  ? t('center.routing.snoozedUntil', { date: formatDate(new Date(approval.snoozed_until)) })
                  : null}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                disabled={pendingId === approval.id}
                onClick={() => onWake(approval.id)}
              >
                <BellRing className="size-3.5" aria-hidden="true" />
                {t('center.routing.wake')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
