import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowRight, BarChart3, Download, PenLine, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, BrailleLoader, Button, Text } from '@bellum/ui'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { AllAnswersByTheme } from '@/features/onboarding/components/AllAnswersByTheme'
import { FramingExportDialog } from '@/features/onboarding/components/FramingExportDialog'
import { FramingFooterBar, FramingHeading, FramingPage } from '@/features/onboarding/components/FramingLayout'
import { FramingLaunch } from '@/features/onboarding/components/FramingLaunch'
import { FramingValidationBlock } from '@/features/onboarding/components/FramingValidationBlock'
import { LauraUnderstoodSection, PointsToDecide } from '@/features/onboarding/components/LauraUnderstoodSection'
import { OnboardingReviewBlockCard } from '@/features/onboarding/components/OnboardingReviewBlockCard'
import { OnboardingContradictionCard } from '@/features/onboarding/components/OnboardingContradictionCard'
import { OnboardingLauraHypothesisCard } from '@/features/onboarding/components/OnboardingLauraHypothesisCard'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { buildReviewBlocks, type ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'
import { buildAttentionPoints } from '@/features/onboarding/lib/onboarding-attention-points'
import { buildQuestionnaireContradictions } from '@/features/onboarding/lib/onboarding-contradictions'
import { buildAuditReadout } from '@/features/onboarding/lib/audit-readout'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useFraming, useSaveFramingDecision } from '@/features/onboarding/hooks/useFraming'
import { statusOf } from '@/features/onboarding/lib/answer-status'
import { buildContextGrid, hasDeclaredTools } from '@/features/onboarding/lib/framing-readout'
import { recommendedThemes, THEMES } from '@/features/onboarding/lib/theme-catalog'
import { ContextPackDropzone } from '@/features/universal-import/view/ContextPackDropzone'

/**
 * #2030 — « ONBOARDING — RELIRE AVANT DE GÉNÉRER L'AUDIT ». La dernière étape
 * du questionnaire (« Ton audit », #2023.1) : les huit blocs de
 * récapitulatif, chacun modifiable, avant le CTA qui lance vraiment la
 * génération.
 *
 * ⚠️ Reste à faire, hors de ce lot (fichiers d'un autre lot — cf. rapport) :
 * `useOnboardingNavigation.onContinue` route aujourd'hui la dernière
 * sous-étape directement vers `/welcome` (P0-01, cliquet). Cet écran est donc
 * fonctionnellement complet et atteignable par son URL propre
 * (`/onboarding/$id/review`), mais pas encore le point d'arrivée AUTOMATIQUE
 * de la dernière sous-étape.
 */
export function OnboardingReviewPage() {
  const { id } = useParams({ from: '/onboarding/$id/review' })
  const { data: state, isLoading } = useOnboardingState()
  const navigate = useNavigate()
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const prefillMeta = useOnboardingStore(s => s.prefillMeta)
  const profileContext = useProfileContext()
  const statuses = useOnboardingStore(s => s.statuses)
  const { data: framing } = useFraming()
  const saveDecision = useSaveFramingDecision()
  const [view, setView] = useState<'review' | 'launch'>('review')
  const hydrate = useOnboardingStore(s => s.hydrate)
  // Relue seule (rechargement, autre appareil), la relecture lit les réponses ENREGISTRÉES — comme le
  // guide, le catalogue et les thèmes. Sans elle, la grille et l'empreinte validée portaient un brouillon vide.
  useEffect(() => {
    if (state) hydrate(state.answers)
  }, [state, hydrate])
  const [exportOpen, setExportOpen] = useState(false)

  if (isLoading || !state) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }

  const blocks = buildReviewBlocks(answers, prefillMeta, t)
  // #2089.20 — au moins un bloc n'est pas « confirmé » : le dire, sans
  // prétendre que l'absence est un défaut prouvé (#2072.9).
  const hasUnverifiedData = blocks.some(b => b.state !== 'confirmed')
  const attentionPoints = buildAttentionPoints(blocks)
  // #2030.13 — les contradictions, MISES EN ÉVIDENCE. Le calcul (#2029) et la
  // phrase exacte existaient depuis le 15/09 et n'avaient aucun appelant : ce
  // n'est pas un nouveau détecteur, c'est l'écran qui manquait. Une liste vide
  // n'affiche RIEN — « aucune tension détectée » n'est pas « il n'y en a pas »,
  // et l'écrire serait affirmer plus que ce qu'on mesure.
  const contradictions = buildQuestionnaireContradictions(answers, t)
  // #2088.34 — la lecture de LAURA elle-même (le profileur), distincte des huit
  // détecteurs déterministes ci-dessus. `withheldStoredContext` (apps/api) vide
  // `statement` en silence quand une génération antérieure a écrit un motif
  // interdit — un `statement` vide vaut donc « rien à montrer », même règle que
  // `profile_recap` (`ProfileRecapCard`, `if (!recap) return null`).
  const laura = profileContext.data?.profile_context?.contradiction
  const lauraStatement = laura?.statement?.trim() ? laura : null
  // #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — ce que l'audit sait
  // DÉJÀ dire, avant même d'être lancé. Aucune ligne n'est un pourcentage :
  // les cinq dérivations (contrats) n'en rendent aucun, et ce qu'elles ne
  // peuvent pas évaluer est NOMMÉ plutôt que compté à zéro.
  const readout = buildAuditReadout(answers)

  const onModify = (target: ReviewEditTarget): void => {
    navigate({ to: '/onboarding/$id/$stage/$slug', params: { id, stage: target.stage, slug: target.slug } })
  }
  // #2088.34 — « Revoir mes réponses » sur la carte de Laura ne vise PAS un
  // champ précis (contrairement à `OnboardingContradictionCard`, dont chaque
  // tension connaît ses deux champs) : la lecture du profileur porte sur
  // l'ensemble des réponses. La première sous-étape modifiable de l'écran est
  // la cible honnête — jamais un renvoi deviné vers un champ non concerné.
  const firstEditTarget = blocks.find(b => b.editTarget)?.editTarget ?? null
  const onReviewLaura = firstEditTarget ? () => onModify(firstEditTarget) : null

  const grid = buildContextGrid(answers, t)
  const answeredCount = THEMES.flatMap(theme => theme.questions).filter(
    q => statusOf(q, answers[q.key], statuses[q.key]) === 'answered',
  ).length
  const firstNameRaw = answers.first_name
  const firstName = typeof firstNameRaw === 'string' && firstNameRaw.trim() ? firstNameRaw.trim() : null
  const onCorrect = firstEditTarget ? () => onModify(firstEditTarget) : null
  const hasClarify = hasUnverifiedData || !!lauraStatement || contradictions.length > 0 || attentionPoints.length > 0
  const toTop = (): void => document.getElementById('framing-scroll')?.scrollTo({ top: 0 })

  // Théo O onboarding-lancement — « Entrer dans le produit » : l'écran d'APRÈS la validation, sur la même
  // adresse (aucune route neuve). « Retour » revient à la relecture.
  if (view === 'launch') {
    return (
      <FramingPage
        footer={
          <FramingFooterBar
            onBack={() => {
              setView('review')
              toTop()
            }}
            saved={t('welcome.v23.draftSaved')}
          />
        }
      >
        <FramingLaunch validatedAt={framing?.validated_at ?? null} />
      </FramingPage>
    )
  }

  return (
    <FramingPage>
      <main className="w-full space-y-12">
        {/* Théo O onboarding-relecture — « Relire avant d'appliquer » : la première moitié est TON contexte. */}
        <FramingHeading
          eyebrow={t('review.v23.eyebrow')}
          title={firstName ? t('review.v23.title', { name: firstName }) : t('review.v23.titleNoName')}
          lead={answeredCount > 0 ? t('review.v23.lead', { count: answeredCount }) : t('review.v23.leadNone')}
          action={
            <Button type="button" variant="plain" onClick={() => setExportOpen(true)}>
              <Download aria-hidden="true" className="mr-2 h-4 w-4" />
              {t('review.v23.export')}
            </Button>
          }
        />

        <section aria-label={t('review.v23.gridLabel')} data-testid="review-context-grid">
          <ul className="grid overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] md:grid-cols-2">
            {grid.map(cell => {
              const label = t(cell.labelKey)
              const prefilled = cell.answerKeys.some(key => prefillMeta[key])
              const toVerify = cell.answerKeys.some(key => statuses[key] === 'to_verify_with_team')
              return (
                <li
                  key={cell.key}
                  className="space-y-3 border-b border-[var(--bellum-border)] p-6 md:odd:border-r [&:nth-last-child(-n+2)]:md:border-b-0 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                      {label}
                    </Text>
                    <Link
                      to="/onboarding/themes/$themeId"
                      params={{ themeId: cell.themeSlug }}
                      aria-label={`${t('understood.edit')} : ${label}`}
                      className="-m-3 inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
                    >
                      <PenLine aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </div>
                  {toVerify && <Badge variant="warning">{t('review.v23.toVerify')}</Badge>}
                  {!toVerify && prefilled && <Badge variant="info">{t('review.v23.prefilled')}</Badge>}
                  <Text element="p" size="sm" weight="medium">
                    {cell.value ?? t('understood.toSpecify')}
                  </Text>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="next-themes-title" className="space-y-4" data-testid="review-also">
          <Text
            element="h2"
            size="xl"
            weight="semibold"
            id="next-themes-title"
            className="border-b border-[var(--bellum-border)] pb-4"
          >
            {t('review.v23.alsoTitle')}
          </Text>
          <ul className="grid md:grid-cols-2 md:gap-x-6">
            {recommendedThemes(answers, statuses).map(({ theme }) => (
              <li key={theme.slug} className="space-y-2 border-b border-[var(--bellum-border)] py-5">
                <Text element="h3" size="sm" weight="semibold">
                  {t(theme.labelKey)}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t(theme.descriptionKey)}
                </Text>
                <Link
                  to="/onboarding/themes/$themeId"
                  params={{ themeId: theme.slug }}
                  aria-label={`${t('review.v23.deepen')} : ${t(theme.labelKey)}`}
                  className="inline-flex min-h-11 items-center gap-2 text-xs text-[var(--bellum-text-accent)] hover:underline"
                >
                  {t('review.v23.deepen')}
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('framingReview.themesIntro')}
            </Text>
            <Button asChild variant="plain" size="sm">
              <Link to="/onboarding/themes">{t('framingReview.allThemes')}</Link>
            </Button>
          </div>

          {/* import-contexte Je.4 — « Dépose tes documents » (R21-JE) : tiering, postes, grille, campagnes,
              offres… chacun rangé là où il sert, AVANT que la génération ne lise l'espace. Rien ne
              s'importe sans le clic « Ajouter ces documents » ; l'étape reste franchissable sans aucun fichier. */}
          <ContextPackDropzone />
        </section>

        {/* Théo O onboarding-relecture — « Relire toutes mes réponses » : par thème, avec « Modifier » ;
            les huit blocs historiques restent DANS ce repli (rien ne se perd). */}
        <AllAnswersByTheme>
          {blocks.map(block => (
            <OnboardingReviewBlockCard key={block.code} block={block} onModify={onModify} />
          ))}
        </AllAnswersByTheme>

        <div className="border-t border-[var(--bellum-border)] pt-12">
          {/* Théo O onboarding-relecture.R4 — la seconde moitié : « Ce que Laura a compris », la stratégie. */}
          <LauraUnderstoodSection
            answers={answers}
            firstName={firstName}
            answeredCount={answeredCount}
            validated={!!framing?.validated_at}
            decisions={framing?.decisions ?? {}}
            onDecide={(orientation, decision) => saveDecision.mutate({ orientation, decision })}
            decisionPending={saveDecision.isPending}
            onCorrect={onCorrect}
          />
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="clarify-title" className="space-y-5" data-testid="review-clarify">
            <Text
              element="h2"
              size="xl"
              weight="semibold"
              id="clarify-title"
              className="border-b border-[var(--bellum-border)] pb-4"
            >
              {t('framingReview.pointsHeading')}
            </Text>

            {/* #2089.20 — bloc orange : dit ce que ça limite, jamais que
                l'absence est une faiblesse prouvée (#2072.9). */}
            {hasUnverifiedData && (
              <div className="rounded-control border border-[color-mix(in_srgb,var(--bellum-warning)_28%,var(--bellum-border))] bg-[color-mix(in_srgb,var(--bellum-warning)_8%,transparent)] p-4">
                <Text element="p" size="sm" weight="medium" className="text-[var(--warning-soft-text)]">
                  {t('review.dataWarning.title')}
                </Text>
                <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('review.dataWarning.description')}
                </Text>
              </div>
            )}

            {/* #2088.34 — la lecture de LAURA elle-même (le profileur), distincte des huit détecteurs. */}
            {lauraStatement && (
              <ul className="space-y-3">
                <OnboardingLauraHypothesisCard contradiction={lauraStatement} onReview={onReviewLaura} />
              </ul>
            )}

            {/* #2030.13 / #2029.9-.11 — les contradictions, NOMMÉES avec les deux réponses qui tirent en sens
                opposé, et trois issues pour chacune (Expliquer / Corriger / Maintenir les deux). */}
            {contradictions.length > 0 && (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-[var(--bellum-text-accent)]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                    {t('contradictions.lauraHeading')}
                  </Text>
                </div>
                <Text element="h3" size="base" weight="semibold">
                  {t('contradictions.cardTitle')}
                </Text>
                <ul className="space-y-3">
                  {contradictions.map(contradiction => (
                    <OnboardingContradictionCard
                      key={contradiction.id}
                      contradiction={contradiction}
                      onModify={onModify}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* #2089.21/.22 — trois points d’attention max : tension / impact / action. */}
            {attentionPoints.length > 0 && (
              <div className="space-y-3">
                <Text element="h3" size="sm" weight="semibold">
                  {t('review.attention.title')}
                </Text>
                <ul className="divide-y divide-[var(--bellum-border)]">
                  {attentionPoints.map(point => (
                    <li key={point.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Text element="p" size="sm" weight="medium">
                          {t('review.attention.tension', { question: t(point.tensionLabelKey) })}
                        </Text>
                        <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                          {t(point.impactKey)}
                        </Text>
                      </div>
                      {point.editTarget && (
                        <Button type="button" variant="plain" size="sm" onClick={() => onModify(point.editTarget!)}>
                          {t('review.attention.action')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <PointsToDecide answers={answers} />
            {!hasClarify && (
              <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                {t('review.v23.nothingToClarify')}
              </Text>
            )}
          </section>

          <section aria-labelledby="changes-title" className="space-y-5" data-testid="review-changes">
            <Text
              element="h2"
              size="xl"
              weight="semibold"
              id="changes-title"
              className="border-b border-[var(--bellum-border)] pb-4"
            >
              {t('review.v23.changesTitle')}
            </Text>
            <dl className="divide-y divide-[var(--bellum-border)] border-b border-[var(--bellum-border)]">
              {CHANGES.map(key => (
                <div key={key} className="grid gap-2 py-4 sm:grid-cols-[8rem_1fr] sm:gap-4">
                  <dt className="text-xs font-semibold">{t(`review.v23.changes.${key}.label`)}</dt>
                  <dd className="text-sm text-[var(--bellum-text-secondary)]">{t(`review.v23.changes.${key}.body`)}</dd>
                </div>
              ))}
            </dl>

            {/* #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — ce que l'audit sait DÉJÀ dire, et ce qu'il
                ne peut pas encore dire : les deux listes ensemble, à dessein. */}
            {(readout.rows.length > 0 || readout.unmeasured.length > 0) && (
              <div className="space-y-3">
                <Text element="h3" size="sm" weight="semibold">
                  {t('review.readout.title')}
                </Text>
                {readout.rows.length > 0 && (
                  <ul className="space-y-3">
                    {readout.rows.map(row => (
                      <li key={row.key} className="min-w-0">
                        <Text element="p" size="sm">
                          {t(row.labelKey, row.values)}
                        </Text>
                        {row.detail.length > 0 && (
                          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                            {t('review.readout.detail', { list: row.detail.join(' · ') })}
                          </Text>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {readout.unmeasured.length > 0 && (
                  <div>
                    <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                      {t('review.readout.unmeasuredTitle')}
                    </Text>
                    <ul className="mt-1 space-y-1">
                      {readout.unmeasured.map(axis => (
                        <li key={axis}>
                          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                            {t(`review.readout.unmeasured.${axis}`)}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Théo O onboarding-relecture.A1/A3/A4 — la lecture approfondie (l'audit IA) est GARDÉE : même
                génération, mêmes phases ; le diagnostic détaillé vit dans le profil. */}
            <div
              className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
              aria-labelledby="audit-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Text element="h3" size="sm" weight="semibold" id="audit-title">
                    {t('framingReview.auditTitle')}
                  </Text>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('review.v23.diagnostic')}
                  </Text>
                </div>
                <Button asChild variant="plain" size="sm">
                  <Link to="/settings/profile/audit">
                    <BarChart3 aria-hidden="true" className="mr-2 h-4 w-4" />
                    {t('framingReview.auditSee')}
                  </Link>
                </Button>
              </div>
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('framingReview.auditDescription')}
              </Text>
              {/* #2030.17/.18 — coût, durée, aucune action externe ; #2008.10 — l'audit ne se relance qu'au clic. */}
              <div className="space-y-1">
                <Text element="p" size="xs" weight="medium">
                  {t('review.cost.free')}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('review.cost.duration')}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('review.cost.noExternalAction')}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('review.cost.refreshNotice')}
                </Text>
              </div>
              {/* #2030.16/#2089.28 — ouvre l'écran de génération dédié, qui déclenche VRAIMENT la génération. */}
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => navigate({ to: '/onboarding/$id/generating', params: { id } })}
              >
                {t('review.cta')}
              </Button>
            </div>

            {/* Théo O onboarding-relecture.A6 — des outils déclarés : le renvoi vers les connecteurs, sans rien connecter seul. */}
            {hasDeclaredTools(answers) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text element="p" size="xs" className="min-w-0 flex-1 text-[var(--bellum-text-muted)]">
                  {t('framingReview.toolsNotice')}
                </Text>
                <Button asChild variant="plain" size="sm">
                  <Link to="/integrations">{t('framingReview.toolsLink')}</Link>
                </Button>
              </div>
            )}
          </section>
        </div>

        {/* Théo O onboarding-relecture.N2/N3/R5 — la validation explicite ; le lancement est l'écran suivant. */}
        <FramingValidationBlock
          onLaunch={() => {
            setView('launch')
            toTop()
          }}
          onCorrect={onCorrect}
          // #4817 — chaque réponse manquante NOMMÉE ouvre la sous-étape qui la pose,
          // par le même chemin que « Modifier » : aucune route neuve.
          onGoToQuestion={onModify}
        />
      </main>
      <FramingExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </FramingPage>
  )
}

const CHANGES = ['recommendations', 'discover', 'matching', 'sources'] as const
