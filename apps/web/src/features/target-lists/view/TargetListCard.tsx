import { Button, HORIZONTAL_OVERSCROLL_CLASS, SelectField, cn } from '@bellum/ui'
import {
  TARGET_LIST_STATUSES,
  TARGET_PRIORITIES,
  TARGET_WORK_STATUSES,
  type TargetList,
  type TargetListItem,
  type TargetListStatus,
  type TargetPriority,
  type TargetWorkStatus,
  type UpdateTargetListItem,
} from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Download, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountFactLines } from '@/components/account/AccountFactLines'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useDebounce } from '@/hooks/useDebounce'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { targetListsApi, useTargetCandidates, useTargetListMutations } from '../api'
import { useRefillTargetListFromSavedSearch } from '../useRefillTargetListFromSavedSearch'
import {
  targetListAccountIds,
  targetListExportFilename,
  targetListItemsCsv,
  type TargetListExportLabels,
  type TargetListFactCells,
} from '../lib/target-list-export'
import { TargetListSequenceAction } from './TargetListSequenceAction'
import { getTargetListFreshnessValue, getTargetListOwnerLabel } from './target-list-summary'

export const TARGET_FIELD_CLASS =
  'min-h-9 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm text-[var(--bellum-text-primary)]'

// Recette 06/10 — les colonnes à liste déroulante gardent une largeur plancher : sans elle, le bloc
// tier/raison/hypothèses (#3753) de la 1re colonne prenait toute la place et « À vérifier » sortait
// en « À… ». Plancher en `rem` (le tableau défile en x sous 768 px, `overflow-x-auto`).
export const TARGET_SELECT_CELL_CLASS = {
  priority: 'py-2 pr-3 min-w-32',
  owner: 'py-2 pr-3 min-w-44',
  status: 'py-2 pr-3 min-w-40',
} as const
// La 1re colonne borne sa mesure de lecture : le texte libre se replie au lieu d'écraser les voisines.
export const TARGET_ITEM_CELL_CLASS = 'py-2 pr-3 min-w-48 max-w-md'

// #2156.67 (GA-26) — partagée avec `TargetListsTable` : même bouton icône, deux
// mises en page.
export const ICON_BUTTON_CLASS =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]'

type Props = { list: TargetList; members: WorkspaceMember[] }

/** #2155.13 à .21 — une liste de cibles : son objectif, puis ses éléments. */
export function TargetListCard({ list, members }: Props) {
  const { t } = useTranslation('targets')
  const { deleteList, updateList } = useTargetListMutations()
  const refill = useRefillTargetListFromSavedSearch()
  const [confirming, setConfirming] = useState(false)
  const headingId = `target-list-${list.id}`
  const listField = (column: string) => t('list.field', { column, name: list.name })

  // #2156.63/.65 (GA-26) — dérivations partagées avec `TargetListsTable`.
  const ownerLabel = getTargetListOwnerLabel(list, members, t)
  const freshnessValue = getTargetListFreshnessValue(list, t)

  /**
   * #2157.46 — EXPORTER une cible, ligne pour ligne, comme le tableau
   * l'affiche. Même règle que tout CSV construit dans le navigateur (D#2081.14,
   * garde `a-csv-leaves-only-through-the-workspace-rule`) : le bouton n'existe
   * que si la règle d'espace laisse sortir des données.
   */
  const dataExit = useDataExit()
  const exportLabels: TargetListExportLabels = {
    kind: t('columns.kind'),
    label: t('columns.item'),
    sublabel: t('columns.detail'),
    priority: t('columns.priority'),
    owner: t('columns.owner'),
    workStatus: t('columns.status'),
    provenance: t('columns.provenance'),
    nextAction: t('columns.nextAction'),
    selectionReason: t('list.selectionReasonColumn'),
    kindLabel: { account: t('kind.account'), contact: t('kind.contact') },
    priorityLabel: priority => t(`priority.${priority}`),
    workStatusLabel: status => t(`status.${status}`),
    provenanceLabel: provenance => t(`provenance.${provenance}`),
    ownerNone: t('owner.none'),
    ownerUnknown: t('owner.unknown'),
    facts: {
      lastHiring: t('exportFacts.lastHiring'),
      lastNeed: t('exportFacts.lastNeed'),
      lastSignal: t('exportFacts.lastSignal'),
      dealWon: t('exportFacts.dealWon'),
      dealLost: t('exportFacts.dealLost'),
      mission: t('exportFacts.mission'),
    },
  }
  const exportList = async () => {
    if (!dataExit.grant) return
    // #4073.1 — les faits datés des comptes de la liste, lus par le lecteur
    // unique. Un échec est DIT, le fichier ne part pas sans (jamais de colonnes
    // vides qui se liraient « aucun fait »). Une liste sans compte garde ses colonnes.
    const accountIds = targetListAccountIds(list.items)
    let facts: TargetListFactCells | undefined
    if (accountIds.length > 0) {
      try {
        facts = await targetListsApi.accountFactsCells(accountIds)
      } catch {
        toast.error(t('list.exportFactsError'))
        return
      }
    }
    downloadCSV(
      targetListItemsCsv(list.items, members, exportLabels, facts),
      targetListExportFilename(list, t('list.exportFilenamePrefix')),
      dataExit.grant,
    )
  }

  /**
   * #2157.43 (épopée #2962) — « Analyser les comptes » : le MÊME lot d'analyse
   * que `/discover/lots` (préview, coût, doublons déjà analysés), jamais un
   * second moteur — cette liste ne fait QUE pré-remplir les noms déjà connus.
   * Absent si la cible ne porte aucun compte vivant nommé (jamais un lien vers
   * un lot vide).
   */
  const liveAccountNames = list.items
    .filter(
      (item): item is TargetListItem & { label: string } =>
        item.removed_at == null && item.kind === 'account' && item.label != null,
    )
    .map(item => item.label)

  return (
    <section aria-labelledby={headingId} className="mt-6 rounded-xl border border-[var(--bellum-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-[var(--bellum-text-primary)]">
            {list.name}
          </h2>
          {/* #2155.16 — l'objectif est ce qui distingue une liste de travail d'un tas de fiches. */}
          <p className="text-sm text-[var(--bellum-text-secondary)]">
            {list.objective ? t('list.objective', { objective: list.objective }) : t('list.noObjective')}
          </p>
        </div>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              {t('list.cancel')}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => deleteList.mutate(list.id)}>
              {t('list.confirmDelete')}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-1">
            {/* #2157.43 — absent (pas grisé) sans compte vivant nommé : un lien
                vers un lot d'analyse vide n'apprendrait rien. */}
            {liveAccountNames.length > 0 ? (
              <Link
                to="/discover/lots"
                search={{ names: liveAccountNames }}
                className={ICON_BUTTON_CLASS}
                aria-label={t('list.analyze', { name: list.name })}
              >
                <Search className="size-4" aria-hidden />
              </Link>
            ) : null}
            {/* Golden journey 29 (#2208.60) — la liste est une source d'audience de séquence. */}
            <TargetListSequenceAction
              listId={list.id}
              listName={list.name}
              buttonClassName={ICON_BUTTON_CLASS}
              hasLiveItems={list.items.some(item => item.removed_at == null)}
            />
            {/* #2157.46 — masqué, pas grisé : une règle d'espace qui RETIRE ne
                se lit jamais « ouverte » sur un doute (`useDataExit`). */}
            {dataExit.allowed ? (
              <button
                type="button"
                className={ICON_BUTTON_CLASS}
                aria-label={t('list.export', { name: list.name })}
                onClick={exportList}
              >
                <Download className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className={ICON_BUTTON_CLASS}
              aria-label={t('list.delete', { name: list.name })}
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* #2156.35-.39/.63/.65/.66 — le statut, le responsable, l'origine, la
          progression, la fraîcheur et la prochaine action de la LISTE elle-même
          (distincts des mêmes notions portées par CHAQUE élément ci-dessous). */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--bellum-text-secondary)]">
        <SelectField
          size="sm"
          ariaLabel={listField(t('list.statusLabel'))}
          value={list.status}
          onChange={next => updateList.mutate({ listId: list.id, body: { status: next as TargetListStatus } })}
          options={TARGET_LIST_STATUSES.map(status => ({ value: status, label: t(`listStatus.${status}`) }))}
        />
        <span>{t('list.owner', { name: ownerLabel })}</span>
        <span>{t('list.source', { source: t(`listSource.${list.source}`) })}</span>
        {/* Golden journey 9 (#2208.40) — une liste sans fiche n'a pas de progression : « 0 sur 0 prêts »
            est un ratio sans dénominateur, et « Cette liste est vide » en dessous le dit déjà. */}
        {list.counts.measured && list.counts.total === 0 ? null : (
          <span>
            {list.counts.measured
              ? t('list.progressMeasured', { ready: list.counts.ready_to_work, total: list.counts.total })
              : t(`progressGap.${list.counts.gap}`)}
          </span>
        )}
        <span>{t('list.freshness', { value: freshnessValue })}</span>
        <input
          aria-label={listField(t('list.nextActionLabel'))}
          defaultValue={list.next_action ?? ''}
          placeholder={t('nextActionPlaceholder')}
          maxLength={300}
          onBlur={event => {
            const next = event.target.value.trim() || null
            if (next !== list.next_action) updateList.mutate({ listId: list.id, body: { next_action: next } })
          }}
          className={`${TARGET_FIELD_CLASS} min-w-40`}
        />
      </div>

      {/* #3075 (rattrapage) — une cible « recherche enregistrée » créée avant le
          correctif peut être restée vide/incomplète en base : ce geste rejoue
          CETTE liste, ciblé, jamais tout le parc au déploiement. Un clic,
          jamais automatique (le rejeu ne part pas seul, doctrine #2543). */}
      {list.source === 'saved_search' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refill.isPending}
            onClick={() => refill.mutate({ list })}
          >
            {t('list.refill')}
          </Button>
          <p className="text-xs text-[var(--bellum-text-secondary)]">{t('list.refillHint')}</p>
        </div>
      )}

      <AddTargetItem listId={list.id} />

      {list.items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--bellum-text-secondary)]">{t('list.empty')}</p>
      ) : (
        // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
        <div className={cn('mt-3 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-xs text-[var(--bellum-text-secondary)]">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('columns.item')}</th>
                <th className="py-2 pr-3 font-medium">{t('columns.priority')}</th>
                <th className="py-2 pr-3 font-medium">{t('columns.owner')}</th>
                <th className="py-2 pr-3 font-medium">{t('columns.status')}</th>
                <th className="py-2 pr-3 font-medium">{t('columns.provenance')}</th>
                <th className="py-2 pr-3 font-medium">{t('columns.nextAction')}</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">{t('columns.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map(item => (
                <TargetItemRow key={item.id} item={item} listId={list.id} members={members} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/**
 * #3753.2/.3/.6 — le ciblage de l'ESN, tel qu'elle l'a fourni : « Tier A/B/C »
 * (la lettre, jamais un pourcentage ni une chance), la raison, les problématiques
 * et projets IT « selon ton ciblage » — des hypothèses du vendeur, pas des faits
 * collectés. Une absence ne fait AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas »).
 */
export function SellerTargeting({ item }: { item: TargetListItem }) {
  const { t } = useTranslation('targets')
  const issues = item.seller_hypotheses?.addressable_issues?.trim()
  const projects = item.seller_hypotheses?.upcoming_it_projects?.trim()
  const reason = item.selection_reason?.trim()
  if (!item.tier_label && !reason && !issues && !projects) return null
  return (
    <div className="mt-1 space-y-0.5 text-xs text-[var(--bellum-text-secondary)]">
      {item.tier_label ? (
        <span className="font-medium text-[var(--bellum-text-primary)]">
          {t('sellerTargeting.tier', { tier: item.tier_label })}
        </span>
      ) : null}
      {reason ? <p>{t('sellerTargeting.reason', { value: reason })}</p> : null}
      {issues ? <p>{t('sellerTargeting.issues', { value: issues })}</p> : null}
      {projects ? <p>{t('sellerTargeting.projects', { value: projects })}</p> : null}
    </div>
  )
}

function TargetItemRow({
  item,
  listId,
  members,
}: {
  item: TargetListItem
  listId: string
  members: WorkspaceMember[]
}) {
  const { t } = useTranslation('targets')
  const { updateItem, removeItem } = useTargetListMutations()
  const label = item.label ?? t('unnamed')
  const field = (column: string) => t('field', { column: t(`columns.${column}`), label })
  const update = (body: UpdateTargetListItem) => updateItem.mutate({ listId, itemId: item.id, body })
  // Un responsable qui a quitté l'espace reste NOMMÉ comme tel, pas effacé en « Personne ».
  const ownerKnown = item.owner_user_id == null || members.some(member => member.userId === item.owner_user_id)

  return (
    <tr className="border-t border-[var(--bellum-border)] align-top">
      <td className={TARGET_ITEM_CELL_CLASS}>
        {/* #2155.15 — le lien mène à la fiche CANONIQUE, jamais à une copie. */}
        {item.kind === 'account' ? (
          <Link
            to="/accounts/$id"
            params={{ id: item.ref_id }}
            className="font-medium text-[var(--bellum-text-accent)] underline"
          >
            {label}
          </Link>
        ) : (
          <Link
            to="/contacts/$id"
            params={{ id: item.ref_id }}
            className="font-medium text-[var(--bellum-text-accent)] underline"
          >
            {label}
          </Link>
        )}
        <span className="block text-xs text-[var(--bellum-text-secondary)]">
          {item.sublabel ? `${t(`kind.${item.kind}`)} · ${item.sublabel}` : t(`kind.${item.kind}`)}
        </span>
        <SellerTargeting item={item} />
        {/* #4072.5 — les 3 faits les plus récents du compte : date · TYPE · fait. */}
        <AccountFactLines facts={item.recent_facts} max={3} />
      </td>
      <td className={TARGET_SELECT_CELL_CLASS.priority}>
        {/* #2155.17 — `null` = pas encore posée : ça se DIT, ça ne devient pas « basse ». */}
        <SelectField
          size="sm"
          ariaLabel={field('priority')}
          value={item.priority ?? ''}
          onChange={next => update({ priority: next === '' ? null : (next as TargetPriority) })}
          emptyOption={{ label: t('priority.none') }}
          options={TARGET_PRIORITIES.map(priority => ({ value: priority, label: t(`priority.${priority}`) }))}
        />
      </td>
      <td className={TARGET_SELECT_CELL_CLASS.owner}>
        {/* #2155.18 — le responsable est un membre de l'espace, ou personne. */}
        <SelectField
          size="sm"
          ariaLabel={field('owner')}
          value={item.owner_user_id ?? ''}
          onChange={next => update({ owner_user_id: next === '' ? null : next })}
          emptyOption={{ label: t('owner.none') }}
          options={[
            ...(ownerKnown ? [] : [{ value: item.owner_user_id ?? '', label: t('owner.unknown') }]),
            ...members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? t('owner.unknown'),
            })),
          ]}
        />
      </td>
      <td className={TARGET_SELECT_CELL_CLASS.status}>
        {/* #2155.19 — le statut de travail ; « à vérifier » attend une décision.
            #2156.42 / .43 / .45 / .46 — les NEUF valeurs du contrat portent leur
            libellé, FR et EN : la clé est interpolée sans `defaultValue`, donc une
            valeur sans libellé s'afficherait en clair (« status.to_enrich »). C'est
            `i18n/enum-keys.test.ts` qui l'exige au prochain statut ajouté. */}
        <SelectField
          size="sm"
          ariaLabel={field('status')}
          value={item.work_status}
          onChange={next => update({ work_status: next as TargetWorkStatus })}
          options={TARGET_WORK_STATUSES.map(status => ({ value: status, label: t(`status.${status}`) }))}
        />
      </td>
      {/* #2155.20 — d'où vient la sélection. Écrite à l'ajout, elle ne se réécrit pas. */}
      <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{t(`provenance.${item.provenance}`)}</td>
      <td className="py-2 pr-3">
        {/* #2155.21 — l'action suivante, enregistrée quand on quitte le champ. */}
        <input
          aria-label={field('nextAction')}
          defaultValue={item.next_action ?? ''}
          placeholder={t('nextActionPlaceholder')}
          maxLength={300}
          onBlur={event => {
            const next = event.target.value.trim() || null
            if (next !== item.next_action) update({ next_action: next })
          }}
          className={`${TARGET_FIELD_CLASS} w-full min-w-40`}
        />
        {updateItem.isError ? (
          <span role="alert" className="block text-xs text-[var(--bellum-text-secondary)]">
            {t('saveError')}
          </span>
        ) : null}
      </td>
      <td className="py-2">
        {/* #2155.14 — retirer de la liste ne touche pas la fiche. */}
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          aria-label={t('remove', { label })}
          onClick={() => removeItem.mutate({ listId, itemId: item.id })}
        >
          <X className="size-4" aria-hidden />
        </button>
      </td>
    </tr>
  )
}

/**
 * Ajouter un compte ou un contact DÉJÀ dans l'espace. La recherche ne sort pas
 * de l'espace : trouver de nouvelles entreprises, c'est Découvrir.
 */
function AddTargetItem({ listId }: { listId: string }) {
  const { t } = useTranslation('targets')
  const { addItem } = useTargetListMutations()
  const [query, setQuery] = useState('')
  const [debounced] = useDebounce(query, 250)
  const candidates = useTargetCandidates(debounced)
  const showResults = debounced.trim().length >= 2

  return (
    <div className="mt-3">
      <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
        {t('add.label')}
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('add.placeholder')}
          className={`${TARGET_FIELD_CLASS} max-w-md`}
        />
      </label>
      <p className="mt-1 text-xs text-[var(--bellum-text-secondary)]">{t('add.hint')}</p>
      {showResults && candidates.data ? (
        candidates.data.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('add.none')}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {candidates.data.map(candidate => {
              const label = candidate.label ?? t('unnamed')
              return (
                <li key={`${candidate.kind}-${candidate.id}`}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    icon={Plus}
                    aria-label={t('add.add', { label })}
                    disabled={addItem.isPending}
                    onClick={() =>
                      addItem.mutate(
                        { listId, body: { kind: candidate.kind, ref_id: candidate.id, provenance: 'manual' } },
                        { onSuccess: () => setQuery('') },
                      )
                    }
                  >
                    {candidate.sublabel ? `${label} · ${candidate.sublabel}` : label}
                  </Button>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
      {addItem.isError ? (
        <p role="alert" className="mt-1 text-sm text-[var(--bellum-text-secondary)]">
          {t('add.error')}
        </p>
      ) : null}
    </div>
  )
}
