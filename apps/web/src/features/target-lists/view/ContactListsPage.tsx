import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  HORIZONTAL_OVERSCROLL_CLASS,
  ModeTabs,
  cn,
  type ModeTabItem,
} from '@bellum/ui'
import type { TargetList, TargetListItem } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2, ListChecks } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ContactsIntro } from '@/features/contacts/view/contacts-list/ContactsIntro'
import { ContactsTabs } from '@/features/contacts/view/contacts-list/ContactsTabs'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useTargetListMutations, useTargetLists } from '../api'
import { listAudience, splitContactLists, type ListAudience } from '../lib/contact-lists'
import { TARGET_FIELD_CLASS } from './TargetListCard'

const liveItems = (list: TargetList): TargetListItem[] => list.items.filter(item => item.removed_at == null)

/**
 * Théo B c2-mes-listes.R1 — « Contacts › Mes listes » : les sélections de travail de l'espace.
 * Les mêmes fiches, regroupées selon la prospection : une liste référence, elle ne recopie rien.
 * `/accounts?lens=lists` garde le tableau complet (responsable, priorité, statut par élément).
 */
export function ContactListsPage() {
  const { t } = useTranslation('targets')
  const { t: tContacts } = useTranslation('contacts')
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <CustomerPage anchorId="mes-listes" titleInScreen pageTitle={tContacts('tabs.lists')} contentClassName="px-0 py-4">
      {/* #4503.a — l'en-tête COMMUN de Contacts et ses trois onglets, le même composant que /contacts. */}
      <div className={`${PAGE_GUTTER_X} mb-4`} data-testid="contacts-intro-area">
        <ContactsIntro
          onAddContact={() => setCreateOpen(true)}
          askLaura={<AskLaura label={t('contactLists.askLauraLabel')} question={t('contactLists.askLauraQuestion')} />}
        />
        <ContactsTabs current="lists" />
      </div>
      <ContactListsContent />
      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </CustomerPage>
  )
}

export function ContactListsContent() {
  const { t } = useTranslation('targets')
  useLauraContext({ kind: 'screen', label: t('contactLists.title'), entityId: null, facets: [], state: 'ready' })
  const lists = useTargetLists()
  const [audience, setAudience] = useState<ListAudience>('contacts')
  const [showArchived, setShowArchived] = useState(false)
  const split = splitContactLists(lists.data ?? [])
  const bucket = split[audience]

  const tabs: ModeTabItem<ListAudience>[] = [
    { key: 'contacts', label: t('contactLists.tabContacts', { count: split.contacts.active.length }) },
    { key: 'accounts', label: t('contactLists.tabAccounts', { count: split.accounts.active.length }) },
  ]

  return (
    <div className={`${PAGE_GUTTER_X} flex min-w-0 flex-col gap-4`}>
      {/* Théo B c2-mes-listes.R4 — on coche dans le répertoire, puis « Enregistrer une liste ». Le titre et les
          gestes de Contacts vivent dans l'en-tête commun de la page, au-dessus des onglets. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-[var(--bellum-text-secondary)]">{t('contactLists.subtitle')}</p>
        <Button asChild size="sm" variant="black">
          <Link to="/contacts">
            <ListChecks className="size-4 shrink-0" aria-hidden />
            {t('contactLists.selectContacts')}
          </Link>
        </Button>
      </div>

      {lists.isError ? (
        <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
          {t('loadError')}
        </p>
      ) : lists.data === undefined ? (
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('loading')}</p>
      ) : lists.data.length === 0 ? (
        // Théo B c2-mes-listes.R5 — l'état vide dit quoi faire.
        <EmptyState
          align="start"
          title={t('contactLists.emptyTitle')}
          description={t('contactLists.emptyDescription')}
        />
      ) : (
        <>
          {/* Théo B c2-mes-listes.A1 — Contacts / Comptes : les listes de comptes (tier, raison,
                problématiques) restent ici, sous leur propre onglet. */}
          <ModeTabs items={tabs} value={audience} onChange={setAudience} />
          {bucket.active.length === 0 ? (
            <p className="text-sm text-[var(--bellum-text-secondary)]">
              {t(audience === 'contacts' ? 'contactLists.noneContacts' : 'contactLists.noneAccounts')}
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {bucket.active.map(list => (
                <ListCard key={list.id} list={list} />
              ))}
            </ul>
          )}
          {/* Théo B c2-mes-listes.A2 — l'archive est une ligne discrète, pas deux puces de plus. */}
          {bucket.archived.length > 0 ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived(open => !open)}
                className="min-h-11 self-start text-sm text-[var(--bellum-text-secondary)] underline"
              >
                {t(showArchived ? 'contactLists.hideArchived' : 'contactLists.showArchived', {
                  count: bucket.archived.length,
                })}
              </button>
              {showArchived ? (
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {bucket.archived.map(list => (
                    <ListCard key={list.id} list={list} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function countsLine(list: TargetList, t: ReturnType<typeof useTranslation<'targets'>>['t']): string {
  const live = liveItems(list)
  const accounts = live.filter(item => item.kind === 'account').length
  const contacts = live.filter(item => item.kind === 'contact').length
  const parts: string[] = []
  if (accounts > 0) parts.push(t('contactLists.accountsCount', { count: accounts }))
  if (contacts > 0) parts.push(t('contactLists.contactsCount', { count: contacts }))
  // « une absence n'est jamais 0 » : une liste sans élément vivant le dit.
  return parts.length > 0 ? parts.join(' · ') : t('contactLists.noItems')
}

/** Théo B c2-mes-listes.R2 — nom, description, effectif, puis trois gestes dans « … ». */
function ListCard({ list }: { list: TargetList }) {
  const { t } = useTranslation('targets')
  const { updateList, deleteList } = useTargetListMutations()
  const [detail, setDetail] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const archived = list.status === 'archived'
  const isAccounts = listAudience(list) === 'accounts'
  const headingId = `contact-list-${list.id}`

  return (
    <li className="rounded-xl border border-[var(--bellum-border)] p-4">
      <section aria-labelledby={headingId} className="flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 id={headingId} className="min-w-0 text-base font-semibold text-[var(--bellum-text-primary)]">
            {list.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('contactLists.menu', { name: list.name })}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil className="size-4" aria-hidden />
                {t('contactLists.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  updateList.mutate({ listId: list.id, body: { status: archived ? 'in_progress' : 'archived' } })
                }
              >
                {archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
                {t(archived ? 'contactLists.restore' : 'contactLists.archive')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDeleting(true)}>
                <Trash2 className="size-4" aria-hidden />
                {t('contactLists.deleteOnly')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-sm text-[var(--bellum-text-secondary)]">
          {list.objective?.trim() ? list.objective : t('list.noObjective')}
        </p>
        <p className="mt-auto text-sm text-[var(--bellum-text-primary)]">{countsLine(list, t)}</p>
        {updateList.isError ? (
          <p role="alert" className="text-xs text-[var(--bellum-text-secondary)]">
            {t('saveError')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {archived ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => updateList.mutate({ listId: list.id, body: { status: 'in_progress' } })}
            >
              {t('contactLists.restore')}
            </Button>
          ) : isAccounts ? (
            // Un compte porte son tier, sa raison, ses problématiques : on les lit ici avant d'ouvrir Comptes.
            <Button type="button" size="sm" variant="outline" onClick={() => setDetail(true)}>
              {t('contactLists.open')}
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/contacts" search={{ targetListId: list.id }}>
                {t('contactLists.open')}
              </Link>
            </Button>
          )}
        </div>
      </section>

      <AccountsDetailDialog list={list} open={detail} onOpenChange={setDetail} />
      <RenameDialog list={list} open={renaming} onOpenChange={setRenaming} />
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent closeLabel={t('contactLists.close')}>
          <DialogHeader>
            <DialogTitle>{t('contactLists.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('contactLists.deleteBody', { name: list.name, count: liveItems(list).length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(false)}>
              {t('list.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteList.mutate(list.id, { onSuccess: () => setDeleting(false) })}
            >
              {t('contactLists.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** Théo B c2-mes-listes.N1 / .N2 — renommer la liste et réécrire sa description. */
function RenameDialog({
  list,
  open,
  onOpenChange,
}: {
  list: TargetList
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('targets')
  const { updateList } = useTargetListMutations()
  const [name, setName] = useState(list.name)
  const [objective, setObjective] = useState(list.objective ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    updateList.mutate(
      { listId: list.id, body: { name: trimmed, objective: objective.trim() || null } },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('contactLists.close')}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t('contactLists.rename')}</DialogTitle>
            <DialogDescription>{t('contactLists.renameHint')}</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
            {t('contactLists.fieldName')}
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={120}
              className={TARGET_FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
            {t('contactLists.fieldDescription')}
            <textarea
              value={objective}
              onChange={event => setObjective(event.target.value)}
              maxLength={500}
              rows={3}
              className={TARGET_FIELD_CLASS}
            />
          </label>
          {updateList.isError ? (
            <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
              {t('saveError')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('list.cancel')}
            </Button>
            <Button type="submit" variant="black" disabled={!name.trim() || updateList.isPending}>
              {t('contactLists.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Théo B c2-mes-listes.A1 — chaque compte garde son tier, la raison de sa présence et ses problématiques.
 * Rien n'est écrit si le vendeur ne les a pas fournis : une absence ne fait aucune cellule inventée.
 */
function AccountsDetailDialog({
  list,
  open,
  onOpenChange,
}: {
  list: TargetList
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('targets')
  const accounts = liveItems(list).filter(item => item.kind === 'account')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" closeLabel={t('contactLists.close')}>
        <DialogHeader>
          <DialogTitle>{list.name}</DialogTitle>
          <DialogDescription>{t('contactLists.detailHint')}</DialogDescription>
        </DialogHeader>
        <div className={cn('overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-[var(--bellum-text-secondary)]">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('contactLists.colAccount')}</th>
                <th className="py-2 pr-3 font-medium">{t('contactLists.colTier')}</th>
                <th className="py-2 pr-3 font-medium">{t('contactLists.colReason')}</th>
                <th className="py-2 font-medium">{t('contactLists.colIssues')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(item => (
                <tr key={item.id} className="border-t border-[var(--bellum-border)] align-top">
                  <td className="py-2 pr-3">
                    <Link
                      to="/accounts/$id"
                      params={{ id: item.ref_id }}
                      className="font-medium text-[var(--bellum-text-accent)] underline"
                    >
                      {item.label ?? t('unnamed')}
                    </Link>
                    {item.sublabel ? (
                      <span className="block text-xs text-[var(--bellum-text-secondary)]">{item.sublabel}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    {item.tier_label ? t('sellerTargeting.tier', { tier: item.tier_label }) : null}
                  </td>
                  <td className="py-2 pr-3">{item.selection_reason?.trim() || null}</td>
                  <td className="py-2">{item.seller_hypotheses?.addressable_issues?.trim() || null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('contactLists.close')}
          </Button>
          <Button asChild variant="black">
            <Link to="/accounts" search={{ lens: 'lists' }}>
              {t('contactLists.openInAccounts')}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
