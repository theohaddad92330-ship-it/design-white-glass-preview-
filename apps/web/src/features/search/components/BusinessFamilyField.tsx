import { cn, Text } from '@bellum/ui'
import { BUSINESS_FAMILY_IDS } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { FIELD_TITLE } from './AnalyzeChrome'

/**
 * Familles métier à prioriser (#2163.14-24 — Cyber / Data-IA / Cloud / Agilité
 * / Finance / RH / Achats / Industrie / Supply / Produit / Autre). `business_families`
 * (`analysis.ts`) était déclaré et déjà LU par `isScopeSelectionEmpty` sans
 * AUCUN champ web pour le renseigner — le code mort exact que ce dépôt demande
 * de chercher avant d'en écrire de nouveau.
 *
 * Onze puces FIXES (spec #2163.14-24), pas un texte libre comme les priorités
 * (`selected_angles`) : la demande liste des familles nommées, ni un ordre ni
 * une priorisation (contrairement au niveau de contact, #2163.30).
 */
// Cadrage analyse (15/10) — UNE liste, celle du contrat (`BUSINESS_FAMILY_IDS`), qui
// porte aussi les termes que chaque famille trie dans les offres et les contacts (GA-26).
const FAMILY_ORDER = BUSINESS_FAMILY_IDS

type BusinessFamily = (typeof FAMILY_ORDER)[number]

const FAMILY_LABEL_KEYS: Record<BusinessFamily, string> = {
  cyber: 'confirm.businessFamily.families.cyber',
  data_ia: 'confirm.businessFamily.families.dataIa',
  cloud: 'confirm.businessFamily.families.cloud',
  agility: 'confirm.businessFamily.families.agility',
  finance: 'confirm.businessFamily.families.finance',
  hr: 'confirm.businessFamily.families.hr',
  procurement: 'confirm.businessFamily.families.procurement',
  industry: 'confirm.businessFamily.families.industry',
  supply: 'confirm.businessFamily.families.supply',
  product: 'confirm.businessFamily.families.product',
  other: 'confirm.businessFamily.families.other',
}

export function BusinessFamilyField({
  value,
  onChange,
  disabled = false,
}: {
  /** Libellés stockés dans `business_families` — les mêmes que ce que l'écran affiche. */
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')

  const toggle = (family: BusinessFamily) => {
    const label = t(FAMILY_LABEL_KEYS[family])
    if (value.includes(label)) {
      onChange(value.filter(item => item !== label))
    } else {
      onChange([...value, label])
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" className={FIELD_TITLE}>
        {t('confirm.businessFamily.label')}
      </Text>
      <div className="flex flex-wrap items-center gap-1.5">
        {FAMILY_ORDER.map(family => {
          const label = t(FAMILY_LABEL_KEYS[family])
          const active = value.includes(label)
          // #4512 — « Achats » est déjà un NIVEAU de contact, juste au-dessus : la famille se nomme autrement à
          // l'écran. La valeur stockée (`label`) ne change pas — la requête envoyée reste celle d'avant.
          const shown = family === 'procurement' ? t('confirm.businessFamily.procurementShown') : label
          return (
            <button
              key={family}
              type="button"
              onClick={() => toggle(family)}
              aria-pressed={active}
              disabled={disabled}
              className={cn(
                'inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 pointer-coarse:min-h-11',
                active
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-white'
                  : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              {shown}
            </button>
          )
        })}
      </div>
    </div>
  )
}
