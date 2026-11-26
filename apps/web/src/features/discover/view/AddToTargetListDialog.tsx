import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  Text,
} from '@bellum/ui'
import { useTargetListMutations, useTargetLists } from '@/features/target-lists/api'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #2166.55 / #2166.61 / #2166.63 / #2166.76 — ajouter une sélection de  */
/*  Découvrir à une cible (nouvelle ou existante).                       */
/*                                                                     */
/*  La PRÉVISUALISATION précède l'envoi (#2166.61) : la liste des        */
/*  entreprises apparaît avant tout appel réseau, même modèle que        */
/*  `PositionDialog` (préflight puis confirmation).                      */
/*                                                                     */
/*  Une cible RÉFÉRENCE un compte canonique, elle ne le copie pas — donc  */
/*  ce dialogue ne reçoit QUE les candidats déjà éligibles (`accountId`   */
/*  non nul, `discover-selection.ts`) ; `ineligibleCount` NOMME le reste. */
/* ------------------------------------------------------------------ */

interface AddToTargetListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eligible: DiscoverCandidate[]
  ineligibleCount: number
  /** Appelé une fois l'ajout confirmé — le caller vide sa sélection. */
  onDone: () => void
}

export function AddToTargetListDialog({
  open,
  onOpenChange,
  eligible,
  ineligibleCount,
  onDone,
}: AddToTargetListDialogProps) {
  const { t } = useTranslation('discover')
  const lists = useTargetLists()
  const { createList, addItem } = useTargetListMutations()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newName, setNewName] = useState('')
  const [existingListId, setExistingListId] = useState('')
  const [pending, setPending] = useState(false)

  const existingLists = lists.data ?? []
  const canSubmit =
    eligible.length > 0 && !pending && (mode === 'new' ? newName.trim().length > 0 : existingListId.length > 0)

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    try {
      const listId =
        mode === 'new'
          ? (await createList.mutateAsync({ name: newName.trim(), source: 'discover' })).id
          : existingListId
      for (const candidate of eligible) {
        if (!candidate.accountId) continue
        await addItem.mutateAsync({
          listId,
          body: { kind: 'account', ref_id: candidate.accountId, provenance: 'discover' },
        })
      }
      // #2149.31 — CONTINUITÉ DÉCOUVRIR → PRÉPARATION D'ACTION : ajouter une
      // sélection à une cible est le premier geste d'une campagne
      // (`campaign_label`, c74), mais rien n'emmenait vers l'écran où cette
      // cible vit désormais. Même patron que la continuité symétrique
      // Découvrir → Comptes (#2149.30, `useDiscoverShortlist`).
      toast.success(t('targetDialog.success', { count: eligible.length }), {
        action: {
          label: t('targetDialog.seeTargetLists'),
          onClick: () => {
            // Import dynamique : `@/router` importe `routeTree.gen`, qui
            // importe TOUTES les routes — un import statique rendrait ce
            // composant, monté sur /discover, dépendant de l'arbre entier
            // (même raison que `useLogout.ts`).
            void import('@/router').then(({ router }) => {
              void router.navigate({ to: '/accounts', search: { lens: 'lists' } })
            })
          },
        },
      })
      setNewName('')
      onDone()
      onOpenChange(false)
    } catch {
      toast.error(t('targetDialog.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('targetDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('targetDialog.title')}</DialogTitle>
          <DialogDescription>{t('targetDialog.previewTitle')}</DialogDescription>
        </DialogHeader>

        <Box display="flex" className="max-h-40 flex-col gap-1 overflow-y-auto">
          {eligible.map(candidate => (
            <Text key={candidate.siren} size="sm">
              {candidate.name}
            </Text>
          ))}
        </Box>

        {ineligibleCount > 0 && (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('targetDialog.excludedNote', { count: ineligibleCount })}
          </Text>
        )}

        <Box display="flex" className="flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
            <input type="radio" name="target-list-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
            {t('targetDialog.newListOption')}
          </label>
          {mode === 'new' && (
            <label className="flex flex-col gap-1 pl-6 text-sm text-[var(--bellum-text-secondary)]">
              {t('targetDialog.newListNameLabel')}
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                maxLength={120}
                className="rounded-md border border-[var(--bellum-border)] bg-transparent px-3 py-2 text-sm text-[var(--bellum-text-primary)]"
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
            <input
              type="radio"
              name="target-list-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              disabled={existingLists.length === 0}
            />
            {t('targetDialog.existingListOption')}
          </label>
          {mode === 'existing' &&
            (existingLists.length === 0 ? (
              <Text size="xs" className="pl-6 text-[var(--bellum-text-muted)]">
                {t('targetDialog.noExistingLists')}
              </Text>
            ) : (
              // GA-251 — un <select> natif ne suit pas le thème : le menu de
              // choix passe par SelectField, qui porte lui-même son nom
              // accessible et l'option vide que le natif écrivait `value=""`.
              <SelectField
                value={existingListId}
                onChange={setExistingListId}
                options={existingLists.map(list => ({ value: list.id, label: list.name }))}
                placeholder={t('targetDialog.existingListLabel')}
                ariaLabel={t('targetDialog.existingListLabel')}
                className="ml-6"
              />
            ))}
        </Box>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('targetDialog.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t('targetDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
