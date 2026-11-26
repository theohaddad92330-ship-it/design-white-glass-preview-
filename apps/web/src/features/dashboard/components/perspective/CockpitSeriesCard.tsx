import { useMemo, useState } from 'react'
import type { CockpitSeries, CockpitSeriesPoint } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CockpitSources } from './CockpitSources'

/**
 * Les deux courbes du cockpit (#1410).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GRAPHIQUES, ET JAMAIS UN SEUL À DEUX AXES
 * ─────────────────────────────────────────────────────────────────────────────
 * « Couverture » compte des COMPTES, « dynamique » compte des MESSAGES. Deux
 * mesures d'échelles différentes sur un même cadre demandent deux axes Y, et un
 * graphique à deux axes laisse celui qui le dessine choisir laquelle des deux
 * courbes passe au-dessus de l'autre — c'est-à-dire choisir la conclusion. Deux
 * petits cadres côte à côte disent la même chose sans ce pouvoir-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN POINT MANQUANT INTERROMPT LE TRACÉ — IL NE PLONGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est la raison d'être de ce composant, et `interaction-laws.ts` avait nommé
 * le trou avant qu'il soit comblé : « c'est l'invariant "non mesuré n'est pas
 * zéro" appliqué aux graphiques. Les primitives `UnknownValue`/`MeasuredValue`
 * le tiennent dans le TEXTE ; rien ne le tient dans un graphe, et un point
 * manquant y devient un creux qui se lit comme une chute. »
 *
 * Un `null` coupe donc la ligne en deux segments. La zone non mesurée porte en
 * plus une trame discrète : la seule interruption du trait se confond avec un
 * blanc de mise en page, et « on ne mesurait pas » mérite d'être VU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COULEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule série par cadre ⇒ aucune palette catégorielle, donc aucun risque de
 * confusion entre séries et aucune légende (le titre nomme la courbe). Le trait
 * porte `--bellum-text-accent`, le jeton violet qui a UN pas par thème — c'est
 * la règle D79 : aucune nuance FIXE de la gamme primaire ne passe AA des deux
 * côtés. Contraste mesuré contre les deux surfaces : ≥ 3:1 en clair comme en
 * sombre. Les valeurs et les libellés, eux, gardent les jetons de TEXTE ; la
 * couleur ne porte jamais un chiffre.
 */

/** Les deux fenêtres du retour. La série servie couvre treize semaines. */
const RANGES = { '30': 4, '90': 13 } as const
type RangeKey = keyof typeof RANGES

export function CockpitSeriesCard({ series }: { series: CockpitSeries }) {
  const { t } = useTranslation('dashboard')
  const [range, setRange] = useState<RangeKey>('90')

  // Pas d'historique ⇒ pas de graphique. Le retour l'écrit : « si aucune série
  // temporelle fiable n'existe, afficher une synthèse statique plutôt qu'un
  // graphique artificiel ». Le bloc s'efface ; les chiffres du jour vivent dans
  // les blocs Couverture et Dynamique, juste au-dessus.
  if (!series.coverage && !series.outreach) return null

  const weeks = RANGES[range]

  return (
    <section
      aria-label={t('perspective.series.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('perspective.series.title')}
        </Text>
        {/* Les filtres sur UNE ligne au-dessus des cadres, jamais dans chacun. */}
        <div role="group" aria-label={t('perspective.series.rangeLabel')} className="flex gap-1">
          {(Object.keys(RANGES) as RangeKey[]).map(key => (
            <button
              key={key}
              type="button"
              aria-pressed={range === key}
              onClick={() => setRange(key)}
              className={
                range === key
                  ? 'rounded-lg bg-[var(--bellum-surface-2)] px-3 py-1 text-xs font-medium text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'
                  : 'rounded-lg px-3 py-1 text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11'
              }
            >
              {t('perspective.series.range', { days: key })}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        {series.coverage ? (
          <Sparkline
            title={t('perspective.series.coverage')}
            hint={t('perspective.series.coverageHint')}
            points={series.coverage.slice(-weeks)}
            unitKey="perspective.series.unitAccounts"
          />
        ) : null}
        {series.outreach ? (
          <Sparkline
            title={t('perspective.series.outreach')}
            hint={t('perspective.series.outreachHint')}
            points={series.outreach.slice(-weeks)}
            unitKey="perspective.series.unitMessages"
          />
        ) : null}
      </div>

      <CockpitSources provenance={series.provenance} />
    </section>
  )
}

const WIDTH = 320
const HEIGHT = 96
const PAD = 8

/**
 * Une courbe fine, une grille très légère, et un `null` qui COUPE.
 *
 * L'accessibilité ne repose pas sur le tracé : le tableau qui suit porte les
 * mêmes valeurs, et il est la version lue par un lecteur d'écran (`<svg>` est
 * `aria-hidden`). Une courbe décrite en `aria-label` ne se lit pas — elle se
 * résume, et un résumé qu'on écrit à la main se périme au premier changement de
 * données.
 */
function Sparkline({
  title,
  hint,
  points,
  unitKey,
}: {
  title: string
  hint: string
  points: CockpitSeriesPoint[]
  /** ⚠️ La CLÉ, pas le mot déjà traduit : l'unité s'accorde en nombre, et le
   *  tableau affichait « 1 comptes ». Le pluriel se décide au point de vue du
   *  compte, donc là où le compte est connu. */
  unitKey: string
}) {
  const { t, i18n } = useTranslation('dashboard')
  const [hovered, setHovered] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const measured = points.filter((point): point is CockpitSeriesPoint & { value: number } => point.value !== null)
    // Un maximum de zéro écraserait tout sur la ligne de base : on garde 1 pour
    // que « rien du tout » se lise comme une ligne plate EN BAS, ce qui est vrai.
    const max = Math.max(1, ...measured.map(point => point.value))
    const step = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0
    const xy = points.map((point, index) => ({
      point,
      x: PAD + index * step,
      y: point.value === null ? null : HEIGHT - PAD - (point.value / max) * (HEIGHT - PAD * 2),
    }))

    // Les segments : on coupe à chaque `null`. Deux points mesurés séparés par
    // un trou ne sont PAS reliés — les relier inventerait la pente entre eux.
    //
    // ⚠️ UN SEGMENT D'UN SEUL POINT SE DESSINE QUAND MÊME, et c'est le contraire
    // de ce que la première version faisait : elle jetait tout segment de moins
    // de deux points (`length > 1`), si bien qu'une semaine mesurée ENTOURÉE de
    // deux trous disparaissait de la courbe. C'est pire qu'un trou — la mesure
    // existait, et l'écran n'en gardait aucune trace. Un `M x,y L x,y` avec un
    // bout de trait arrondi dessine exactement un point.
    const segments: string[] = []
    const flush = (current: string[]) => {
      if (current.length === 0) return
      if (current.length === 1) {
        segments.push(`${current[0]} L${current[0].slice(1)}`)
        return
      }
      segments.push(current.join(' '))
    }
    let current: string[] = []
    for (const node of xy) {
      if (node.y === null) {
        flush(current)
        current = []
        continue
      }
      current.push(`${current.length === 0 ? 'M' : 'L'}${node.x.toFixed(1)},${node.y.toFixed(1)}`)
    }
    flush(current)

    const gaps = xy.filter(node => node.y === null).map(node => node.x)
    return { xy, segments, gaps, max, step }
  }, [points])

  const active = hovered === null ? null : geometry.xy[hovered]
  const formatWeek = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })

  return (
    <figure className="min-w-0">
      <figcaption>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {hint}
        </Text>
      </figcaption>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-24 w-full"
          preserveAspectRatio="none"
          aria-hidden
          onMouseLeave={() => setHovered(null)}
        >
          {/* Grille recessive — trois traits, et ils passent DERRIÈRE la courbe. */}
          {[0.25, 0.5, 0.75].map(ratio => (
            <line
              key={ratio}
              x1={PAD}
              x2={WIDTH - PAD}
              y1={PAD + ratio * (HEIGHT - PAD * 2)}
              y2={PAD + ratio * (HEIGHT - PAD * 2)}
              stroke="var(--bellum-border)"
              strokeWidth="1"
            />
          ))}

          {/* Ce qui n'a PAS été mesuré, dit visuellement : une bande, pas un
              blanc. Un trait qui s'arrête sans rien se confond avec une marge. */}
          {geometry.gaps.map(x => (
            <rect
              key={x}
              x={x - Math.max(2, geometry.step / 2)}
              y={PAD}
              width={Math.max(4, geometry.step)}
              height={HEIGHT - PAD * 2}
              fill="var(--bellum-surface-2)"
            />
          ))}

          {geometry.segments.map(path => (
            <path
              key={path}
              d={path}
              fill="none"
              stroke="var(--bellum-text-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {active?.y !== null && active !== null ? (
            <circle cx={active.x} cy={active.y} r="4" fill="var(--bellum-text-accent)" />
          ) : null}

          {/* Les cibles de survol sont plus larges que la marque — sinon il faut
              viser un trait de deux pixels. */}
          {geometry.xy.map((node, index) => (
            <rect
              key={node.point.at}
              x={node.x - Math.max(4, geometry.step / 2)}
              y={0}
              width={Math.max(8, geometry.step)}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
            />
          ))}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute -top-1 left-0 right-0 text-center">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {active.point.value === null
                ? t('perspective.series.tooltipUnknown', { week: formatWeek(active.point.at) })
                : t('perspective.series.tooltip', {
                    week: formatWeek(active.point.at),
                    count: active.point.value,
                    unit: t(unitKey, { count: active.point.value }),
                  })}
            </Text>
          </div>
        ) : null}
      </div>

      {/* La version lue. `sr-only` plutôt qu'un repli conditionnel : elle est
          TOUJOURS là, donc toujours à jour — un tableau qu'on n'affiche que
          « si besoin » est un tableau que personne ne teste. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {points.map(point => (
            <tr key={point.at}>
              <th scope="row">{formatWeek(point.at)}</th>
              <td>
                {point.value === null
                  ? t('perspective.series.notMeasured')
                  : `${point.value} ${t(unitKey, { count: point.value })}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
