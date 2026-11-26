import { computeHierarchyLevel, type Contact } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Check, Clock, Copy, ExternalLink, FileText, Mail, RefreshCw, Users, User } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { PageBreadcrumb } from '@/components/layout/PageHeader'
import { MessageInsightPanel } from '@/components/message-insight/MessageInsightPanel'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useTrackAction } from '@/features/actions/hooks/useTrackAction'
import { ApprovedTemplatePicker } from '@/features/accounts/view/account-detail/components/contact-engagement/ApprovedTemplatePicker'
import { ComposerParameters } from '@/features/accounts/view/account-detail/components/contact-engagement/ComposerParameters'
import { StyleSelector } from '@/features/accounts/view/account-detail/components/contact-engagement/ComposerDock'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { EngagementCreateTaskAction } from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateTask'
import {
  trackEngagementOpened,
  trackLinkedinOpened,
  trackMessageCopied,
  trackMessageDeclaredSent,
  trackMessageDismissed,
  trackMessageGenerated,
} from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementPanel'
import { previousMessage } from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementMessage'
import {
  EngagementSendEmailAction,
  identityDoubtBlockedReason,
} from '@/features/accounts/view/account-detail/components/contact-engagement/EngagementSendEmail'
import { SendReceipt } from '@/features/accounts/view/account-detail/components/contact-engagement/SendReceipt'
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
import { useMessageStyleTemplates } from '@/features/message-style/hooks/useMessageStyle'
import { useCreateDraft, useMailboxStatus } from '@/features/mailbox/api'
import { useContact } from '@/features/contacts/hooks/useContact'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { useContactSendability } from '@/features/contacts/hooks/useContactSendability'
import { latestValidated, useDraftThread, useSaveDraft, useValidateDraft } from './approach-api'
import {
  APPROACH_OBJECTIVES,
  approachChannelFromParam,
  approachDraftStatus,
  approachSubtitle,
  type DraftContent,
} from './approach-model'
import { ProofDialog, ValidateDialog, VersionsDialog } from './ApproachDialogs'
import {
  APPROACH_CARD,
  APPROACH_FIELD,
  ApproachAvoidCard,
  ApproachBackAction,
  ApproachBanner,
  ApproachContextCard,
  ApproachObjectionsCard,
  ApproachTopRow,
} from './ApproachLayout'
import { ApproachGroundingBlock } from './ApproachGrounding'
import { contextElement } from './approach-grounding'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { CallApproachBody } from './CallApproachBody'
import { useApproachGrounding } from './useApproachGrounding'
import { EnrichThenPrepareButton } from './EnrichThenPrepareButton'

/** Le corps d'une note de connexion LinkedIn tient en 300 caractères (C6.N2). */
const LINKEDIN_NOTE_LIMIT = 300

/**
 * Théo C6 — la page « Préparer ton e-mail / ton message LinkedIn » (`/contacts/<id>/approach/<canal>`).
 *
 * Mise en page de la maquette (`b/c6-approche-email-linkedin.html`) : l'en-tête de la coque (titre, « Paul Ferrer ·
 * Responsable programme SAP », « Retour au contact »), puis deux colonnes — à gauche l'objectif et le canal, les
 * précisions repliées, le modèle approuvé, « Ton brouillon » DÉJÀ RÉDIGÉ par le copilote, les actions et « Valider le
 * brouillon » ; à droite « Le contexte à garder », « Éviter le message passe-partout », « Objections à anticiper ».
 * L'envoi sur clic et « Déposer dans ma boîte » sont rangés SOUS cette validation (décision Louis 22/10) ; rien ne part
 * sans le clic du commercial.
 */
export function ApproachPage({ contactId, channelParam }: { contactId: string; channelParam: string }) {
  const { t } = useTranslation('engagement')
  const { t: tc } = useTranslation('contacts')
  const navigate = useNavigate()
  const { data: contact, isLoading, isError } = useContact(contactId)
  const channel = approachChannelFromParam(channelParam)
  const title = t(`approachPage.title.${channel ?? 'email'}`)
  // #4525.5 — Laura connaît l'écran : la page dédiée à l'appel le déclarait, l'onglet (et E-mail / LinkedIn) le fait
  // désormais pour les trois canaux. Le contact ouvert CADRE la conversation ; il n'entre pas dans le texte du modèle.
  useLauraContext({
    kind: 'screen',
    label: title,
    entityId: contact?.id ?? null,
    facets: [],
    state: contact ? 'ready' : 'loading',
  })

  const breadcrumbs: PageBreadcrumb[] | undefined = contact
    ? [
        { label: tc('breadcrumbs.contacts'), icon: Users, to: '/contacts' },
        {
          label: contact.full_name,
          icon: User,
          onClick: () => void navigate({ to: '/contacts/$id', params: { id: contact.id } }),
        },
        { label: t('approachPage.breadcrumb'), icon: Mail },
      ]
    : undefined

  return (
    <CustomerPage
      pageTitle={title}
      pageSubtitle={contact ? approachSubtitle(contact) : undefined}
      headerActions={contact ? <ApproachBackAction contactId={contact.id} /> : undefined}
      breadcrumbs={breadcrumbs}
    >
      {isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('approachPage.generation.writing')}
        </Text>
      ) : isError || !contact ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {tc('notFound.title')}
        </Text>
      ) : channel === null ? (
        <section className={`${APPROACH_CARD} p-5`}>
          <h2 className="text-base font-semibold text-[var(--bellum-text-primary)]">
            {t('approachPage.notFound.title')}
          </h2>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('approachPage.notFound.body')}
          </Text>
          <Link
            to="/contacts/$id"
            params={{ id: contact.id }}
            className="mt-3 inline-flex min-h-11 items-center text-sm underline"
          >
            {t('approachPage.back')}
          </Link>
        </section>
      ) : channel === 'call' ? (
        <CallApproachBody contact={contact} />
      ) : (
        <ApproachBody contact={contact} channel={channel} title={title} />
      )}
    </CustomerPage>
  )
}

function ApproachBody({ contact, channel, title }: { contact: Contact; channel: 'email' | 'linkedin'; title: string }) {
  const { t, i18n } = useTranslation('engagement')
  const trackAction = useTrackAction()
  const drafts = useOptionalContactEngagement()?.drafts
  const ranking = useContactRanking(contact.account_id ?? '', {})
  const identityDoubt = identityDoubtBlockedReason(contact, ranking.data)
  const { rawAnalysis, facts, choice, setChoice, grounding, account } = useApproachGrounding(
    contact,
    identityDoubt !== null,
  )
  const message = useMemo(() => buildContactMessage(contact, rawAnalysis ?? {}), [contact, rawAnalysis])
  const objections = useMemo(() => readObjections(rawAnalysis ?? {}), [rawAnalysis])
  const { hydrated } = useEngagementDraftHydration(drafts, contact.id, channel)
  const conversation = useEngagementConversation({
    channel,
    contact,
    message,
    drafts,
    // #4524.1 — la rédaction automatique attend le compte : les faits cochés d'emblée sont ceux qui partent au moteur.
    draftHydrated: hydrated && account.ready,
    autoDraft: true,
    grounding,
  })
  const { data: styleTemplates } = useMessageStyleTemplates()
  const styleOptions = useMemo(
    () => (styleTemplates ?? []).filter(template => template.status === 'active' && template.channel === channel),
    [styleTemplates, channel],
  )

  const thread = useDraftThread(contact.id, channel)
  const saveDraft = useSaveDraft()
  const validateDraft = useValidateDraft()
  const sendability = useContactSendability(contact.id, channel === 'email')
  const mailbox = useMailboxStatus()
  const createMailDraft = useCreateDraft()

  const [precisionsOpen, setPrecisionsOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [validateOpen, setValidateOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [validatedHere, setValidatedHere] = useState<DraftContent | null>(null)
  const [declaredAt, setDeclaredAt] = useState<string | null>(null)
  const [openedLinkedin, setOpenedLinkedin] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  useEffect(() => {
    trackEngagementOpened(trackAction.mutate, contact, channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une trace par ouverture de page
  }, [contact.id, channel])

  const lastAssistant = [...conversation.entries]
    .reverse()
    .find((entry): entry is AssistantEntry => entry.role === 'assistant')
  const lastEntry = conversation.entries[conversation.entries.length - 1]
  const failedEntry = lastEntry?.role === 'error' ? lastEntry : null
  const generating = conversation.generationStep !== null
  const generated: DraftContent = { subject: lastAssistant?.subject ?? '', body: lastAssistant?.text ?? '' }
  const draft: DraftContent = lastAssistant?.edited ?? generated
  const insight = lastAssistant ?? {}

  const validatedContent = validatedHere ?? latestValidated(thread.data ?? [])
  const status = approachDraftStatus({ current: draft, validated: validatedContent, generating })
  const validated = status === 'validated'

  const usedElement = contextElement(choice, facts, insight)
  const objectiveCode = conversation.parameters.objective ?? lastAssistant?.brief?.objective ?? ''
  const objectiveKnown = APPROACH_OBJECTIVES.some(item => item.code === objectiveCode)
  const otherObjective = !objectiveKnown && MESSAGE_OBJECTIVE_CODES.some(code => code === objectiveCode)

  const sendabilityData = sendability.data
  const suppressed = channel === 'email' && sendabilityData?.reason === 'suppressed'
  const mailboxAddress = sendabilityData?.mailbox?.can_send ? sendabilityData.mailbox.address : null
  const fromAddress = mailboxAddress ?? sendabilityData?.sender ?? null
  const toLabel =
    channel === 'email'
      ? contact.email
        ? `${contact.full_name} <${contact.email}>`
        : t('approachPage.draft.toMissing')
      : t('approachPage.draft.toLinkedin', { name: contact.full_name })

  const previous = previousMessage(contact)
  const canAct = draft.body.trim().length > 0 && !generating

  const setDraft = (next: DraftContent) => {
    if (lastAssistant) conversation.editEntry(lastAssistant.id, next)
  }
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  const chooseObjective = (code: string) => {
    if (!code) return
    if (conversation.chooseParameters({ ...conversation.parameters, objective: code })) {
      trackMessageGenerated(trackAction.mutate, contact, channel)
    }
  }
  const adapt = () => {
    trackMessageGenerated(trackAction.mutate, contact, channel)
    conversation.generateDraft()
  }
  const copy = () => {
    void navigator.clipboard.writeText(draft.body).then(() => {
      trackMessageCopied(trackAction.mutate, contact, channel)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }
  const saveArgs = {
    contactId: contact.id,
    channel,
    existing: thread.data ?? [],
    generated,
    current: draft,
  }
  const save = () =>
    saveDraft.mutate(saveArgs, {
      onSuccess: () => toast.success(t('approachPage.actions.saved')),
      onError: () => toast.error(t('approachPage.actions.saveFailed')),
    })
  const validate = () =>
    validateDraft.mutate(saveArgs, {
      onSuccess: () => {
        setValidatedHere(draft)
        setValidateOpen(false)
        toast.success(t('approachPage.validate.done'))
      },
    })
  const deposit = () => {
    if (!contact.email) return
    createMailDraft.mutate(
      {
        to: contact.email,
        cc: [],
        subject: draft.subject || title,
        body: draft.body,
        appendSignature: true,
        documentIds: [],
      },
      {
        onSuccess: () => toast.success(t('approachPage.actions.deposited')),
        onError: () => toast.error(t('approachPage.actions.depositFailed')),
      },
    )
  }
  const copyAndOpenLinkedin = () => {
    if (!contact.linkedin_url) return
    const copying = navigator.clipboard.writeText(draft.body)
    trackLinkedinOpened(trackAction.mutate, contact)
    window.open(contact.linkedin_url, '_blank', 'noopener,noreferrer')
    setOpenedLinkedin(true)
    void copying.then(() => trackMessageCopied(trackAction.mutate, contact, channel))
  }
  const declareSent = () => {
    trackMessageDeclaredSent(trackAction.mutate, contact, channel)
    setDeclaredAt(new Date().toISOString())
  }
  const dismiss = () => {
    trackMessageDismissed(trackAction.mutate, contact, channel)
    setDismissed(true)
  }

  const objectiveOptions = [
    ...APPROACH_OBJECTIVES.map(item => ({ value: item.code, label: t(`approachPage.goal.${item.id}`) })),
    ...(otherObjective ? [{ value: objectiveCode, label: t(`composer.parameters.objectives.${objectiveCode}`) }] : []),
  ]
  const objectiveLabel =
    objectiveCode && MESSAGE_OBJECTIVE_CODES.some(code => code === objectiveCode)
      ? t(`composer.parameters.objectives.${objectiveCode}`)
      : null
  const versionCount = thread.data?.length

  return (
    <div className="w-full space-y-5 pb-8" data-testid="approach-page">
      <AiDisclosure />
      {suppressed ? (
        <ApproachBanner tone="danger" title={t('approachPage.guard.suppressed', { name: contact.full_name })}>
          {t('approachPage.guard.suppressedBody')}
        </ApproachBanner>
      ) : null}
      {identityDoubt ? (
        <ApproachBanner
          tone="warning"
          title={t('approachPage.guard.identity')}
          action={
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to="/contacts/$id" params={{ id: contact.id }}>
                {t('approachPage.guard.verify')}
              </Link>
            </Button>
          }
        >
          {t('approachPage.guard.identityBody', { name: contact.full_name })}
        </ApproachBanner>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 space-y-5" aria-label={title}>
          <ApproachTopRow
            contactId={contact.id}
            channel={channel}
            objective={objectiveCode}
            objectiveOptions={objectiveOptions}
            placeholder={t('approachPage.goal.placeholder')}
            onObjective={chooseObjective}
          />

          <details
            className={`${APPROACH_CARD} group`}
            open={precisionsOpen}
            onToggle={event => setPrecisionsOpen(event.currentTarget.open)}
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 text-sm">
              <span className="grow font-semibold text-[var(--bellum-text-primary)]">
                {t('approachPage.precisions.title')}
              </span>
              <small className="hidden text-xs text-[var(--bellum-text-muted)] sm:inline">
                {t('approachPage.precisions.hint')}
              </small>
            </summary>
            <div className="space-y-3 border-t border-[var(--bellum-border)] p-4">
              <label className="block space-y-1">
                <span className="text-xs text-[var(--bellum-text-muted)]">{t('approachPage.precisions.angle')}</span>
                <textarea
                  aria-label={t('approachPage.precisions.angle')}
                  className={`${APPROACH_FIELD} min-h-20 py-2`}
                  placeholder={t('composer.placeholder')}
                  value={conversation.context}
                  onChange={event => conversation.setContext(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-start gap-2">
                <ComposerParameters
                  parameters={conversation.parameters}
                  onParametersChange={next => {
                    if (conversation.chooseParameters(next)) {
                      trackMessageGenerated(trackAction.mutate, contact, channel)
                    }
                  }}
                />
                <StyleSelector
                  contactId={contact.id}
                  options={styleOptions}
                  styleTemplateId={conversation.styleTemplateId}
                  onStyleTemplateIdChange={conversation.setStyleTemplateId}
                />
              </div>
            </div>
          </details>

          <ApproachBanner
            icon={<FileText className="size-5 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />}
            title={t('approachPage.templates.title')}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setTemplatesOpen(true)}
              >
                {t('approachPage.templates.choose')}
              </Button>
            }
          >
            {t('approachPage.templates.body')}
          </ApproachBanner>

          <section className={`${APPROACH_CARD} p-5 sm:p-6`} aria-labelledby="approach-draft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="approach-draft" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
                {channel === 'email' ? t('approachPage.draft.title') : t('approachPage.draft.titleLinkedin')}
              </h2>
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setVersionsOpen(true)}
                >
                  <Clock className="mr-1.5 size-4" aria-hidden />
                  {versionCount !== undefined && versionCount > 0
                    ? t('approachPage.actions.versionsCount', { count: versionCount })
                    : t('approachPage.actions.versions')}
                </Button>
                <span
                  data-testid="approach-draft-status"
                  className={
                    validated
                      ? 'rounded-badge bg-[var(--success-soft-bg)] px-2 py-0.5 text-xs font-medium text-[var(--success-soft-text)]'
                      : 'rounded-badge bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]'
                  }
                >
                  {t(`approachPage.status.${status}`)}
                </span>
              </span>
            </div>

            {generating ? (
              <div role="status" className="mb-3 rounded-control bg-[var(--bellum-surface-2)] p-3">
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
                className="mb-3 flex flex-wrap items-center gap-2 rounded-control bg-[var(--warning-soft-bg)] p-3 text-sm"
              >
                <AlertTriangle className="size-4 text-[var(--warning-soft-text)]" aria-hidden />
                <span className="font-semibold text-[var(--bellum-text-primary)]">
                  {t('approachPage.generation.failed')}
                </span>
                {failedEntry.reason ? (
                  <span className="text-[var(--bellum-text-secondary)]">{failedEntry.reason}</span>
                ) : lastAssistant ? (
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

            {dismissed ? (
              <div className="flex flex-wrap items-center gap-2">
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('approachPage.draft.dismissed')}
                </Text>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => {
                    setDismissed(false)
                    adapt()
                  }}
                >
                  {t('approachPage.draft.writeAnother')}
                </Button>
              </div>
            ) : (
              <>
                <ComposeLine label={t('approachPage.draft.to')}>
                  <strong className="font-semibold text-[var(--bellum-text-primary)]">{contact.full_name}</strong>
                  <span className="grow" />
                  <span className="min-w-0 break-all text-[var(--bellum-text-secondary)]">
                    {channel === 'email'
                      ? (contact.email ?? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Link
                              to="/contacts/$id"
                              params={{ id: contact.id }}
                              className="inline-flex min-h-11 items-center underline"
                            >
                              {t('approachPage.draft.toMissing')}
                            </Link>
                            {/* #AM.36 (#4062) — le même contact s'enrichit ICI : on ne repasse ni par la liste ni par la fiche.
                                #4981 — et un seul geste : confirmation du coût, enrichissement, puis préparation. */}
                            <EnrichThenPrepareButton contact={contact} onPrepare={adapt} />
                          </span>
                        ))
                      : t('approachPage.draft.linkedinKind')}
                  </span>
                </ComposeLine>
                {channel === 'email' ? (
                  <>
                    <ComposeLine label={t('approachPage.draft.from')}>
                      <span className="min-w-0 break-all text-[var(--bellum-text-primary)]">
                        {fromAddress ?? t('approachPage.draft.fromSpace')}
                      </span>
                    </ComposeLine>
                    <ComposeLine label={t('approachPage.draft.subject')}>
                      <input
                        aria-label={t('approachPage.draft.subject')}
                        className={`${APPROACH_FIELD} font-medium`}
                        value={draft.subject}
                        disabled={!lastAssistant}
                        onChange={event => setDraft({ ...draft, subject: event.target.value })}
                      />
                    </ComposeLine>
                  </>
                ) : null}
                <textarea
                  aria-label={t('approachPage.draft.body')}
                  className={`${APPROACH_FIELD} mt-4 min-h-72 py-3 text-base leading-7`}
                  value={draft.body}
                  disabled={!lastAssistant}
                  onChange={event => setDraft({ ...draft, body: event.target.value })}
                />
                {/* #4980.2 — la justification est repliée derrière « Pourquoi ce mail est pertinent » : le corps se lit
                    sans défiler, le pourquoi reste au clic. */}
                {channel === 'email' && lastAssistant ? (
                  <MessageInsightPanel
                    channel={channel}
                    insight={
                      !lastAssistant.rationale?.trim() && contact.why_contact?.trim()
                        ? { ...lastAssistant, rationale: contact.why_contact }
                        : lastAssistant
                    }
                  />
                ) : null}
                {channel === 'email' ? (
                  <div className="mt-2">
                    <ComposeLine label={t('approachPage.draft.attachmentsLabel')}>
                      <span className="text-[var(--bellum-text-secondary)]">{t('approachPage.draft.attachments')}</span>
                    </ComposeLine>
                    <ComposeLine label={t('approachPage.draft.signatureLabel')}>
                      <span className="text-[var(--bellum-text-secondary)]">{t('approachPage.draft.signature')}</span>
                    </ComposeLine>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {t('approachPage.draft.linkedinCount', {
                        count: draft.body.length,
                        limit: LINKEDIN_NOTE_LIMIT,
                      })}
                    </Text>
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {contact.linkedin_url
                        ? t('approachPage.draft.linkedinNotConnected')
                        : t('approachPage.draft.noLinkedin')}
                    </Text>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('approachPage.draft.keepHand')}
                  </Text>
                  <Button type="button" variant="outline" className="min-h-11" disabled={generating} onClick={adapt}>
                    <RefreshCw className="mr-1.5 size-4" aria-hidden />
                    {t('approachPage.actions.regenerate')}
                  </Button>
                </div>
              </>
            )}
          </section>

          {dismissed ? null : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={!canAct} onClick={copy}>
                    {copied ? (
                      <Check className="mr-1.5 size-4" aria-hidden />
                    ) : (
                      <Copy className="mr-1.5 size-4" aria-hidden />
                    )}
                    {copied ? t('approachPage.actions.copied') : t('approachPage.actions.copy')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!canAct || saveDraft.isPending}
                    onClick={save}
                  >
                    <FileText className="mr-1.5 size-4" aria-hidden />
                    {t('approachPage.actions.save')}
                  </Button>
                </div>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!canAct || validated}
                  onClick={() => setValidateOpen(true)}
                >
                  <Check className="mr-1.5 size-4" aria-hidden />
                  {t('approachPage.actions.validate')}
                </Button>
              </div>

              {validated ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-card border border-[var(--bellum-border)] p-3"
                  data-testid="approach-validated"
                >
                  <span className="rounded-badge bg-[var(--success-soft-bg)] px-2 py-0.5 text-xs font-medium text-[var(--success-soft-text)]">
                    {t('approachPage.validate.pill', { name: contact.full_name })}
                  </span>
                  <span className="grow" />
                  {channel === 'email' ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={!contact.email || !mailbox.data?.connected || createMailDraft.isPending}
                        onClick={deposit}
                      >
                        {createMailDraft.isPending
                          ? t('approachPage.actions.depositing')
                          : t('approachPage.actions.deposit')}
                      </Button>
                      <EngagementSendEmailAction contact={contact} subject={draft.subject} text={draft.body} />
                      {!contact.email ? (
                        <Text size="xs" className="basis-full text-[var(--bellum-text-muted)]">
                          {t('approachPage.actions.depositNeedsEmail')}
                        </Text>
                      ) : !mailbox.data?.connected ? (
                        <Text size="xs" className="basis-full text-[var(--bellum-text-muted)]">
                          {t('approachPage.actions.depositNeedsMailbox')}
                        </Text>
                      ) : null}
                    </>
                  ) : contact.linkedin_url ? (
                    <Button type="button" className="min-h-11" onClick={copyAndOpenLinkedin}>
                      <ExternalLink className="mr-1.5 size-4" aria-hidden />
                      {t('message.copyAndOpenLinkedin')}
                    </Button>
                  ) : null}
                  {channel === 'linkedin' && openedLinkedin && !declaredAt ? (
                    <Button type="button" variant="ghost" className="min-h-11" onClick={declareSent}>
                      {t('message.declareSent.action')}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                  {t('approachPage.actions.afterValidationHint')}
                </Text>
              )}

              {declaredAt ? (
                <SendReceipt contact={contact} channel={channel} sentAt={declaredAt} nature="declared" />
              ) : null}
              <div className="flex flex-wrap items-center gap-x-1 text-sm text-[var(--bellum-text-muted)]">
                <span>{t('approachPage.actions.sentOtherwise')}</span>
                {declaredAt ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 px-2 font-semibold text-[var(--bellum-text-accent)]"
                    disabled={!canAct}
                    onClick={declareSent}
                  >
                    {t('approachPage.actions.markSent')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-2 font-semibold text-[var(--bellum-text-accent)]"
                  disabled={!canAct}
                  onClick={dismiss}
                >
                  {t('approachPage.actions.dismiss')}
                </Button>
              </div>
            </div>
          )}

          {contact.account_id ? (
            <div className="border-t border-[var(--bellum-border)] pt-3">
              <EngagementCreateTaskAction contact={contact} subject={draft.subject} body={draft.body} />
            </div>
          ) : null}
        </section>

        {/* #4980.2 — le CORPS du mail passe avant ses appuis : les signaux (jusqu'à des dizaines de cases de 44 px)
              rejetaient le mail à ~3 écrans. Repliés par défaut, rien n'est supprimé ; le choix part au « Régénérer ». */}
        <ApproachGroundingBlock facts={facts} choice={choice} onChoice={setChoice} collapsible />

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
          <ApproachAvoidCard variant="message" />
          <ApproachObjectionsCard objections={objections} />
        </aside>
      </div>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent closeLabel={t('approachPage.proof.close')} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('approachPage.templates.title')}</DialogTitle>
            <DialogDescription>{t('approachPage.templates.body')}</DialogDescription>
          </DialogHeader>
          <ApprovedTemplatePicker
            alwaysOpen
            channel={channel}
            contactId={contact.id}
            parameters={conversation.parameters}
            onUseTemplate={candidate => {
              conversation.useApprovedTemplate(candidate)
              setTemplatesOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
      <ProofDialog open={proofOpen} onOpenChange={setProofOpen} insight={insight} />
      <ValidateDialog
        open={validateOpen}
        onOpenChange={setValidateOpen}
        to={toLabel}
        from={channel === 'email' ? fromAddress : null}
        draft={draft}
        insight={insight}
        checklist={{
          hierarchyLevel: computeHierarchyLevel(contact.title),
          step: previous.step,
          daysSincePrevious: previous.daysSincePrevious,
        }}
        pending={validateDraft.isPending}
        failed={validateDraft.isError}
        onValidate={validate}
      />
      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        items={thread.data ?? []}
        current={draft}
        onResume={setDraft}
        formatDate={formatDate}
      />
    </div>
  )
}

/** `.compose-line` — un libellé à gauche (À, De, Objet, Pièces jointes, Signature), la valeur à droite. */
function ComposeLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--bellum-border)] py-2 text-sm last:border-b-0">
      <span className="w-24 shrink-0 text-[var(--bellum-text-muted)]">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</span>
    </div>
  )
}
