import { labelWithCount } from '@/lib/count-label'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ModeTabs,
  Text,
  cn,
  type ModeTabItem,
} from '@bellum/ui'
import type { TargetList } from '@bellum/contracts'
import { Compass, Crosshair, LayoutList, Plus, Table2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { AskLaura } from '@/components/primitives/AskLaura'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useSession } from '@/lib/hooks/use-session'
import { useTargetListMutations, useTargetLists } from '../api'
import { ImportTargetListDialog } from './ImportTargetListDialog'
import { TARGET_FIELD_CLASS, TargetListCard } from './TargetListCard'
import { TargetListTile } from './TargetListTile'
import { TargetListsTable } from './TargetListsTable'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/**
 * #2156.67 — bascule cartes / tableau pour la liste des LISTES. « Cartes »
 * reste le défaut (décision la plus conservatrice, comportement inchangé) ;
 * « Tableau » est réservé aux utilisateurs avancés qui veulent balayer vite.
 */
type TargetListsLayout = 'cards' | 'table'

/** Théo B c2-mes-listes (C2.A1) — « Contacts · N / Comptes · N » ; une liste mixte est dans les deux. */
type TargetTypeFilter = 'all' | 'contacts' | 'accounts'

function matchesType(list: TargetList, type: TargetTypeFilter): boolean {
  if (type === 'all' || list.type === null || list.type === 'mixed') return true
  return list.type === type
}

/**
 * #2156.56-.60 — les 5 vues nommées, plus « Toutes » (par défaut, non
 * demandée par l'issue mais nécessaire pour ne rien cacher au premier
 * chargement — décision la plus conservatrice, decisions-louis-22-09-soir.md
 * §12). Chaque prédicat vit UNE fois ici (GA-26) : le résumé chiffré de
 * l'en-tête (#2156.51) réutilise `isActiveList` pour que « listes actives »
 * et la vue « Actives » disent toujours le même nombre.
 */
type TargetListView = 'all' | 'active' | 'toPrepare' | 'sharedWithMe' | 'done' | 'archived'

export function isActiveList(list: Pick<TargetList, 'status'>): boolean {
  return list.status === 'in_progress'
}

function matchesView(list: TargetList, view: TargetListView, userId: string | undefined): boolean {
  switch (view) {
    case 'all':
      return true
    case 'active':
      return isActiveList(list)
    case 'toPrepare':
      return list.status === 'to_qualify' || list.status === 'ready'
    case 'sharedWithMe':
      return list.visibility === 'workspace' && list.created_by !== userId
    case 'done':
      return list.status === 'done'
    case 'archived':
      return list.status === 'archived'
  }
}

/**
 * #4088.8 — LES LISTES DE CIBLES ONT QUITTÉ `/mes-cibles` (Louis 12/10/2026).
 *
 * `/mes-cibles` ne garde que les signaux (« ce qui bouge sur tes comptes ») ; les
 * listes — création, vues, cartes/tableau, import — vivent sur l'écran Comptes,
 * comme la lentille « Listes » (`/accounts?lens=lists`, le motif des lentilles
 * `delivery` / `effort`). Rien n'est supprimé : c'est l'ancien bloc « listes » de
 * #2155.13 / .22, déplacé tel quel.
 */
export function TargetListsSection() {
  const { t } = useTranslation('targets')
  // #2156.55 — « Importer une liste » : un CTA secondaire.
  const [importOpen, setImportOpen] = useState(false)
  const [view, setView] = useState<TargetListView>('all')
  const [layout, setLayout] = useState<TargetListsLayout>('cards')
  const [typeFilter, setTypeFilter] = useState<TargetTypeFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const { user } = useSession()
  const lists = useTargetLists()
  const members = useWorkspaceMembers()
  // #2156.51 — le résumé chiffré. « Active » reprend EXACTEMENT la même
  // définition que la vue « Actives » (#2156.56, GA-26) : `isActiveList`.
  const toReview = (lists.data ?? []).flatMap(list => list.items).filter(item => item.work_status === 'to_review')
  const activeListsCount = (lists.data ?? []).filter(isActiveList).length
  const readyToContactCount = (lists.data ?? []).reduce(
    (sum, list) => sum + (list.counts.measured ? list.counts.ready_to_work : 0),
    0,
  )
  const summaryParts = [
    { key: 'active', text: t('page.summaryActiveLists', { count: activeListsCount }), count: activeListsCount },
    { key: 'ready', text: t('page.summaryReadyContacts', { count: readyToContactCount }), count: readyToContactCount },
    { key: 'review', text: t('page.summaryToReview', { count: toReview.length }), count: toReview.length },
  ].filter(part => part.count > 0)
  const viewItems: ModeTabItem<TargetListView>[] = [
    { key: 'all', label: t('views.all') },
    { key: 'active', label: t('views.active') },
    { key: 'toPrepare', label: t('views.toPrepare') },
    { key: 'sharedWithMe', label: t('views.sharedWithMe') },
    { key: 'done', label: t('views.done') },
    { key: 'archived', label: t('views.archived') },
  ]

  const typedLists = (lists.data ?? []).filter(list => matchesView(list, view, user?.id))
  const contactListsCount = typedLists.filter(list => matchesType(list, 'contacts')).length
  const accountListsCount = typedLists.filter(list => matchesType(list, 'accounts')).length
  const shownLists = typedLists.filter(list => matchesType(list, typeFilter))
  const viewCount = (key: TargetListView) => (lists.data ?? []).filter(list => matchesView(list, key, user?.id)).length
  const detailList = (lists.data ?? []).find(list => list.id === detailId)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Théo B c2-mes-listes `.v13-section-title` — le titre, sa phrase, et le geste qui crée une liste
          (cocher dans le répertoire). Les gestes existants restent à droite : créer, importer, Découvrir, Laura. */}
      <div className={`${PAGE_GUTTER_X} flex flex-wrap items-start justify-between gap-4`}>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--bellum-text-primary)]">{t('lists.heading')}</h2>
          <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('lists.subtitle')}
          </Text>
          {/* #2155.14 — la garantie « retirer une cible ne supprime jamais la fiche », écrite en clair. */}
          <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('page.introCanonical')}
          </Text>
          {/* #2156.51 — un résumé qui n'affiche jamais « 0 » avant la première mesure.
              #4433.9 — ni après : une absence ne fait AUCUNE ligne (« 0 liste active », « 0 contact prêt »), la
              séparation ne se pose qu'entre deux parties qui existent (GA-18 / GA-19). */}
          {summaryParts.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-x-1.5 text-xs text-[var(--bellum-text-secondary)]">
              {summaryParts.flatMap((part, index) => [
                ...(index > 0
                  ? [
                      <span key={`${part.key}-sep`} aria-hidden>
                        ·
                      </span>,
                    ]
                  : []),
                <span key={part.key}>{part.text}</span>,
              ])}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* #2156.53/.54 — deux CTA secondaires : Découvrir, ou un arbitrage de Laura. */}
          <AskLaura alwaysVisible label={t('cta.askLaura')} question={t('cta.askLauraQuestion')} />
          <Button asChild size="sm" variant="outline">
            <Link to="/discover">
              <Compass className="size-4 shrink-0" aria-hidden />
              {t('cta.discover')}
            </Link>
          </Button>
          {/* #2931 — CTA secondaire à contour. */}
          <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            {t('cta.importList')}
          </Button>
          <Button type="button" variant="outline" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
            {t('cta.createList')}
          </Button>
          <Button asChild size="sm" variant="soft">
            <Link to="/contacts">{t('cta.selectContacts')}</Link>
          </Button>
        </div>
        <ImportTargetListDialog open={importOpen} onOpenChange={setImportOpen} />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent closeLabel={t('list.cancel')} className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('cta.createList')}</DialogTitle>
            </DialogHeader>
            <CreateTargetListForm onCreated={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div {...guideAnchorProps('cibles.listes')} className={PAGE_GUTTER_X}>
        {lists.isError ? (
          <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
            {t('loadError')}
          </p>
        ) : lists.data === undefined ? (
          <p className="text-sm text-[var(--bellum-text-secondary)]">{t('loading')}</p>
        ) : lists.data.length === 0 ? (
          // Théo B c2-mes-listes — « Aucune liste pour l'instant. » + le geste qui en crée une.
          <div className="rounded-overlay border border-[var(--bellum-border)] bg-card px-6 py-12 text-center">
            <Crosshair className="mx-auto mb-4 size-8 text-[var(--bellum-text-accent)]" aria-hidden />
            <h3 className="mb-2 text-lg font-semibold text-[var(--bellum-text-primary)]">{t('empty.title')}</h3>
            <Text element="p" size="sm" className="mx-auto text-[var(--bellum-text-secondary)]">
              {t('empty.theoHint')}
            </Text>
            <Text element="p" size="sm" className="mx-auto mt-1 mb-5 text-[var(--bellum-text-muted)]">
              {t('empty.description')}
            </Text>
            <Button asChild size="sm" variant="soft">
              <Link to="/contacts">{t('cta.selectContacts')}</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Théo B c2-mes-listes `.t-listbar` — le type (Contacts · N / Comptes · N, C2.A1), puis les vues
                de statut (#2156.56-.60, prédicats dans `matchesView`, GA-26) et la bascule cartes / tableau. */}
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label={t('typeFilter.aria')}
                className="inline-flex rounded-control border border-[var(--bellum-border)] p-0.5"
              >
                {(['contacts', 'accounts'] as const).map(key => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={typeFilter === key}
                    onClick={() => setTypeFilter(current => (current === key ? 'all' : key))}
                    className={cn(
                      'min-h-9 rounded-badge px-3 text-xs font-medium pointer-coarse:min-h-11',
                      typeFilter === key
                        ? 'bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
                        : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
                    )}
                  >
                    {t(`typeFilter.${key}`, { count: key === 'contacts' ? contactListsCount : accountListsCount })}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <ModeTabs
                items={viewItems.map(item => ({
                  ...item,
                  label: item.key === 'all' ? item.label : labelWithCount(item.label, viewCount(item.key), 'dot'),
                }))}
                value={view}
                onChange={setView}
              />
              {/* #2156.67 — bascule cartes / tableau ; « Cartes » reste le défaut. */}
              <LayoutToggle layout={layout} onChange={setLayout} />
            </div>
            {shownLists.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--bellum-text-secondary)]">{t('views.empty')}</p>
            ) : layout === 'table' ? (
              <TargetListsTable lists={shownLists} members={members.data ?? []} />
            ) : (
              // Théo `.v13-grid3` — trois cartes par rangée sur bureau, une au téléphone.
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shownLists.map(list => (
                  <TargetListTile key={list.id} list={list} onOpenDetail={() => setDetailId(list.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Le détail complet d'une liste (éléments, statuts, responsable, export, séquence) — `TargetListCard`,
          inchangé, dans une fenêtre (Théo `dlg-acclist`). */}
      <Dialog open={detailList !== undefined} onOpenChange={open => (open ? null : setDetailId(null))}>
        <DialogContent
          closeLabel={t('tile.close')}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{detailList?.name ?? ''}</DialogTitle>
          {detailList ? <TargetListCard list={detailList} members={members.data ?? []} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const LAYOUT_TOGGLE_BUTTON =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]'
const LAYOUT_TOGGLE_ACTIVE = 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]'

/** #2156.67 — bascule cartes / tableau, réutilisable où la liste des LISTES s'affiche. */
function LayoutToggle({
  layout,
  onChange,
}: {
  layout: TargetListsLayout
  onChange: (layout: TargetListsLayout) => void
}) {
  const { t } = useTranslation('targets')
  return (
    <div
      role="group"
      aria-label={t('layout.groupLabel')}
      className="flex items-center gap-1 rounded-lg border border-[var(--bellum-border)] p-0.5"
    >
      <button
        type="button"
        aria-pressed={layout === 'cards'}
        aria-label={t('cta.viewCards')}
        className={cn(LAYOUT_TOGGLE_BUTTON, layout === 'cards' && LAYOUT_TOGGLE_ACTIVE)}
        onClick={() => onChange('cards')}
      >
        <LayoutList className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-pressed={layout === 'table'}
        aria-label={t('cta.viewTable')}
        className={cn(LAYOUT_TOGGLE_BUTTON, layout === 'table' && LAYOUT_TOGGLE_ACTIVE)}
        onClick={() => onChange('table')}
      >
        <Table2 className="size-4" aria-hidden />
      </button>
    </div>
  )
}

/** #2155.16 — une liste naît avec son nom et, si on l'écrit, son objectif. */
function CreateTargetListForm({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation('targets')
  const { createList } = useTargetListMutations()
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createList.mutate(
      { name: trimmed, objective: objective.trim() || null },
      {
        onSuccess: () => {
          setName('')
          setObjective('')
          onCreated?.()
        },
      },
    )
  }

  return (
    <form {...guideAnchorProps('cibles.creer-une-liste')} onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
        {t('create.name')}
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder={t('create.namePlaceholder')}
          maxLength={120}
          className={TARGET_FIELD_CLASS}
        />
      </label>
      <label className="flex min-w-0 flex-[2] basis-72 flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
        {t('create.objective')}
        <input
          value={objective}
          onChange={event => setObjective(event.target.value)}
          placeholder={t('create.objectivePlaceholder')}
          maxLength={500}
          className={TARGET_FIELD_CLASS}
        />
      </label>
      <Button type="submit" size="sm" variant="black" disabled={!name.trim() || createList.isPending}>
        {t('create.submit')}
      </Button>
      {/* #2167.9 — le contrat de page exige un coût ÉVENTUEL nommé sur
          chaque surface : `createList` ne pose que le nom et l'objectif
          (aucun appel facturé), donc le formulaire le dit plutôt que de
          laisser la question ouverte. */}
      <p className="w-full text-xs text-[var(--bellum-text-muted)]">{t('create.costHint')}</p>
      {createList.isError ? (
        <p role="alert" className="w-full text-sm text-[var(--bellum-text-secondary)]">
          {t('create.error')}
        </p>
      ) : null}
    </form>
  )
}
