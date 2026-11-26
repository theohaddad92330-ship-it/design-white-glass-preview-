import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { EsnAnswers, SaveAnswers } from '@bellum/contracts'
import {
  isProfileAnswerFilled,
  profileQuestionnaireProgress,
  roleFunctionsPracticedFromWorkspaceRole,
  summariseProfileUnderstanding,
  toolingChoicesFromConnectedTools,
} from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SettingsRow,
  Switch,
  Text,
} from '@bellum/ui'
import { Check, Sparkles } from 'lucide-react'
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import type { Question } from '@/features/onboarding/lib/questions'
import { buildProfileSteps, deferredProgress, toWebQuestion } from '@/features/onboarding/lib/profile-questions'
import { presentedValue } from '@/features/onboarding/lib/validation'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { useProfileComplement } from '@/features/onboarding/hooks/useProfileComplement'
import { esnProfileApi } from '@/features/profile/api'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** #3709 — ouvre le parcours directement sur cette question (ex. les
   *  résultats clients depuis le rail de reconfiguration). */
  startAtKey?: string
}

type AnswerValue = string | string[]

/**
 * Le profil commercial progressif — restitution V2 §21-30.
 *
 * 30 questions en 6 blocs de 4 à 6, chaque bloc annonçant ce qu'il améliore
 * AVANT de demander quoi que ce soit, et une synthèse finale « voici ce que
 * Bellum a compris » qui dit les conséquences concrètes.
 *
 * Non bloquant de bout en bout, comme le complément qu'il remplace : chaque
 * question se passe, le dialogue se ferme à tout moment, et ce qui a été répondu
 * est déjà enregistré (sauvegarde à chaque étape, pas à la fin).
 *
 * Le parcours est RECALCULÉ à chaque réponse : la logique conditionnelle du §28
 * vit dans le catalogue partagé, donc cocher « secteur public » fait apparaître
 * une question et « je travaille seul » en fait disparaître deux, sans que cet
 * écran ne connaisse une seule règle métier.
 */
export function ProfileQuestionnaireDialog({ open, onOpenChange, startAtKey }: Props) {
  const { t } = useTranslation('onboarding')
  const { data: onboarding } = useOnboardingState()
  const { finish, saveAnswer } = useProfileComplement()
  // #2007.11 — le bouton « passer » ne persistait RIEN : la question passée
  // n'atteignait jamais le moteur (`skipped_question_keys`, distinct
  // d'`answer_meta` qui suppose toujours une valeur). Mutation LOCALE, pas
  // ajoutée à `useProfileComplement` : aucun autre écran ne la consomme
  // aujourd'hui — un état vit à un seul endroit (GA-26), pas partagé sans
  // second lecteur.
  const skipQuestion = useMutation({ mutationFn: esnProfileApi.skipQuestion })
  const { tools } = useConnectedCapabilities()
  // #2031.3 — le rôle avec lequel la personne a été invitée dans l'espace
  // (`workspace_members.role`, lu par TOUT membre via `GET /workspaces/me` —
  // le chemin déjà emprunté par l'écran Équipe, on n'en ouvre pas un second).
  const { team } = useTeam()

  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Record<string, AnswerValue>>({})

  const stored = useMemo<Partial<EsnAnswers>>(() => onboarding?.answers ?? {}, [onboarding])
  // #2031.10 — ce que l'app sait déjà, CHAMP PAR CHAMP : chaque outil branché
  // retire SON choix de la question « équipement », jamais les 14 d'un coup
  // (§28 « éviter les questions déjà déductibles », pas celles qui ne le sont
  // pas). Les noms viennent de `connectedClientTools` (via `tools`), jamais
  // écrits en dur ici.
  const context = useMemo(
    () => ({
      connectedToolNames: toolingChoicesFromConnectedTools(tools),
      // #2031.3 — même principe : le rôle invité prérempli UNIQUEMENT les
      // fonctions qu'il porte réellement (voir `roleFunctionsPracticedFromWorkspaceRole`),
      // jamais un booléen qui masquerait la question `role_functions_practiced`.
      invitedRoleFunctions: roleFunctionsPracticedFromWorkspaceRole(team?.workspace.role ?? null),
    }),
    [tools, team],
  )
  // Le brouillon local prime : il porte la réponse en cours, celle qui peut
  // faire apparaître ou disparaître les questions suivantes.
  const answers = useMemo<Partial<EsnAnswers>>(() => ({ ...stored, ...draft }) as Partial<EsnAnswers>, [stored, draft])
  const steps = useMemo(() => buildProfileSteps(answers, context), [answers, context])
  const progress = useMemo(() => profileQuestionnaireProgress(answers, context), [answers, context])
  // #2626.1 — ce qui reste à affiner parmi les questions que le Temps 1 a
  // rendues. Un nombre de questions RESTANTES, mesuré ; il n'est affiché que
  // s'il y en a (GA-18/GA-19).
  const deferred = useMemo(() => deferredProgress(answers), [answers])

  // #3709 — saut initial vers `startAtKey`, UNE fois, quand le parcours est
  // calculé (les réponses stockées arrivent de façon asynchrone).
  const [jumped, setJumped] = useState(false)
  useEffect(() => {
    if (jumped || !startAtKey) return
    const target = steps.findIndex(
      s => (s.kind === 'deferred' || s.kind === 'question') && s.question.key === startAtKey,
    )
    if (target === -1) return
    setIndex(target)
    setJumped(true)
  }, [jumped, startAtKey, steps])

  const step = steps[Math.min(index, steps.length - 1)]
  if (!step) return null

  const goNext = (): void => setIndex(Math.min(index + 1, steps.length - 1))

  const close = (): void => {
    setIndex(0)
    onOpenChange(false)
  }

  if (step.kind === 'block-intro') {
    return (
      <Shell open={open} onOpenChange={onOpenChange} progress={progress}>
        <div className="space-y-3">
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t(`profileQuestions.blocks.${step.block}.title`)}
          </Text>
          {/* « Cela permettra à Bellum de mieux… » — la contrepartie annoncée
              AVANT l'effort, pas après. */}
          <div className="flex items-start gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t(`profileQuestions.blocks.${step.block}.promise`)}
            </Text>
          </div>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('profileQuestions.dialog.blockSize', { count: step.questionCount })}
          </Text>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="ghost" onClick={close}>
            {t('profileQuestions.dialog.later')}
          </Button>
          <Button onClick={goNext}>{t('profileQuestions.dialog.start')}</Button>
        </div>
      </Shell>
    )
  }

  // #2626.1 — l'entrée de la section « Ce qui reste à affiner » : les questions
  // que le Temps 1 a rendues pour tenir sa promesse des cinq minutes. Dite
  // comme un bloc, avec sa contrepartie annoncée AVANT l'effort, et un nombre
  // de questions RESTANTES — jamais un « 0 » à la place d'une valeur absente.
  if (step.kind === 'deferred-intro') {
    return (
      <Shell open={open} onOpenChange={onOpenChange} progress={progress}>
        <div className="space-y-3">
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('profileQuestions.deferred.title')}
          </Text>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('profileQuestions.deferred.promise')}
            </Text>
          </div>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('profileQuestions.deferred.remaining', { count: deferred.remaining })}
          </Text>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button variant="ghost" onClick={close}>
            {t('profileQuestions.dialog.later')}
          </Button>
          <Button onClick={goNext}>{t('profileQuestions.dialog.start')}</Button>
        </div>
      </Shell>
    )
  }

  if (step.kind === 'notifications') {
    return <NotificationsStep open={open} onOpenChange={onOpenChange} progress={progress} goNext={goNext} />
  }

  if (step.kind === 'summary') {
    const understanding = summariseProfileUnderstanding(answers)
    return (
      <Shell open={open} onOpenChange={onOpenChange} progress={progress}>
        <div className="space-y-3">
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('profileQuestions.summary.title')}
          </Text>
          {understanding.length === 0 ? (
            // Tout a été passé : on ne fabrique pas une synthèse de rien.
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('profileQuestions.summary.empty')}
            </Text>
          ) : (
            <ul className="space-y-2">
              {understanding.map(line => (
                <li key={line.id} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
                  <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t(`profileQuestions.summary.lines.${line.id}`, { values: line.values.join(', ') })}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('profileQuestions.summary.editable')}
          </Text>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => finish.mutate(undefined, { onSettled: close })} isLoading={finish.isPending}>
            {t('profileQuestions.dialog.done')}
          </Button>
        </div>
      </Shell>
    )
  }

  // #2626.1 — deux provenances, un seul rendu : une question du catalogue de
  // profil (convertie) ou une question REPORTÉE du Temps 1 (déjà une question
  // d'écran, libellés i18n compris — on ne la retraduit pas, on la repose).
  const profileQuestion = step.kind === 'question' ? step.question : null
  const webQuestion: Question = step.kind === 'question' ? toWebQuestion(step.question) : step.question
  const key = webQuestion.key as keyof EsnAnswers
  const storedAnswer = (stored[key] as AnswerValue | null) ?? null
  // #2031.3 — un préremplissage ne s'affiche QUE si rien n'est déjà répondu :
  // une correction humaine gagne toujours, quelle que soit sa date. Les
  // questions sans `prefillValue` (les 29 autres) gardent l'ancien
  // comportement à l'octet près : `prefill` reste vide.
  const prefill = isProfileAnswerFilled(storedAnswer) ? [] : (profileQuestion?.prefillValue?.(context) ?? [])
  const baseValue = prefill.length > 0 ? [...prefill] : storedAnswer
  const value = draft[key] ?? presentedValue(webQuestion, baseValue)
  const answered = Array.isArray(value) ? value.length > 0 : value.trim().length > 0

  const advance = (persist: boolean): void => {
    // #2031.3 — une suggestion acceptée SANS y toucher doit s'enregistrer
    // quand même : sinon « Suivant » sur un champ prérempli n'écrirait rien.
    const pending = draft[key] ?? (prefill.length > 0 ? ([...prefill] as AnswerValue) : undefined)
    // Une question passée n'écrase JAMAIS une réponse précédente par du vide.
    if (persist && pending !== undefined) {
      saveAnswer.mutate({ [key]: pending } as SaveAnswers)
    }
    goNext()
  }

  // #2007.11 — passer une question la note NOMMÉMENT (pas une absence muette
  // qui se lirait « pas encore répondu ») : le moteur doit pouvoir l'exclure
  // du dénominateur d'une couverture calculée, jamais la compter comme un
  // « zéro » (doctrine « non mesuré ≠ 0 »). UNIQUEMENT quand rien n'est
  // affiché (`!answered`) : passer une question déjà répondue (préremplie ou
  // stockée) ne doit jamais la faire ressortir comme « non évaluable » —
  // ce serait contredire sa propre valeur.
  const skip = (): void => {
    if (!answered) skipQuestion.mutate({ key })
    advance(false)
  }

  return (
    <Shell open={open} onOpenChange={onOpenChange} progress={progress}>
      <div className="space-y-5">
        <div className="space-y-2">
          <Text element="span" size="xs" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {step.kind === 'question'
              ? t(`profileQuestions.blocks.${step.block}.title`)
              : t('profileQuestions.deferred.title')}
          </Text>
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {step.kind === 'question' ? t(`profileQuestions.items.${webQuestion.key}.label`) : t(webQuestion.label)}
          </Text>
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {step.kind === 'question'
              ? t(`profileQuestions.items.${webQuestion.key}.subtitle`)
              : webQuestion.subtitle
                ? t(webQuestion.subtitle)
                : ''}
          </Text>
        </div>

        <QuestionField question={webQuestion} value={value} onChange={next => setDraft({ ...draft, [key]: next })} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={skip}>
          {t('profileQuestions.dialog.skip')}
        </Button>
        <Button onClick={() => advance(true)} disabled={!answered}>
          {t('profileQuestions.dialog.next')}
        </Button>
      </div>
    </Shell>
  )
}

/** L'enveloppe commune : titre, avancement réel, fermeture libre. */
function Shell({
  open,
  onOpenChange,
  progress,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  progress: { answered: number; total: number }
  children: React.ReactNode
}) {
  const { t } = useTranslation('onboarding')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('profileQuestions.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('profileQuestions.dialog.progress', { answered: progress.answered, total: progress.total })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * #2018.5 — la demande de notifications, dans le questionnaire.
 *
 * `useNotificationPreferences` est le MÊME hook que Réglages › Notifications
 * (`NotificationsView.tsx`) : chaque bascule écrit tout de suite via
 * `PATCH /notifications/preferences` (`notification_preferences`, la table qui
 * existe déjà), jamais `saveAnswer`/`esn_profiles` — un réglage vit à un seul
 * endroit (GA-26), et le chemin des Réglages continue de marcher à l'identique
 * après ce lot. Rien à « Suivant » ou « Passer » ne dépend d'une valeur
 * répondue : les deux avancent, l'écriture est déjà faite au clic sur
 * l'interrupteur.
 */
function NotificationsStep({
  open,
  onOpenChange,
  progress,
  goNext,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  progress: { answered: number; total: number }
  goNext: () => void
}) {
  const { t } = useTranslation('onboarding')
  // GA-235 — chemin COMPLET, jamais un `keyPrefix` : ce fichier a par ailleurs
  // un `t('common:…')` nu (`Shell` ci-dessus), et un `keyPrefix` neutraliserait
  // le `namespace:` de CET appel-là si les deux se retrouvaient dans le même
  // scope — la garde ne le distingue pas par fonction, elle le lit par
  // FICHIER. Même résultat rendu, un seul `t` par namespace.
  const { t: tNotif } = useTranslation('settings')
  const { preferences, setPreference } = useNotificationPreferences()

  const rows: { key: 'relance_reminders' | 'weekly_summary'; titleKey: string }[] = [
    { key: 'relance_reminders', titleKey: 'notifications.relanceRemindersTitle' },
    { key: 'weekly_summary', titleKey: 'notifications.weeklySummaryTitle' },
  ]

  return (
    <Shell open={open} onOpenChange={onOpenChange} progress={progress}>
      <div className="space-y-5">
        <div className="space-y-2">
          <Text element="h2" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('profileQuestions.notifications.title')}
          </Text>
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('profileQuestions.notifications.subtitle')}
          </Text>
        </div>
        <div className="space-y-3">
          {rows.map(row => (
            <SettingsRow
              key={row.key}
              title={tNotif(row.titleKey)}
              trailing={
                <Switch
                  aria-label={tNotif(row.titleKey)}
                  checked={preferences[row.key]}
                  onCheckedChange={checked => setPreference(row.key, checked)}
                />
              }
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={goNext}>
          {t('profileQuestions.dialog.skip')}
        </Button>
        <Button onClick={goNext}>{t('profileQuestions.dialog.next')}</Button>
      </div>
    </Shell>
  )
}
