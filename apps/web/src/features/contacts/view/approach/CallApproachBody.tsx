import { formatPhoneForDisplay, type Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Lightbulb,
  Phone,
  PhoneIncoming,
  RefreshCw,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsignCallDialog } from '@/features/activities/view/ConsignCallDialog'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import {
  trackEngagementOpened,
  trackMessageCopied,
  trackMessageGenerated,
} from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementPanel'
import {
  useEngagementConversation,
  type AssistantEntry,
} from '@/features/accounts/view/account-detail/components/contact-engagement/conversation'
import {
  buildContactMessage,
  readObjections,
} from '@/features/accounts/view/account-detail/components/contact-engagement/message'
import { MESSAGE_OBJECTIVE_CODES } from '@/features/accounts/view/account-detail/components/contact-engagement/message-parameters'
import { useEngagementDraftHydration } from '@/features/accounts/view/account-detail/components/contact-engagement/useEngagementDraftHydration'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { useTelephonyStatus } from '@/features/telephony/api'
import { getRoleQuestionKey } from '@/lib/contactRoles'
import { useTrackAction } from '@/features/actions/hooks/useTrackAction'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { identityDoubtBlockedReason } from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail'
import { PlanCallDialog, ProofDialog } from './ApproachDialogs'
import { ApproachGroundingBlock } from './ApproachGrounding'
import { callOfferLabel, contextElement } from './approach-grounding'
import {
  APPROACH_OBJECTIVES,
  callBriefFacts,
  callQualificationQuestions,
  latestExchange,
  splitCallScript,
} from './approach-model'
import { useApproachGrounding } from './useApproachGrounding'
import { APPROACH_CARD, ApproachAvoidCard, ApproachContextCard, ApproachTopRow } from './ApproachLayout'

const CHIP = 'rounded-badge px-2 py-0.5 text-xs font-medium'
const H2 = 'text-xl font-semibold text-[var(--bellum-text-primary)]'
const FACT_ICON = {
  why: Target,
  last_exchange: Clock,
  last_sent: Clock,
  signal: Building2,
  key_point: Lightbulb,
} as const

/**
 * Théo C7 — la page « Préparer ton appel » (`/contacts/<id>/approach/call`), sur la maquette `b/c7-approche-appel.html`.
 *
 * Elle s'ouvre DÉJÀ RÉDIGÉE : le support d'appel (ouverture, questions, réponses aux objections) est généré par le
 * copilote à l'ouverture (`autoDraft`), éditable, avec « Régénérer ». Le copilote n'appelle jamais : « Appeler » ouvre le
 * téléphone du commercial (lien `tel:`), qui compose lui-même ; on copie le support, on consigne l'échange, on planifie
 * l'appel. Les questions sont CELLES DU SCRIPT rédigé ; les objections celles du dossier du compte ; « Ce qu'il faut
 * savoir » ne lit que la fiche — rien n'est inventé côté écran.
 */
export function CallApproachBody({ contact }: { contact: Contact }) {
  const { t, i18n } = useTranslation('engagement')
  const trackAction = useTrackAction()
  const drafts = useOptionalContactEngagement()?.drafts
  const ranking = useContactRanking(contact.account_id ?? '', {})
  const identityDoubt = identityDoubtBlockedReason(contact, ranking.data)
  const timeline = useTimeline('contact', contact.id)
  const telephony = useTelephonyStatus()
  const {
    rawAnalysis,
    facts: groundingFacts,
    choice,
    setChoice,
    grounding,
    account,
  } = useApproachGrounding(contact, identityDoubt !== null, true)
  const message = useMemo(() => buildContactMessage(contact, rawAnalysis ?? {}), [contact, rawAnalysis])
  const dossierObjections = useMemo(() => readObjections(rawAnalysis ?? {}).slice(0, 2), [rawAnalysis])
  const { hydrated } = useEngagementDraftHydration(drafts, contact.id, 'phone')
  const conversation = useEngagementConversation({
    channel: 'phone',
    contact,
    message,
    drafts,
    // #4524.1 — la rédaction automatique attend le compte : les faits cochés d'emblée sont ceux qui partent au moteur.
    draftHydrated: hydrated && account.ready,
    autoDraft: true,
    grounding,
  })

  const [consigning, setConsigning] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [phoneCopied, setPhoneCopied] = useState(false)

  useEffect(() => {
    trackEngagementOpened(trackAction.mutate, contact, 'phone')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une trace par ouverture de page
  }, [contact.id])

  const lastAssistant = [...conversation.entries]
    .reverse()
    .find((entry): entry is AssistantEntry => entry.role === 'assistant')
  const lastEntry = conversation.entries[conversation.entries.length - 1]
  const failedEntry = lastEntry?.role === 'error' ? lastEntry : null
  const generating = conversation.generationStep !== null
  // Le texte affiché n'est PAS rogné : rogner la valeur d'un champ empêche d'y taper une espace finale.
  const scriptText = lastAssistant?.edited?.body ?? lastAssistant?.text ?? ''
  // #4975.1 — l'ouverture ne porte jamais d'objection : celles que le script contient vont dans leur bloc
  // (le dossier du compte reste la source d'abord ; le script ne comble que son absence).
  const split = splitCallScript(scriptText)
  const openingText = split.opening
  const objections = dossierObjections.length > 0 ? dossierObjections : split.objections.slice(0, 2)
  const script = openingText.trim()
  // #4525.5 — la question du rôle de décision (taxonomie MEDDIC) ouvre les questions ; sans rôle établi, aucune.
  const roleQuestionKey = getRoleQuestionKey(contact.decision_role)
  const questions = callQualificationQuestions(script, roleQuestionKey ? t(roleQuestionKey, { ns: 'contacts' }) : null)
  const facts = callBriefFacts({ ...contact, last_exchange: latestExchange(timeline.data?.items) })
  const objectiveCode = conversation.parameters.objective ?? lastAssistant?.brief?.objective ?? ''
  const objectiveKnown = APPROACH_OBJECTIVES.some(item => item.code === objectiveCode)
  const otherObjective = !objectiveKnown && MESSAGE_OBJECTIVE_CODES.some(code => code === objectiveCode)
  const objectiveOptions = [
    ...APPROACH_OBJECTIVES.map(item => ({ value: item.code, label: t(`approachPage.goal.${item.id}`) })),
    ...(otherObjective ? [{ value: objectiveCode, label: t(`composer.parameters.objectives.${objectiveCode}`) }] : []),
  ]
  const objectiveLabel =
    objectiveCode && MESSAGE_OBJECTIVE_CODES.some(code => code === objectiveCode)
      ? t(`composer.parameters.objectives.${objectiveCode}`)
      : null
  const offerLabel = callOfferLabel(choice, groundingFacts)
  const usedElement = contextElement(choice, groundingFacts, lastAssistant ?? {})
  const phone = contact.phone?.trim() ? contact.phone.trim() : null
  // #4525.5 — « Appeler » n'est proposé que si un outil d'appel est branché ET qu'un numéro est connu ; sinon
  // « Consigner » prend la place. Tant que l'état de l'outil n'est pas lu, on n'affirme rien : pas de bouton.
  const canDial = phone !== null && telephony.data?.connected === true
  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' })

  const chooseObjective = (code: string) => {
    if (!code) return
    if (conversation.chooseParameters({ ...conversation.parameters, objective: code })) {
      trackMessageGenerated(trackAction.mutate, contact, 'phone')
    }
  }
  const copyPhone = () => {
    if (!phone) return
    void navigator.clipboard.writeText(phone).then(() => {
      setPhoneCopied(true)
      window.setTimeout(() => setPhoneCopied(false), 1800)
    })
  }

  const setScript = (opening: string) => {
    // Modifier l'ouverture ne fait pas perdre les objections que le script portait : elles sont reposées à la suite.
    const kept = split.objections.map(item => `Objection — « ${item.objection} » Réponse — « ${item.response} »`)
    const body = [opening, ...kept].join('\n')
    if (lastAssistant) conversation.editEntry(lastAssistant.id, { subject: '', body })
  }
  const regenerate = () => {
    trackMessageGenerated(trackAction.mutate, contact, 'phone')
    conversation.generateDraft()
  }
  const copySupport = () => {
    const lines = [
      script,
      ...(questions.length > 0
        ? ['', t('approachPage.call.questions'), ...questions.map(question => `- ${question}`)]
        : []),
      ...(objections.length > 0
        ? ['', t('approachPage.call.objections'), ...objections.map(item => `${item.objection} → ${item.response}`)]
        : []),
    ]
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      trackMessageCopied(trackAction.mutate, contact, 'phone')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="w-full space-y-5 pb-8" data-testid="call-approach">
      <AiDisclosure />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          <ApproachTopRow
            contactId={contact.id}
            channel="call"
            objective={objectiveCode}
            objectiveOptions={objectiveOptions}
            placeholder={t('approachPage.goal.placeholder')}
            onObjective={chooseObjective}
          />

          <ApproachGroundingBlock facts={groundingFacts} choice={choice} onChoice={setChoice} />
          {/* #4977 — l'appel dit s'il s'ouvre sur une offre d'emploi, ou que le script reste général. */}
          <Text size="sm" className="block text-[var(--bellum-text-secondary)]" data-testid="call-offer-state">
            {offerLabel
              ? t('approachPage.grounding.callOffer', { offer: offerLabel })
              : t('approachPage.grounding.callNoOffer')}
          </Text>

          {facts.length > 0 ? (
            <section className={`${APPROACH_CARD} p-5 sm:p-6`} aria-labelledby="call-brief">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="call-brief" className={H2}>
                  {t('approachPage.call.before')}
                </h2>
                <span className={`${CHIP} bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]`}>
                  {t('approachPage.call.kind')}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {facts.map(fact => {
                  const Icon = FACT_ICON[fact.kind]
                  return (
                    <li key={`${fact.kind}-${fact.text}-${fact.date ?? ''}`} className="flex gap-3 text-sm">
                      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                      <span className="text-[var(--bellum-text-primary)]">
                        {fact.kind === 'last_sent' && fact.date
                          ? t('approachPage.call.lastSent', { date: formatDay(fact.date) })
                          : fact.kind === 'last_exchange' && fact.date
                            ? t(
                                fact.text
                                  ? 'approachPage.call.lastExchange'
                                  : 'approachPage.call.lastExchangeNoSubject',
                                { date: formatDay(fact.date), subject: fact.text },
                              )
                            : fact.text}
                        {fact.kind === 'signal' && fact.date && !Number.isNaN(Date.parse(fact.date)) ? (
                          <span className="text-[var(--bellum-text-muted)]"> · {formatDay(fact.date)}</span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className={`${APPROACH_CARD} p-5 sm:p-6`} aria-labelledby="call-opening">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="call-opening" className={H2}>
                {t('approachPage.call.opening')}
              </h2>
              <span
                data-testid="call-status"
                className={`${CHIP} ${
                  generating
                    ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]'
                    : 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                }`}
              >
                {generating ? t('approachPage.status.writing') : t('approachPage.call.prepared')}
              </span>
            </div>

            {/* Coordonnées pro en CLAIR ; sans numéro, le support se prépare quand même et le dit. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {phone ? (
                <>
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
                    <strong className="font-semibold text-[var(--bellum-text-primary)]">
                      {formatPhoneForDisplay(phone)}
                    </strong>
                    <span className="text-[var(--bellum-text-muted)]">{t('approachPage.call.phonePro')}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={copyPhone}>
                    {phoneCopied ? (
                      <Check className="mr-1.5 size-4" aria-hidden />
                    ) : (
                      <Copy className="mr-1.5 size-4" aria-hidden />
                    )}
                    {phoneCopied ? t('approachPage.call.copiedPhone') : t('approachPage.call.copyPhone')}
                  </Button>
                </>
              ) : (
                <span className="text-[var(--bellum-text-secondary)]">{t('callBar.noPhone')}</span>
              )}
            </div>

            {generating ? (
              <div role="status" className="mt-3 rounded-control bg-[var(--bellum-surface-2)] p-3">
                <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">
                  {t('approachPage.generation.writing')}
                </p>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('approachPage.generation.writingHint')}
                </Text>
              </div>
            ) : null}
            {failedEntry && !generating ? (
              <div
                role="alert"
                className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-[var(--warning-soft-bg)] p-3 text-sm"
              >
                <AlertTriangle className="size-4 text-[var(--warning-soft-text)]" aria-hidden />
                <span className="font-semibold text-[var(--bellum-text-primary)]">
                  {t('approachPage.generation.failed')}
                </span>
                {lastAssistant ? (
                  <span className="text-[var(--bellum-text-secondary)]">{t('approachPage.generation.failedKeep')}</span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() => conversation.retryDraft(failedEntry)}
                >
                  {t('approachPage.generation.retry')}
                </Button>
              </div>
            ) : null}

            {/* #4975.2 — bloc 1 : l'ouverture générale. Les objections ont leur bloc, plus bas. */}
            <div data-testid="call-opening-block">
              <textarea
                aria-label={t('approachPage.call.opening')}
                className="mt-4 min-h-36 w-full min-w-0 rounded-control border-0 border-l-4 border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)] px-5 py-4 text-lg leading-8 text-[var(--bellum-text-primary)]"
                value={openingText}
                disabled={!lastAssistant}
                onChange={event => setScript(event.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <Button type="button" variant="outline" className="min-h-11" disabled={generating} onClick={regenerate}>
                  <RefreshCw className="mr-1.5 size-4" aria-hidden />
                  {t('approachPage.call.regenerate')}
                </Button>
              </div>
            </div>

            {questions.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-base font-semibold text-[var(--bellum-text-primary)]">
                  {t('approachPage.call.questions')}
                </h3>
                <ul className="mt-2 divide-y divide-[var(--bellum-border)] border-b border-[var(--bellum-border)]">
                  {/* #4978.1 — questions et objections à la taille de l'ouverture : le script se lit à voix haute */}
                  {questions.map(question => (
                    <li key={question} className="py-3 text-lg leading-8 text-[var(--bellum-text-primary)]">
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* #4975.1 / #4976.1 — bloc 2, toujours là : les objections du DOSSIER, ou le constat qu'il n'en porte aucune
                (jamais une objection inventée). « Autre approche » demande un autre angle dans les deux cas. */}
            <div className="mt-6" data-testid="call-objections-block">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[var(--bellum-text-primary)]">
                  {t('approachPage.call.objections')}
                </h3>
                <Button type="button" variant="outline" className="min-h-11" disabled={generating} onClick={regenerate}>
                  <RefreshCw className="mr-1.5 size-4" aria-hidden />
                  {t('approachPage.call.otherApproach')}
                </Button>
              </div>
              {objections.length > 0 ? (
                <ul className="mt-2 divide-y divide-[var(--bellum-border)]">
                  {objections.map(item => (
                    <li key={`${item.objection}-${item.response}`} className="py-3 text-lg leading-8">
                      <p className="font-semibold text-[var(--bellum-text-primary)]">« {item.objection} »</p>
                      <p className="mt-1 text-[var(--bellum-text-secondary)]">{item.response}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text size="sm" className="mt-2 block text-[var(--bellum-text-secondary)]">
                  {t('composer.objectionsNone')}
                </Text>
              )}
            </div>
          </section>

          <div
            role="group"
            aria-label={t('approachPage.call.nextStep')}
            className="flex flex-wrap items-center gap-2"
            data-testid="call-actions"
          >
            {canDial && phone ? (
              <Button asChild className="min-h-11">
                <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
                  <Phone className="mr-1.5 size-4" aria-hidden />
                  {t('approachPage.call.dial')}
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant={canDial ? 'outline' : 'default'}
              className="min-h-11"
              onClick={() => setConsigning(true)}
            >
              <PhoneIncoming className="mr-1.5 size-4" aria-hidden />
              {t('callBar.consign')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={script.length === 0}
              onClick={() => setPlanning(true)}
            >
              <CalendarClock className="mr-1.5 size-4" aria-hidden />
              {t('approachPage.call.plan.open')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={script.length === 0}
              onClick={copySupport}
            >
              {copied ? (
                <Check className="mr-1.5 size-4" aria-hidden />
              ) : (
                <Copy className="mr-1.5 size-4" aria-hidden />
              )}
              {copied ? t('approachPage.actions.copied') : t('approachPage.call.copy')}
            </Button>
          </div>
          {canDial ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('approachPage.call.noCall')}
            </Text>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4" aria-label={t('approachPage.context.title')}>
          <ApproachContextCard
            contact={contact}
            account={account.companyName}
            objective={objectiveLabel}
            subject={lastAssistant?.angle || null}
            element={usedElement}
            freeAngle={choice?.mode === 'free_angle'}
            onProof={() => setProofOpen(true)}
          />
          <ApproachAvoidCard variant="call" />
        </aside>
      </div>

      <ConsignCallDialog contact={contact} open={consigning} onOpenChange={setConsigning} />
      <PlanCallDialog
        open={planning}
        onOpenChange={setPlanning}
        contact={contact}
        script={script}
        rationale={lastAssistant?.rationale}
      />
      <ProofDialog open={proofOpen} onOpenChange={setProofOpen} insight={lastAssistant ?? {}} />
    </div>
  )
}
