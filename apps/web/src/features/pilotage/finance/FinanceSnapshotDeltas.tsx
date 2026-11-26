import {
  METRIC_SNAPSHOT_UNIT,
  metricDelta,
  metricPointAt,
  type MetricSeriesResponse,
  type StockMetricKey,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { FinanceDelta } from './FinanceDelta'

/**
 * CE QUE LA PHOTO MENSUELLE SAIT COMPARER, sur cet écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX INDICATEURS, ET LE CHOIX EST LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * Neuf indicateurs sont photographiés. Deux seulement ont leur place sur un
 * tableau de bord FINANCE, et ce ne sont pas ceux qu'on croit :
 *
 *  · **les clients actifs** — la population qui produit le chiffre d'affaires.
 *    Sa variation dit si le mois vient d'un portefeuille qui grossit ou d'un
 *    portefeuille qui se concentre, ce qu'aucun montant ne dit ;
 *  · **les missions sans coût** — la CAUSE directe de la part non mesurée de la
 *    marge, juste au-dessus. La voir baisser est la seule preuve que le taux de
 *    marge affiché devient plus crédible.
 *
 * Les sept autres (contacts sans e-mail, besoins sans compétence…) sont du
 * travail de qualité de données : ils vivent sur `/pilotage/qualite`, et les
 * répéter ici serait la loi 4 du tome 7 enfreinte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ICI — ET C'EST LE PLUS IMPORTANT À LIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Ni la marge prévisionnelle, ni la marge réalisée, ni les encaissements**,
 * que les maquettes montrent pourtant avec un « +12,4 % ». Aucun n'est
 * photographié, et `METRICS_NOT_PHOTOGRAPHED` (contrats) dit pour chacun le
 * blocage EXACT — pas « c'est absent », mais ce qu'il faudrait LEVER : une
 * dérivation qui n'existe pas pour la première, le cliquet GA-07 à son plafond
 * pour la seconde, une fonction pure qui vit côté navigateur pour la troisième.
 *
 * Leur inventer une variation ici — en relisant le mois précédent, par exemple —
 * produirait un chiffre qui CHANGE rétroactivement dès qu'une donnée passée est
 * corrigée : le « +12,4 % » publié en septembre pour août ne serait plus celui
 * qu'on a publié. C'est exactement ce que l'arbitrage du 31/08 a tranché.
 *
 * ⚠️ `monthsCovered <= 1` est traité AVANT toute lecture : c'est ce qui
 * distingue « pas encore » d'une panne, et personne ne doit ouvrir un incident
 * le premier mois d'un espace.
 */
export function FinanceSnapshotDeltas({
  series,
  month,
  previousMonth,
  previousLabel,
  loading,
  failed,
}: {
  series: MetricSeriesResponse | undefined
  month: string
  previousMonth: string
  previousLabel: string | null
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation('pilotage')

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }
  if (failed || !series) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.unavailable')}
      </Text>
    )
  }

  // Zéro ou une photo ⇒ AUCUNE variation ne peut exister, et l'écran le sait
  // avant de tenter une lecture. Il faut deux passages du balayage mensuel —
  // donc deux mois — et ce n'est pas une panne.
  if (series.monthsCovered <= 1) {
    return (
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('delta.notMeasured')} — {t('delta.firstMonth')}
      </Text>
    )
  }

  return (
    <dl className="flex flex-col gap-1.5">
      {FINANCE_SNAPSHOT_METRICS.map(key => {
        const points = series.series.find(entry => entry.metricKey === key)?.points ?? []
        const current = metricPointAt(points, month)
        // #3483 — un ZÉRO sans population (ni dénominateur, ni mois précédent non nul) n'est pas une
        // mesure : « Clients actifs 0 · vs août 0 » peignait une absence de photo en zéro. Dans une
        // liste, une absence ne fait aucune ligne. Un zéro sur une population (0 sur 9) reste dit.
        const previous = metricPointAt(points, previousMonth)
        if (
          current?.value === 0 &&
          !(typeof current.denominator === 'number' && current.denominator > 0) &&
          !previous?.value
        )
          return null
        // ⚠️ La dérivation vit à UN endroit : aucun composant ne soustrait deux
        // photos lui-même. `metricDelta` porte les cas de bord (base à zéro,
        // base négative, population vide), et c'est tout ce qu'il y a de
        // difficile ici.
        const delta = metricDelta({
          unit: METRIC_SNAPSHOT_UNIT[key],
          previous,
          current,
        })
        return (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`finance.snapshot.${key}`)}
              </Text>
            </dt>
            <dd className="flex shrink-0 flex-col items-end">
              {/* Le CHIFFRE du mois, écrit à côté de sa variation — une variation
                  seule ne dit pas de quoi elle est la variation. `null` quand
                  aucune photo du mois n'existe : jamais zéro. */}
              {/* #3483 — pas de photo du mois : aucun « non mesuré » nu ; la ligne de variation dessous
                  le dit déjà, AVEC sa raison. */}
              {current ? (
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {current.value}
                </Text>
              ) : null}
              <FinanceDelta delta={delta} previousLabel={previousLabel} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Les deux photographiés qui parlent d'argent. Le choix est justifié plus haut. */
const FINANCE_SNAPSHOT_METRICS: readonly StockMetricKey[] = ['activeClients', 'missions_without_cost']
