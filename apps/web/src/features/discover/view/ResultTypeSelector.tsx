import { useTranslation } from 'react-i18next'
import { Building2, Radar, Handshake, Users, PhoneCall } from 'lucide-react'
import type { DiscoverResultType } from '@bellum/contracts'

/* ------------------------------------------------------------------ */
/*  #2165.7-.10 / #2165.61 — le TYPE DE RÉSULTAT d'une recherche.       */
/*                                                                     */
/*  Découvrir ne rendait que des comptes, et rien à l'écran ne le       */
/*  disait : l'utilisateur ne pouvait ni le savoir ni demander autre    */
/*  chose. Le sélecteur répond aux deux — il NOMME ce que la liste      */
/*  contient et il en propose trois autres lectures.                    */
/*                                                                     */
/*  ⚠️ `role="radiogroup"` et non quatre `aria-pressed` : la contrainte  */
/*  « un seul type par recherche » (#2165.10) doit être ANNONCÉE, pas   */
/*  seulement appliquée. Quatre bascules indépendantes se lisent comme  */
/*  un choix multiple à un lecteur d'écran, et la moitié de l'écran     */
/*  devient incompréhensible.                                          */
/* ------------------------------------------------------------------ */

/** Lot U — UNE barre : « Partenaires » est fusionné dans « Autres acteurs » (`others`), qui n'est pas un type de requête. */
type ResultTab = Exclude<DiscoverResultType, 'partners'> | 'others'
const TAB_ORDER: readonly ResultTab[] = ['accounts', 'others', 'contacts', 'needs', 'calls']

const ICON: Readonly<Record<ResultTab, typeof Building2>> = {
  accounts: Building2,
  contacts: Users,
  needs: Radar,
  others: Handshake,
  // #2545.1 — le tableau d'appels : un cinquième type, une cinquième icône.
  calls: PhoneCall,
}

interface ResultTypeSelectorProps {
  value: ResultTab
  onChange: (tab: ResultTab) => void
  /** Théo A decouvrir.R4 — nombre de résultats MESURÉ par type ; absent ou nul → aucun chiffre. */
  counts?: Partial<Record<DiscoverResultType, number>>
  /** « Autres acteurs » : `undefined` tant que l'onglet n'a pas été ouvert — rien n'est affiché, jamais « 0 ». */
  othersCount?: number
  /** #5001 — sur combien de comptes se répartissent les contacts comptés ; absent ou nul → le seul nombre de contacts. */
  contactAccounts?: number
}

export function ResultTypeSelector({ value, onChange, counts, othersCount, contactAccounts }: ResultTypeSelectorProps) {
  const { t } = useTranslation('discover')

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t('resultType.groupLabel')}
        className="flex flex-nowrap items-center gap-x-5 overflow-x-auto overscroll-x-contain border-b border-[var(--bellum-border)]"
      >
        {TAB_ORDER.map(type => {
          const Icon = ICON[type]
          const active = type === value
          const count = type === 'others' ? othersCount : counts?.[type]
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              title={t(`resultType.hint.${type}`)}
              // Recliquer le type actif ne relance rien : la recherche coûte une
              // requête, et « je confirme mon choix » n'est pas une intention.
              onClick={() => {
                if (!active) onChange(type)
              }}
              className="-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-1 py-2 text-sm transition-colors"
              style={{
                borderColor: active ? 'var(--bellum-primary-500)' : 'transparent',
                color: active ? 'var(--bellum-text-primary)' : 'var(--bellum-text-secondary)',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon className="h-[14px] w-[14px]" aria-hidden />
              {t(`resultType.label.${type}`)}
              {/* Théo A decouvrir.R4 — comptage par onglet ; une absence n'est jamais « 0 ». */}
              {count !== undefined && count > 0 && (
                <span
                  data-testid={`result-type-count-${type}`}
                  className="rounded-md bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]"
                >
                  {type === 'contacts' && contactAccounts !== undefined && contactAccounts > 0
                    ? t('resultType.contactsOnAccounts', { count, accounts: contactAccounts })
                    : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
