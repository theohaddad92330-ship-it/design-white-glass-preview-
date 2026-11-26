import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useConsultant } from '@/features/consultants/hooks'
import { guestWarningMailto } from '@/features/agenda/guest-list'
import { safeHref } from '@/lib/safe-href'

/**
 * #2936 (#2176.49) — RELANCER LE CONSULTANT, DEPUIS LE MATCHING.
 *
 * Même famille que `WarnGuestDialog.tsx` (#2938/#2102.12) : un brouillon
 * `mailto:`, jamais un envoi direct — LE COPILOTE PRÉPARE, IL N'ENVOIE JAMAIS
 * (doctrine, CLAUDE.md). `guestWarningMailto` est réutilisé tel quel (GA-26) :
 * construire une seconde fonction pour le même besoin — un lien `mailto:`
 * avec sujet et corps encodés — ne dirait rien de plus.
 *
 * La fiche consultant se charge ICI, à l'ouverture (`useConsultant`), plutôt
 * que dans chaque carte du classement : `MatchDrawer` n'a jusqu'ici que
 * `{fullName, title}` par profil (`identities`), et ce dialogue est le seul
 * endroit qui a besoin de l'adresse.
 *
 * `contact_visible` gouverne déjà l'affichage de l'adresse ailleurs
 * (`TalentDetailHeader.tsx`) — sans coordonnées visibles, ce dialogue le NOMME
 * plutôt que d'inventer un contact (doctrine « jamais de donnée fictive »).
 */
export function RelaunchConsultantDialog({
  consultantId,
  name,
  onClose,
}: {
  consultantId: string | null
  /** Le nom déjà connu de `MatchDrawer` (`identities`) : le titre s'affiche
   *  tout de suite, sans attendre le chargement de la fiche complète. */
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation('matching')
  const { data: consultant, isLoading } = useConsultant(consultantId ?? undefined)

  if (!consultantId) return null

  const email = consultant?.contact_visible ? consultant.email : null
  const href = email
    ? safeHref(guestWarningMailto(email, t('relaunch.subject'), t('relaunch.body', { name })), {
        allowMailtoTel: true,
      })
    : undefined

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('relaunch.title', { name })}</DialogTitle>
          <DialogDescription>{t('relaunch.description')}</DialogDescription>
        </DialogHeader>
        <Box className="px-1">
          {isLoading ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('relaunch.loading')}
            </Text>
          ) : !href ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('relaunch.noEmail')}
            </Text>
          ) : null}
        </Box>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('relaunch.cancel')}
          </Button>
          {/* Même refus que `WarnGuestDialog` : pas de bouton cliquable sans
              destinataire lisible. */}
          {href ? (
            <Button asChild onClick={onClose}>
              <a href={href}>{t('relaunch.open')}</a>
            </Button>
          ) : (
            <Button disabled>{t('relaunch.open')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
