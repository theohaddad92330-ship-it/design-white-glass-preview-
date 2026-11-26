import { canErasePerson, isContactOwner, type Contact } from '@bellum/contracts'
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
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useErasePerson } from '@/features/contacts/hooks/useErasePerson'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useSession } from '@/lib/hooks/use-session'
import { useUserPermissions } from '@/lib/permissions'

/**
 * #2297 — « Effacer cette personne » (RGPD art. 17, décision Louis du 19/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI LE DISTINGUE DES DEUX CARTES VOISINES
 * ─────────────────────────────────────────────────────────────────────────────
 * « Écarter » est NOTRE décision, réversible. Le « refus de contact » est la
 * sienne, et ferme les chemins d'envoi. L'effacement est son DROIT : la fiche
 * et tout ce qui la nomme sont SUPPRIMÉS — la seule suppression réelle du
 * produit (doctrine c67) — et seule une trace sans donnée personnelle reste,
 * pour qu'elle ne soit jamais recollectée.
 *
 * TROIS RÈGLES TENUES PAR L'ÉCRAN
 * 1. **Qui peut** : la règle de `person-erasure.ts` (contracts), la même que la
 *    route — administrateur de l'espace, ou porteur de la fiche. Celui qui ne
 *    peut pas voit une phrase qui NOMME qui peut : c'est lui qui reçoit la
 *    demande, et il doit savoir à qui la transmettre.
 * 2. **La conséquence est annoncée AVANT le clic**, dans une confirmation :
 *    une irréversibilité découverte après coup n'a pas été consentie.
 * 3. **Rien en démonstration** : la salle est partagée, une fiche effacée le
 *    serait pour tous les visiteurs suivants (la route le refuse aussi).
 *    Et rien tant que le droit n'est pas CONNU — inconnu n'est pas autorisé.
 */
export function ContactErasureCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const isDemo = useIsDemo()
  const access = useUserPermissions()
  const { user } = useSession()
  const navigate = useNavigate()
  const erase = useErasePerson()
  const [confirming, setConfirming] = useState(false)

  if (isDemo || access.status !== 'known') return null

  const allowed = canErasePerson({
    role: access.role,
    extraPermissions: access.extraPermissions,
    ownsContact: isContactOwner(contact, user?.id ?? ''),
  })

  // La fiche n'existe plus : on ramène au compte qu'elle servait, sinon à
  // l'annuaire — jamais sur une page qui répondrait « introuvable ».
  const leave = () =>
    contact.account_id
      ? void navigate({ to: '/accounts/$id', params: { id: contact.account_id } })
      : void navigate({ to: '/contacts' })

  return (
    <Box className="rounded-md border border-border bg-card p-4">
      <Text element="h3" size="sm" weight="medium">
        {t('erasure.title')}
      </Text>
      <Text size="sm" color="text-muted-foreground" className="mt-2">
        {t('erasure.explain')}
      </Text>

      {allowed ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={erase.isPending}
          onClick={() => setConfirming(true)}
        >
          {t('erasure.action')}
        </Button>
      ) : (
        // Pas de bouton grisé : la phrase dit QUI peut, plutôt qu'un geste
        // inerte qui laisserait croire qu'il suffit d'un droit de plus.
        <Text size="xs" color="text-muted-foreground" className="mt-2">
          {t('erasure.notAllowed')}
        </Text>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('erasure.confirmTitle', { name: contact.full_name })}</DialogTitle>
            <DialogDescription>{t('erasure.confirmBody')}</DialogDescription>
          </DialogHeader>
          <Text size="sm" color="text-muted-foreground">
            {t('erasure.confirmTrace')}
          </Text>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('erasure.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={erase.isPending}
              onClick={() => {
                erase.mutate({ id: contact.id, onErased: leave })
                setConfirming(false)
              }}
            >
              {t('erasure.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
