import { useEffect, useState } from 'react'
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
import { deriveTargetListType, type TargetItemKind, type TargetListVisibility } from '@bellum/contracts'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatCount, formatDate } from '@/lib/locale'
import { TARGET_FIELD_CLASS } from './TargetListCard'
import { useTargetListMutations, useTargetLists } from '../api'

/**
 * #2157.4/.8/.10-.16/.20 — « Créer une cible » depuis une SÉLECTION de lignes
 * déjà dans l'espace (Comptes en premier, #2157.4 ; toute sélection manuelle
 * de lignes, #2157.8), avec une PREVIEW avant tout appel réseau (#2157.10-.16) :
 * nom proposé ET modifiable (#2157.10/.20), objectif, type dérivé, nombre de
 * comptes/contacts inclus, et les doublons — les fiches déjà présentes dans
 * une AUTRE cible (#2157.15, MÊME notion que #2157.16 « déjà dans une autre
 * cible » : un seul calcul, un seul message). #2157.42 (#2962) — ce message
 * NOMME la ou les listes qui portent déjà la fiche, et la cible en cours de
 * création, au lieu d'un compte agrégé anonyme.
 *
 * #2157.17-.24/.37/.41/.57 — l'APERÇU avant création de masse : fiches écartées
 * et contacts sans e-mail NOMMÉS (jamais « 0 »), retrait par ligne, responsable
 * (membre de l'espace — le serveur refuse tout autre), visibilité, « nouvelle
 * cible / liste existante ». Une fiche déjà dans d'autres listes (même entre
 * deux objectifs) est NOMMÉE, jamais bloquée. Aucun coût chiffré ici (c132 :
 * crédits implicites, Louis 22/10) et aucune inscription en séquence.
 *
 * Compose les DEUX écritures publiques de `target-lists` (GA-26, comme
 * `useCreateTargetFromAccount.ts`) :
 * jamais un second modèle de cible, jamais un endpoint dédié.
 */
/**
 * `email` : `undefined` = le caller ne sait pas (rien n'est dit, jamais « sans
 * e-mail » inventé) ; `null`/vide = connu ABSENT (#2157.18).
 */
type SelectionItem = { kind: TargetItemKind; id: string; label: string; email?: string | null }

/** #2157.17 — une fiche que le caller a ÉCARTÉE de la sélection : nommée, jamais retirée en silence. */
type ExcludedSelectionItem = { label: string; reason?: string }

interface CreateTargetListFromSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: SelectionItem[]
  /** #2157.17 — les fiches écartées en amont (ex. contacts désinscrits), affichées avec leur motif. */
  excluded?: ExcludedSelectionItem[]
  /** Appelé une fois la cible créée — le caller vide sa sélection. */
  onDone: () => void
}

export function CreateTargetListFromSelectionDialog({
  open,
  onOpenChange,
  items: selectedItems,
  excluded = [],
  onDone,
}: CreateTargetListFromSelectionDialogProps) {
  const { t } = useTranslation('targets')
  const lists = useTargetLists()
  const { createList, addItem } = useTargetListMutations()
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [pending, setPending] = useState(false)
  const members = useWorkspaceMembers()
  // #2157.21 — retrait par ligne : local à l'aperçu, rien n'est écrit tant que rien n'est validé.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  // #2157.22/.23 — vides = le serveur garde ses défauts (responsable : personne, visibilité : espace).
  const [ownerId, setOwnerId] = useState('')
  const [visibility, setVisibility] = useState<TargetListVisibility | ''>('')
  // #2157.24 — '' = nouvelle cible ; sinon l'id d'une liste existante.
  const [destinationId, setDestinationId] = useState('')

  // #2157.10/.20 — un nom PROPOSÉ, jamais vide, ET modifiable : `name` est un
  // champ contrôlé (`onChange` plus bas) — l'utilisateur le relit et le
  // renomme AVANT toute validation, il ne part jamais d'un champ blanc.
  useEffect(() => {
    if (!open) return
    setName(t('createFromSelection.defaultName', { date: formatDate(new Date()) ?? '' }))
    setObjective('')
    setRemoved(new Set())
    setOwnerId('')
    setVisibility('')
    setDestinationId('')
  }, [open, t])

  const items = selectedItems.filter(item => !removed.has(`${item.kind}:${item.id}`))
  // #2157.17 — une fiche retirée par « Retirer » se NOMME parmi les écartés (le compteur ne passe plus de 9 à 8 en silence).
  const setAside = [
    ...excluded,
    ...selectedItems
      .filter(item => removed.has(`${item.kind}:${item.id}`))
      .map(item => ({ label: item.label, reason: t('createFromSelection.removedReason') })),
  ]
  const withoutEmail = items.filter(item => item.kind === 'contact' && item.email !== undefined && !item.email)
  const memberOptions = Array.isArray(members.data) ? members.data : []
  const destinationList = (lists.data ?? []).find(list => list.id === destinationId) ?? null

  const accountsCount = items.filter(item => item.kind === 'account').length
  const contactsCount = items.filter(item => item.kind === 'contact').length
  // #2157.12 — le type dérive des éléments, jamais stocké (même fonction que
  // le contrat, GA-26) : « mixte » ne s'affirme pas au hasard.
  const type = deriveTargetListType(items.map(item => ({ kind: item.kind, removed_at: null })))

  // #2157.15/.16 — un doublon est une fiche déjà RÉFÉRENCÉE, vivante, dans une
  // AUTRE cible existante — c'est la même notion que #2157.16 « éléments déjà
  // dans une autre cible ». On ne le bloque pas (une fiche peut légitimement
  // vivre dans plusieurs listes de travail) : on le NOMME (#2157.42, plus bas).
  const existingRefs = new Set(
    (lists.data ?? []).flatMap(list =>
      list.items.filter(item => item.removed_at == null).map(item => `${item.kind}:${item.ref_id}`),
    ),
  )
  const duplicateCount = items.filter(item => existingRefs.has(`${item.kind}:${item.id}`)).length
  // #2157.42 — le doublon se NOMME : « déjà présent dans Banque Q4 », jamais un
  // compte agrégé anonyme. On lit, pour chaque fiche dupliquée, le NOM de la
  // ou des listes vivantes qui la référencent déjà, dédupliqué (une même
  // liste ne se répète pas si plusieurs fiches en double y pointent).
  const duplicateListNames = Array.from(
    new Set(
      items
        .filter(item => existingRefs.has(`${item.kind}:${item.id}`))
        .flatMap(item =>
          (lists.data ?? [])
            .filter(list =>
              list.items.some(
                listItem => listItem.removed_at == null && listItem.kind === item.kind && listItem.ref_id === item.id,
              ),
            )
            .map(list => list.name),
        ),
    ),
  )
  const destinationName = name.trim() || t('createFromSelection.untitled')

  // #2157.24 — les fiches déjà vivantes dans la liste choisie sont sautées (et dites), jamais un 409 par fiche.
  const alreadyInDestination = destinationList
    ? new Set(destinationList.items.filter(item => item.removed_at == null).map(item => `${item.kind}:${item.ref_id}`))
    : new Set<string>()
  const toAdd = items.filter(item => !alreadyInDestination.has(`${item.kind}:${item.id}`))
  const skippedCount = items.length - toAdd.length

  const canSubmit = toAdd.length > 0 && (destinationList != null || name.trim().length > 0) && !pending

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    try {
      // #2157.24 — « liste existante » n'écrit AUCUNE liste ; « nouvelle » envoie owner/visibilité
      // seulement s'ils ont été choisis (#2157.22/.23 : le serveur refuse un owner hors espace).
      const list =
        destinationList ??
        (await createList.mutateAsync({
          name: name.trim(),
          objective: objective.trim() || null,
          source: 'manual',
          ...(ownerId ? { owner_user_id: ownerId } : {}),
          ...(visibility ? { visibility } : {}),
        }))
      let added = 0
      let failed = 0
      for (const item of toAdd) {
        try {
          await addItem.mutateAsync({
            listId: list.id,
            body: { kind: item.kind, ref_id: item.id, provenance: 'manual' },
          })
          added += 1
        } catch {
          failed += 1
        }
      }
      toast.success(
        destinationList
          ? t('createFromSelection.addedToExisting', { count: added, listName: destinationList.name })
          : t('createFromSelection.success', { count: added }),
        failed > 0 ? { description: t('createFromSelection.someFailed', { count: failed }) } : undefined,
      )
      onDone()
      onOpenChange(false)
    } catch {
      toast.error(t('createFromSelection.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('createFromSelection.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createFromSelection.title')}</DialogTitle>
          <DialogDescription>{t('createFromSelection.description', { count: items.length })}</DialogDescription>
        </DialogHeader>

        {/* #2157.24 — nouvelle cible, ou une liste existante (le nom/objectif/owner n'ont alors plus lieu d'être). */}
        <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
          {t('createFromSelection.destinationLabel')}
          <SelectField
            value={destinationId}
            onChange={setDestinationId}
            ariaLabel={t('createFromSelection.destinationLabel')}
            emptyOption={{ label: t('createFromSelection.destinationNew') }}
            options={(lists.data ?? []).map(list => ({ value: list.id, label: list.name }))}
          />
        </label>

        {destinationList ? null : (
          <>
            <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.nameLabel')}
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={120}
                className={TARGET_FIELD_CLASS}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.objectiveLabel')}
              <input
                value={objective}
                onChange={event => setObjective(event.target.value)}
                placeholder={t('createFromSelection.objectivePlaceholder')}
                maxLength={500}
                className={TARGET_FIELD_CLASS}
              />
            </label>

            {/* #2157.22 — le responsable : un membre de l'espace (le serveur refuse tout autre). */}
            <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.ownerLabel')}
              <SelectField
                value={ownerId}
                onChange={setOwnerId}
                ariaLabel={t('createFromSelection.ownerLabel')}
                emptyOption={{ label: t('owner.none') }}
                options={memberOptions.map(member => ({
                  value: member.userId,
                  label: member.fullName ?? member.email ?? t('owner.unknown'),
                }))}
              />
            </label>

            {/* #2157.23 — qui voit la liste. */}
            <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.visibilityLabel')}
              <SelectField
                value={visibility}
                onChange={next => setVisibility(next as TargetListVisibility | '')}
                ariaLabel={t('createFromSelection.visibilityLabel')}
                emptyOption={{ label: t('createFromSelection.visibilityDefault') }}
                options={[
                  { value: 'workspace', label: t('createFromSelection.visibilityWorkspace') },
                  { value: 'private', label: t('createFromSelection.visibilityPrivate') },
                ]}
              />
            </label>
          </>
        )}

        <Box display="flex" className="flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.typeLabel')}
            </Text>{' '}
            {type ? t(`itemType.${type}`) : null}
          </span>
          <span>
            <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.accountsCountLabel')}
            </Text>{' '}
            {formatCount(accountsCount)}
          </span>
          <span>
            <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('createFromSelection.contactsCountLabel')}
            </Text>{' '}
            {formatCount(contactsCount)}
          </span>
        </Box>

        {/* #2157.21 — chaque fiche, retirable une à une AVANT toute écriture. */}
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
          {items.map(item => (
            <li key={`${item.kind}:${item.id}`} className="flex items-center justify-between gap-2">
              <span>{item.label}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('createFromSelection.removeRow', { label: item.label })}
                onClick={() => setRemoved(prev => new Set(prev).add(`${item.kind}:${item.id}`))}
              >
                {t('createFromSelection.remove')}
              </Button>
            </li>
          ))}
        </ul>

        {/* #2157.17/.18 — ce qui est écarté ou manquant se NOMME ; l'absence ne fait aucune ligne (jamais « 0 »). */}
        {setAside.length > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('createFromSelection.excluded', { count: setAside.length })}
            {' : '}
            {setAside.map(entry => (entry.reason ? `${entry.label} (${entry.reason})` : entry.label)).join(', ')}
          </Text>
        ) : null}
        {withoutEmail.length > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('createFromSelection.withoutEmail', { count: withoutEmail.length })}
            {' : '}
            {withoutEmail.map(item => item.label).join(', ')}
          </Text>
        ) : null}
        {destinationList && skippedCount > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('createFromSelection.skippedExisting', { count: skippedCount, listName: destinationList.name })}
          </Text>
        ) : null}

        {/* #2157.15/.16/.42 — jamais un « 0 doublon » : l'absence ne s'affiche pas.
            Le message NOMME la liste où la fiche vit déjà, et la cible en cours
            de création — pas un compte agrégé anonyme. */}
        {duplicateCount > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('createFromSelection.duplicatesNamed', {
              count: duplicateCount,
              listNames: duplicateListNames.join(', '),
              destName: destinationName,
            })}
          </Text>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('createFromSelection.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {destinationList ? t('createFromSelection.submitExisting') : t('createFromSelection.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
