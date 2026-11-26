import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OnboardingStateResponse } from '@bellum/contracts'
import {
  EFFECTIF_FRESHNESS_ANSWER_KEYS,
  readEffectifFreshness,
  RESEAU_FRESHNESS_ANSWER_KEYS,
  readReseauFreshness,
  toolingMapKeysForConnectedTools,
  type EffectifFreshness,
  type ReseauFreshness,
} from '@bellum/contracts'
import { BrailleLoader, Button, MOTION, Progress, Text } from '@bellum/ui'
import { useOnboardingState, useSkipOnboarding } from '@/features/onboarding/hooks/useOnboarding'
import { useOnboardingNavigation } from '@/features/onboarding/hooks/useOnboardingNavigation'
import { useOnlineStatus } from '@/features/onboarding/hooks/useOnlineStatus'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { AnswersRecapDrawer } from '@/features/onboarding/components/AnswersRecapDrawer'
import { AwaitingAdminBanner } from '@/features/onboarding/components/AwaitingAdminBanner'
import { RedirectTo } from '@/components/navigation/RedirectTo'
import {
  AWAITING_SEQUENCE,
  awaitingView,
  firstAwaitingSubStep,
  isAwaitingAdmin,
} from '@/features/onboarding/lib/awaiting-admin'
import { InheritedProfileBanner } from '@/features/onboarding/components/InheritedProfileBanner'
import { OnboardingHelpCard } from '@/features/onboarding/components/OnboardingHelpCard'
import { OnboardingIntroCard } from '@/features/onboarding/components/OnboardingIntroCard'
import { OnboardingLauraGuide } from '@/features/onboarding/components/OnboardingLauraGuide'
import { OnboardingStageTransition, isStageEntry } from '@/features/onboarding/components/OnboardingStageTransition'
import { OnboardingStepper } from '@/features/onboarding/components/OnboardingStepper'
import { onboardingQuestionRevealId, SubStepQuestions } from '@/features/onboarding/components/SubStepQuestions'
import {
  choicesFromAnswerTags,
  findSubStep,
  TEMPS1_STAGES,
  TEMPS1_SUBSTEPS,
  visibleQuestions,
  type FlatSubStep,
  type Question,
} from '@/features/onboarding/lib/questions'
import { previousAnsweredQuestion } from '@/features/onboarding/lib/onboarding-previous-answer'
import { formatSavedAt } from '@/features/onboarding/lib/saved-at'
import { ONBOARDING_QUESTION_SCREEN, ONBOARDING_QUESTIONNAIRE_ACTION } from '@/features/onboarding/lib/tracking'
import { exceedsMax, isSatisfied, presentedValue } from '@/features/onboarding/lib/validation'
import { ProfileQuestionnaireDialog } from '@/features/onboarding/components/ProfileQuestionnaireDialog'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ReseauExternalReads } from '@/features/onboarding/components/ReseauExternalReads'
import { BrandMark } from '@/features/brand/BrandMark'
import { useBrand } from '@/features/brand/brand-context'
import { revealTarget } from '@/lib/reveal-target'
import { trackActionAbandoned, trackActionStarted } from '@/lib/product-tracker'

export function OnboardingWizard({ stageCode, slug }: { stageCode: string; slug: string }) {
  const { t } = useTranslation('onboarding')
  const { data: state, isLoading } = useOnboardingState()
  const hydrate = useOnboardingStore(s => s.hydrate)
  const found = findSubStep(stageCode, slug)
  // #4158.12 — un membre qui attend l'administrateur ne voit que ses questions
  // PERSONNELLES : la sous-étape est réduite à elles (`null` = sous-étape
  // d'entreprise, qui n'a rien à lui poser — il est renvoyé plus bas).
  const awaiting = isAwaitingAdmin(state)
  const sub = awaiting && found ? awaitingView(found) : found
  // #2084.15 — « réseau coupé » : distinct d'un appel qui échoue, la
  // connexion elle-même est absente. Sans ce bandeau, un formulaire rempli
  // hors ligne semblait juste bloqué au clic sur « Continuer ».
  const online = useOnlineStatus()
  // #2541 — LE conteneur qui défile réellement : `overflow-y-auto` vit ici,
  // pas sur `window` (voir `useOnboardingNavigation.ts`, `goTo`). Une
  // référence React, remise à zéro par le hook de navigation — pas un
  // sélecteur CSS, qui casserait au premier changement de mise en page.
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // #2087.19 — les étapes dont la transition a déjà été franchie (un clic).
  // Revenir en arrière dans une étape déjà ouverte ne la rejoue pas.
  const [enteredStages, setEnteredStages] = useState<ReadonlySet<number>>(() => new Set())

  // Seed the store from the persisted answers once they load (local edits win).
  useEffect(() => {
    if (state) hydrate(state.answers)
  }, [state, hydrate])

  if (state && awaiting && found && !sub) {
    // #4158.12 — une sous-étape d'entreprise (lien, rail, reprise) n'a rien à
    // poser à ce membre : on l'envoie sur sa première question personnelle.
    const entry = firstAwaitingSubStep()
    return <RedirectTo to={`/onboarding/${state.id}/${entry.stageCode}/${entry.slug}`} />
  }
  if (isLoading || !state || !sub) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }

  // #2087.19 / #2087.20 — un écran très court (titre, phrase de sens,
  // « Continuer ») à l'ENTRÉE de chaque étape, jamais au milieu.
  // #4158.12 — la séquence réduite n'a pas d'« entrée d'étape » à annoncer.
  const showTransition = !awaiting && isStageEntry(sub) && !enteredStages.has(sub.stageIndex)
  const progress = awaiting
    ? Math.round(((AWAITING_SEQUENCE.findIndex(step => step.index === sub.index) + 1) / AWAITING_SEQUENCE.length) * 100)
    : Math.round(((sub.index + 1) / TEMPS1_SUBSTEPS.length) * 100)

  // The progress bar lives here (not in WizardContent) so it persists across
  // sub-steps and its width animates smoothly between them.
  return (
    <div className="flex h-full flex-col bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)]">
      <Progress value={progress} size="sm" className="rounded-none" />

      <header className="px-4 md:px-6 py-6 sm:px-10">
        <BrandMark />
      </header>

      {!online && (
        <div
          role="status"
          className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] p-3 md:mx-6"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('offline.notice')}
          </Text>
        </div>
      )}

      {/* Deux comportements distincts vivent ici, et aucun ne remplace l'autre :
          · #2541 — `scrollContainerRef` désigne le conteneur qui DÉFILE vraiment,
            pour que passer à la salve suivante remonte en haut du formulaire et
            non de la fenêtre ;
          · #2021.10 — `MOTION.reveal` seul (GA-25) : la question CHANGE, elle
            n'arrive pas d'ailleurs. Aucun glissement, aucun rebond — le même
            vocabulaire que BrowsableDialog.tsx.
          La clé porte le fondu, donc elle reste sur `motion.div` : c'est lui qui
          se remonte à chaque sous-étape.
          · #2021.14 — mesuré en prod le 27/09 (fenêtre 861px) : une sous-étape
            courte (une question) restait collée en HAUT, laissant jusqu'à 40%
            de la fenêtre vide DESSOUS (nav, aside et colonne centrale). `flex
            min-h-full flex-col justify-center` centre le contenu quand il est
            plus court que la fenêtre — `min-height`, pas `height`, donc une
            sous-étape plus longue que la fenêtre déborde normalement, rien
            n'est coupé en haut. Même geste que `OnboardingStageTransition`
            (`min-h-[60dvh] flex-col justify-center`), en pourcentage ici
            puisque le parent est déjà borné par `flex-1` (jamais `vh`, GA-29). */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <motion.div
          key={showTransition ? `stage-${sub.stageIndex}` : sub.index}
          data-testid="onboarding-substep-transition"
          className="flex min-h-full flex-col justify-center"
          initial={MOTION.reveal.initial}
          animate={MOTION.reveal.animate}
          transition={MOTION.reveal.transition}
        >
          {showTransition ? (
            <OnboardingStageTransition
              stageIndex={sub.stageIndex}
              onContinue={() => setEnteredStages(prev => new Set(prev).add(sub.stageIndex))}
            />
          ) : (
            <WizardContent state={state} sub={sub} scrollContainerRef={scrollContainerRef} />
          )}
        </motion.div>
      </div>
    </div>
  )
}

function WizardContent({
  state,
  sub,
  scrollContainerRef,
}: {
  state: OnboardingStateResponse
  sub: FlatSubStep
  scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const { t, i18n } = useTranslation('onboarding')
  const navigate = useNavigate()
  // #2021.14 — un espace en marque blanche n'a jamais de carte de support
  // Bellum (#1960.20) et le guide de Laura ne parle QUE sur certains écrans
  // (#2020.12/.13) : combinés, la colonne d'aide de 300px restait
  // RÉSERVÉE, vide, sur la plupart des sous-étapes — le « grand espace
  // vide » mesuré au code. `isCustom` décide donc aussi de la GRILLE, pas
  // seulement du contenu de la carte.
  const { isCustom } = useBrand()
  const answers = useOnboardingStore(s => s.answers)
  const setAnswer = useOnboardingStore(s => s.setAnswer)
  const prefillMeta = useOnboardingStore(s => s.prefillMeta)
  const lastSavedAt = useOnboardingStore(s => s.lastSavedAt)
  const { pending, onContinue, onBack, onJump } = useOnboardingNavigation(state, sub, scrollContainerRef)
  // #2579.2 — « Quitter » rend la main, comme « Plus tard » (#2579.1,
  // `OnboardingWelcomePage.later`) : le MÊME geste (`skip.mutateAsync`), pas
  // un second — un réglage vit à un seul endroit (GA-26).
  const skip = useSkipOnboarding()

  /**
   * #2035.8 — l'effectif porte sa date, et redevient inconnu en vieillissant.
   * Dérivé ici (pas côté API) : le SEUIL peut changer côté contrat sans
   * nouvel aller-retour réseau. Ne garde QUE les bandes PÉRIMÉES — une bande
   * fraîche ou jamais répondue n'a rien à signaler, l'absence de badge EST
   * le signal (comme `helpKey`/`consequenceKey`, `SubStepQuestions.tsx`).
   */
  const effectifFreshness = useMemo(() => {
    const now = new Date()
    const result: Partial<Record<string, EffectifFreshness>> = {}
    for (const key of EFFECTIF_FRESHNESS_ANSWER_KEYS) {
      const freshness = readEffectifFreshness(state.effectif_observed_at?.[key] ?? null, now)
      if (freshness.state === 'stale') result[key] = freshness
    }
    return result
  }, [state.effectif_observed_at])

  /**
   * #2045.15 — un contact ancien n'est pas un accès actif : même mécanique
   * que `effectifFreshness` ci-dessus, MÊME colonne source
   * (`effectif_observed_at`, une map générique clé→date), seuil réseau
   * distinct (`readReseauFreshness`, 180j).
   */
  const reseauFreshness = useMemo(() => {
    const now = new Date()
    const result: Partial<Record<string, ReseauFreshness>> = {}
    for (const key of RESEAU_FRESHNESS_ANSWER_KEYS) {
      const freshness = readReseauFreshness(state.effectif_observed_at?.[key] ?? null, now)
      if (freshness.state === 'stale') result[key] = freshness
    }
    return result
  }, [state.effectif_observed_at])

  // #2054.19 — un maillon d'outillage BRANCHÉ (connexion réelle du registre,
  // jamais un littéral) retire « pas cet outil » de SA question, et de sa
  // seule question. `toolingMapKeysForConnectedTools` dit QUELS maillons une
  // connexion peut parler ; `resolveChoices` (posé question par question dans
  // `lib/questions/outillage*.ts`) applique cette lecture SANS jamais faire
  // disparaître la question elle-même (le contre-exemple LU au registre :
  // `!ctx.hasConnectedTooling` masquait la question ENTIÈRE, avant #2031.10).
  const { tools } = useConnectedCapabilities()
  const questionContext = useMemo(() => ({ connectedToolingMapKeys: toolingMapKeysForConnectedTools(tools) }), [tools])
  // #2023.5 — le branchement adaptatif s'applique ICI, en amont de tout le
  // reste : les questions non posées ne s'affichent pas, ne bloquent pas
  // « Continuer » et ne comptent pas dans « questions restantes ». `answers`
  // est dans les dépendances à dessein — c'est ce qui rend le branchement
  // vivant pendant la saisie, pas seulement à l'arrivée sur l'écran.
  const questions = useMemo<Question[]>(
    () =>
      visibleQuestions(sub.questions, answers).map(question => {
        if (question.kind === 'single' && question.resolveChoices) {
          return { ...question, choices: question.resolveChoices(questionContext) }
        }
        // #2039.6 (épopée #2880) — les choix d'une expertise DÉJÀ déclarée
        // par CETTE personne, ajoutés à la volée : `answers` est déjà lu ici
        // pour le branchement adaptatif (#2023.5), donc aucune nouvelle
        // dépendance n'est introduite.
        if (question.kind === 'multi' && question.dynamicChoicesFromAnswerKey) {
          const dynamic = choicesFromAnswerTags(answers[question.dynamicChoicesFromAnswerKey])
          return { ...question, choices: [...question.choices, ...dynamic] }
        }
        return question
      }),
    [sub.questions, questionContext, answers],
  )

  // #2021.11 — la réponse à LA question précédente immédiate, en ligne :
  // recalculée à chaque changement de sous-étape ou de réponses, comme
  // `questions` juste au-dessus (même dépendance sur `answers` pour rester
  // vivante pendant la saisie).
  const previousAnswer = useMemo(() => previousAnsweredQuestion(sub, answers, t), [sub, answers, t])

  // #2026.2 — « Enregistré à 14 h 32 » : l'autosauvegarde locale (#2026.1)
  // tournait déjà, sans rien montrer. `null` tant qu'aucune réponse n'a
  // encore été saisie dans cette sous-étape — jamais une heure inventée.
  const savedTime = formatSavedAt(lastSavedAt, i18n.language)

  const isFirst = sub.index === 0
  const showIntro = state.status === 'not_started' && sub.index === 0
  // #2059.7 — une question facultative (`optional: true`) n'exige jamais de
  // réponse pour avancer : `isSatisfied` porte ce contournement, `validate`
  // seul continuerait de bloquer « Continuer ».
  const isValid = questions.every(q => isSatisfied(q, presentedValue(q, answers[q.key])))
  // R15N-10 — « Continuer » désactivé par un DÉPASSEMENT de plafond (le texte
  // libre « Autre » compte dedans) le dit : un `title` au survol et un
  // `aria-describedby` vers le compteur en alerte de `QuestionField`, plutôt
  // qu'un bouton mort sans un mot d'explication.
  const overLimitQuestion = questions.find(q => exceedsMax(q, presentedValue(q, answers[q.key])))
  // #2577.1 — les questions VRAIMENT manquantes (jamais celles qui dépassent
  // le plafond : R15N-10 les explique déjà par `title`/`aria-describedby`,
  // leur donner AUSSI ce message dirait « répondre » à une question qui a
  // déjà une réponse — juste trop chargée).
  const missingQuestions = questions.filter(
    q => !isSatisfied(q, presentedValue(q, answers[q.key])) && !exceedsMax(q, presentedValue(q, answers[q.key])),
  )
  // #2577.1 — ⚠️ « Continuer » reste ACTIONNABLE même invalide (`aria-disabled`,
  // pas `disabled`) : un bouton natif `disabled` ne reçoit AUCUN `click` dans
  // un navigateur, c'est très exactement pourquoi le clic ne produisait rien
  // en production (#2577). Ce booléen ne pilote donc plus l'attribut
  // `disabled` du bouton, seulement `aria-disabled` + le curseur.
  const [showMissingFeedback, setShowMissingFeedback] = useState(false)
  // #3709 — les preuves (résultats, témoignages) s'ouvrent depuis le rail.
  const [proofsOpen, setProofsOpen] = useState(false)
  const handleContinueClick = (): void => {
    if (missingQuestions.length > 0) {
      setShowMissingFeedback(true)
      revealTarget(onboardingQuestionRevealId(missingQuestions[0].key))
      return
    }
    if (overLimitQuestion) return
    setShowMissingFeedback(false)
    void onContinue()
  }

  // #2085.3 — « questionnaire commencé » : l'arrivée sur la toute première
  // sous-étape d'un onboarding qui n'a PAS encore démarré, une fois. Un retour
  // ultérieur sur cette même sous-étape (`onBack`) ne retrouve plus
  // `state.status === 'not_started'` dès que la première réponse a été
  // enregistrée — pas de second départ compté pour le même questionnaire.
  useEffect(() => {
    if (showIntro) trackActionStarted(ONBOARDING_QUESTIONNAIRE_ACTION, ONBOARDING_QUESTION_SCREEN)
  }, [showIntro])

  // #2579.2 — « Quitter » rend la main, comme « Plus tard ». Mesuré le 18/09 :
  // Ludovic Marx paie depuis un mois sans avoir jamais atteint le produit, et
  // Louis s'est retrouvé enfermé sur son propre compte le 17/09 au soir. La
  // cause : un `<Link to="/briefing">` nu qui ne prévenait jamais le serveur
  // du report (`skipped_at` restait `null`), donc `needsOnboarding`
  // (`onboarding-gate.ts`) renvoyait aussitôt vers /onboarding sur tout compte
  // `refresh_required`. `skip` est ATTENDU avant de naviguer : partir tout de
  // suite relirait un cache pas encore à jour et recréerait la boucle — c'est
  // le même ordre que `later()` dans `OnboardingWelcomePage.tsx`. Un report qui
  // échoue ne doit pas non plus enfermer : `.catch(() => undefined)` laisse la
  // main partir quand même, comme pour « Plus tard ».
  const handleQuit = async (): Promise<void> => {
    trackActionAbandoned(ONBOARDING_QUESTIONNAIRE_ACTION, ONBOARDING_QUESTION_SCREEN, sub.slug)
    await skip.mutateAsync().catch(() => undefined)
    void navigate({ to: '/briefing' })
  }

  return (
    <div
      className={
        // #2021.14 — pas de troisième colonne fixe pour un espace en marque
        // blanche : elle n'a jamais rien d'autre à y montrer que le guide de
        // Laura, et lui ne parle pas sur la plupart des écrans.
        isCustom
          ? 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 md:px-6 pb-20 md:grid-cols-[220px_1fr]'
          : 'mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-4 md:px-6 pb-20 md:grid-cols-[220px_1fr_300px]'
      }
    >
      {/* #2021.7 — la progression n'est plus collée en haut sous `md` : elle se
          déroule EN LIGNE au-dessus des questions, et ne devient une colonne
          fixe qu'au moment où la grille en a une.
          #2021.19 — borne portée de `lg` (1 024 px) à `md` (768 px, GA-28) :
          une seule rupture pour tout le dépôt, desktop/tablette/mobile
          observent la même logique. */}
      <div data-testid="onboarding-stepper" className="md:sticky md:top-6 md:self-start">
        <OnboardingStepper
          currentStageIndex={sub.stageIndex}
          currentSlug={sub.slug}
          onNavigate={onJump}
          onOpenProofs={() => setProofsOpen(true)}
        />
        {proofsOpen && (
          <ProfileQuestionnaireDialog open={proofsOpen} onOpenChange={setProofsOpen} startAtKey="case_study_results" />
        )}
      </div>

      {/* #2021.1 — la colonne de questions est BORNÉE. Sous `md` la grille
          repasse à une colonne et cette colonne occupait toute la largeur de
          `max-w-6xl` : ~1 100 px, soit ~138 caractères par ligne, le double de
          la largeur de lecture (D81). Au-dessus de `md` la borne est inerte —
          la piste centrale de la grille y fait déjà ~500 px. */}
      <main className="w-full max-w-xl space-y-8">
        {/* #2018.6 — « Voici ce que ton équipe a déjà configuré. » : gagée sur
            `inherited_answer_keys` (jamais `isFirst`/`showIntro`, qui ne
            portent que le tout premier écran — un membre rejoignant un
            workspace configuré atterrit plus loin, directement sur sa
            première sous-étape PERSONNELLE via `firstPendingSubStep`). */}
        {/* #4158.12 — le membre qui attend l'administrateur : pourquoi son
            parcours est court, et ce qui s'enrichira quand l'ESN sera décrite. */}
        {state.awaiting_company_admin && <AwaitingAdminBanner adminName={state.awaiting_company_admin.admin_name} />}
        <InheritedProfileBanner inheritedKeys={state.inherited_answer_keys ?? []} />
        {showIntro && <OnboardingIntroCard />}
        {/* #2021.14 — même contenu qu'`OnboardingHelpCard` porterait dans la
            colonne latérale (retirée ci-dessus pour la marque blanche), mais
            dans le flux de la colonne des questions : jamais une `<aside>`
            vide, jamais une carte dupliquée. */}
        {isCustom && <OnboardingLauraGuide />}

        {/* #2021.5 — UNE barre d'actions, les deux boutons dedans, toujours
            rendus. Avant : « Continuer » était ABSENT tant que la réponse
            manquait et un second bouton, désactivé, vivait en BAS de la
            colonne — répondre faisait donc disparaître une cible du bas de
            l'écran pour en faire apparaître une autre en haut. « Retour »
            était à un TROISIÈME endroit, dans la colonne de gauche, sous le
            pli sur mobile. */}
        <div
          data-testid="onboarding-actions"
          className="sticky top-0 z-10 -mx-2 flex min-h-12 flex-wrap items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--bellum-bg)_92%,transparent)] px-2 py-2 backdrop-blur"
        >
          <div className="flex flex-col gap-0.5">
            <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-accent)]">
              {t(TEMPS1_STAGES[sub.stageIndex].title)}
            </Text>
            {savedTime && (
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]" data-testid="onboarding-saved-at">
                {t('autosave.savedAt', { time: savedTime })}
              </Text>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* #2021 — recette écran du 26/09 à 900px (prod `058db2c5`) : en
                `nowrap`, cette rangée débordait de sa colonne de grille
                (768-1024px) et chevauchait la carte d'aide de Laura de
                158,8px. `wrap` la fait passer à la ligne au lieu de déborder. */}
            {/* #2087.30 — accessible depuis N'IMPORTE QUELLE sous-étape, pas
                seulement la relecture finale (`/review`) : sauter vers une
                réponse déjà donnée PENDANT le parcours, sans y renoncer. */}
            <AnswersRecapDrawer onboardingId={state.id} answers={answers} />
            {/* #2026.3 — Quitter, à côté de Retour et Continuer : les
                sous-étapes déjà validées restent enregistrées côté serveur
                (#2026.1), donc quitter ne perd que la sous-étape en cours.
                `firstPendingSubStep` reprend exactement là au retour. */}
            {/* #2022.8 — « abandons PAR QUESTION » : le seul abandon que le
                produit sait observer sans deviner est celui qui se CLIQUE. Ce
                qui sort est le SLUG de la sous-étape (un identifiant d'écran,
                exactement comme `route` dans le reste du traceur) — jamais une
                réponse, jamais ce que la personne avait commencé à écrire,
                jamais qui elle est. Fermer l'onglet n'émet rien ici : le
                routeur émet déjà `screen_left` avec son mode de sortie, et
                inventer un second signal d'abandon sur ce chemin compterait
                deux fois le même départ. */}
            {/* Théo O onboarding-catalogue — le catalogue des 16 thèmes, à tout moment du parcours. */}
            <Button asChild variant="ghost" size="sm">
              <Link to="/onboarding/themes">{t('actions.themes')}</Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isLoading={skip.isPending}
              loadingText={t('common:states.saving')}
              onClick={() => void handleQuit()}
            >
              {t('actions.quit')}
            </Button>
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={ArrowLeft}
                iconPosition="left"
                disabled={pending}
                onClick={onBack}
              >
                {t('common:actions.back')}
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              isLoading={pending}
              loadingText={t('common:states.saving')}
              // #2577.2 — `aria-disabled`, jamais le seul `disabled` : un
              // bouton natif désactivé ne reçoit pas de `click`, donc plus
              // aucun moyen de dire CE QUI manque. `pending` (enregistrement
              // en cours) reste porté par `isLoading`, qui pose son propre
              // `disabled` natif — ce n'est pas le cas que #2577 corrige.
              aria-disabled={!isValid || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              title={overLimitQuestion ? t('questionField.continueDisabledOverLimit') : undefined}
              aria-describedby={overLimitQuestion ? `${overLimitQuestion.key}-selected-count` : undefined}
              onClick={handleContinueClick}
            >
              {t('common:actions.continue')}
            </Button>
          </div>
          {/* #2577.1 — au clic sur un bouton invalide, ce qui manque est DIT :
              une région annoncée (`role="status"`, `aria-live="polite"`) ET
              visible (pas seulement pour un lecteur d'écran) — le défaut
              mesuré était un clic qui ne produisait NI l'un NI l'autre. */}
          {showMissingFeedback && missingQuestions.length > 0 && (
            <Text
              role="status"
              aria-live="polite"
              element="p"
              size="xs"
              weight="medium"
              className="w-full basis-full text-[var(--warning-soft-text)]"
              data-testid="onboarding-continue-feedback"
            >
              {t('actions.continueMissing', { count: missingQuestions.length })}
            </Text>
          )}
        </div>

        <SubStepQuestions
          questions={questions}
          answers={answers}
          onChange={setAnswer}
          prefillMeta={prefillMeta}
          effectifFreshness={effectifFreshness}
          reseauFreshness={reseauFreshness}
          previousAnswer={previousAnswer}
        />
        {/* #2045.5 / #2045.8 / #2045.11 (épopée #2859) — les deux lectures
            externes (CRM, missions capitalisées) et le lien d'import
            ultérieur, propres à cette sous-étape : jamais un `Question.kind`
            de plus, voir `ReseauExternalReads`. */}
        {sub.slug === 'reseau-comptage' && <ReseauExternalReads />}
      </main>

      {/* #2021.14 — jamais rendue en marque blanche : elle n'a alors plus
          rien à montrer (contact Bellum retiré par #1960.20), le guide de
          Laura vit désormais dans la colonne des questions ci-dessus. */}
      {!isCustom && <OnboardingHelpCard />}
    </div>
  )
}
