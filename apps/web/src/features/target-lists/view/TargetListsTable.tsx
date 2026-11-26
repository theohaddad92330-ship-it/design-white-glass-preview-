import { Button, HORIZONTAL_OVERSCROLL_CLASS, SelectField, cn } from '@bellum/ui'
import { TARGET_LIST_STATUSES, type TargetList, type TargetListStatus } from '@bellum/contracts'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useTargetListMutations } from '../api'
import { ICON_BUTTON_CLASS, TARGET_FIELD_CLASS } from './TargetListCard'
import { getTargetListFreshnessValue, getTargetListOwnerLabel } from './target-list-summary'

type Props = { lists: TargetList[]; members: WorkspaceMember[] }

/**
 * #2156.67 — bascule « vue tableau » pour un balayage dense des LISTES : une
 * ligne par liste (nom, statut, responsable, origine, progression, fraîcheur,
 * prochaine action), sans le détail par élément qui reste réservé à la vue
 * cartes (`TargetListCard`). Mêmes dérivations (GA-26, `target-list-summary`),
 * mêmes gestes d'écriture (`updateList`/`deleteList`) que la carte.
 */
export function TargetListsTable({ lists, members }: Props) {
  const { t } = useTranslation('targets')
  return (
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <div className={cn('mt-3 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="text-xs text-[var(--bellum-text-secondary)]">
          <tr>
            <th className="py-2 pr-3 font-medium">{t('table.headerName')}</th>
            <th className="py-2 pr-3 font-medium">{t('list.statusLabel')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.owner')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.source')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.progress')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.freshness')}</th>
            <th className="py-2 pr-3 font-medium">{t('table.nextAction')}</th>
            <th className="py-2 font-medium">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lists.map(list => (
            <TargetListTableRow key={list.id} list={list} members={members} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TargetListTableRow({ list, members }: { list: TargetList; members: WorkspaceMember[] }) {
  const { t } = useTranslation('targets')
  const { deleteList, updateList } = useTargetListMutations()
  const [confirming, setConfirming] = useState(false)
  const listField = (column: string) => t('list.field', { column, name: list.name })
  const ownerLabel = getTargetListOwnerLabel(list, members, t)
  const freshnessValue = getTargetListFreshnessValue(list, t)

  return (
    <tr className="border-t border-[var(--bellum-border)] align-top">
      <td className="py-2 pr-3 font-medium text-[var(--bellum-text-primary)]">{list.name}</td>
      <td className="py-2 pr-3">
        <SelectField
          size="sm"
          ariaLabel={listField(t('list.statusLabel'))}
          value={list.status}
          onChange={next => updateList.mutate({ listId: list.id, body: { status: next as TargetListStatus } })}
          options={TARGET_LIST_STATUSES.map(status => ({ value: status, label: t(`listStatus.${status}`) }))}
        />
      </td>
      <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{ownerLabel}</td>
      <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{t(`listSource.${list.source}`)}</td>
      <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">
        {list.counts.measured
          ? list.counts.total === 0
            ? null
            : t('list.progressMeasured', { ready: list.counts.ready_to_work, total: list.counts.total })
          : t(`progressGap.${list.counts.gap}`)}
      </td>
      <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{freshnessValue}</td>
      <td className="py-2 pr-3">
        <input
          aria-label={listField(t('list.nextActionLabel'))}
          defaultValue={list.next_action ?? ''}
          placeholder={t('nextActionPlaceholder')}
          maxLength={300}
          onBlur={event => {
            const next = event.target.value.trim() || null
            if (next !== list.next_action) updateList.mutate({ listId: list.id, body: { next_action: next } })
          }}
          className={`${TARGET_FIELD_CLASS} w-full min-w-40`}
        />
      </td>
      <td className="py-2">
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
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            aria-label={t('list.delete', { name: list.name })}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </td>
    </tr>
  )
}
