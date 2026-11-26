import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommercialAuditContext } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { AXIS_MAX_SCORE } from '../lib/maturity-axes'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

type Maturity = NonNullable<CommercialAuditContext['maturity']>
type MaturityAxis = Maturity['axes'][number]

/**
 * #2065.1-.18 — LES 12 AXES DE MATURITÉ, RENDUS. `computeCommercialMaturity`
 * (`lib/maturity-axes.ts`) était du code juste, calculé, testé, que personne
 * n'appelait : `useCommercialAudit` le pose sur `auditContext.maturity`
 * depuis #2065, mais aucun écran ne le lisait avant ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE DU SCORE, TENUE ICI PAR CE QUE CE COMPOSANT NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * - Le score global passe par `ScoreWithAxes` (`components/primitives`) —
 *   PAS réécrit ici : c'est la primitive qui sait déjà dire « pas de score »
 *   avec sa raison, sortir un axe non évaluable du dénominateur, et ne
 *   JAMAIS afficher un pourcentage.
 * - En dessous, les 12 axes sont TOUJOURS rendus, mesurés ou non — jamais une
 *   liste raccourcie à ceux qui ont un score. Un axe `unknown` reste NOMMÉ,
 *   avec le fait qui manque pour le mesurer (`axis.gaps`), jamais une case
 *   vide qui se lirait comme « rien à signaler ».
 * - Sous 3 axes évalués, `maturity.score` est déjà `null` côté moteur : cet
 *   écran ne recalcule rien, il rend ce que `ScoreWithAxes` fait de `null`.
 *
 * ⚠️ GA-35 — ce qui se clique se tabule. Seul un axe qui porte une preuve, un
 * manque nommé ou un prochain geste ouvre un détail (`<button type="button">`).
 * Un axe qui n'a RIEN à montrer (cas qui ne se produit pas aujourd'hui — même
 * `unknown` porte toujours son gap — mais que le type n'exclut pas) reste un
 * simple encart : un bouton inerte tromperait le clavier.
 */
export function AuditMaturityAxes({ maturity }: { maturity: CommercialAuditContext['maturity'] }) {
  const { t } = useTranslation('commercialAudit')
  const [openAxis, setOpenAxis] = useState<MaturityAxis['id'] | null>(null)

  // #2065 — `maturity` est TOUJOURS un objet côté moteur (`build-audit.ts`) ;
  // le contrat le laisse `nullable()` pour un producteur futur qui n'aurait
  // pas encore ce bloc. Même règle que `AuditPlanAndMilestones` : l'absence se
  // NOMME, elle n'invente jamais un score.
  if (maturity === null) {
    return (
      <AuditCard className="space-y-1">
        <Text
          element="h2"
          size="xs"
          weight="semibold"
          className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
        >
          {t('maturity.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('maturity.unmeasured')}
        </Text>
      </AuditCard>
    )
  }

  const open = maturity.axes.find(axis => axis.id === openAxis) ?? null

  const scoreAxes = maturity.axes.map(axis => ({
    label: axis.label,
    score: axis.score,
    detail: axis.level ? t(`maturity.level.${axis.level}`) : null,
  }))

  return (
    <AuditCard className="space-y-3">
      <Text
        element="h2"
        size="xs"
        weight="semibold"
        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
      >
        {t('maturity.title')}
      </Text>
      <ScoreWithAxes
        score={maturity.score}
        max={maturity.max}
        axes={scoreAxes}
        reason={maturity.reason ?? t('maturity.unmeasured')}
      />
      <MaturityBarsChart axes={maturity.axes} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {maturity.axes.map(axis => (
          <AxisChip
            key={axis.id}
            axis={axis}
            isOpen={openAxis === axis.id}
            onToggle={() => setOpenAxis(current => (current === axis.id ? null : axis.id))}
          />
        ))}
      </div>
      {open ? <AxisDetail axis={open} /> : null}
    </AuditCard>
  )
}

/**
 * #2090.10 — LE GRAPHIQUE DE MATURITÉ, EN BARRES.
 *
 * Tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §6) : un axe =
 * une barre, chaque barre est dimensionnée sur {@link AXIS_MAX_SCORE} (échelle
 * UNIQUE, celle du moteur — GA-26) mais son SEUL texte est le NIVEAU nommé
 * (jamais une fraction, jamais un nombre nu : « jamais une magnitude seule »).
 * Un axe non évaluable n'a AUCUN score — lui donner une barre à zéro se
 * lirait comme un fait mesuré (GA-18/GA-19), donc il est listé À PART, jamais
 * dessiné.
 */
function MaturityBarsChart({ axes }: { axes: MaturityAxis[] }) {
  const { t } = useTranslation('commercialAudit')
  const measured = axes.filter(axis => axis.score !== null)
  const notEvaluable = axes.filter(axis => axis.score === null)

  if (measured.length === 0) return null

  return (
    <div data-testid="maturity-bars-chart" className="space-y-2">
      <Text
        element="h3"
        size="xs"
        weight="semibold"
        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
      >
        {t('maturity.chart.title')}
      </Text>
      <div className="space-y-1.5">
        {measured.map(axis => {
          const levelLabel = axis.level ? t(`maturity.level.${axis.level}`) : t('maturity.state.unknown')
          const widthPercent = Math.round((Math.max(axis.score ?? 0, 0) / AXIS_MAX_SCORE) * 100)
          return (
            <div key={axis.id} className="flex items-center gap-2">
              <Text element="span" size="xs" className="w-36 shrink-0 truncate text-[var(--bellum-text-secondary)]">
                {axis.label}
              </Text>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-[var(--bellum-surface-2)]">
                <div
                  className="h-2 rounded-full bg-[var(--bellum-primary-500)]"
                  style={{ width: `${widthPercent}%` }}
                  role="img"
                  aria-label={`${axis.label} : ${levelLabel}`}
                />
              </div>
              <Text element="span" size="xs" weight="medium" className="w-24 shrink-0">
                {levelLabel}
              </Text>
            </div>
          )
        })}
      </div>
      {notEvaluable.length > 0 && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('maturity.chart.notEvaluable', { axes: notEvaluable.map(axis => axis.label).join(', ') })}
        </Text>
      )}
    </div>
  )
}

function AxisChip({ axis, isOpen, onToggle }: { axis: MaturityAxis; isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation('commercialAudit')
  // #2065.13/.14 — le NIVEAU nommé quand il existe, sinon l'ÉTAT nommé
  // (« Inconnu », « Partiel ») : jamais un score numérique nu sur la puce.
  const stateLabel = axis.level ? t(`maturity.level.${axis.level}`) : t(`maturity.state.${axis.state}`)
  const hasDetail = (axis.evidence?.length ?? 0) > 0 || (axis.gaps?.length ?? 0) > 0 || axis.nextLever !== null

  const content = (
    <div className="rounded-lg border border-[var(--bellum-border)] p-2">
      <Text element="p" size="xs" weight="medium">
        {axis.label}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {stateLabel}
      </Text>
    </div>
  )

  if (!hasDetail) return content

  return (
    <button type="button" onClick={onToggle} aria-expanded={isOpen} className="text-left pointer-coarse:min-h-11">
      {content}
    </button>
  )
}

/**
 * #2072.1 / #2072.2 / #2072.5 / #2072.7 — ACTIFS · CONTRAINTES · CONFIANCE.
 *
 * Avant ce lot, `evidence` et `gaps` sortaient en DEUX listes strictement
 * identiques — même taille, même couleur, aucun intitulé. La matière des blocs
 * demandés était donc bien à l'écran, mais illisible COMME telle : rien ne
 * distinguait ce qui est en place de ce qui manque.
 *
 * Ce qu'on n'a PAS fait, et pourquoi : un bloc « Actifs / Contraintes /
 * Ruptures » séparé, qui redirait ces mêmes phrases sous un autre titre
 * (loi 4 du tome 7 — rien deux fois sous la même forme ; décision déjà écrite
 * dans `AuditDecisionColumns.tsx`). Les RUPTURES (#2072.3), elles, ont déjà
 * leur bloc : `AuditChain`, où chaque étape en rupture porte sa tension, ses
 * faits, sa confiance et sa conséquence.
 *
 * La CONFIANCE rendue ici n'est pas inventée : c'est `axis.confidence`, produit
 * par `computeCommercialMaturity` (`deduced` sur un axe mesuré, `null` sur un
 * axe qu'aucune source ne relie). `ConfidenceBadge` sait déjà dire `null`
 * « Non mesurée » — un état DISTINCT de « Déduit », qui est le plus faible des
 * trois paliers CONNUS.
 */
function AxisDetail({ axis }: { axis: MaturityAxis }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h3" size="sm" weight="semibold">
          {axis.label}
        </Text>
        {/* #2072.5 — la confiance de CET axe, à paliers nommés, jamais un
            pourcentage et jamais un nombre nu. */}
        {/* `?? null` : le contrat laisse le champ optionnel pour un producteur
            futur. Absent = NON MESURÉE, l'état que le badge sait déjà nommer —
            surtout pas le palier le plus faible des trois connus. */}
        <ConfidenceBadge confidence={axis.confidence ?? null} />
      </div>
      {axis.evidence && axis.evidence.length > 0 ? (
        <div className="space-y-0.5">
          {/* #2072.1 — ce qui est EN PLACE porte son nom. */}
          <Text
            element="p"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('maturity.detail.assets')}
          </Text>
          <ul className="space-y-0.5">
            {axis.evidence.map(item => (
              <li key={item}>
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {axis.gaps && axis.gaps.length > 0 ? (
        <div className="space-y-0.5">
          {/* #2072.2 — ce qui CONTRAINT porte le sien, et ne se confond plus
              avec la liste du dessus. */}
          <Text
            element="p"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('maturity.detail.constraints')}
          </Text>
          <ul className="space-y-0.5">
            {axis.gaps.map(item => (
              <li key={item}>
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {axis.nextLever ? (
        <div className="space-y-0.5">
          {/* #2072.7 — l'action ÉVENTUELLE : elle n'apparaît que quand le
              moteur en a une, jamais une phrase de remplissage. */}
          <Text
            element="p"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('maturity.detail.action')}
          </Text>
          <Text element="p" size="sm" weight="medium">
            {axis.nextLever}
          </Text>
        </div>
      ) : null}
    </AuditCard>
  )
}
