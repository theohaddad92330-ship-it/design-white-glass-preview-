import type { BellumReadData } from '../useAccountOverviewData'
import type { ConfidenceTier } from '../evaluation/evaluationViewData'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Logo,
  Box,
  Text,
  cn,
} from '@bellum/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Target } from 'lucide-react'
import { GaugeDonut } from '@/components/ui/GaugeDonut'
import { accountDisplayVerdict, namedAccountVerdict } from '@bellum/contracts'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { BADGE_COLORS } from './BadgeColorScore'
import { ScoreCircle } from '@/components/ui/ScoreCircle'
import { stripRegistryJargon } from '@/lib/strip-registry-jargon'

type BellumReadCardProps = {
  data: BellumReadData
  score: number | null
  // Verdict émis par l'IA — prioritaire sur le dérivé /10, seul à porter EXPLORER.
  storedVerdict?: string | null
  /** Note commerciale canonique /25 ; à défaut on retombe sur `score` (/10). */
  score25?: number | null
  // Second axis (Théo P1) — « Fiabilité du dossier » /100 shown beside the
  // commercial gauge, greyed when the underlying data is weak.
  dossierReliability?: number | null
  confidenceTier?: ConfidenceTier | null
  /**
   * #2118.6 — le dossier porte-t-il la décomposition en sept axes ?
   *
   * Quand il ne la porte pas (analyse d'avant ce lot), la note reste affichée —
   * la retirer ferait disparaître une information juste — mais elle DIT qu'elle
   * n'est pas décomposée. Un score nu se lit comme une vérité complète, et la
   * doctrine « un score n'est jamais nu » n'a pas d'exception pour les vieux
   * dossiers : elle a une formulation pour eux.
   */
  hasAxisBreakdown?: boolean
  /** #2932 — `dossier_read.no_go.trigger` : distingue les deux visages de
   *  STOP dans le verdict NOMMÉ (METTRE EN VEILLE vs ÉCARTER POUR CET OBJECTIF). */
  hasNoGoTrigger?: boolean
  /** #2164.34 — « Ce que je ferais maintenant » est déjà monté par l'écran : pas deux fois (GA-26). */
  hideNextAction?: boolean
}

/**
 * Remplace deux composants supprimés le 31/08/2026 (code mort, zéro
 * appelant) :
 * - `sections/ExecutiveSummary.tsx` — `data.description` reprend son
 *   `summary` (les deux lisent `analysis.business_description`, via
 *   `buildBellumReadData`) ; ses `angles` alimentent `data.tags`. Son
 *   `priorityScore`/badge GO-PRUDENT-NO-GO-EXPLORER, lui, n'est PAS repris à
 *   l'identique — un score nu sans ses axes est désormais interdit par la
 *   doctrine (« un score n'est jamais nu »), et ce donjon-là utilisait en
 *   plus des couleurs Tailwind figées (`bg-emerald-100` etc.), non conformes
 *   aux deux thèmes. Le score DÉCOMPOSÉ vit ici via `score`/`score25` + le
 *   donut ci-dessous.
 * - `sections/BusinessOverview.tsx` — son unique champ (`businessDescription
 *   ?? description`) est le MÊME `analysis.business_description` que
 *   `data.description` ci-dessous.
 */
export function BellumReadCard({
  data,
  score,
  storedVerdict = null,
  score25 = null,
  dossierReliability = null,
  confidenceTier = null,
  hasAxisBreakdown = false,
  hasNoGoTrigger = false,
  hideNextAction = false,
}: BellumReadCardProps) {
  const { t, i18n } = useTranslation('accountDetail')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scoreExplainId = useId()
  const [open, setOpen] = useState(false)
  const [isTitleClamped, setIsTitleClamped] = useState(false)
  // #2932 — la FAMILLE pilote la couleur (BADGE_COLORS), le TEXTE affiché est
  // le verdict NOMMÉ : `named_verdict()` côté IA n'était branché que sur le
  // chat, jamais sur cet écran.
  const verdictFamily = accountDisplayVerdict(score, storedVerdict)
  // #3818 — un STOP sans déclencheur ne dit « ÉCARTER POUR CET OBJECTIF » que
  // si l'espace a réellement renseigné un domaine d'offre à juger.
  const hasObjective = useHasOfferObjective()
  const badge = verdictFamily ? namedAccountVerdict(verdictFamily, hasNoGoTrigger, { hasObjective }) : null
  // Grille canonique /25 (Annexe méthodo p25) — la même que celle détaillée dans
  // l'onglet Score ; repli sur le /10 pour un dossier qui ne la porte pas encore.
  const hasScore25 = score25 != null
  const gaugeValue = hasScore25 ? score25 : score
  const gaugeMax = hasScore25 ? 25 : 10
  const gaugeSuffix = hasScore25 ? '/25' : '/10'
  const ringColor = verdictFamily ? BADGE_COLORS[verdictFamily].ring : 'rgba(255,255,255,0.1)'
  const badgeClassName = verdictFamily ? BADGE_COLORS[verdictFamily].badge : null
  // #2307.19 — `non_evaluable` est greyé comme une confiance faible, mais
  // n'en EST pas une : aucune source n'a répondu, rien à juger.
  const confidenceNonEvaluable = confidenceTier === 'non_evaluable'
  const confidenceWeak = confidenceNonEvaluable
    ? true
    : confidenceTier
      ? confidenceTier === 'low'
      : dossierReliability != null && dossierReliability < 40

  useEffect(() => {
    const element = titleRef.current
    if (!element) return

    const updateClampState = () => {
      setIsTitleClamped(element.scrollHeight > element.clientHeight + 1)
    }

    updateClampState()
    const observer = new ResizeObserver(updateClampState)
    observer.observe(element)
    return () => observer.disconnect()
  }, [data.title, data.blocks])

  // #1607.1 — le VERDICT (`blocks.verdictLine`) remplace la phrase libre dès
  // qu'un dossier le porte. `data.title` reste la seule source sur une
  // analyse d'avant ce lot (`data.blocks` est alors `null`, jamais un objet à
  // moitié rempli — voir `buildBellumReadData`).
  const headline = stripRegistryJargon(data.blocks?.verdictLine ?? data.title ?? '')

  if (!headline) return null

  return (
    <div className="py-2 space-y-2">
      <div className="flex items-center gap-1">
        <Logo className="size-8 shrink-0" />
        <Text element="span" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('overview.analysisTitle')}
        </Text>
      </div>
      {/* #1895 — « ce cadre doit prendre moins d'espace en hauteur ».
          Mesuré en production le 11/09 : 241 px pour une phrase et deux
          chiffres, tout en haut de l'onglet — c'est-à-dire avant tout ce qui se
          lit ensuite.

          La hauteur ne venait PAS du texte : elle venait de la colonne de
          droite. Trois sources, toutes retirées sans rien perdre de ce qui se
          lit — un anneau de 104 px là où 72 suffit à porter un nombre à 24 px,
          une gouttière de 16 px en haut ET en bas du cadre, et un décalage de
          16 px pose sur le titre pour le centrer optiquement face à l'anneau,
          que l'alignement vertical fait maintenant gratuitement.

          ⚠️ Ce qui N'A PAS été retiré : les deux libellés sous les chiffres.
          « 64 » sans « Score commercial » serait un score nu, et ce dépôt ne
          rend jamais un score sans dire ce qu'il mesure. Gagner 16 px de plus
          coûterait la seule chose qui rend les chiffres lisibles. */}
      <Box className="flex h-full flex-col rounded-xl px-4 py-3 hover:bg-[var(--bellum-surface-2)] transition-colors">
        <div className="flex flex-1 items-center gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Text
              ref={titleRef}
              element="h2"
              size="xl"
              weight="bold"
              className="line-clamp-5 text-[var(--bellum-text-primary)] leading-snug"
            >
              {headline}
            </Text>
            {isTitleClamped && (
              <Button type="button" variant="black" size="xs" onClick={() => setOpen(true)}>
                {t('common:actions.seeMore')}
              </Button>
            )}
          </div>
          <div className="shrink-0">
            <div className="flex flex-col items-center gap-2">
              <GaugeDonut
                value={gaugeValue}
                max={gaugeMax}
                color={ringColor}
                size="medium"
                displayValue={gaugeValue?.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                  maximumFractionDigits: 1,
                })}
                suffix={gaugeSuffix}
                // #1895 — 20 px et non 24 : l'anneau passe de 104 à 72 px, et
                // trois chiffres suivis de leur suffixe ne tiennent plus dans
                // son trou à la taille d'avant. L'échelle reste celle de
                // Tailwind (D80), et le nombre reste le plus gros de la carte.
                valueClassName="text-xl text-[var(--bellum-text-primary)]"
                suffixClassName="text-xs text-[var(--bellum-text-muted)]"
              />
              {badge && badgeClassName ? (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClassName}`}>{badge}</span>
              ) : null}
              {/* #3675 — le score reste un repère secondaire, EXPLIQUÉ : ce qu'il mesure
                  et ce qu'il n'est pas (aucune prédiction d’issue, aucune case à remplir).
                  Lue par les lecteurs d'écran (`aria-describedby`) et au survol (`title`). */}
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
              {/* Fiabilité du dossier — 2e axe distinct (Théo P1), grisé si faible.
                  Note la COLLECTE de l'analyse (`raw_analysis.confidence`, grille IA
                  technique/identité/sources/commerciale). À ne pas confondre avec la
                  « Confiance donnée » de l'onglet Zones blanches, qui note les CONTACTS. */}
              {dossierReliability != null ? (
                <div
                  className={cn(
                    'flex flex-col items-center border-t border-[var(--bellum-border)] pt-2',
                    confidenceWeak && 'opacity-60',
                  )}
                >
                  {confidenceNonEvaluable ? (
                    <Text size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
                      {t('score.dossierReliabilityNonEvaluable')}
                    </Text>
                  ) : (
                    <Text
                      size="sm"
                      weight="semibold"
                      className={
                        confidenceWeak ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--bellum-text-primary)]'
                      }
                    >
                      {dossierReliability}
                      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                        /100
                      </Text>
                    </Text>
                  )}
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('score.dossierReliability')}
                  </Text>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Box>
      {/* #2118.6 / #2118.48 — la note sans ses axes le DIT, et DIT pourquoi.
          `DossierWorthCard`, juste en dessous, porte la décomposition quand
          le dossier l'a ; sur une analyse plus ancienne elle n'existe pas, et
          le silence laisserait croire que ce chiffre résume tout ce qu'on
          sait — « un score n'est jamais nu ».
          ⚠️ L'explication était posée en `title` (info-bulle au survol
          seulement, jamais visible au clic ni au toucher, jamais lue par un
          lecteur d'écran) : sur QONTO/LATECOERE, vu en recette le 18/09, elle
          ne s'affichait donc JAMAIS. Elle est maintenant un texte lu, pas un
          survol. Elle ne relance RIEN toute seule — le rafraîchissement reste
          un geste, depuis le menu de l'en-tête. */}
      {!hasAxisBreakdown && gaugeValue != null ? (
        // #3499 — le titre générique « Axes non détaillés » est retiré : la phrase
        // qui suit dit POURQUOI (analyse antérieure à la lecture en sept axes) et
        // reste, un score n'étant jamais nu.
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('dossierRead.noAxisBreakdownHint')}
        </Text>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t('common:actions.close')}
          className="flex max-h-[82dvh] min-w-[60vw] flex-col overflow-hidden rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 sm:max-w-xl"
        >
          <DialogHeader className="shrink-0 border-b border-[var(--bellum-border)] p-5 pr-14">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <Logo className="size-5 shrink-0" />
                  <DialogTitle className="text-base leading-snug text-[var(--bellum-text-primary)]">
                    {t('bellumRead.dialogTitle')}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--bellum-text-muted)]">
                  {t('bellumRead.dialogDescription')}
                </DialogDescription>
              </div>
              {score != null ? (
                <div className="flex flex-col items-center gap-2">
                  <GaugeDonut
                    value={gaugeValue}
                    max={gaugeMax}
                    color={ringColor}
                    size="medium"
                    displayValue={gaugeValue?.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                      maximumFractionDigits: 1,
                    })}
                    suffix={gaugeSuffix}
                    valueClassName="text-xs text-[var(--bellum-text-primary)]"
                    suffixClassName="text-xs text-[var(--bellum-text-muted)]"
                  />
                  {badge && badgeClassName ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClassName}`}>{badge}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </DialogHeader>

          {/* #1081 : la hauteur du corps était calculée en soustrayant une entête
              SUPPOSÉE de 108 px. Celle-ci en fait plus (titre + description +
              jauge), si bien que le corps dépassait le conteneur `overflow-hidden`
              et que la DERNIÈRE ligne était coupée, sans qu'aucun défilement ne
              puisse l'atteindre. La hauteur se MESURE désormais : la modale est une
              colonne flex, l'entête ne se rétrécit pas, le corps prend ce qui
              reste. */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <section className="space-y-2">
              <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                {t('bellumRead.summary')}
              </Text>
              <Text
                element="p"
                size="base"
                weight="medium"
                className="text-[var(--bellum-text-primary)] leading-relaxed"
              >
                {headline}
              </Text>
            </section>

            {/* #1607.1 — POURQUOI / CE QUI MANQUE / PROCHAINE ACTION : trois
                blocs additifs, rendus UNIQUEMENT quand le dossier porte les
                quatre blocs BELLUM READ (`data.blocks`). Absents sur une
                analyse d'avant ce lot — jamais un panneau à moitié rempli. */}
            {data.blocks && data.blocks.why.length > 0 ? (
              <section className="space-y-2">
                <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t('bellumRead.why')}
                </Text>
                <ul className="list-disc space-y-1 pl-5">
                  {data.blocks.why.map((rawReason, index) => {
                    const reason = stripRegistryJargon(rawReason)
                    if (!reason) return null
                    return (
                      <li key={`${reason}-${index}`}>
                        <Text element="span" size="sm" className="text-[var(--bellum-text-primary)] leading-relaxed">
                          {reason}
                        </Text>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            {stripRegistryJargon(data.blocks?.missing ?? '') ? (
              <section className="space-y-2">
                <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t('bellumRead.missing')}
                </Text>
                <Text element="p" size="sm" className="text-[var(--bellum-text-muted)] leading-relaxed">
                  {stripRegistryJargon(data.blocks?.missing ?? '')}
                </Text>
              </section>
            ) : null}

            {stripRegistryJargon(data.blocks?.nextAction ?? '') && !hideNextAction ? (
              <section className="space-y-2">
                <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t('bellumRead.nextAction')}
                </Text>
                <Text element="p" size="sm" className="text-[var(--bellum-text-accent)] leading-relaxed">
                  {stripRegistryJargon(data.blocks?.nextAction ?? '')}
                </Text>
              </section>
            ) : null}

            {stripRegistryJargon(data.description ?? '') ? (
              <section className="space-y-2 rounded-lg bg-[var(--bellum-bg-lighter)] p-4">
                <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {t('bellumRead.context')}
                </Text>
                <Text element="p" size="sm" className="text-[var(--bellum-text-primary)] leading-relaxed">
                  {stripRegistryJargon(data.description ?? '')}
                </Text>
              </section>
            ) : null}

            {data.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--bellum-border)] pt-4">
                {data.tags.map((tag, index) => (
                  <span
                    key={`${tag}-${index}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2.5 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]"
                  >
                    <Target className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
