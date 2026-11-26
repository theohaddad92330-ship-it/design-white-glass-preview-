import { useRef } from 'react'
import { Clock, HelpCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  coverageModeOf,
  proposeActivityNoteFacts,
  needsPriorityWarning,
  RESEAU_FRESHNESS_ANSWER_KEYS,
  UNKNOWN_ANSWER_LABELS,
  UNKNOWN_ANSWER_REASONS,
  unknownAnswerReasonOf,
  type EffectifFreshness,
  type ReseauFreshness,
  type UnknownAnswerReason,
} from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { PrefillBadge } from '@/features/onboarding/components/PrefillBadge'
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import type { Question } from '@/features/onboarding/lib/questions'
import { QUESTION_CONSEQUENCE_KEY } from '@/features/onboarding/lib/question-consequences'
import { QUESTION_HELP_KEY } from '@/features/onboarding/lib/question-help'
import { ONBOARDING_QUESTION_SCREEN } from '@/features/onboarding/lib/tracking'
import { emptyFor, presentedValue, validate } from '@/features/onboarding/lib/validation'
import { trackPrefillReviewed } from '@/lib/product-tracker'
import { revealTargetProps } from '@/lib/reveal-target'
import type {
  OnboardingAnswers,
  OnboardingAnswerValue,
  OnboardingPrefillMeta,
  PrefillFieldMeta,
} from '@/stores/onboardingStore'

type Props = {
  questions: Question[]
  answers: OnboardingAnswers
  onChange: (key: string, value: OnboardingAnswerValue) => void
  /** Provenance of the answers still holding their prefilled value (badges).
   *  Absent for a manually-filled onboarding — the historical rendering. */
  prefillMeta?: OnboardingPrefillMeta
  /**
   * #2035.8 — les bandes d'effectif PÉRIMÉES (déjà filtrées sur `state ===
   * 'stale'` par l'appelant), clé → sa fraîcheur. Absent = comportement
   * historique à l'octet près, comme `prefillMeta`.
   */
  effectifFreshness?: Partial<Record<string, EffectifFreshness>>
  /**
   * #2045.15 — même contrat que `effectifFreshness`, pour le réseau personnel
   * déclaré (`reseau-comptage`). Map séparée plutôt qu'un seul type union :
   * les deux familles ont chacune leur seuil et ne se confondent jamais à
   * l'écran (badge, testid et clé i18n distincts).
   */
  reseauFreshness?: Partial<Record<string, ReseauFreshness>>
  /**
   * #2021.11 — la dernière question VISIBLE et RÉPONDUE avant la sous-étape
   * courante (`previousAnsweredQuestion`, calculée par l'appelant qui seul
   * connaît `sub.index`). `null`/absent = rien avant (première sous-étape,
   * ou aucune réponse plus haut) : pas de ligne, jamais un placeholder.
   */
  previousAnswer?: { labelKey: string; value: string } | null
}

/**
 * #2577.1 — le chemin entre « il manque N questions » et la question elle-même.
 * Un seul endroit fabrique cet identifiant (GA-26) : `OnboardingWizard` (le
 * clic sur « Continuer ») et `SubStepQuestions` (la carte qui le porte) le
 * lisent tous les deux ICI plutôt que de recopier le gabarit chacun de son
 * côté.
 */
export function onboardingQuestionRevealId(questionKey: string): string {
  return `onboarding-question-${questionKey}`
}

export function SubStepQuestions({
  questions,
  answers,
  onChange,
  prefillMeta,
  effectifFreshness,
  reseauFreshness,
  previousAnswer,
}: Props) {
  return (
    <div className="space-y-10">
      {/* #2021.11 — la réponse à LA question précédente immédiate, relisible
          en ligne sans ouvrir `AnswersRecapDrawer` (#2087.30, qui sert à
          SAUTER vers une réponse plus ancienne). Absente = rien avant : pas
          de ligne, jamais un placeholder (« non mesuré n'est jamais 0 »). */}
      <PreviousAnswerRecap previousAnswer={previousAnswer} />
      {/* #2087.29 — « questions restantes DANS l'étape », lues sur les MÊMES
          réponses que le bouton Continuer (`validate`, lecture seule — ce
          composant ne le modifie pas), jamais un second calcul qui pourrait
          diverger (GA-26). Masqué à zéro restante : pas un "0 questions
          restantes" qui redirait ce que Continuer dit déjà.
          #2088.33 — `prefillMeta` en plus : une valeur SEULEMENT proposée
          (jamais confirmée ni corrigée) sort du dénominateur, comme partout
          ailleurs où ce dépôt compte des réponses. */}
      <RemainingQuestionsCount questions={questions} answers={answers} prefillMeta={prefillMeta} />
      {questions.map(question => (
        <QuestionRow
          key={question.key}
          question={question}
          answers={answers}
          onChange={onChange}
          meta={prefillMeta?.[question.key]}
          freshness={effectifFreshness?.[question.key]}
          reseauFreshness={reseauFreshness?.[question.key]}
        />
      ))}
    </div>
  )
}

/** #2021.11 — une ligne compacte, pas un second tiroir (`AnswersRecapDrawer` existe déjà pour sauter en arrière). */
function PreviousAnswerRecap({ previousAnswer }: { previousAnswer?: { labelKey: string; value: string } | null }) {
  const { t } = useTranslation('onboarding')
  if (!previousAnswer) return null

  return (
    <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
      {t('substep.previousAnswer', { label: t(previousAnswer.labelKey), value: previousAnswer.value })}
    </Text>
  )
}

function RemainingQuestionsCount({
  questions,
  answers,
  prefillMeta,
}: {
  questions: Question[]
  answers: OnboardingAnswers
  /** #2088.33 — une clé encore présente ici n'a reçu aucun geste humain :
   *  additif, optionnel (comportement historique inchangé si absent). */
  prefillMeta?: OnboardingPrefillMeta
}) {
  const { t } = useTranslation('onboarding')
  if (questions.length <= 1) return null // une seule question : le titre suffit, un compteur à « 1 » ne dit rien de plus.

  const remaining = questions.filter(
    q => prefillMeta?.[q.key] !== undefined || !validate(q, presentedValue(q, answers[q.key])),
  ).length
  if (remaining === 0) return null

  return (
    <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
      {t('substep.questionsRemaining', { count: remaining })}
    </Text>
  )
}

/**
 * Une question : son titre, son sous-titre, la provenance de sa valeur si elle
 * a été devinée, le champ, et ce qu'une ESN généraliste doit lire dessous.
 *
 * Extraite de la boucle pour une raison précise (#2028.3) : « Corriger » doit
 * rendre la main sur LE champ de CETTE question, ce qui demande une référence
 * par question — donc un composant par question, pas un `useRef` dans une
 * boucle.
 */
function QuestionRow({
  question,
  answers,
  onChange,
  meta,
  freshness,
  reseauFreshness,
}: {
  question: Question
  answers: OnboardingAnswers
  onChange: (key: string, value: OnboardingAnswerValue) => void
  meta?: PrefillFieldMeta
  /** #2035.8 — présent UNIQUEMENT quand cette bande d'effectif est PÉRIMÉE
   *  (l'appelant a déjà filtré `state === 'stale'`). */
  freshness?: EffectifFreshness
  /** #2045.15 — même contrat, pour une bande de réseau personnel PÉRIMÉE. */
  reseauFreshness?: ReseauFreshness
}) {
  const { t } = useTranslation('onboarding')
  const fieldRef = useRef<HTMLDivElement>(null)
  const value = presentedValue(question, answers[question.key])
  const consequenceKey = QUESTION_CONSEQUENCE_KEY[question.key]
  const helpKey = QUESTION_HELP_KEY[question.key]

  // #2028.3 — « Corriger » ne change RIEN : il déplace le focus dans le champ.
  // Le badge reste tant que la réponse n'a pas bougé, parce qu'elle est encore
  // une suggestion ; c'est `setAnswer` qui retire la provenance sur une vraie
  // édition, et « Confirmer » qui en fait la réponse de l'utilisateur.
  const focusField = (): void => {
    fieldRef.current?.querySelector<HTMLElement>('input, textarea, button, [tabindex]:not([tabindex="-1"])')?.focus()
  }

  return (
    <div className="space-y-3" {...revealTargetProps(onboardingQuestionRevealId(question.key))}>
      <div className="space-y-1">
        <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t(question.label, 'max' in question ? { max: question.max } : undefined)}
        </Text>
        {question.subtitle && (
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(question.subtitle, 'max' in question ? { max: question.max } : undefined)}
          </Text>
        )}
        {/* #2024.10 / #2025.1 — la conséquence de la réponse, à côté de la
            question : ce que {{brand}} en fait RÉELLEMENT (voir
            `lib/question-consequences.ts`), jamais une promesse de résultat,
            un pourcentage ou une probabilité. */}
        {consequenceKey && (
          <Text element="p" size="xs" className="flex items-start gap-1.5 text-[var(--bellum-text-secondary)]">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t(consequenceKey)}</span>
          </Text>
        )}
        {/* #2087.24 — l'aide À RÉPONDRE, distincte de la conséquence
            ci-dessus (ce que ça change) et de `RationaleDisclosure`
            (pourquoi on la pose, repliée par défaut) : toujours VISIBLE,
            jamais un troisième bouton à déplier. Une icône différente
            (`HelpCircle`) pour ne pas se lire comme la même chose que la
            conséquence au premier coup d'œil. */}
        {helpKey && (
          <Text element="p" size="xs" className="flex items-start gap-1.5 text-[var(--bellum-text-muted)]">
            <HelpCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t(helpKey)}</span>
          </Text>
        )}
        {/* #2035.8 / #2045.15 — un fait périmé redevient inconnu AVEC SA
            DATE, il ne disparaît pas : cette bande a une réponse, mais elle
            a vieilli au-delà de SON seuil (`EFFECTIF_FRESHNESS_STALE_AFTER_DAYS`
            90j, ou `RESEAU_FRESHNESS_STALE_AFTER_DAYS` 180j pour un contact —
            « un contact ancien n'est pas un accès actif ») — le signal
            invite à la revérifier, il ne l'efface pas. Le TEXTE distingue les
            deux familles : un même mot pour un effectif de consultants et un
            contact réseau mentirait sur la raison de revérifier. */}
        {freshness && freshness.ageDays !== null && (
          <Text
            element="p"
            size="xs"
            className="flex items-start gap-1.5 text-[var(--warning-soft-text)]"
            data-testid="effectif-freshness-stale"
          >
            <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t(
                (RESEAU_FRESHNESS_ANSWER_KEYS as readonly string[]).includes(question.key)
                  ? 'substep.reseauStale'
                  : 'substep.effectifStale',
                { count: freshness.ageDays },
              )}
            </span>
          </Text>
        )}
        {/* #2045.15 — même doctrine, pour le réseau personnel déclaré : un
            fait périmé redevient inconnu AVEC SA DATE, il ne disparaît pas.
            Seuil et texte distincts de l'effectif ci-dessus
            (`RESEAU_FRESHNESS_STALE_AFTER_DAYS`, 180j — un réseau personnel
            bouge plus lentement qu'un effectif de consultants). */}
        {reseauFreshness && reseauFreshness.ageDays !== null && (
          <Text
            element="p"
            size="xs"
            className="flex items-start gap-1.5 text-[var(--warning-soft-text)]"
            data-testid="reseau-freshness-stale"
          >
            <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('substep.reseauStale', { count: reseauFreshness.ageDays })}</span>
          </Text>
        )}
      </div>

      {meta && (
        <PrefillBadge
          meta={meta}
          onConfirm={() => {
            // #2085.19 — la suggestion devient la réponse telle quelle.
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'confirmed')
            onChange(question.key, value)
          }}
          onCorrect={() => {
            // #2085.20 — le focus va au champ ; la VALEUR corrigée, elle,
            // n'est jamais lue ici (`setAnswer` ordinaire ensuite).
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'corrected')
            focusField()
          }}
          onIgnore={() => {
            // #2085.5 — la suggestion est rejetée plutôt que corrigée.
            trackPrefillReviewed(ONBOARDING_QUESTION_SCREEN, 'ignored')
            onChange(question.key, emptyFor(question))
          }}
        />
      )}

      <div ref={fieldRef}>
        {/* #2024.3 — les réponses déjà données descendent ici : c'est d'elles,
            et d'elles seules, qu'une recommandation peut se fonder. */}
        <QuestionField
          question={question}
          value={value}
          onChange={next => onChange(question.key, next)}
          answers={answers}
        />
      </div>
      {/* #2027.1 — quatre états d'incertitude, distincts d'une absence de
          réponse : n'apparaît QUE sur les questions marquées `allowUnknown`
          (décision de contenu, pas une case cochée sur tout le questionnaire). */}
      {question.allowUnknown && typeof value === 'string' && (
        <UnknownAnswerChoices
          value={value}
          onSelect={reason => onChange(question.key, UNKNOWN_ANSWER_LABELS[reason])}
        />
      )}
      <CoverageHint questionKey={question.key} answers={answers} />
      {question.key === 'uncovered_activity_note' && typeof value === 'string' && <ActivityNoteFacts note={value} />}
    </div>
  )
}

/**
 * #4016 L13b (DÉCISION LOUIS 11/10/2026, renverse en partie #2060.10) — la note
 * libre découpée en faits, TOUS « à revoir ». Les phrases sont reprises
 * TEXTUELLEMENT (`proposeActivityNoteFacts`, mécanique, zéro modèle) ; aucune
 * n'est présentée comme un fait certain, et la note reste ton texte. Une note
 * vide ne fait aucune ligne.
 */
function ActivityNoteFacts({ note }: { note: string }) {
  const { t } = useTranslation('onboarding')
  const facts = proposeActivityNoteFacts(note)
  if (facts.length === 0) return null
  return (
    <div className="space-y-1.5" data-testid="activity-note-facts">
      <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('activityNoteFacts.title')}
      </Text>
      <ul aria-label={t('activityNoteFacts.listLabel')} className="space-y-1">
        {facts.map(fact => (
          <li key={fact.id} className="flex items-start gap-2">
            <Text element="span" size="sm" className="text-[var(--bellum-text-primary)]">
              {fact.text}
            </Text>
            <Text element="span" size="xs" className="shrink-0 text-[var(--warning-soft-text)]">
              {t('activityNoteFacts.toReview')}
            </Text>
          </li>
        ))}
      </ul>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('activityNoteFacts.hint')}
      </Text>
    </div>
  )
}

const UNKNOWN_ANSWER_I18N_KEY: Record<UnknownAnswerReason, string> = {
  not_yet_known: 'unknownAnswer.notYetKnown',
  not_applicable: 'unknownAnswer.notApplicable',
  to_verify_with_team: 'unknownAnswer.toVerifyWithTeam',
  answer_later: 'unknownAnswer.answerLater',
}

/**
 * #2027.1 / #2027.2 — les quatre boutons d'incertitude. Cliquer en choisit
 * UN, qui PERSISTE (même canal qu'une réponse réelle, `onSelect` appelle le
 * même `onChange` que `QuestionField`) — jamais un état local qui se perdrait
 * au rafraîchissement. Le bouton actif reste visuellement DISTINCT (`aria-pressed`)
 * de la réponse mesurée : ni « faux », ni un choix parmi d'autres.
 */
export function UnknownAnswerChoices({
  value,
  onSelect,
}: {
  value: string
  onSelect: (reason: UnknownAnswerReason) => void
}) {
  const { t } = useTranslation('onboarding')
  const currentReason = unknownAnswerReasonOf(value)

  return (
    <div className="space-y-1.5">
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('unknownAnswer.prompt')}
      </Text>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('unknownAnswer.prompt')}>
        {UNKNOWN_ANSWER_REASONS.map(reason => (
          <Button
            key={reason}
            type="button"
            size="sm"
            variant={currentReason === reason ? 'secondary' : 'outline'}
            aria-pressed={currentReason === reason}
            onClick={() => onSelect(reason)}
          >
            {t(UNKNOWN_ANSWER_I18N_KEY[reason])}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * Ce qu'une ESN GÉNÉRALISTE doit lire sous la question des expertises (ONB-03).
 *
 * Le rapport terrain : « une ESN généraliste ne peut pas déclarer toute sa
 * couverture », et son réflexe est de vouloir tout cocher. Sauf que « tout
 * afficher » n'est pas « tout prioriser » : un profil qui confond les deux
 * dilue les prompts, les contacts et le score, et le généraliste obtient alors
 * de MOINS bonnes recommandations que le spécialiste — l'inverse exact de ce
 * qu'il attend en cochant plus de cases.
 *
 * Deux messages, jamais bloquants : ce que ces cinq cases veulent dire pour lui,
 * et un avertissement s'il n'en a coché aucune. Le positionnement est déjà
 * répondu à ce stade (il précède les expertises dans le questionnaire) ; s'il ne
 * l'est pas, rien ne s'affiche plutôt qu'un conseil au hasard.
 */
function CoverageHint({ questionKey, answers }: { questionKey: string; answers: OnboardingAnswers }) {
  const { t } = useTranslation('onboarding')
  if (questionKey !== 'expertise_areas') return null

  const positioning = typeof answers.positioning === 'string' ? answers.positioning : null
  if (coverageModeOf(positioning) !== 'generalist') return null

  const chosen = Array.isArray(answers.expertise_areas) ? answers.expertise_areas : []
  const warn = needsPriorityWarning({ positioning, expertise_areas: chosen as string[] })

  return (
    <Text
      element="p"
      size="sm"
      role={warn ? 'alert' : undefined}
      className={warn ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-secondary)]'}
    >
      {t(warn ? 'coverage.generalistWarning' : 'coverage.generalistHint')}
    </Text>
  )
}
