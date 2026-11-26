import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@bellum/ui'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SortKey } from './types'

/**
 * Refonte Théo (comptes-liste, `.a4-toolbar`) — les trois contrôles que la maquette pose après « Filtres » :
 * le RESPONSABLE, le TRI, et la PRÉSENTATION (tableau ou cartes). Chacun écrit un axe qui existait déjà
 * dans l'URL (`ownership`, `sort`) ou la seule clé neuve (`layout`) : aucun état local, un lien partagé
 * ouvre la même liste.
 */

type Ownership = 'all' | 'mine' | 'teammate'

const TRIGGER_CLASS =
  'h-10 min-h-11 w-auto min-w-36 max-w-56 gap-2 rounded-control border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-xs text-[var(--bellum-text-secondary)] md:min-h-10'

/** « Toute l'équipe » · « Mes comptes » · « Portés par un collègue » — l'axe `ownership`, une seule fois. */
export function AccountsOwnerSelect({ value, onChange }: { value: Ownership; onChange: (next: Ownership) => void }) {
  const { t } = useTranslation('accounts')
  const label = t(`toolbar.owner.${value}`)
  return (
    <Select value={value} onValueChange={next => onChange(next as Ownership)}>
      <SelectTrigger aria-label={t('toolbar.owner.aria', { value: label })} className={TRIGGER_CLASS}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(['all', 'mine', 'teammate'] as const).map(key => (
          <SelectItem key={key} value={key}>
            {t(`toolbar.owner.${key}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Le tri, nommé en MOTS : « Décision d'abord » ordonne par la décision et le verdict (jamais un score
 * affiché), puis le nom, puis le dossier le plus récent. Les sens inverses restent aux entêtes du tableau.
 */
const SORT_OPTIONS = ['score_desc', 'name_asc', 'date_desc'] as const satisfies readonly SortKey[]

export function AccountsSortSelect({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const { t } = useTranslation('accounts')
  // Un tri posé par une entête (sens inverse) n'a pas d'option : le sélecteur le DIT au lieu de mentir.
  const known = (SORT_OPTIONS as readonly SortKey[]).includes(value)
  const label = known ? t(`toolbar.sort.${value}`) : t('toolbar.sort.custom')
  return (
    <Select value={known ? value : 'custom'} onValueChange={next => onChange(next as SortKey)}>
      <SelectTrigger aria-label={t('toolbar.sort.aria', { value: label })} className={TRIGGER_CLASS}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map(key => (
          <SelectItem key={key} value={key}>
            {t(`toolbar.sort.${key}`)}
          </SelectItem>
        ))}
        {known ? null : (
          <SelectItem value="custom" disabled>
            {t('toolbar.sort.custom')}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

/** Tableau ou cartes — un segment de deux icônes NOMMÉES (GA-32), l'état dit par `aria-pressed`. */
export function AccountsLayoutToggle({ cards, onChange }: { cards: boolean; onChange: (cards: boolean) => void }) {
  const { t } = useTranslation('accounts')
  const options = [
    { cards: false, label: t('toolbar.layout.table'), Icon: Rows3 },
    { cards: true, label: t('toolbar.layout.cards'), Icon: LayoutGrid },
  ]
  return (
    <div
      role="group"
      aria-label={t('toolbar.layout.label')}
      className="flex items-center gap-0.5 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0.5"
    >
      {options.map(option => (
        <button
          key={option.label}
          type="button"
          aria-label={option.label}
          title={option.label}
          aria-pressed={cards === option.cards}
          onClick={() => onChange(option.cards)}
          className={cn(
            'flex size-9 items-center justify-center rounded-control text-[var(--bellum-text-muted)] transition-colors duration-immediate ease-bellum-out pointer-coarse:size-11',
            cards === option.cards
              ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
              : 'hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <option.Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  )
}
