import { COMMERCIAL_STATUSES_REQUIRING_REASON, type CommercialLifecycle } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text, Textarea } from '@bellum/ui'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetCommercialStatus } from '@/features/accounts/hooks/useSetCommercialStatus'

/**
 * #2117.23 — LE MOTIF, AVANT L'ÉCRITURE.
 *
 * « Hors priorité » et « En veille » sortent un compte du travail courant. Les
 * deux se choisissent maintenant depuis le sous-menu de statut (avant, aucun
 * écran n'envoyait `archived` : la valeur existait, et personne ne pouvait
 * l'atteindre autrement qu'en archivant le dossier). Les deux passent par ici,
 * et par ici seulement : le geste n'écrit RIEN tant que le motif est vide.
 *
 * Pourquoi un motif obligatoire pour ceux-là et pour aucun autre : dans six
 * mois, « pourquoi ce compte est-il sorti ? » n'a pas de réponse ailleurs. Un
 * déplacement dans le pipe se relit tout seul (le score, les signaux, la date) ;
 * une sortie, non — elle tient à ce que le commercial savait ce jour-là. Le
 * motif part dans `reason`, l'API l'écrit dans l'entrée d'historique de la
 * transition (#2117.24), et le panneau « Motif et historique » du dossier
 * l'affiche.
 *
 * ⚠️ Le dialogue vit HORS du menu, chez le parent : un menu Radix se démonte en
 * se fermant, et l'état d'un dialogue rendu dedans partirait avec lui.
 * Échap et « Annuler » ferment sans rien écrire — c'est le comportement par
 * défaut de `Dialog`, et le test le vérifie plutôt que de le supposer.
 */
export function CommercialStatusReasonDialog({
  accountId,
  target,
  onClose,
}: {
  accountId: string
  /** Le statut demandé, `null` quand aucun geste n'est en cours. */
  target: CommercialLifecycle | null
  onClose: () => void
}) {
  const { t } = useTranslation('accounts')
  const setStatus = useSetCommercialStatus()
  const [reason, setReason] = useState('')
  const fieldId = useId()

  const open = target !== null && COMMERCIAL_STATUSES_REQUIRING_REASON.includes(target)
  const filled = reason.trim().length > 0

  const close = () => {
    setReason('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) close()
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg space-y-4">
        <DialogHeader>
          {/* i18n keys: commercialStatus.archived | commercialStatus.dormant */}
          <DialogTitle>
            {t('commercialStatusReason.title', { status: target ? t(`commercialStatus.${target}`) : '' })}
          </DialogTitle>
          <DialogDescription>{t('commercialStatusReason.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Text size="sm" element="label" htmlFor={fieldId} className="text-[var(--bellum-text-secondary)]">
            {t('commercialStatusReason.label')}
          </Text>
          <Textarea
            id={fieldId}
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('commercialStatusReason.placeholder')}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={close}>
            {t('commercialStatusReason.cancel')}
          </Button>
          <Button
            size="sm"
            // Le motif VIDE n'est pas envoyé puis refusé : le bouton ne part
            // pas. L'API refuse quand même (la règle vit dans le contrat), mais
            // un aller-retour pour se voir dire non n'est pas une réponse.
            disabled={!filled || setStatus.isPending}
            isLoading={setStatus.isPending}
            onClick={() => {
              if (!target || !filled) return
              setStatus.mutate({ id: accountId, status: target, reason: reason.trim() }, { onSuccess: close })
            }}
          >
            {t('commercialStatusReason.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
