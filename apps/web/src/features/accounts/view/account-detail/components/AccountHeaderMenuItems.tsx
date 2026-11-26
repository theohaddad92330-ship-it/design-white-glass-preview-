import { ACCOUNT_FOLLOW_CAP_REACHED } from '@bellum/contracts'
import { DropdownMenuItem } from '@bellum/ui'
import { BellRing, CalendarClock, MessageSquareText, UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAccountFollows, useToggleAccountFollow } from '@/features/account-follows/api'
import { ApiError } from '@/lib/api-error'

/**
 * #4507 — trois entrées du menu « … » de l'en-tête qui ne sont pas des contrats du registre CTA
 * (`DOSSIER_CTA_CONTRACTS`) : elles ouvrent des surfaces qui ont déjà leur propre porte.
 *  · « Commenter » → la section Historique, où vit le fil de commentaires d'équipe (#2914) ;
 *  · « Planifier un créneau » → la proposition de créneau (#2770, prévisualisation figée avant toute écriture) ;
 *  · « Mettre à jour dans mon CRM » → l'envoi vers le CRM (#4188, prévisualisation puis envoi par la porte).
 * Chaque geste était un bouton ou une puce de l'en-tête ; il garde exactement sa destination.
 */
export function AccountHeaderWorkMenuItems({
  onComment,
  onPlan,
  onCrmPush,
}: {
  onComment?: () => void
  onPlan: () => void
  onCrmPush: () => void
}) {
  const { t } = useTranslation('accounts')
  return (
    <>
      {onComment ? (
        <DropdownMenuItem className="gap-1.5" onSelect={onComment}>
          <MessageSquareText className="size-4" />
          {t('header.menu.comment')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem className="gap-1.5" onSelect={onPlan}>
        <CalendarClock className="size-4" />
        {t('header.menu.plan')}
      </DropdownMenuItem>
      <DropdownMenuItem className="gap-1.5" onSelect={onCrmPush}>
        <UploadCloud className="size-4" />
        {t('header.menu.crmPush')}
      </DropdownMenuItem>
    </>
  )
}

/**
 * #4283.8 (recette prod 25/10) — « Suivre » ne figurait nulle part dans l'en-tête de la fiche : un compte ne se suivait
 * que depuis Signaux ou Veille. Même geste, même plafond (`POST|DELETE /accounts/:id/follow`), sous « … » (#4507).
 * Une fois suivi, la prochaine mise à jour se lit dans la fraîcheur du hero (`AccountFreshness`). Rien n'est rendu tant
 * que la liste des suivis n'a pas répondu : jamais un état deviné.
 */
export function AccountFollowMenuItem({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const follows = useAccountFollows()
  const toggle = useToggleAccountFollow()
  if (!follows.data) return null
  const followed = follows.data.followed.some(item => item.account_id === accountId)
  return (
    <DropdownMenuItem
      className="gap-1.5"
      disabled={toggle.isPending}
      onSelect={() =>
        toggle.mutate(
          { accountId, follow: !followed },
          {
            onError: error =>
              toast.error(
                error instanceof ApiError && error.code === ACCOUNT_FOLLOW_CAP_REACHED
                  ? t('header.menu.followCap', { max: follows.data?.max ?? 3 })
                  : t('header.menu.followFailed'),
              ),
          },
        )
      }
    >
      <BellRing className="size-4" />
      {t('header.menu.follow')}
      {followed ? <span className="text-[var(--bellum-text-muted)]">· {t('header.menu.followed')}</span> : null}
    </DropdownMenuItem>
  )
}
