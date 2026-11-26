import { hasPermission, type OrgGraph } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import { useTeam } from '@/features/team/hooks/useTeam'
import { OrgCorrectionDrawer } from './corrections/OrgCorrectionDrawer'
import type { FocalPersonCard } from './focalOrgData'
import { PERSON_GESTURES } from './FocalOrgView'
import { OrgPersonNode } from './OrgPersonNode'

/**
 * #4061 (recette prod 12/10) — le PANNEAU d'un nœud de l'arbre qui n'a pas de fiche contact.
 *
 * Avant : 32 nœuds sur 75 étaient inertes (ni cliquables ni focalisables). Maintenant TOUT nœud
 * s'ouvre : avec une fiche, la fiche ; sans, ce panneau — ce que le graphe SAIT (nom, fonction,
 * rôles, rattachement, preuves, via la MÊME carte, jamais une seconde mise en forme) et les gestes
 * NON payants déjà là (ajouter ce que je sais, corriger la relation, déclarer un rôle). Rien n'est
 * deviné pour combler l'absence de fiche : le panneau le dit.
 *
 * #4509 (décision Louis 24/10) — « Créer sa fiche » : le formulaire de création de contact EXISTANT
 * (`CreateContactDialog`), prérempli du nom, de la fonction et du compte. Rien n'est écrit avant que
 * l'utilisateur valide le formulaire. Le droit est celui de l'API (`records:write`, `POST /crm/contacts`) ;
 * tant que le rôle n'est pas résolu, le bouton ne se montre pas (jamais un geste qu'on ne sait pas permis).
 */
export function OrgPersonPanel({
  person,
  graph,
  accountId,
  onClose,
}: {
  person: FocalPersonCard | null
  graph: OrgGraph
  accountId?: string
  onClose: () => void
}) {
  const { t } = useTranslation('accountOrg')
  return (
    <Dialog open={person !== null} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        {person ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('personPanel.title')}</DialogTitle>
              <DialogDescription>{t('personPanel.noRecord')}</DialogDescription>
            </DialogHeader>
            <OrgPersonNode person={person} className="max-w-full" />
            {accountId ? (
              <div className="flex flex-wrap gap-2" data-testid="person-panel-gestures">
                {PERSON_GESTURES.map(gesture => (
                  <OrgCorrectionDrawer
                    key={gesture.key}
                    accountId={accountId}
                    graph={graph}
                    objectType="person"
                    objectId={person.id}
                    objectName={person.fullName}
                    field={gesture.field}
                    triggerLabel={t(`correction.gestures.${gesture.key}`)}
                  />
                ))}
              </div>
            ) : null}
            {accountId ? <CreateRecordGesture person={person} accountId={accountId} onDone={onClose} /> : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Le geste vit dans son propre composant : le rôle (`useTeam`) ne se lit que pour un panneau OUVERT sur un compte,
 * jamais pour la vue qui monte le panneau fermé.
 */
function CreateRecordGesture({
  person,
  accountId,
  onDone,
}: {
  person: FocalPersonCard
  accountId: string
  onDone: () => void
}) {
  const { t } = useTranslation('accountOrg')
  const { team } = useTeam()
  const [creating, setCreating] = useState(false)
  const role = team?.workspace.role
  if (role === undefined || !hasPermission(role, 'records:write')) return null
  return (
    <div data-testid="org-person-panel-create">
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={UserPlus}
        className="min-h-11"
        onClick={() => setCreating(true)}
      >
        {t('personPanel.createRecord')}
      </Button>
      <CreateContactDialog
        key={person.id}
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        initialValues={{ fullName: person.fullName, ...(person.title ? { title: person.title } : {}) }}
        onCreated={() => {
          setCreating(false)
          onDone()
        }}
      />
    </div>
  )
}
