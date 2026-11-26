import { useRef } from 'react'
import {
  Building2,
  Check,
  ClipboardCheck,
  Compass,
  Flag,
  Settings2,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text, cn } from '@bellum/ui'
import { TEMPS1_STAGES, TEMPS1_SUBSTEPS, type FlatSubStep } from '@/features/onboarding/lib/questions'
import {
  clampProgressRegression,
  computeResultProgress,
  estimateMinutesRemaining,
  ONBOARDING_RESULT_STEPS,
  resultStepStatus,
} from '@/features/onboarding/lib/onboarding-progress'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * #2021.9 — UNE icône métier par BLOC (les sept étapes nommées), jamais une
 * par question : `TEMPS1_STAGES` compte ~114 questions à ce jour, en
 * assigner une par question aurait deviné 114 choix visuels sans catalogue
 * icône↔domaine à relire (mesuré 18/09, cf. registre). Le grain « bloc » est
 * `ONBOARDING_RESULT_STEPS`, déjà le vocabulaire à sept étapes de #2023.1/.7
 * — pas une seconde échelle inventée ici (GA-26).
 *
 * Liste FERMÉE, comme `CHOICE_ICON_KEYS` (`lib/questions/types.ts`) : un
 * code de `ONBOARDING_RESULT_STEPS` sans entrée ici ne compile pas
 * (exhaustivité TS via `satisfies`).
 */
const STEP_ICONS = {
  organisation: Building2,
  role: UserRound,
  offer: Compass,
  market: TrendingUp,
  system: Settings2,
  goals: Flag,
  audit: ClipboardCheck,
} as const satisfies Record<(typeof ONBOARDING_RESULT_STEPS)[number]['code'], LucideIcon>

/**
 * Où l'on en est dans le questionnaire — les SEPT étapes nommées par
 * résultat, l'étape courante marquée.
 *
 * #2023.1/.7 — remplace le vocabulaire des trois stages internes
 * (« Ton ESN / Ton offre / Tes cibles ») par les sept étapes de l'issue
 * (Louis 15/09, décision qui tranche #2023.7 : « prends-les tous »). Trois de
 * ces sept ont déjà leurs questions Temps-1 câblées ; les quatre autres
 * (rôle, système, objectifs, audit) restent honnêtement `not_started` tant
 * qu'aucune question ne les nourrit — ce n'est pas une étape à 0 %, c'est une
 * étape non commencée, NOMMÉE comme telle (`onboarding-progress.ts`).
 *
 * #2023.1/#2012 — l'état de chaque étape se lit sur les RÉPONSES réellement
 * enregistrées (`resultStepStatus`), jamais sur sa position par rapport à
 * l'étape courante : l'ancien `done = i < currentStageIndex` était ✅
 * positionnel, pas un état réel.
 *
 * #2023.3 — l'étape active ouvre par « Cette partie permet à BellumAI de… ».
 * #2023.4 — une estimation dynamique de la durée restante, comptée sur les
 * RÉSULTATS (questions répondues), jamais sur les écrans traversés.
 * #2023.6 — cette estimation ne redescend jamais brutalement : `useRef` garde
 * le maximum déjà montré pour la durée de la session d'écran.
 *
 * `onReview` (#2030.16) : rendu depuis `OnboardingReviewPage`, l'étape
 * « Ton audit » devient l'étape active et les trois étapes à contenu
 * Temps-1 sont considérées faites (on n'atteint la relecture qu'après la
 * dernière sous-étape).
 *
 * #3553 — avec `onNavigate`, le rail devient une NAVIGATION : une étape qui a
 * des sous-étapes est un bouton qui mène à la première, et l'étape courante
 * déplie la liste de ses sous-étapes (la courante marquée, `aria-current=
 * "page"`), elles aussi cliquables. Une étape sans sous-étape (« Ton rôle »,
 * « Ton audit » : leurs questions sont reposées au Temps 2, ou c'est la
 * relecture) reste un texte — un bouton qui ne mène nulle part serait mort.
 * Aucune saisie ne se perd : c'est l'appelant (`useOnboardingNavigation.
 * onJump`) qui enregistre la page quittée avant de router.
 *
 * #2021.7 — la même LOGIQUE à toutes les largeurs (une liste, deux
 * directions). #2021.3 — l'étape courante ne s'écrit plus avec une nuance
 * FIXE de la gamme primaire en couleur de TEXTE (GA-33) : la pastille garde
 * la couleur de marque (fond opaque, texte blanc, AA dans les deux thèmes),
 * le libellé passe par `--bellum-text-accent`.
 */
export function OnboardingStepper({
  currentStageIndex,
  onReview = false,
  currentSlug,
  onNavigate,
  onOpenProofs,
}: {
  currentStageIndex: number
  onReview?: boolean
  currentSlug?: string
  onNavigate?: (target: FlatSubStep) => void
  /** #3709 — « Ton système commercial » n'a aucune question au Temps 1 : ses
   *  preuves (résultats, témoignages, « je n'en ai pas encore ») vivent dans
   *  le complément de profil. Avec ce rappel, l'étape devient un bouton qui
   *  mène à elles, au lieu d'un numéro inerte qui se lit « verrouillé ». */
  onOpenProofs?: () => void
}) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  // #2088.33 — un prérempli non confirmé ne compte pas comme une réponse :
  // sans `prefillMeta`, ce stepper afficherait une progression que personne
  // n'a validée.
  const prefillMeta = useOnboardingStore(s => s.prefillMeta)
  const progress = computeResultProgress(answers, prefillMeta)
  const minutesRemaining = onReview ? null : estimateMinutesRemaining(progress)

  // #2023.6 — plafond monotone : ne redescend jamais sous ce qui a déjà été
  // montré pendant cette session d'écran.
  const maxPercentRef = useRef(0)
  const rawPercent = onReview ? 100 : progress.percent
  const displayPercent = clampProgressRegression(maxPercentRef.current, rawPercent)
  maxPercentRef.current = displayPercent

  const currentStageCode = TEMPS1_STAGES[currentStageIndex]?.code
  const activeStep = onReview
    ? ONBOARDING_RESULT_STEPS[ONBOARDING_RESULT_STEPS.length - 1]
    : (ONBOARDING_RESULT_STEPS.find(s => (s.stageCodes as readonly string[]).includes(currentStageCode ?? '')) ??
      ONBOARDING_RESULT_STEPS[0])

  // #2087.27 — « Afficher l'étape (3/7) » : un texte compact en plus de la
  // liste des sept étapes déjà rendue ci-dessous — utile en particulier
  // quand la liste passe en ligne (`flex-wrap`, < md). Le même dénombrement
  // que la liste (`ONBOARDING_RESULT_STEPS`), jamais un second calcul (GA-26).
  const activeStepIndex = ONBOARDING_RESULT_STEPS.findIndex(s => s.code === activeStep.code)
  const stepNumber = (activeStepIndex === -1 ? 0 : activeStepIndex) + 1

  return (
    <nav className="pt-4" aria-label={t('stepper.label')}>
      {/* #2021.19 — borne portée de `lg` (1 024 px) à `md` (768 px, GA-28) :
          une seule rupture pour tout le dépôt. */}
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 md:block md:space-y-4">
        {ONBOARDING_RESULT_STEPS.map((step, i) => {
          const active = step.code === activeStep.code
          const status =
            step.code === 'audit'
              ? onReview
                ? 'in_progress'
                : 'not_started'
              : resultStepStatus(step, answers, prefillMeta)
          const done = status === 'done'
          // #2021.9 — icône métier DÉCORATIVE : le libellé texte juste après
          // reste seul porteur du nom accessible, jamais l'icône (GA-32 vise
          // le bouton icône-seule, absent ici).
          const StepIcon = STEP_ICONS[step.code]
          // #3553 — les sous-étapes que le Temps 1 pose encore pour cette étape.
          const subSteps = TEMPS1_SUBSTEPS.filter(s => (step.stageCodes as readonly string[]).includes(s.stageCode))
          const firstSub = subSteps[0]
          const label = (
            <Text
              element="span"
              size="sm"
              className={cn(active ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]')}
            >
              {t(step.titleKey)}
            </Text>
          )
          return (
            <li
              key={step.code}
              aria-current={active ? 'step' : undefined}
              className="flex flex-wrap items-center gap-2 md:gap-3"
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs',
                  done && 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-white',
                  active && !done && 'border-[var(--bellum-primary-500)] text-[var(--bellum-text-accent)]',
                  !done && !active && 'border-[var(--bellum-border)] text-[var(--bellum-text-muted)]',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <StepIcon
                aria-hidden="true"
                className={cn(
                  'step-icon h-4 w-4 shrink-0',
                  active ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]',
                )}
              />
              {onOpenProofs && step.code === 'system' ? (
                <>
                  <Button type="button" variant="ghost" size="sm" className="h-auto px-1 py-1" onClick={onOpenProofs}>
                    {label}
                  </Button>
                  <Text element="span" size="xs" className="basis-full pl-8 text-[var(--bellum-text-muted)] md:pl-10">
                    {t('stepper.proofsHint')}
                  </Text>
                </>
              ) : onNavigate && firstSub ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-1 py-1"
                  onClick={() => onNavigate(firstSub)}
                >
                  {label}
                </Button>
              ) : (
                label
              )}
              {/* #3553 — les sous-étapes de l'étape COURANTE seulement : les
                  autres restent repliées, le rail ne devient pas un sommaire. */}
              {onNavigate && active && subSteps.length > 1 ? (
                <ol aria-label={t(step.titleKey)} className="basis-full space-y-1 pl-8 md:pl-10">
                  {subSteps.map(subStep => (
                    <li key={subStep.slug}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto justify-start px-1 py-1"
                        aria-current={subStep.slug === currentSlug ? 'page' : undefined}
                        onClick={() => onNavigate(subStep)}
                      >
                        <Text
                          element="span"
                          size="xs"
                          className={cn(
                            subStep.slug === currentSlug
                              ? 'text-[var(--bellum-text-accent)]'
                              : 'text-[var(--bellum-text-muted)]',
                          )}
                        >
                          {t(`stepper.substeps.${subStep.slug}`)}
                        </Text>
                      </Button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          )
        })}
      </ol>

      {/* #2087.27 — texte compact « Étape 3/7 », en plus de la liste ci-dessus
          (utile quand elle passe en ligne, < md). */}
      {!onReview && (
        <Text element="p" size="xs" weight="medium" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('stepper.stepOf', { current: stepNumber, total: ONBOARDING_RESULT_STEPS.length })}
        </Text>
      )}

      {!onReview && (
        <Text element="p" size="sm" weight="medium" className="mt-1 text-[var(--bellum-text-accent)]">
          {t('stepper.percentComplete', { percent: displayPercent })}
        </Text>
      )}

      {!onReview && (
        <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
          {t(activeStep.introKey)}
        </Text>
      )}

      {/* #2087.33 — « branchement adaptatif expliqué » : la moitié qui
          manquait. « La barre ne recule jamais » est déjà tenu par
          `clampProgressRegression` ci-dessus (#2023.6) — ce texte-ci explique
          juste POURQUOI le compte de questions peut baisser d'une réponse à
          l'autre, pour que ça ne se lise pas comme un bug. */}
      {!onReview && (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('stepper.adaptiveBranchingHint')}
        </Text>
      )}

      {!onReview && minutesRemaining != null && (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('stepper.minutesRemaining', { count: minutesRemaining })}
        </Text>
      )}
    </nav>
  )
}
