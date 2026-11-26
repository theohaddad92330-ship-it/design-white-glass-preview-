import { Badge, Card, Text, cn } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { GaugeDonut } from '@/components/ui/GaugeDonut'
import { cardFade } from '../../motion'
import { DOSSIER_SCORE_AXES } from '@bellum/contracts'
import type { DossierReadView } from './dossierReadViewData'
import type { ConfidenceTier, EvaluationViewData } from './evaluationViewData'
import { buildProvisionalScore } from './provisionalScore'
import {
  type ScoreFactorView,
  excludedAxisLabels,
  measuredAxisCount,
  reconcileFactorsWithDossierRead,
  proofTypeMeta,
  sumAxisFactors,
  sumAxisMax,
  totalAxisCount,
  totalFactor,
} from './scoreFactors'
import { BADGE_COLORS } from '../sections/BadgeColorScore'
import { accountDisplayVerdict, NAMED_ACCOUNT_VERDICTS, namedAccountVerdict } from '@bellum/contracts'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'

/**
 * LOIC-FIX2 SCORE OGF — UNE source pour le verdict nommé et le score affiché (GA-26) : le badge, la ligne de
 * total et le titre « Score du compte » lisent tous ce résultat, jamais chacun sa copie (recette 20/10 :
 * « RÉSERVE » d'un côté, « Verdict PRUDENT » de l'autre pour le même verdict).
 */
function useScoreHeadline(data: EvaluationViewData) {
  const verdictFamily = accountDisplayVerdict(data.score, data.goNoGo)
  // #3818 — un STOP sans déclencheur ne dit « ÉCARTER POUR CET OBJECTIF » que si l'espace a un domaine d'offre.
  const hasObjective = useHasOfferObjective()
  const unarbitrated = data.scoreUnarbitrated === true
  const verdictName = verdictFamily ? namedAccountVerdict(verdictFamily, data.hasNoGoTrigger, { hasObjective }) : null
  const hasScore25 = data.score25 != null
  // #4991.1 — le score se dit en MOTS : une clé de phrase par verdict (le détail en points passe dans un repli).
  const wordsKey =
    verdictFamily && verdictName && (NAMED_ACCOUNT_VERDICTS as readonly string[]).includes(verdictName)
      ? verdictFamily === 'NO-GO'
        ? data.hasNoGoTrigger
          ? 'score.words.onHold'
          : 'score.words.setAside'
        : `score.words.${verdictFamily}`
      : null
  return {
    verdictFamily,
    unarbitrated,
    verdictName,
    wordsKey,
    gaugeValue: hasScore25 ? data.score25 : data.score,
    gaugeMax: hasScore25 ? 25 : 10,
    gaugeSuffix: hasScore25 ? '/25' : '/10',
  }
}

type ScoreHeadline = ReturnType<typeof useScoreHeadline>

export function ScoreSummaryCard({ data }: { data: EvaluationViewData }) {
  const headline = useScoreHeadline(data)
  return (
    <motion.div variants={cardFade}>
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:divide-x lg:divide-[var(--bellum-border)]">
          <ScorePanel headline={headline} confidence={data.confidence} confidenceTier={data.confidenceTier} />
          <JustificationPanel
            headline={headline}
            justification={data.justification}
            qualityCapped={data.qualityCapped}
            qualityCapReason={data.qualityCapReason}
            scoreFactors={data.scoreFactors}
            dossierRead={data.dossierRead ?? null}
          />
        </div>
        <ProvisionalNotice data={data} />
      </Card>
    </motion.div>
  )
}

/**
 * Note provisoire + « ce qui ferait bouger la note » (rapport TF1 p28).
 *
 * Le score s'affichait comme un verdict, y compris quand l'IA l'avait plafonné
 * faute de matière — une précision fictive, que la spec interdit. Le bandeau dit
 * l'état réel de la note et cite les axes les plus loin de leur maximum, qui sont
 * les seuls à pouvoir la déplacer. Rien à annoncer ⇒ rien n'est rendu.
 */
function ProvisionalNotice({ data }: { data: EvaluationViewData }) {
  const { t } = useTranslation('accountDetail')
  const { provisional, reason, levers } = buildProvisionalScore(data)
  if (!provisional) return null

  return (
    <div className="border-t border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-warning)_8%,transparent)] px-5 py-4">
      <Text size="sm" weight="semibold">
        {t('evaluation.provisionalTitle')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t(reason === 'qualityCapped' ? 'evaluation.provisionalCapped' : 'evaluation.provisionalWeak')}
      </Text>
      {levers.length > 0 && (
        <>
          <Text size="xs" weight="medium" className="mt-3">
            {t('evaluation.provisionalLevers')}
          </Text>
          <ul className="mt-1.5 space-y-1">
            {levers.map(lever => (
              <li key={lever.label} className="flex gap-2">
                <span aria-hidden="true" className="text-[var(--bellum-text-muted)]">
                  ·
                </span>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('evaluation.provisionalLever', {
                    axis: lever.label,
                    weight: lever.weight ?? 0,
                    max: lever.max ?? 5,
                  })}
                </Text>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Confidence is "weak" when the tier is low or, absent a tier, the number is
 *  under the medium cutoff (mirrors confidence.py _tier: high ≥ 70, medium ≥ 40).
 *  A weak confidence is greyed so the two axes read differently at a glance.
 *  `non_evaluable` is greyed too, but never counted as "weak" data (#2307.19):
 *  it is a DIFFERENT badge, see `ScorePanel`. */
function isWeakConfidence(confidence: number | null, tier: ConfidenceTier | null): boolean {
  if (tier) return tier === 'low' || tier === 'non_evaluable'
  return confidence != null && confidence < 40
}

function ScorePanel({
  headline,
  confidence,
  confidenceTier,
}: {
  headline: ScoreHeadline
  confidence: number | null
  confidenceTier: ConfidenceTier | null
}) {
  const { t, i18n } = useTranslation('accountDetail')
  // #3675 reste (recette prod 07/10) — même explication accessible que
  // BellumReadCard (Vue d'ensemble), pas recalculée : `score.commercialExplain`
  // est le texte partagé, lu au survol (`title`) et par les lecteurs d'écran
  // (`aria-describedby`).
  const scoreExplainId = useId()
  // #2932 — la FAMILLE pilote la couleur (BADGE_COLORS), le TEXTE affiché est
  // le verdict NOMMÉ (`headline.verdictName`).
  const { verdictFamily, unarbitrated: scoreUnarbitrated, gaugeValue, gaugeMax, gaugeSuffix } = headline
  // D10 (Louis 05/10, recette 06/10) — un score « non arbitré » ne décide rien : ni verdict nommé, ni couleur de famille.
  const badge = scoreUnarbitrated ? t('synthesis.takeaway.unarbitrated') : headline.verdictName
  const ringColor = verdictFamily && !scoreUnarbitrated ? BADGE_COLORS[verdictFamily].ring : 'rgba(255,255,255,0.1)'
  const badgeClassName = scoreUnarbitrated
    ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-muted)]'
    : verdictFamily
      ? BADGE_COLORS[verdictFamily].badge
      : null
  const weak = isWeakConfidence(confidence, confidenceTier)

  return (
    <div className="flex flex-col items-center justify-center gap-3 border-b border-[var(--bellum-border)] p-6 lg:border-b-0">
      <div className="shrink-0">
        <div className="flex flex-col items-center gap-2">
          {/* La note commerciale s'affiche sur la grille CANONIQUE /25 (Annexe
              méthodo p25 : Fit · Timing · Accessibilité · Concurrence · Capacité),
              celle-là même que les facteurs listent juste à côté. Le /10 n'était
              qu'une projection : l'écran annonçait « 3/10 » au-dessus d'une
              grille totalisant 10/25. Repli sur le /10 pour un dossier ancien
              qui ne porte pas encore le /25. */}
          {/* #4991.1 — le détail en points (jauge /25) ne tient plus l'en-tête : il est dans un repli (Louis 23/10). */}
          <details data-testid="score-gauge-detail" className="text-center">
            <summary className="min-h-11 cursor-pointer text-xs text-[var(--bellum-text-muted)]">
              {t('score.pointsDetail')}
            </summary>
            <GaugeDonut
              value={gaugeValue}
              max={gaugeMax}
              color={ringColor}
              size="large"
              displayValue={gaugeValue?.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                maximumFractionDigits: 1,
              })}
              suffix={gaugeSuffix}
              valueClassName="text-2xl text-[var(--bellum-text-primary)]"
              suffixClassName="text-xs text-[var(--bellum-text-muted)]"
            />
          </details>
          {badge && badgeClassName ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClassName}`}>{badge}</span>
          ) : null}
          <Text
            size="xs"
            title={t('score.commercialExplain')}
            aria-describedby={scoreExplainId}
            className="text-[var(--bellum-text-muted)]"
          >
            {t('score.commercial')}
          </Text>
          <span id={scoreExplainId} className="sr-only">
            {t('score.commercialExplain')}
          </span>
          {/* Les deux nombres mesurent des choses différentes — on le dit, au
              lieu de laisser un « /10 » et un « /100 » côte à côte. */}
          <Text size="xs" className="max-w-[180px] text-center text-[var(--bellum-text-muted)]">
            {t('score.commercialHint')}
          </Text>
        </div>
      </div>
      {/* Fiabilité du dossier — DISTINCTE du score commercial (Théo p.33). Greyed +
          badgée « données faibles » quand la donnée est peu fiable. Elle note la
          COLLECTE de l'analyse (grille IA), pas les contacts : la note qui porte
          sur les contacts s'appelle « Confiance donnée » (onglet Zones blanches).
          #2307.27 (épopée #2789, NO-GO) — TOUJOURS rendue à côté du score dès
          qu'il y en a un : un `confidence` absent (dossier antérieur à la grille
          de fiabilité) affichait ce bloc entier disparaître, laissant le score
          commercial seul à l'écran — exactement le score qui masque une
          confiance dont on ignore tout. « Non mesurée » le nomme au lieu de se
          taire, distinct de « Non évaluable » (#2307.19 : la grille a tourné,
          sans matière). */}
      <div
        className={cn('flex flex-col items-center border-t border-[var(--bellum-border)] pt-3', weak && 'opacity-60')}
      >
        {confidence == null ? (
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('score.dossierReliabilityUnknown')}
          </Text>
        ) : confidenceTier === 'non_evaluable' ? (
          // #2307.19 — aucune des sources de collecte n'a répondu : rien à
          // juger. Un « 0/100 » se lirait comme une confiance faible plutôt
          // qu'une absence de matière (doctrine « non mesuré n'est jamais un
          // 0 déguisé »), donc le nombre s'efface au profit d'un état nommé.
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('score.dossierReliabilityNonEvaluable')}
          </Text>
        ) : (
          <Text
            size="lg"
            weight="semibold"
            className={weak ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--bellum-text-primary)]'}
          >
            {confidence}
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              /100
            </Text>
          </Text>
        )}
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('score.dossierReliability')}
        </Text>
        <Text size="xs" className="max-w-[180px] text-center text-[var(--bellum-text-muted)]">
          {confidence == null
            ? t('score.dossierReliabilityUnknownHint')
            : confidenceTier === 'non_evaluable'
              ? t('score.dossierReliabilityNonEvaluableHint')
              : t('score.dossierReliabilityHint')}
        </Text>
        {weak && confidence != null && confidenceTier !== 'non_evaluable' ? (
          <Badge variant="outline" className="mt-1 text-xs text-[var(--bellum-text-muted)]">
            {t('score.weakData')}
          </Badge>
        ) : null}
      </div>
    </div>
  )
}

/** Evidence for the commercial score — each factor tied to a proof (Théo P1).
 *
 *  The additive axes are listed with a "+N / max", then the deterministic
 *  verdict is shown as the TOTAL of that column. It used to be rendered "+N"
 *  like the axes even though its weight IS their sum, so adding the column gave
 *  twice the score. The total is also restated on the /10 the headline shows,
 *  so the two never look like contradicting numbers. */
function ScoreFactorsList({
  factors: rawFactors,
  dossierRead,
  verdictName,
}: {
  factors: ScoreFactorView[]
  dossierRead: DossierReadView | null
  verdictName: string | null
}) {
  const { t } = useTranslation('accountDetail')
  if (rawFactors.length === 0) return null
  // LOIC-FIX2 SCORE OGF (b) — la lecture du dossier fait foi sur « mesuré / non mesuré » : un axe qu'elle range
  // parmi les non mesurés n'a pas de note ici (recette 20/10 : « Concurrence +2/5 » ET « non mesurée »).
  const factors = reconcileFactorsWithDossierRead(rawFactors, dossierRead?.score.unknownAxes ?? [])
  const reconciled = factors.some((factor, index) => factor.weight !== rawFactors[index]?.weight)
  const axes = factors.filter(factor => factor.kind === 'axis')
  const total = totalFactor(factors)
  const axesSum = sumAxisFactors(factors)
  // #2091 — un axe non mesuré sortait du numérateur (silencieusement, +0) mais
  // gardait sa part du dénominateur fixe (souvent 25) : le total affiché
  // mesurait alors la complétude de nos données, pas le compte. `axesMax`
  // réduit le dénominateur d'autant, et `excludedAxes` les NOMME.
  const axesMax = sumAxisMax(factors)
  const excludedAxes = excludedAxisLabels(factors)

  return (
    <div className="mt-6 border-t border-[var(--bellum-border)] pt-5">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('score.factorsTitle')}
      </Text>
      <ul className="mt-3 flex flex-col gap-2">
        {axes.map((factor, index) => (
          <ScoreFactorRow key={`${factor.label}-${index}`} factor={factor} />
        ))}
      </ul>
      {/* #4016.L9.a (THALES, 14/10) — UNE source pour « N axes sur M » et les axes non évalués NOMMÉS
          (GA-26) : la lecture en sept axes de la Vue d'ensemble (`dossierRead`). Les cinq facteurs
          ci-dessus restent la PREUVE du score ; ils ne redisent plus un décompte qui contredit
          l'autre onglet. Sans lecture en sept axes (dossier ancien), le décompte des facteurs. */}
      {dossierRead && dossierRead.score.scoredAxes > 0 ? (
        <>
          <Text data-testid="score-axes-count" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {/* Échelle du score (R12) — ce décompte est celui de la LECTURE DU DOSSIER (7 axes), pas
                celui de la grille à 5 critères affichée en /25 : il le dit. */}
            {t('dossierRead.scoreNamePrefix')}{' '}
            {t('dossierRead.axesEvaluated', {
              count: dossierRead.score.scoredAxes,
              total: DOSSIER_SCORE_AXES.length,
            })}
          </Text>
          {dossierRead.score.unknownAxes.length > 0 ? (
            <Text data-testid="score-axes-unknown" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('dossierRead.unknownOutOfScore', {
                count: dossierRead.score.unknownAxes.length,
                axesCount: dossierRead.score.unknownAxes.length,
                axes: dossierRead.score.unknownAxes.map(key => t(`dossierRead.axis.${key}`)).join(', '),
              })}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {/* #2091 — un axe non évaluable SORT du dénominateur (doctrine `ScoreWithAxes`), mais reste
              NOMMÉ, y compris sur un run « legacy » sans facteur `total`. */}
          {excludedAxes.length > 0 ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
              {t('score.factorsExcluded', { names: excludedAxes.join(', ') })}
            </Text>
          ) : null}
          {axes.length > 0 ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
              {t('dossierRead.axesEvaluated', { count: measuredAxisCount(factors), total: totalAxisCount(factors) })}
            </Text>
          ) : null}
        </>
      )}
      {total ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-3">
          <Text size="sm" weight="medium" className="min-w-0 truncate text-[var(--bellum-text-primary)]">
            {/* LOIC-FIX2 SCORE OGF (a) — le NOM du verdict (celui du badge), jamais la famille écrite par l'analyse. */}
            {verdictName ? t('score.verdictRule', { name: verdictName }) : total.label}
          </Text>
          <Text size="sm" weight="semibold" className="shrink-0 tabular-nums text-[var(--bellum-text-primary)]">
            {reconciled
              ? t('score.factorsTotal', { value: axesSum, max: axesMax ?? 25 })
              : t('score.factorsTotal', { value: total.weight ?? axesSum, max: total.max ?? axesMax ?? 25 })}
          </Text>
        </div>
      ) : null}
    </div>
  )
}

function ScoreFactorRow({ factor }: { factor: ScoreFactorView }) {
  const { t } = useTranslation('accountDetail')
  const meta = proofTypeMeta(factor.proofType)
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold', meta.className)}>
          {meta.label}
        </span>
        <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
          {factor.label}
        </Text>
      </div>
      {factor.weight != null ? (
        <Text size="xs" className="shrink-0 tabular-nums text-[var(--bellum-text-muted)]">
          {factor.max != null
            ? t('score.factorWeightWithMax', { value: factor.weight, max: factor.max })
            : t('score.factorWeight', { value: factor.weight })}
        </Text>
      ) : (
        <Text data-testid="score-factor-unmeasured" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
          {t('score.factorNotMeasured')}
        </Text>
      )}
    </li>
  )
}

function JustificationPanel({
  headline,
  justification,
  qualityCapped,
  qualityCapReason,
  scoreFactors,
  dossierRead,
}: {
  headline: ScoreHeadline
  justification: string
  qualityCapped: boolean
  qualityCapReason: string | null
  scoreFactors: ScoreFactorView[]
  dossierRead: DossierReadView | null
}) {
  const { t, i18n } = useTranslation('accountDetail')
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Text element="h3" size="base" weight="semibold">
          {t('score.title')}
        </Text>
        {qualityCapped ? (
          // Le Quality Judge a dégradé le verdict (Théo p.11 : score recalculé après
          // gates qualité) — on le signale au lieu d'afficher un score muet.
          <Badge variant="warning" className="text-xs">
            {qualityCapReason ? t('score.qualityCapWithReason', { reason: qualityCapReason }) : t('score.qualityCap')}
          </Badge>
        ) : null}
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('score.subtitle')}
      </Text>
      {/* #4991.1 — le score en mots d'abord ; le chiffre /25 vit dans un repli, jamais dans le titre. */}
      {headline.wordsKey && !headline.unarbitrated ? (
        <Text data-testid="score-words" size="sm" weight="medium" className="mt-2 text-[var(--bellum-text-primary)]">
          {t(headline.wordsKey)}
        </Text>
      ) : null}
      {headline.gaugeValue != null ? (
        <details data-testid="score-points-detail" className="mt-2">
          <summary className="min-h-11 cursor-pointer text-xs text-[var(--bellum-text-muted)]">
            {t('score.pointsDetail')}
          </summary>
          {/* LOIC-FIX2 SCORE OGF (c) — le détail porte SON score et son échelle ; absent, aucun chiffre (jamais « 0 »). */}
          <Text data-testid="score-title-value" size="sm" weight="semibold" className="tabular-nums">
            {headline.gaugeValue.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
              maximumFractionDigits: 1,
            })}
            {headline.gaugeSuffix}
          </Text>
        </details>
      ) : null}
      <div className="mt-6 border-t border-[var(--bellum-border)] pt-5">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('score.justification')}
        </Text>
        <Text size="sm" className="mt-2 max-w-3xl leading-relaxed text-[var(--bellum-text-primary)]">
          {justification || t('score.justificationFallback')}
        </Text>
      </div>
      <ScoreFactorsList
        factors={scoreFactors}
        dossierRead={dossierRead}
        verdictName={headline.unarbitrated ? null : headline.verdictName}
      />
    </div>
  )
}

function DecisionBadge({ value }: { value: string }) {
  const variant =
    value === 'GO' ? 'success' : value === 'PRUDENT' ? 'warning' : value === 'NO-GO' ? 'danger' : 'outline'
  return (
    <Badge variant={variant} className="px-3 py-1 text-sm font-semibold tracking-normal">
      {value}
    </Badge>
  )
}
