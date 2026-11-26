import { Button } from '@bellum/ui'
import { ListPlus, MessageSquareText, MoreHorizontal, Workflow, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SELECT_ALL_CAP } from '@/features/contacts/selection/loadAllResults'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import type { ContactAssignTarget } from './ContactSelectionPanel'
import { commonAssignee } from '@/features/contacts/selection/commonAssignee'
import { AssignSelectionMenu } from './ContactSelectionPanel'

/**
 * Théo B c1-repertoire `.v13-selectbar` (C1.R13) — la sélection est une BARRE collée au bas du
 * tableau, plus un panneau qui s'ouvrait d'office à droite et mangeait 26 rem de la liste.
 *
 * Gardés visibles : les gestes de Théo (Enregistrer une liste, Attribuer, Préparer une séquence) et
 * « Préparer un message » (C1.A11, le plus fréquent). « Plus » ouvre le panneau de sélection
 * EXISTANT (`ContactSelectionPanel`) : enrichir, vérifier, plan d'action, CRM, actions rapides,
 * envoi en lot — aucun geste retiré. La portée (« Sur cette page », « Sélectionner les N »,
 * « Revoir la sélection », sélection hors vue) reprend `ContactsSelectionScope`, qui vivait au-dessus.
 */
type Props = {
  contacts: readonly GlobalContact[]
  /** Lignes de la page affichée. */
  pageCount: number
  total: number | undefined
  hasNextPage: boolean
  canSelectAll: boolean
  hiddenSelectedCount: number
  selectAllBusy: boolean
  members: readonly WorkspaceMember[]
  assignPending: boolean
  onAssign: (target: ContactAssignTarget) => void
  onSelectAllResults: () => void
  onReview: () => void
  onRemoveHidden: () => void
  onSaveList: () => void
  onPrepareMessage: () => void
  onPrepareSequence: () => void
  onMore: () => void
  moreOpen: boolean
  onClear: () => void
}

export function ContactsSelectionBar({
  contacts,
  pageCount,
  total,
  hasNextPage,
  canSelectAll,
  hiddenSelectedCount,
  selectAllBusy,
  members,
  assignPending,
  onAssign,
  onSelectAllResults,
  onReview,
  onRemoveHidden,
  onSaveList,
  onPrepareMessage,
  onPrepareSequence,
  onMore,
  moreOpen,
  onClear,
}: Props) {
  const { t } = useTranslation('contacts')
  const count = contacts.length
  if (count === 0) return null
  const onPage = count <= pageCount && hiddenSelectedCount === 0
  const showSelectAll = canSelectAll && total !== undefined && total > count
  return (
    <div
      role="region"
      aria-label={t('selectionBar.aria')}
      data-testid="contacts-selection-bar"
      className="sticky bottom-4 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-overlay border border-[var(--bellum-accent-line)] bg-card px-4 py-3 shadow-overlay max-md:bottom-2"
    >
      <b className="text-xs text-[var(--bellum-text-primary)]">{t('selection.count', { count })}</b>
      {onPage ? <span className="text-xs text-[var(--bellum-text-muted)]">{t('selectionBar.onPage')}</span> : null}
      {hiddenSelectedCount > 0 ? (
        <>
          <span data-testid="contacts-selection-hidden" className="text-xs text-[var(--bellum-text-muted)]">
            {t('list.selectionHidden', { count: hiddenSelectedCount })}
          </span>
          <Button type="button" size="sm" variant="plain" onClick={onRemoveHidden}>
            {t('list.selectionRemoveHidden', { count: hiddenSelectedCount })}
          </Button>
        </>
      ) : null}
      {showSelectAll ? (
        <Button type="button" size="sm" variant="plain" onClick={onSelectAllResults} disabled={selectAllBusy}>
          {total <= SELECT_ALL_CAP
            ? t('list.selectAllResults', { total })
            : t('list.selectFirstResults', { cap: SELECT_ALL_CAP, total })}
        </Button>
      ) : null}
      {hasNextPage && total !== undefined ? <span className="sr-only">{t('selectionBar.partial')}</span> : null}
      <Button type="button" size="sm" variant="plain" onClick={onReview}>
        {t('list.reviewSelection')}
      </Button>
      <span className="flex-1 max-md:hidden" />
      <Button type="button" size="sm" variant="outline" icon={ListPlus} onClick={onSaveList}>
        {t('selectionBar.saveList')}
      </Button>
      <AssignSelectionMenu
        inline
        members={members}
        currentAssignee={commonAssignee(contacts)}
        pending={assignPending}
        onAssign={onAssign}
      />
      <Button type="button" size="sm" variant="outline" icon={MessageSquareText} onClick={onPrepareMessage}>
        {t('selectionBar.prepareMessage')}
      </Button>
      <Button type="button" size="sm" variant="soft" icon={Workflow} onClick={onPrepareSequence}>
        {t('selectionBar.prepareSequence')}
      </Button>
      <Button type="button" size="sm" variant="outline" icon={MoreHorizontal} aria-expanded={moreOpen} onClick={onMore}>
        {t('selectionBar.more')}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="plain"
        aria-label={t('selectionBar.clear')}
        onClick={onClear}
        className="pointer-coarse:size-11"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
