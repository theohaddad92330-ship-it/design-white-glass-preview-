import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { consultantsApi } from '@/features/consultants/api'
import { CvDropZone } from '@/features/consultants/view/CvDropZone'
import { talentNameText } from '@/features/consultants/lib/talentName'
import { hasPermissions, useUserPermissions } from '@/lib/permissions'
import { useReplyFollowUp } from './reply-follow-up'

/**
 * #AM.58 (décision Louis 24/10) — AJOUTER UN CV SANS QUITTER LA CONVERSATION.
 *
 * Laura propose l'import quand un CV est joint (`attached_document_role.py`) ; jusqu'ici la carte renvoyait vers
 * `/consultants`. Ici le bouton ouvre le MÊME dépôt de CV que le vivier (`CvDropZone` : mêmes refus nommés, même
 * détection de doublon, même fiche à relire) en surimpression — aucun endpoint neuf, aucune navigation.
 *
 * Rien n'est écrit sans le geste de la personne : choisir le fichier dans le dépôt est ce geste. Fermer sans importer
 * ne crée rien et ne dit rien au fil. Import terminé → le fil reçoit un message de la personne (le nom de la fiche,
 * son identifiant en métadonnée) et Laura reprend la comparaison du besoin en cours.
 *
 * Même droit que l'import du vivier (`POST /talents/intake` : `records:write`, re-vérifié par le serveur) : sans lui,
 * ou tant que le rôle n'est pas lu, le bouton n'est pas offert.
 */
export function AddCvFromThread() {
  const { t } = useTranslation('chat')
  const access = useUserPermissions()
  const followUp = useReplyFollowUp()
  const [open, setOpen] = useState(false)

  if (access.status !== 'known' || !hasPermissions(['records:write'], access.permissions)) return null

  const onCreated = async (consultantId: string) => {
    setOpen(false)
    if (!followUp) return
    // Le nom vient de la fiche créée ou mise à jour ; illisible, le message le dit sans en inventer un.
    const fullName = await consultantsApi
      .get(consultantId)
      .then(consultant => consultant.full_name)
      .catch(() => null)
    const name = talentNameText(fullName, '')
    followUp(name ? t('addCv.done', { name }) : t('addCv.doneUnnamed'), { talentId: consultantId })
  }

  return (
    <>
      <Button size="sm" variant="ghost" icon={FileText} onClick={() => setOpen(true)}>
        {t('addCv.cta')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('addCv.title')}</DialogTitle>
            <DialogDescription>{t('addCv.description')}</DialogDescription>
          </DialogHeader>
          <CvDropZone onCreated={id => void onCreated(id)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
