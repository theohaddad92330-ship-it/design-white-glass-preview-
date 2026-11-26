import { type Contact, type ContactStatus, contactInterlocutorKind } from '@bellum/contracts'
import { Badge, Box, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@bellum/ui'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdateContactStatus } from '@/features/contacts/hooks/useUpdateContactStatus'
import { getRoleLabel } from '@/lib/contactRoles'

/** Les issues qu'on déclare — `new` est l'état de départ, jamais une déclaration (comme le sous-menu de la liste). */
const OUTCOMES: ContactStatus[] = ['contacted', 'replied', 'meeting', 'refused', 'silence']

/**
 * Théo B c5-fiche-contact.R2 / N3 / N4 / A3 — les DEUX badges de l'en-tête de la fiche :
 * la relation (dérivée de l'historique par le serveur, `relation_badge`) et le type d'interlocuteur
 * (deux regroupements des rôles existants). Le badge de relation se CLIQUE pour déclarer où en est le contact ;
 * la déclaration humaine gagne sur le dérivé (« une correction humaine gagne toujours »).
 * #4504.1 — DEUX étiquettes au plus dans l'en-tête : celle-ci (toujours, voir le repli) et le rôle (s'il est connu).
 */
export function ContactRelationBadges({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const updateStatus = useUpdateContactStatus()
  const badge = contact.relation_badge
  const kind = contactInterlocutorKind(contact.decision_role)

  // #4504.1 — sans badge servi (réponse antérieure au champ), le statut DÉCLARÉ tient la place (« new » se lit
  // « À contacter », même mot que la liste) : l'en-tête garde toujours son étiquette de relation, jamais deux.
  const shown = badge?.shown
  const declaredFallback = contact.user_status !== 'new' ? contact.user_status : null
  const label = shown
    ? shown.source === 'declared'
      ? t(`status.value.${shown.status}`)
      : t(`relationBadge.${shown.relation}`)
    : declaredFallback
      ? t(`status.value.${declaredFallback}`)
      : t('relationBadge.to_contact')
  const current = shown ? (shown.source === 'declared' ? shown.status : null) : declaredFallback

  return (
    <Box display="flex" className="flex-wrap items-center gap-2" data-testid="contact-relation-badges">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[var(--bellum-border)] px-3 text-xs font-medium text-[var(--bellum-text-primary)]"
            title={current ? t('relationBadge.declaredHint') : t('relationBadge.derivedHint')}
          >
            {label}
            <ChevronDown className="size-3" aria-hidden />
            <span className="sr-only">{t('relationBadge.declare')}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {OUTCOMES.map(outcome => (
            <DropdownMenuItem
              key={outcome}
              disabled={current === outcome || updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate({
                  id: contact.id,
                  account_id: contact.account_id,
                  full_name: contact.full_name,
                  status: outcome,
                })
              }
            >
              {current === outcome ? (
                <Check className="mr-2 size-4 text-[var(--bellum-text-accent)]" />
              ) : (
                <span className="mr-2 size-4" />
              )}
              {t(`status.value.${outcome}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Théo c5 — le rôle, nommé par son regroupement ; le rôle décisionnel exact au survol. */}
      {kind ? (
        <Badge
          variant="outline"
          title={t('header.decisionRoleTitle', { role: getRoleLabel(contact.decision_role ?? 'unknown') })}
        >
          {t(`interlocutor.${kind}`)}
        </Badge>
      ) : null}
    </Box>
  )
}
