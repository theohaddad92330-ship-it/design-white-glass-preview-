import type {
  AccountInterestPenetrability,
  AccountInterestPenetrabilityBand,
  AccountInterestPenetrabilitySimulationOverride,
  AccountPenetrabilityFactorKey,
} from '@bellum/contracts'
import { simulateAccountInterestPenetrability } from '@bellum/contracts'
import { Card, Switch, Text } from '@bellum/ui'
import { CircleHelp, CircleMinus, CirclePlus, DoorOpen, FlaskConical, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * BEL-SC-229.16/.17/.18 (#3258, épopée #3362) — les trois leviers de
 * simulation du ticket : « avec ou sans partenaire, nouvelle référence,
 * filiale ou groupe ». `simulateAccountInterestPenetrability` (contracts) est
 * le SEUL moteur — cette carte ne fait que forcer trois facteurs de
 * pénétrabilité déjà nommés dans le contrat, jamais un second calcul.
 */
const SIMULATION_LEVERS: AccountPenetrabilityFactorKey[] = [
  'partner_in_place',
  'available_proof',
  'subsidiary_autonomy',
]

/**
 * BEL-SC-229 (#3258, P0) — LA CARTE DE LA MATRICE INTÉRÊT × PÉNÉTRABILITÉ.
 *
 * Rend `AccountInterestPenetrability` tel qu'il arrive de la façade unique
 * (`useAccountInterestPenetrability`) : deux bandes QUALITATIVES (jamais un
 * nombre — doctrine c26), le quadrant croisé quand les deux axes sont
 * déterminés, et les facteurs DÉTERMINANTS de chaque axe.
 *
 * Un facteur sans signal connu (`signal: null`) ne fait AUCUNE ligne — même
 * discipline que toute LISTE du produit (« on n'affiche pas ce qu'on n'a
 * pas ») ; ce que l'axe ignore encore reste visible via `known`/`total`,
 * jamais un pourcentage.
 *
 * ⚠️ `null` = la façade n'a pas répondu ; l'écran se TAIT, même discipline
 * que `AccountStrategy5PCard`.
 */
export function AccountInterestPenetrabilityCard({ matrix }: { matrix: AccountInterestPenetrability | null }) {
  const { t } = useTranslation('accountDetail')
  // #3362 — réinitialisée à CHAQUE compte : une simulation d'un compte ne
  // doit jamais survivre à la navigation vers un autre (témoin dans le test).
  const [overrides, setOverrides] = useState<AccountInterestPenetrabilitySimulationOverride>({})

  const isSimulating = Object.keys(overrides).length > 0
  const displayed = useMemo(
    () => (matrix && isSimulating ? simulateAccountInterestPenetrability(matrix, overrides) : matrix),
    [matrix, overrides, isSimulating],
  )

  if (!matrix || !displayed) return null

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <div className="px-4 py-4">
        <Text element="h3" size="sm" weight="semibold">
          {t('interestPenetrability.title')}
        </Text>
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('interestPenetrability.subtitle')}
        </Text>
        {isSimulating ? (
          <div className="mt-2 flex items-center gap-1.5">
            <FlaskConical aria-hidden="true" className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
              {t('interestPenetrability.simulation.badge')}
            </Text>
          </div>
        ) : null}
        <Text size="sm" weight="medium" className="mt-2 block text-[var(--bellum-text-accent)]">
          {displayed.quadrant
            ? t(`interestPenetrability.quadrants.${displayed.quadrant}`)
            : t('interestPenetrability.quadrantUnavailable')}
        </Text>
        {!displayed.quadrant && displayed.quadrantUnavailableReason ? (
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {displayed.quadrantUnavailableReason}
          </Text>
        ) : null}
      </div>

      <AxisSection
        icon={Target}
        titleKey="interestPenetrability.axes.interest"
        band={displayed.interest.band}
        known={displayed.interest.known}
        total={displayed.interest.total}
        factors={displayed.interest.factors}
      />
      <AxisSection
        icon={DoorOpen}
        titleKey="interestPenetrability.axes.penetrability"
        band={displayed.penetrability.band}
        known={displayed.penetrability.known}
        total={displayed.penetrability.total}
        factors={displayed.penetrability.factors}
      />

      <div className="border-t border-[var(--bellum-border)] px-4 py-3">
        <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
          {t('interestPenetrability.simulation.title')}
        </Text>
        <ul className="mt-2 space-y-2.5">
          {SIMULATION_LEVERS.map(key => (
            <li key={key} className="flex min-h-11 items-center justify-between gap-3">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`interestPenetrability.simulation.levers.${key}`)}
              </Text>
              <Switch
                aria-label={t(`interestPenetrability.simulation.levers.${key}`)}
                checked={overrides[key] === 'favorable'}
                onCheckedChange={checked =>
                  setOverrides(current => {
                    if (!checked) {
                      const { [key]: _removed, ...rest } = current
                      return rest
                    }
                    return { ...current, [key]: 'favorable' }
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function AxisSection({
  icon: Icon,
  titleKey,
  band,
  known,
  total,
  factors,
}: {
  icon: typeof Target
  titleKey: string
  band: AccountInterestPenetrabilityBand
  known: number
  total: number
  factors: { key: string; signal: 'favorable' | 'unfavorable' | null; evidence: string | null }[]
}) {
  const { t } = useTranslation('accountDetail')
  const determining = factors.filter(f => f.signal !== null)

  return (
    <div className="border-t border-[var(--bellum-border)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t(titleKey)}
          </Text>
        </div>
        <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-secondary)]">
          {t(`interestPenetrability.bands.${band}`)}
        </Text>
      </div>
      {/* #3499 — « 0 élément connu sur N » ne dit rien : le compteur n'existe qu'au-dessus de 0. */}
      {known > 0 ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {t('interestPenetrability.knownCount', { count: known, total })}
        </Text>
      ) : null}
      {determining.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {determining.map(factor => (
            <li key={factor.key} className="flex items-start gap-1.5">
              {factor.signal === 'favorable' ? (
                <CirclePlus aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" />
              ) : (
                <CircleMinus aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              )}
              <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
                {t(`interestPenetrability.factors.${factor.key}`)}
                {factor.evidence ? ` — ${factor.evidence}` : ''}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 flex items-start gap-1.5">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {t('interestPenetrability.noFactorKnown')}
          </Text>
        </div>
      )}
    </div>
  )
}
