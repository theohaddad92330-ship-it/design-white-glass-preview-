import { ACCESS_CLASSES, ACCOUNT_ENTITY_KINDS, PRIORITY_GATES } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EMPTY_PORTFOLIO_FILTERS,
  PORTFOLIO_ACCOUNT_TYPES,
  PORTFOLIO_AUTHORIZED_REFERENCES,
  PORTFOLIO_DOCUMENTED_HISTORY,
  PORTFOLIO_RELATIONS,
  PORTFOLIO_SCORE_BUCKETS,
  PORTFOLIO_SECONDARY_STATES,
  type PortfolioFilterValues,
} from '@/features/accounts/lib/portfolioFilters'
import { ANALYSIS_STATUS_FILTER_VALUES, statusLabelKey } from './types'

type FieldKey = keyof PortfolioFilterValues

/** Les libellés de relation sont ceux de la colonne « Relation » (`relationStatus.*`), jamais une seconde traduction. */
const RELATION_LABEL_KEY = {
  to_open: 'relationStatus.to_open',
  customer: 'relationStatus.client',
  opening: 'relationStatus.opening',
  archived: 'relationStatus.out_of_priority',
  dormant: 'relationStatus.on_hold',
} as const

const SCORE_LABEL_KEY = {
  high: 'filters.scoreHigh',
  medium: 'filters.scoreMedium',
  low: 'filters.scoreLow',
} as const satisfies Record<(typeof PORTFOLIO_SCORE_BUCKETS)[number], string>
type Field = { key: FieldKey; label: string; options: { value: string; label: string }[] }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Les critères APPLIQUÉS — la modale part d'eux à chaque ouverture, et ne les change qu'à « Appliquer ». */
  values: PortfolioFilterValues
  /** `reset` : le geste venait de « Réinitialiser » (il relâche aussi les rangements hérités). */
  onApply: (next: PortfolioFilterValues, options: { reset: boolean }) => void
  sectors: readonly string[]
  tags: readonly string[]
  /** #4989.1 — villes et départements des sièges des comptes chargés ; vide ⇒ le critère se tait. */
  zones: readonly { value: string; kind: 'city' | 'department' }[]
  /** L'accessibilité se lit par une seconde requête ; en panne, son critère se tait et le DIT. */
  accessClassAvailable: boolean
}

/**
 * #4498 (PR 12C, maquette V22 `#dlg-filters`) — « FILTRER MON PORTEFEUILLE ».
 *
 * Titre, la phrase qui dit ce que ces critères NE sont PAS (une recherche de marché), une grille de listes à
 * « Tous » sur deux colonnes (une sous 768 px), puis Réinitialiser · Annuler · Appliquer les filtres. Les
 * critères de la maquette dont la donnée existe, dans son ordre ; puis, dans la même grille, ceux d'avant
 * qu'elle ne montre pas (accessibilité A-D, statut de l'analyse) — aucun filtre ne se perd. Une liste sans
 * valeur à proposer (aucun secteur, aucune étiquette en usage) ne s'affiche pas.
 *
 * Brouillon local : rien ne bouge dans la liste avant « Appliquer ». « Réinitialiser » remet le brouillon à
 * « Tous » ; « Annuler » ferme sans rien écrire.
 */
export function AccountsFiltersDialog({ open, onOpenChange, ...formProps }: Props) {
  const { t } = useTranslation('accounts')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('filtersDialog.close')}
        className="sm:max-w-2xl"
        data-testid="accounts-filters-dialog"
      >
        {/* Le formulaire se monte à l'ouverture : son brouillon part TOUJOURS des critères appliqués. */}
        {open ? <AccountsFiltersForm {...formProps} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AccountsFiltersForm({
  values,
  onApply,
  sectors,
  tags,
  zones,
  accessClassAvailable,
  onClose,
}: Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { t } = useTranslation('accounts')
  const [draft, setDraft] = useState<PortfolioFilterValues>(values)
  const [resetAsked, setResetAsked] = useState(false)

  const allFields: Field[] = [
    {
      key: 'sector',
      label: t('filters.sector'),
      options: sectors.map(sector => ({ value: sector, label: sector })),
    },
    {
      key: 'relation',
      label: t('filters.relation'),
      options: PORTFOLIO_RELATIONS.map(value => ({ value, label: t(RELATION_LABEL_KEY[value]) })),
    },
    {
      key: 'secondary',
      label: t('filters.secondary'),
      options: PORTFOLIO_SECONDARY_STATES.map(value => ({ value, label: t(RELATION_LABEL_KEY[value]) })),
    },
    { key: 'tag', label: t('filters.tag'), options: tags.map(tag => ({ value: tag, label: tag })) },
    {
      key: 'gate',
      label: t('filters.gate'),
      options: PRIORITY_GATES.map(gate => ({ value: gate, label: t(`filters.gateValue.${gate}`) })),
    },
    {
      key: 'entityKind',
      label: t('filters.entityKind'),
      options: ACCOUNT_ENTITY_KINDS.map(kind => ({ value: kind, label: t(`entityKind.${kind}`) })),
    },
    {
      key: 'freshness',
      label: t('filters.freshness'),
      options: [{ value: 'stale', label: t('filters.freshnessValue.stale') }],
    },
    {
      key: 'documentedHistory',
      label: t('filters.documentedHistory'),
      options: PORTFOLIO_DOCUMENTED_HISTORY.map(value => ({
        value,
        label: t(`filters.documentedHistoryValue.${value}`),
      })),
    },
    {
      key: 'accountType',
      label: t('filters.accountType'),
      options: PORTFOLIO_ACCOUNT_TYPES.map(value => ({ value, label: t(`filters.accountTypeValue.${value}`) })),
    },
    {
      key: 'zone',
      label: t('filters.zone'),
      options: zones.map(zone => ({
        value: zone.value,
        label: zone.kind === 'department' ? t('filters.zoneDepartment', { code: zone.value }) : zone.value,
      })),
    },
    {
      key: 'score',
      label: t('filters.score'),
      options: PORTFOLIO_SCORE_BUCKETS.map(bucket => ({
        value: bucket,
        label: t(SCORE_LABEL_KEY[bucket]),
      })),
    },
    {
      key: 'authorizedReferences',
      label: t('filters.authorizedReferences'),
      options: PORTFOLIO_AUTHORIZED_REFERENCES.map(value => ({
        value,
        label: t(`filters.authorizedReferencesValue.${value}`),
      })),
    },
    ...(accessClassAvailable
      ? [
          {
            key: 'accessClass' as const,
            label: t('filters.accessClass'),
            options: ACCESS_CLASSES.map(cls => ({ value: cls, label: t(`filters.accessClassValue.${cls}`) })),
          },
        ]
      : []),
    {
      key: 'status',
      label: t('filters.status'),
      options: ANALYSIS_STATUS_FILTER_VALUES.map(value => ({ value, label: t(statusLabelKey(value)) })),
    },
  ]
  const fields = allFields.filter(field => field.options.length > 0)

  /** Coche ou décoche UNE valeur d'un critère ; la liste vide est « Tous ». */
  const toggleValue = (key: FieldKey, value: string) => {
    setDraft(prev => {
      const current = prev[key]
      let next = current.includes(value) ? current.filter(item => item !== value) : [...current, value]
      // « À ouvrir » (comptes sans prochaine action) est un périmètre à part : il remplace les autres relations,
      // et choisir une autre relation le retire — les deux ne se lisent pas comme un « ou ».
      if (key === 'relation' && next.includes(value)) {
        next = value === 'to_open' ? ['to_open'] : next.filter(item => item !== 'to_open')
      }
      return { ...prev, [key]: next }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('filtersDialog.title')}</DialogTitle>
        <DialogDescription>{t('filtersDialog.description')}</DialogDescription>
      </DialogHeader>
      {zones.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="filters-zone-note">
          {t('filtersDialog.zoneNote')}
        </Text>
      ) : null}
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 py-1 md:grid-cols-2">
        {fields.map(field => (
          <div key={field.key} className="flex min-w-0 flex-col gap-1.5" data-testid={`filter-field-${field.key}`}>
            <span className="text-xs font-medium text-[var(--bellum-text-secondary)]">{field.label}</span>
            <FilterChips
              multiple
              size="sm"
              wrapLabels
              ariaLabel={field.label}
              options={field.options}
              values={draft[field.key]}
              onToggle={value => toggleValue(field.key, value)}
              collapse={{
                after: 8,
                moreLabel: hidden => t('filtersDialog.more', { count: hidden }),
                lessLabel: t('filtersDialog.less'),
              }}
            />
          </div>
        ))}
      </div>
      {accessClassAvailable ? null : (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('filters.accessClassFilterUnavailable')}
        </Text>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setDraft(EMPTY_PORTFOLIO_FILTERS)
            setResetAsked(true)
          }}
        >
          {t('filtersDialog.reset')}
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            {t('filtersDialog.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              onApply(draft, { reset: resetAsked })
              onClose()
            }}
          >
            {t('filtersDialog.apply')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
