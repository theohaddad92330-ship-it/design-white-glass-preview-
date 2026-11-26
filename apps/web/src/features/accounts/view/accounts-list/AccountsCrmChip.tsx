import { chipClassName, chipCountClassName, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { readFilterList, writeFilterList } from '@/features/accounts/lib/portfolioFilters'

/** #4526.3 — `search.crm === 'only'` est la SEULE valeur qui active la puce. */
export function crmFilterOf(search: { readonly crm?: string }): 'only' | undefined {
  return search.crm === 'only' ? 'only' : undefined
}

/**
 * #4643 — « Archives » EXCLUT les puces de source : les compteurs de la puce (`spaceCountersBase`) comptent le
 * portefeuille VIVANT, jamais les comptes rangés. Allumer une puce quitte donc « Archives » (seul `archived` part
 * du statut, les autres valeurs restent) ; deux puces de source, elles, se cumulent (Mon CRM ET Importés).
 */
function leaveArchives(prev: Record<string, unknown>): Record<string, unknown> {
  const status = readFilterList(prev.status)
  if (!status.includes('archived')) return {}
  return { status: writeFilterList(status.filter(value => value !== 'archived')) }
}

/** #4526.3 — l'URL après le clic : seul l'axe `crm` bouge, Suivis/Favoris/recherche restent (intersection). */
export function crmChipSearch(prev: Record<string, unknown>, on: boolean): Record<string, unknown> {
  return { ...prev, ...(on ? leaveArchives(prev) : {}), crm: on ? 'only' : undefined, page: undefined }
}

/** #4597.1 — `search.imported === 'only'` est la SEULE valeur qui active la puce « Importés ». */
export function importedFilterOf(search: { readonly imported?: string }): 'only' | undefined {
  return search.imported === 'only' ? 'only' : undefined
}

/** #4597.1 — l'URL après le clic : seul l'axe `imported` bouge ; jamais `crm` (deux vues, jamais confondues). */
export function importedChipSearch(prev: Record<string, unknown>, on: boolean): Record<string, unknown> {
  return { ...prev, ...(on ? leaveArchives(prev) : {}), imported: on ? 'only' : undefined, page: undefined }
}

/**
 * La puce du portefeuille : UNE grammaire, celle de la rangée (`chipClassName`, 32 px — recette prod 26/10 : la puce
 * « Mon CRM » faisait 44 px contre 32 px pour ses quatre voisines, #4597). Le plancher tactile de 44 px ne joue que
 * sous un pointeur grossier (GA-30/GA-35). Zéro ou compteur absent ⇒ aucune puce, jamais « 0 » (GA-18/19) — sauf
 * active : il faut pouvoir la relâcher.
 */
function PortfolioSourceChip({
  label,
  count,
  active,
  onToggle,
  testId,
  className,
}: {
  label: string
  count: number | undefined
  active: boolean
  onToggle: () => void
  testId: string
  className?: string
}) {
  if (!active && !count) return null
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      data-testid={testId}
      className={chipClassName({ active, size: 'md', className: cn('min-w-11 justify-center', className) })}
    >
      <span>{label}</span>
      {count ? <span className={chipCountClassName(active)}>{count}</span> : null}
    </button>
  )
}

/**
 * #4526.1/.6 — LA PUCE « MON CRM » : isole en un clic la base client que le commercial connaît déjà par son CRM.
 *
 * ⚠️ #4597.2 — elle ne compte plus QUE le CRM : un fichier importé a sa puce, `AccountsImportedChip`.
 *
 * Elle se COMBINE avec les onglets (ce n'est pas un onglet : Suivis ET Mon CRM). Le libellé est le nom du CRM
 * du CLIENT quand l'espace en a un branché (`crmName`), jamais un de NOS fournisseurs.
 */
export function AccountsCrmChip({
  count,
  active,
  crmName,
  onToggle,
  className,
}: {
  count: number | undefined
  active: boolean
  crmName?: string
  onToggle: () => void
  className?: string
}) {
  const { t } = useTranslation('accounts')
  return (
    <PortfolioSourceChip
      label={crmName ?? t('crmChip.label')}
      count={count}
      active={active}
      onToggle={onToggle}
      testId="accounts-crm-chip"
      className={className}
    />
  )
}

/** #4597.1 — LA PUCE « IMPORTÉS » : les comptes venus d'un fichier, jamais sous le nom d'un CRM. */
export function AccountsImportedChip({
  count,
  active,
  onToggle,
  className,
}: {
  count: number | undefined
  active: boolean
  onToggle: () => void
  className?: string
}) {
  const { t } = useTranslation('accounts')
  return (
    <PortfolioSourceChip
      label={t('importedChip.label')}
      count={count}
      active={active}
      onToggle={onToggle}
      testId="accounts-imported-chip"
      className={className}
    />
  )
}

/** #4597.3 — la liste est ouverte sur UN import précis (lien « voir les N comptes ») : la puce le dit et le relâche. */
export function AccountsImportJobChip({ onClear, className }: { onClear: () => void; className?: string }) {
  const { t } = useTranslation('accounts')
  return (
    <PortfolioSourceChip
      label={t('importedChip.importJob')}
      count={undefined}
      active
      onToggle={onClear}
      testId="accounts-import-job-chip"
      className={className}
    />
  )
}
