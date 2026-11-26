import {
  EMPLOYEE_COST_ORIGINS,
  MISSION_COST_SOURCES,
  type MissionCommercialTerms,
  type MissionCostBreakdown,
  type MissionCostSource,
  type UpsertCommercialTermsInput,
} from '@bellum/contracts'
import { Box, Button, FilterChips, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * #2420 — LA SOURCE DU COÛT D'UNE MISSION (#2420.6, .7, .9, .10).
 *
 * Un champ vide reste ABSENT de la décomposition — jamais un zéro : le moteur
 * lit « non renseigné » et le DIT (état partiel, « manque : … »). Zéro saisi
 * reste zéro, c'est une réponse.
 *
 * Le coût chargé saisi suit la décomposition quand elle le définit (TJM
 * fournisseur, prix d'achat) : la liste des missions et le board lisent ce
 * coût-là, et deux chiffres de marge pour la même mission ne se croient pas.
 * Pour un salarié, rien n'est recalculé — aucun champ ne ressemble à un
 * salaire, et aucun coût n'est reconstruit (#2420.8).
 */

type FieldKind = 'cents' | 'number' | 'date'
type BreakdownField = Exclude<keyof MissionCostBreakdown, 'employeeCostOrigin'>

const FIELD_KIND: Record<BreakdownField, FieldKind> = {
  supplierDailyRateCents: 'cents',
  supplierCommissionDailyCents: 'cents',
  supplierTaxesDailyCents: 'cents',
  standardDailyCostCents: 'cents',
  standardCostValidatedOn: 'date',
  periodCostCents: 'cents',
  periodWorkedDays: 'number',
  hourlyCostCents: 'cents',
  hoursPerDay: 'number',
  partnerPurchaseDailyCents: 'cents',
  partnerSaleDailyCents: 'cents',
  partnerSplitPercent: 'number',
  fixedPriceTeamTimeCostCents: 'cents',
  fixedPriceSubcontractingCostCents: 'cents',
  fixedPriceBudgetConsumedCents: 'cents',
  fixedPriceRemainingWorkCents: 'cents',
  specificDailyCostCents: 'cents',
  otherValidatedDailyCostCents: 'cents',
  internalAllocationDailyCents: 'cents',
}

const FIELDS_BY_SOURCE: Record<MissionCostSource, readonly BreakdownField[]> = {
  freelance: ['supplierDailyRateCents', 'supplierCommissionDailyCents', 'supplierTaxesDailyCents'],
  employee: [
    'standardDailyCostCents',
    'standardCostValidatedOn',
    'periodCostCents',
    'periodWorkedDays',
    'hourlyCostCents',
    'hoursPerDay',
  ],
  partner: ['partnerPurchaseDailyCents', 'partnerSaleDailyCents', 'partnerSplitPercent'],
  fixed_price: [
    'fixedPriceTeamTimeCostCents',
    'fixedPriceSubcontractingCostCents',
    'fixedPriceBudgetConsumedCents',
    'fixedPriceRemainingWorkCents',
  ],
}

/** Les coûts directs configurés et l'allocation interne valent pour toutes les sources. */
const COMMON_FIELDS: readonly BreakdownField[] = [
  'specificDailyCostCents',
  'otherValidatedDailyCostCents',
  'internalAllocationDailyCents',
]

type CostSourcePatch = Pick<
  UpsertCommercialTermsInput,
  'costSource' | 'currency' | 'costCurrency' | 'costBreakdown'
> & {
  /** Présent SEULEMENT quand la décomposition définit le coût chargé. */
  loadedDailyCostCents?: number | null
}

function toText(field: BreakdownField, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (FIELD_KIND[field] === 'cents' && typeof value === 'number') return String(value / 100)
  return String(value)
}

function parse(field: BreakdownField, raw: string): number | string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (FIELD_KIND[field] === 'date') return trimmed
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) return null
  return FIELD_KIND[field] === 'cents' ? Math.round(value * 100) : value
}

function currencyOrNull(raw: string): string | null {
  const upper = raw.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(upper) ? upper : null
}

export function MissionCostSourceForm({
  terms,
  onSave,
  saving,
}: {
  terms: MissionCommercialTerms | null
  onSave: (patch: CostSourcePatch) => void
  saving: boolean
}) {
  const { t } = useTranslation('missions')
  const stored = terms?.costBreakdown ?? {}
  const [source, setSource] = useState<MissionCostSource | null>(terms?.costSource ?? null)
  const [origin, setOrigin] = useState(stored.employeeCostOrigin ?? null)
  const [currency, setCurrency] = useState(terms?.currency ?? '')
  const [costCurrency, setCostCurrency] = useState(terms?.costCurrency ?? '')
  const [drafts, setDrafts] = useState<Partial<Record<BreakdownField, string>>>(() =>
    Object.fromEntries(
      (Object.keys(FIELD_KIND) as BreakdownField[]).map(field => [field, toText(field, stored[field])]),
    ),
  )

  const visible = [...(source ? FIELDS_BY_SOURCE[source] : []), ...COMMON_FIELDS]

  const save = () => {
    const breakdown: Record<string, number | string> = {}
    if (source === 'employee' && origin) breakdown['employeeCostOrigin'] = origin
    for (const field of visible) {
      const value = parse(field, drafts[field] ?? '')
      if (value !== null) breakdown[field] = value
    }
    const patch: CostSourcePatch = {
      costSource: source,
      currency: currencyOrNull(currency),
      costCurrency: currencyOrNull(costCurrency),
      costBreakdown: breakdown as MissionCostBreakdown,
    }
    // Le coût chargé suit la décomposition quand elle le DÉFINIT — jamais sinon.
    const num = (key: string) => (typeof breakdown[key] === 'number' ? (breakdown[key] as number) : null)
    if (source === 'freelance' && num('supplierDailyRateCents') !== null) {
      patch.loadedDailyCostCents =
        (num('supplierDailyRateCents') ?? 0) +
        (num('supplierCommissionDailyCents') ?? 0) +
        (num('supplierTaxesDailyCents') ?? 0)
    }
    if (source === 'partner' && num('partnerPurchaseDailyCents') !== null) {
      patch.loadedDailyCostCents = num('partnerPurchaseDailyCents')
    }
    onSave(patch)
  }

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text element="p" size="sm" className="font-medium">
        {t('finance.engine.form.title')}
      </Text>
      <FilterChips<MissionCostSource | 'unspecified'>
        ariaLabel={t('finance.engine.form.sourceLabel')}
        options={[null, ...MISSION_COST_SOURCES].map(option => ({
          value: option ?? 'unspecified',
          label: t(`finance.engine.sources.${option ?? 'unspecified'}`),
        }))}
        value={source ?? 'unspecified'}
        onChange={next => setSource(next === null || next === 'unspecified' ? null : next)}
      />

      {source === 'employee' ? (
        <>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.engine.form.noSalary')}
          </Text>
          <FilterChips
            ariaLabel={t('finance.engine.form.originLabel')}
            options={EMPLOYEE_COST_ORIGINS.map(option => ({
              value: option,
              label: t(`finance.engine.form.origins.${option}`),
            }))}
            value={origin}
            clearable
            onChange={setOrigin}
          />
        </>
      ) : null}

      <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map(field => (
          <label key={field} className="space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground">
              {t(`finance.engine.form.fields.${field}`)}
            </Text>
            <Input
              type={FIELD_KIND[field] === 'date' ? 'date' : 'number'}
              min={FIELD_KIND[field] === 'date' ? undefined : 0}
              value={drafts[field] ?? ''}
              onChange={event => setDrafts(current => ({ ...current, [field]: event.target.value }))}
              aria-label={t(`finance.engine.form.fields.${field}`)}
            />
          </label>
        ))}
        <label className="space-y-1">
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('finance.engine.form.currencyLabel')}
          </Text>
          <Input
            value={currency}
            maxLength={3}
            onChange={event => setCurrency(event.target.value.toUpperCase())}
            aria-label={t('finance.engine.form.currencyLabel')}
            placeholder="EUR"
          />
        </label>
        <label className="space-y-1">
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('finance.engine.form.costCurrencyLabel')}
          </Text>
          <Input
            value={costCurrency}
            maxLength={3}
            onChange={event => setCostCurrency(event.target.value.toUpperCase())}
            aria-label={t('finance.engine.form.costCurrencyLabel')}
          />
        </label>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('finance.engine.form.hint')}
      </Text>
      <Button type="button" variant="outline" size="sm" isLoading={saving} onClick={save}>
        {t('finance.engine.form.save')}
      </Button>
    </Box>
  )
}
