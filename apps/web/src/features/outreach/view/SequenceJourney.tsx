import {
  AUTOMATION_PREPARED_ACTIONS,
  AUTOMATION_SIGNALS,
  AUTOMATION_SIGNAL_SOURCES,
  OUTREACH_PLAYBOOK_KEYS,
  type OutreachStepKind,
} from '@bellum/contracts'
import { Badge, Box, Button, EntityAvatar, Input, SelectField, Text, cn } from '@bellum/ui'
import { Bookmark, Check, ChevronLeft, Info, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateAutomationRule } from '@/features/automations/api'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useMailboxStatus } from '@/features/mailbox/api'
import { useDebounce } from '@/hooks/useDebounce'
import { useJourneyDrafts } from '../hooks/useJourneyDrafts'
import {
  JOURNEY_OBJECTIVES,
  journeyCadence,
  journeyCanContinue,
  journeyLaunchRequest,
  journeyRuleRequest,
  journeySteps,
  reduceJourney,
  type JourneyContact,
  type JourneyState,
} from '../sequence-journey'
import { JourneyExclusions, JourneyImportMenu } from './JourneyAudienceTools'
import { JourneyMessages, type JourneyMessagesStore } from './JourneyMessages'
import { AudienceBuilderBlock } from './AudienceBuilderBlock'
import { SequencesPageHead } from './SequencesPageHead'

/**
 * `.choice-card` — une carte pleine largeur : un rond (coché = accent), le titre, une phrase. C'est un vrai bouton
 * radio (clavier, lecteur d'écran) habillé en carte ; la carte entière se clique.
 */
function Choice({
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string
  checked: boolean
  onChange: () => void
  title: string
  hint?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-card border p-4 text-left pointer-coarse:min-h-11 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--bellum-primary-400)]',
        checked
          ? 'border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)]'
          : 'border-[var(--bellum-border)] hover:border-[var(--bellum-text-accent)]',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]"
      >
        {checked ? <Check className="size-3.5" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <Text element="span" size="sm" weight="semibold">
          {title}
        </Text>
        {hint ? (
          <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
            {hint}
          </Text>
        ) : null}
      </span>
    </label>
  )
}

/**
 * L'ASSISTANT « CRÉER UNE SÉQUENCE » — quatre étapes, un écran par étape : Audience · Objectif · Messages ·
 * Vérification (Théo C sequences-assistant.R1, décision Louis 22/10/2026).
 *
 * Il part d'une AUDIENCE multi-contacts (`c131_sequence_audience_multi_contacts`, ⚠️ renverse c74) ; la colonne
 * « Ta séquence » reste visible à chaque étape (N2), sous le contenu sur mobile. L'état vit dans
 * `reduceJourney` (pur, testé) : « Retour » ne défait jamais un choix, et « Quitter et conserver » (N3) range
 * le brouillon pour le reprendre.
 *
 * Ce que l'assistant ne refait PAS : la dernière vérification d'une séquence « maintenant » (doublons,
 * exclusions à l'inscription, RGPD, collègue, brouillon préparé, import d'une liste) reste celle de
 * `CreateSequenceDialog`, ouverte pré-remplie par `onLaunchManual` — jamais une seconde copie de ces gardes.
 * Le départ « quand un signal arrive » écrit la règle par la même requête que l'ancien constructeur
 * (`journeyRuleRequest`) : le moteur est commun (c128), elle naît éteinte, dans l'onglet Automatisations.
 */
export function SequenceJourney({
  initial,
  onLaunchManual,
  onSaveDraft,
  onClose,
}: {
  initial: JourneyState
  onLaunchManual: (request: ReturnType<typeof journeyLaunchRequest>) => void
  onSaveDraft: (state: JourneyState) => void
  onClose: () => void
}) {
  const { t } = useTranslation('outreach')
  const { t: tActions } = useTranslation('actions')
  const [state, dispatch] = useReducer(reduceJourney, initial)
  const [confirmed, setConfirmed] = useState(false)
  const createRule = useCreateAutomationRule()
  const { data: mailbox } = useMailboxStatus()
  const steps = journeySteps()
  const position = steps.indexOf(state.step) + 1
  const headingRef = useRef<HTMLElement | null>(null)

  // Un écran par étape : le focus suit le titre de l'écran neuf (lecteur d'écran, clavier).
  useEffect(() => {
    headingRef.current?.focus()
  }, [state.step])

  const signalText = (signal: (typeof AUTOMATION_SIGNALS)[number], days: string) =>
    tActions(`automations.signal.${signal}`, { days: days || 'N' })
  const playbookName = t(`playbooks.trigger.${state.playbook}.name`)
  const signal = state.trigger === 'signal'
  const cadence = journeyCadence(state)

  // Les messages rédigés par Laura vivent ICI, pas dans l'étape : y revenir ne redemande rien et ne perd aucune retouche.
  const previewable = useMemo(() => [...state.contacts.values()].filter(contact => contact.email), [state.contacts])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = previewable.find(contact => contact.id === previewId) ?? previewable[0] ?? null
  const objectiveTitle = t(`journey.objective.${state.objective}.title`)
  const contextOf = (index: number): string =>
    index === 0
      ? t('journey.messages.contextFirst', { objective: objectiveTitle })
      : t('journey.messages.contextFollowUp', { n: index, objective: objectiveTitle })
  const draftStore = useJourneyDrafts({
    enabled: state.step === 'messages' && !signal,
    contactId: preview?.id ?? null,
    requests: cadence.flatMap((step, index) => (step.kind === 'email' ? [{ index, context: contextOf(index) }] : [])),
  })
  const messagesStore: JourneyMessagesStore = {
    previewable,
    preview,
    choosePreview: setPreviewId,
    drafts: draftStore.drafts,
    edit: draftStore.edit,
    regenerate: draftStore.regenerate,
    contextOf,
  }

  const activate = () =>
    createRule.mutate(journeyRuleRequest(state), {
      onSuccess: () => {
        toast.success(t('journey.signalCreated'))
        onClose()
      },
      onError: error => toast.error(error.message),
    })

  const footer = (primary: React.ReactNode) => (
    // `.wizard-footer` — [Annuler | Précédent] · « Étape N sur 4 » · [Continuer | Enregistrer], sous un filet.
    <Box className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-5">
      <Button
        type="button"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => (state.step === 'audience' ? onClose() : dispatch({ type: 'back' }))}
      >
        {state.step === 'audience' ? null : <ChevronLeft className="size-4" aria-hidden="true" />}
        {state.step === 'audience' ? t('journey.cancel') : t('journey.previous')}
      </Button>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('journey.progress', { current: position, total: steps.length })}
      </Text>
      {primary}
    </Box>
  )

  return (
    <Box className="flex w-full flex-col gap-6" data-testid="sequence-journey">
      {/* `.page-head` — « Créer une séquence », une phrase, [Quitter et conserver]. */}
      <SequencesPageHead
        title={t('journey.heading')}
        subtitle={t('journey.subtitle')}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => onSaveDraft(state)}
          >
            <Bookmark className="size-4" aria-hidden="true" />
            {t('journey.saveDraft')}
          </Button>
        }
      />

      {/* `.stepper` — quatre étapes numérotées reliées par un filet ; la courante en accent, les faites cochées. Le fil
          se clique : on revient d'un clic, on avance seulement si les étapes d'avant sont répondues (`goTo`). */}
      <nav
        aria-label={t('journey.stepsLabel')}
        className="overflow-x-auto overscroll-x-contain"
        data-testid="journey-stepper"
      >
        <ol className="flex min-w-max list-none items-start gap-2 p-0 md:min-w-0">
          {steps.map((step, index) => {
            const current = step === state.step
            const done = index < position - 1
            return (
              <li key={step} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
                <button
                  type="button"
                  aria-label={`${index + 1}. ${t(`journey.steps.${step}`)}`}
                  onClick={() => dispatch({ type: 'goTo', step })}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-control py-2 text-sm',
                    current
                      ? 'font-semibold text-[var(--bellum-text-accent)]'
                      : done
                        ? 'text-[var(--bellum-text-primary)]'
                        : 'text-[var(--bellum-text-muted)]',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full border text-xs',
                      current
                        ? 'border-[var(--bellum-primary)] bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)]'
                        : done
                          ? 'border-transparent bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
                          : 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)]',
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  {t(`journey.steps.${step}`)}
                </button>
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-[var(--bellum-border)] md:block" />
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* `.wizard-grid` — l'étape à gauche, « Ta séquence » à droite (285 px) ; dessous sur mobile, jamais cachée. */}
      <Box className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-labelledby="journey-step-title"
          data-testid="journey-step"
        >
          <Box className="flex flex-col gap-1.5">
            <Text
              element="h2"
              id="journey-step-title"
              size="2xl"
              weight="semibold"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              {t(`journey.title.${state.step}`)}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {state.step === 'audience'
                ? t('journey.audience.help')
                : state.step === 'objective'
                  ? t('journey.objective.help')
                  : state.step === 'messages'
                    ? signal
                      ? state.prepared
                        ? t('journey.messages.preparedHelp')
                        : t('journey.messages.signalHelp', { sequence: playbookName })
                      : state.objective === 'prepared_only'
                        ? t('journey.messages.preparedHelp')
                        : t('journey.messages.help')
                    : t('journey.review.help')}
            </Text>
          </Box>

          {state.step === 'audience' ? (
            <>
              {/* Théo C sequences-assistant.A1 — « Quand démarrer » en tête de l'audience, en contrôle segmenté. Le départ
                  sur signal fait de la séquence une automatisation (même moteur, c128) ; elle naît éteinte. */}
              <Box className="flex flex-col gap-2">
                <Text
                  element="span"
                  size="xs"
                  weight="medium"
                  className="text-[var(--bellum-text-secondary)]"
                  id="journey-trigger-label"
                >
                  {t('journey.trigger.legend')}
                </Text>
                <Box
                  role="group"
                  aria-labelledby="journey-trigger-label"
                  className="flex w-full flex-wrap gap-0.5 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1 sm:inline-flex sm:w-fit"
                >
                  {(['manual', 'signal'] as const).map(trigger => (
                    <button
                      key={trigger}
                      type="button"
                      aria-pressed={state.trigger === trigger}
                      title={t(`journey.trigger.${trigger}`)}
                      onClick={() => dispatch({ type: 'chooseTrigger', trigger })}
                      className={cn(
                        'min-h-10 flex-1 rounded-md px-3.5 text-sm font-semibold pointer-coarse:min-h-11',
                        state.trigger === trigger
                          ? 'bg-[var(--accent-soft-bg)] text-[var(--bellum-text-primary)]'
                          : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
                      )}
                    >
                      {t(`journey.trigger.${trigger}Short`)}
                    </button>
                  ))}
                </Box>
                {signal ? (
                  <Box
                    className="flex flex-col gap-3 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-4"
                    data-testid="journey-signal-notice"
                  >
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      <strong className="text-[var(--bellum-text-primary)]">{t('journey.signal.becomes')}</strong>{' '}
                      {t('journey.signal.becomesBody')}
                    </Text>
                    <Box className="flex flex-col gap-1">
                      <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t('journey.signal.start')}
                      </Text>
                      <SelectField
                        ariaLabel={t('journey.signal.start')}
                        value={state.signal}
                        onChange={next => {
                          const candidate = AUTOMATION_SIGNALS.find(value => value === next)
                          if (candidate) dispatch({ type: 'chooseSignal', signal: candidate })
                        }}
                        options={AUTOMATION_SIGNALS.map(candidate => ({
                          value: candidate,
                          label: signalText(candidate, 'N'),
                        }))}
                      />
                    </Box>
                    {'parameter' in AUTOMATION_SIGNAL_SOURCES[state.signal] ? (
                      <label className="flex flex-wrap items-center gap-2">
                        <Text element="span" size="sm">
                          {t('journey.signal.days')}
                        </Text>
                        <Input
                          className="w-24 pointer-coarse:min-h-11"
                          inputMode="numeric"
                          value={state.days}
                          onChange={event => dispatch({ type: 'setDays', days: event.target.value })}
                        />
                      </label>
                    ) : null}
                  </Box>
                ) : null}
              </Box>

              {signal ? null : (
                <>
                  <label className="flex flex-col gap-1.5">
                    <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                      {t('journey.audience.name')}
                    </Text>
                    <Input
                      className="pointer-coarse:min-h-11"
                      value={state.name}
                      placeholder={t('journey.audience.namePlaceholder')}
                      onChange={event => dispatch({ type: 'setName', name: event.target.value })}
                    />
                  </label>
                  <ContactsStep
                    picked={state.contacts}
                    onToggle={contact => dispatch({ type: 'toggleContact', contact })}
                    onAddMany={contacts => dispatch({ type: 'addContacts', contacts })}
                    onLeave={() => onSaveDraft(state)}
                  />
                  <JourneyExclusions picked={state.contacts} />
                </>
              )}
              {footer(
                <Button
                  type="button"
                  className="pointer-coarse:min-h-11"
                  disabled={!journeyCanContinue(state)}
                  onClick={() => dispatch({ type: 'next' })}
                >
                  {t('journey.next')}
                </Button>,
              )}
            </>
          ) : null}

          {state.step === 'objective' ? (
            <>
              <fieldset className="flex flex-col gap-3">
                <legend className="sr-only">{t('journey.title.objective')}</legend>
                {signal ? (
                  <>
                    {OUTREACH_PLAYBOOK_KEYS.map(key => (
                      <Choice
                        key={key}
                        name="journey-playbook"
                        checked={state.prepared === null && state.playbook === key}
                        onChange={() => dispatch({ type: 'choosePlaybook', playbook: key })}
                        title={t(`playbooks.trigger.${key}.name`)}
                        hint={t(`playbooks.trigger.${key}.when`)}
                      />
                    ))}
                    {AUTOMATION_PREPARED_ACTIONS.map(key => (
                      <Choice
                        key={key}
                        name="journey-playbook"
                        checked={state.prepared === key}
                        onChange={() => dispatch({ type: 'choosePrepared', prepared: key })}
                        title={t('journey.prepared', { action: tActions(`automations.prepared.${key}`) })}
                        hint={t('journey.preparedHint')}
                      />
                    ))}
                  </>
                ) : (
                  JOURNEY_OBJECTIVES.map(objective => (
                    <Choice
                      key={objective.key}
                      name="journey-objective"
                      checked={state.objective === objective.key}
                      onChange={() => dispatch({ type: 'chooseObjective', objective: objective.key })}
                      title={t(`journey.objective.${objective.key}.title`)}
                      hint={t(`journey.objective.${objective.key}.hint`)}
                    />
                  ))
                )}
              </fieldset>
              {signal ? null : <Notice>{t('journey.objective.note')}</Notice>}
              {footer(
                <Button type="button" className="pointer-coarse:min-h-11" onClick={() => dispatch({ type: 'next' })}>
                  {t('journey.next')}
                </Button>,
              )}
            </>
          ) : null}

          {state.step === 'messages' ? (
            <>
              {signal ? null : <JourneyMessages cadence={cadence} store={messagesStore} dispatch={dispatch} />}
              <Notice tone="accent">{t('journey.messages.note')}</Notice>
              {footer(
                <Button type="button" className="pointer-coarse:min-h-11" onClick={() => dispatch({ type: 'next' })}>
                  {t('journey.next')}
                </Button>,
              )}
            </>
          ) : null}

          {state.step === 'review' ? (
            <>
              <section
                aria-label={t('journey.steps.review')}
                data-testid="journey-review"
                className="flex flex-col gap-1 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
              >
                {signal ? (
                  <>
                    <Text size="sm" weight="semibold">
                      {t('journey.review.when', { signal: signalText(state.signal, state.days) })}
                    </Text>
                    <Text size="sm">
                      {state.prepared
                        ? t('journey.review.thenPrepare', {
                            action: tActions(`automations.prepared.${state.prepared}`),
                          })
                        : t('journey.review.then', { sequence: playbookName })}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t('journey.review.startsOff')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Box className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <Text element="h3" size="lg" weight="semibold">
                        {state.name.trim() || t('journey.side.nameNone')}
                      </Text>
                      <Badge variant="primary">{t('journey.review.ready')}</Badge>
                    </Box>
                    <dl className="flex flex-col">
                      <Property label={t('journey.review.audience')}>
                        {t('journey.review.audienceValue', {
                          count: state.contacts.size,
                          names: [...state.contacts.values()].map(contact => contact.full_name).join(', '),
                        })}
                      </Property>
                      {mailbox?.address ? (
                        <Property label={t('journey.review.sender')}>
                          {t('journey.review.senderValue', { address: mailbox.address })}
                        </Property>
                      ) : null}
                      <Property label={t('journey.review.cadence')}>{cadenceText(t, cadence)}</Property>
                      <Property label={t('journey.review.objective')}>
                        {t(`journey.objective.${state.objective}.title`)}
                      </Property>
                      <Property label={t('journey.review.stop')}>{t('journey.review.stopValue')}</Property>
                    </dl>
                  </>
                )}
              </section>
              {signal ? null : <JourneyExclusions picked={state.contacts} />}
              {signal ? null : (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('journey.audience.lastCheck')}
                </Text>
              )}
              <Notice tone="accent">{t('journey.review.nothingLeaves')}</Notice>
              {signal ? null : (
                <label className="flex cursor-pointer items-start gap-2.5 pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={confirmed}
                    onChange={event => setConfirmed(event.target.checked)}
                  />
                  <Text element="span" size="sm" weight="medium">
                    {t('journey.review.confirm')}
                  </Text>
                </label>
              )}
              {footer(
                signal ? (
                  <Button
                    type="button"
                    className="pointer-coarse:min-h-11"
                    disabled={createRule.isPending}
                    onClick={activate}
                  >
                    {t('journey.activate')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="pointer-coarse:min-h-11"
                    disabled={!confirmed}
                    onClick={() => onLaunchManual(journeyLaunchRequest(state))}
                  >
                    {t('journey.launch')}
                  </Button>
                ),
              )}
            </>
          ) : null}
        </section>

        {/* Théo C sequences-assistant.N2 — « Ta séquence » : le récapitulatif vivant, à chaque étape (`.card`). */}
        <aside
          aria-label={t('journey.side.title')}
          data-testid="journey-side"
          className="flex h-fit flex-col rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
        >
          <Text element="h3" size="base" weight="semibold" className="mb-2">
            {t('journey.side.title')}
          </Text>
          <dl className="flex flex-col">
            {signal ? (
              <Property label={t('journey.side.audience')}>
                {t('journey.side.signal', { signal: signalText(state.signal, state.days) })}
              </Property>
            ) : (
              <>
                <Property label={t('journey.side.name')} strong>
                  {state.name.trim() || t('journey.side.nameNone')}
                </Property>
                <Property label={t('journey.side.audience')} strong>
                  {state.contacts.size > 0
                    ? t('journey.side.audience', { count: state.contacts.size })
                    : t('journey.side.none')}
                </Property>
                <Property label={t('journey.side.objective')}>
                  {t(`journey.objective.${state.objective}.title`)}
                </Property>
                <Property label={t('journey.side.cadence')}>
                  {cadence.map(step => `J${step.offsetDays}`).join(', ')}
                </Property>
              </>
            )}
            <Property label={t('journey.side.send')}>{t('journey.side.sendValue')}</Property>
          </dl>
          <Notice>{t('journey.side.kept')}</Notice>
        </aside>
      </Box>
    </Box>
  )
}

/** `.notice` — une phrase posée dans un cadre doux ; « accent » pour ce qui rassure sur l'envoi. */
function Notice({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <Box
      className={cn(
        'mt-1 flex items-start gap-2.5 rounded-card border px-3.5 py-3',
        tone === 'accent'
          ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {children}
      </Text>
    </Box>
  )
}

/** `.property` — libellé discret, valeur ; un filet entre deux. */
function Property({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <Box className="flex flex-col gap-1 border-t border-[var(--bellum-border)] py-3 first:border-t-0 first:pt-1">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className={cn('text-sm', strong && 'font-semibold')}>{children}</dd>
    </Box>
  )
}

function cadenceText(
  t: (key: string, options?: Record<string, unknown>) => string,
  cadence: readonly { offsetDays: number; kind: OutreachStepKind }[],
): string {
  return cadence.map(step => `J${step.offsetDays} · ${t(`kind.${step.kind}`)}`).join(', ')
}

/**
 * « Qui veux-tu contacter ? » : les contacts de l'espace, cochés (une audience de plusieurs personnes, c129), dans la
 * `.check-list` de la maquette — avatar, nom, « compte · poste », l'e-mail pro EN CLAIR à droite (ou « Sans e-mail
 * pro » en rouge doux). « Sélection métier » déplie le constructeur d'audience existant (source, canal, plafonds par
 * compte / jour / contact / canal) : l'audience qu'il rend s'ajoute à la sélection — une seule définition (GA-26).
 */
function ContactsStep({
  picked,
  onToggle,
  onAddMany,
  onLeave,
}: {
  picked: ReadonlyMap<string, JourneyContact>
  onToggle: (contact: JourneyContact) => void
  onAddMany: (contacts: readonly JourneyContact[]) => void
  onLeave: () => void
}) {
  const { t } = useTranslation('outreach')
  const [search, setSearch] = useState('')
  const [business, setBusiness] = useState(false)
  const [debounced] = useDebounce(search, 300)
  const contacts = useContacts(debounced ? { q: debounced } : {})
  const rows: JourneyContact[] = useMemo(() => {
    const found = (contacts.data?.pages ?? []).flatMap(page => page.data).slice(0, 40)
    // Les contacts déjà cochés restent en tête, même hors de la recherche : revenir à cette étape
    // montre la sélection, jamais une liste où elle a disparu.
    const kept = [...picked.values()]
    const keptIds = new Set(kept.map(contact => contact.id))
    return [
      ...kept,
      ...found
        .filter(contact => !keptIds.has(contact.id))
        .map(contact => ({
          id: contact.id,
          full_name: contact.full_name,
          title: contact.title ?? null,
          email: contact.email ?? null,
          assigned_to: contact.assigned_to ?? null,
          company_name: contact.company_name ?? null,
        })),
    ]
  }, [contacts.data, picked])

  return (
    <Box className="flex flex-col gap-3">
      {/* `.toolbar` — recherche, « Sélection métier », « Importer ». */}
      <Box className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-10 min-w-0 basis-full items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 sm:max-w-sm sm:flex-1 sm:basis-52 pointer-coarse:min-h-11">
          <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder={t('journey.contacts.searchPlaceholder')}
            aria-label={t('journey.contacts.search')}
            onChange={event => setSearch(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--bellum-text-muted)]"
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="soft"
          className="pointer-coarse:min-h-11"
          aria-expanded={business}
          onClick={() => setBusiness(open => !open)}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {t('journey.audience.business')}
        </Button>
        <JourneyImportMenu onLeave={onLeave} />
      </Box>
      {business ? (
        <Box data-testid="journey-business-selection">
          <AudienceBuilderBlock
            onPrepare={found => {
              onAddMany(found)
              setBusiness(false)
            }}
          />
        </Box>
      ) : null}
      {contacts.isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('journey.contacts.loading')}
        </Text>
      ) : rows.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('journey.contacts.none')}
        </Text>
      ) : (
        <>
          <ul
            className="flex list-none flex-col divide-y divide-[var(--bellum-border)] overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0"
            data-testid="journey-contacts"
          >
            {rows.map(contact => (
              <li key={contact.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3.5 py-3 pointer-coarse:min-h-11 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[var(--bellum-primary-400)]',
                    picked.has(contact.id) && 'bg-[var(--accent-soft-bg)]',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(contact.id)}
                    onChange={() => onToggle(contact)}
                    className="size-4 shrink-0"
                  />
                  <EntityAvatar name={contact.full_name} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Text element="span" size="sm" weight="medium" className="truncate">
                      {contact.full_name}
                    </Text>
                    {contact.company_name || contact.title ? (
                      <Text element="span" size="xs" className="truncate text-[var(--bellum-text-muted)]">
                        {[contact.company_name, contact.title].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </span>
                  {/* Coordonnées pro en clair (c87) ; une absence se nomme, en rouge doux. */}
                  {contact.email ? (
                    <Badge className="hidden max-w-60 truncate sm:inline-flex">{contact.email}</Badge>
                  ) : (
                    <Badge variant="danger">{t('journey.audience.noEmail')}</Badge>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('journey.audience.counter', { picked: picked.size, shown: rows.length })}
          </Text>
        </>
      )}
    </Box>
  )
}
