import type { TargetList } from '@bellum/contracts'
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
  DropdownMenuTrigger,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Building2, Layers, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTargetListMutations } from '../api'
import { ICON_BUTTON_CLASS, TARGET_FIELD_CLASS } from './TargetListCard'

/**
 * Théo B c2-mes-listes `.v13-listcard` — une liste se lit en carte : son type, son nom, sa phrase, ce
 * qu'elle porte, et « Ouvrir ». Une liste de CONTACTS s'ouvre dans le répertoire filtré (bandeau
 * « Liste : … », C2.R3) ; une liste de comptes ou mixte ouvre son détail complet (`TargetListCard`,
 * inchangé : éléments, statuts, responsable, export, séquence, analyse).
 *
 * « Renommer » (C2.N1) écrit le nom et l'objectif par le PATCH existant. « Supprimer la liste uniquement »
 * dit ce qu'il garde : les fiches restent, avec leur historique (#2155.14).
 *
 * Les compteurs ne s'écrivent que MESURÉS (`counts.measured`) : une liste cloisonnée ne s'annonce jamais
 * « 0 contact ».
 */
export function TargetListTile({ list, onOpenDetail }: { list: TargetList; onOpenDetail: () => void }) {
  const { t } = useTranslation('targets')
  const { updateList, deleteList } = useTargetListMutations()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const live = list.items.filter(item => item.removed_at == null)
  const contacts = live.filter(item => item.kind === 'contact').length
  const accounts = live.filter(item => item.kind === 'account').length
  const archived = list.status === 'archived'
  const Icon = list.type === 'accounts' ? Building2 : list.type === 'contacts' ? Users : Layers
  const opensInDirectory = list.type === 'contacts'

  return (
    <article
      aria-labelledby={`target-tile-${list.id}`}
      data-testid="target-list-tile"
      className="flex min-w-0 flex-col gap-3 rounded-overlay border border-[var(--bellum-border)] bg-card p-5"
    >
      <div className="flex items-center gap-1">
        <span className="inline-flex size-9 items-center justify-center rounded-control bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex-1" />
        {archived ? null : (
          <>
            <button
              type="button"
              className={ICON_BUTTON_CLASS}
              aria-label={t('tile.rename', { name: list.name })}
              onClick={() => setRenaming(true)}
            >
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={ICON_BUTTON_CLASS}
              aria-label={t('tile.deleteOnly', { name: list.name })}
              onClick={() => setDeleting(true)}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
            {/* Théo `.v13-icon` « Plus d'actions » (C2.A2) — le détail complet, et archiver (réversible : « Ressortir »). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={ICON_BUTTON_CLASS} aria-label={t('tile.more', { name: list.name })}>
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onOpenDetail}>{t('tile.detail')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => updateList.mutate({ listId: list.id, body: { status: 'archived' } })}>
                  {t('tile.archive')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      <div className="min-w-0">
        <h3
          id={`target-tile-${list.id}`}
          className="truncate text-base font-semibold text-[var(--bellum-text-primary)]"
        >
          {list.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--bellum-text-secondary)]">
          {list.objective ? t('list.objective', { objective: list.objective }) : t('list.noObjective')}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {list.counts.measured ? (
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
              {accounts > 0 ? accounts : contacts}
            </span>
            <span className="text-xs text-[var(--bellum-text-muted)]">
              {accounts > 0
                ? contacts > 0
                  ? t('tile.accountsAndContacts', { count: accounts, contacts })
                  : t('tile.accounts', { count: accounts })
                : t('tile.contacts', { count: contacts })}
            </span>
          </p>
        ) : (
          <p className="text-xs text-[var(--bellum-text-muted)]">{t(`tile.gap.${list.counts.gap}`)}</p>
        )}
        <span className="flex-1" />
        {archived ? (
          <Button
            type="button"
            size="sm"
            variant="soft"
            onClick={() => updateList.mutate({ listId: list.id, body: { status: 'in_progress' } })}
          >
            {t('tile.restore')}
          </Button>
        ) : opensInDirectory ? (
          <Button asChild size="sm" variant="soft">
            <Link
              to="/contacts"
              search={{ targetListId: list.id }}
              aria-label={t('tile.openAria', { name: list.name })}
            >
              {t('tile.open')}
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="soft"
            aria-label={t('tile.openAria', { name: list.name })}
            onClick={onOpenDetail}
          >
            {t('tile.open')}
          </Button>
        )}
      </div>
      <RenameListDialog
        list={list}
        open={renaming}
        onOpenChange={setRenaming}
        onSave={body => updateList.mutate({ listId: list.id, body })}
      />
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent closeLabel={t('list.cancel')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tile.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('tile.deleteBody', { name: list.name })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setDeleting(false)}>
              {t('list.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                deleteList.mutate(list.id)
                setDeleting(false)
              }}
            >
              {t('list.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}

function RenameListDialog({
  list,
  open,
  onOpenChange,
  onSave,
}: {
  list: TargetList
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (body: { name: string; objective: string | null }) => void
}) {
  const { t } = useTranslation('targets')
  const [name, setName] = useState(list.name)
  const [objective, setObjective] = useState(list.objective ?? '')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({ name: trimmed, objective: objective.trim() || null })
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) {
          setName(list.name)
          setObjective(list.objective ?? '')
        }
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('list.cancel')} className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('tile.renameTitle')}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
            {t('create.name')}
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={120}
              className={TARGET_FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
            {t('tile.description')}
            <input
              value={objective}
              onChange={event => setObjective(event.target.value)}
              maxLength={500}
              className={TARGET_FIELD_CLASS}
            />
          </label>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {t('list.cancel')}
            </Button>
            <Button type="submit" size="sm" variant="default" disabled={!name.trim()}>
              {t('tile.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
