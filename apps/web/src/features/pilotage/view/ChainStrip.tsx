import { Card, Text, cn } from '@bellum/ui'
import type { PilotageLevelReport, StockBaseline } from '@bellum/contracts'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAlertingLevel } from './chain-alerts'
import { CHAIN_LEVELS, chainOf, primaryMetric, secondaryOf } from './chain-layout'
import { LevelDetail, LevelStatusIcon, MetricRow, MetricValue } from './LevelDetail'

/**
 * LA CHAÎNE COMMERCIALE, EN CHAÎNE — #1433.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE, ET POURQUOI CE N'EST PAS COSMÉTIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Huit cartes égales en grille à quatre colonnes disaient huit mesures
 * indépendantes. Le calcul, lui, dit autre chose depuis toujours : six d'entre
 * elles se SUIVENT — `flowStatus(value, upstream)` juge un maillon en le
 * comparant au précédent — et deux traversent l'ensemble. La grille effaçait la
 * seule information que cet écran existe pour porter : le passage.
 *
 * ⚠️ **Un maillon ne montre qu'UNE métrique**, celle qui mesure le passage
 * (`primaryMetric`). Les autres ne disparaissent pas : elles sont dans le détail
 * qui s'ouvre au clic, avec leurs populations cliquables. Ce qui est retiré,
 * c'est le bruit — pas la donnée.
 *
 * ⚠️ **Sous 768 px la chaîne se lit VERTICALEMENT**, chevron vers le bas. Elle
 * ne défile pas horizontalement : `overflow-x` force `overflow-y` sur le même
 * conteneur, et on aurait posé un second défilement vertical imbriqué dans celui
 * de la page — le défaut déjà payé ici.
 */
export function ChainStrip({
  levels,
  baseline,
  known,
  generatedAt,
}: {
  levels: PilotageLevelReport[]
  baseline: StockBaseline | undefined
  known: ReadonlySet<string>
  /** Quand la chaîne a été calculée — la « dernière mise à jour » de #1440. */
  generatedAt?: string | undefined
}) {
  const { t } = useTranslation('pilotage')
  const [open, setOpen] = useState<PilotageLevelReport['level'] | null>(null)
  const chain = chainOf(levels)
  const secondary = secondaryOf(levels)
  const opened = levels.find(level => level.level === open) ?? null

  if (levels.length === 0) return null

  return (
    <section aria-label={t('chain.title')}>
      <ol className="flex flex-col gap-1 md:flex-row md:items-stretch md:gap-0">
        {chain.map((level, index) => (
          <li
            key={level.level}
            className="flex min-w-0 items-center gap-1 md:flex-1 md:items-stretch"
            data-testid="chain-item"
          >
            <ChainLink
              level={level}
              position={index + 1}
              total={CHAIN_LEVELS.length}
              baseline={baseline}
              expanded={open === level.level}
              onToggle={() => setOpen(current => (current === level.level ? null : level.level))}
            />
            {/* #3467 — `md:items-stretch` sur le `<li>` : en `items-center` le bouton
                prenait la hauteur de SON contenu (92, 108, 126 px selon que la
                sous-ligne tient sur 1, 2 ou 3 lignes) et les bords hauts
                variaient ; étiré, il prend la hauteur de la plus haute carte de
                la rangée. Le chevron garde `self-center`. */}
            {/* Le connecteur est DÉCORATIF : la succession est déjà dite par
                l'ordre de la liste et par « étape n sur six » dans le nom
                accessible de chaque maillon. Une flèche annoncée six fois
                n'apprendrait rien à un lecteur d'écran. */}
            {index < chain.length - 1 ? (
              <>
                <ChevronRight
                  aria-hidden
                  className="hidden size-4 shrink-0 self-center text-[var(--bellum-text-muted)] md:block"
                />
                <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)] md:hidden" />
              </>
            ) : null}
          </li>
        ))}
      </ol>

      {/* Le détail du maillon ouvert — sous la chaîne entière et non dans la
          carte : glissé dans une colonne de 1/6ᵉ de largeur, il pousserait les
          cinq autres maillons hors de la ligne à chaque clic. */}
      {opened ? <LevelDetail generatedAt={generatedAt} level={opened} known={known} baseline={baseline} /> : null}

      {secondary.length > 0 ? (
        <div className="mt-4">
          {/* #1433 — « Conserver Économie et Qualité comme indicateurs
              secondaires sous la chaîne, pas comme maillons équivalents. » */}
          <Text size="xs" weight="medium" className="block text-[var(--bellum-text-secondary)]">
            {t('chain.secondaryTitle')}
          </Text>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {secondary.map(level => (
              <Card key={level.level} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <Text size="sm" weight="semibold">
                    {t(`levels.${level.level}.title`)}
                  </Text>
                  <LevelStatusIcon level={level} />
                </div>
                <dl className="mt-2 flex flex-col gap-1.5">
                  {level.metrics.map(metric => (
                    <MetricRow
                      key={metric.key}
                      metric={metric}
                      known={known}
                      baseline={baseline}
                      generatedAt={generatedAt}
                    />
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/**
 * UN MAILLON — son rang, son état, et la métrique qui mesure son passage.
 *
 * C'est un `<button>` et non un `<div onClick>` : ce qui se clique se tabule
 * (GA-35). `aria-expanded` dit à un lecteur d'écran que le détail s'ouvre en
 * dessous, sinon le clic ne semble rien faire.
 */
function ChainLink({
  level,
  position,
  total,
  baseline,
  expanded,
  onToggle,
}: {
  level: PilotageLevelReport
  position: number
  total: number
  baseline: StockBaseline | undefined
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('pilotage')
  const metric = primaryMetric(level)
  const isAlert = isAlertingLevel(level)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      // Le nom annoncé porte le RANG : « Qualification, étape 3 sur 6 ». Sans
      // lui, six boutons se suivent sans qu'on sache où l'on est dans le flux —
      // et c'est justement ce que la chaîne montre à l'œil.
      aria-label={t('chain.linkAria', { label: t(`levels.${level.level}.title`), position, total })}
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 rounded-lg border p-3 text-left transition-colors pointer-coarse:min-h-11',
        'scroll-mt-4 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--bellum-bg)]',
        isAlert
          ? 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] focus:ring-[var(--bellum-warning)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] hover:bg-[var(--bellum-surface-2)] focus:ring-[var(--bellum-primary-500)]',
        expanded && 'ring-2 ring-[var(--bellum-primary-500)]',
      )}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <Text element="span" size="xs" weight="semibold" className="truncate">
          {t(`levels.${level.level}.title`)}
        </Text>
        <LevelStatusIcon level={level} />
      </span>
      {metric ? (
        <MetricValue metric={metric} baseline={baseline} size="lg" />
      ) : (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('notMeasured')}
        </Text>
      )}
    </button>
  )
}
