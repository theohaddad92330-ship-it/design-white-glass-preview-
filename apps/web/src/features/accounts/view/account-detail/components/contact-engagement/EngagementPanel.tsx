import type { Contact } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrackAction } from '@/features/actions/hooks/useTrackAction'
import { useMessageStyleTemplates } from '@/features/message-style/hooks/useMessageStyle'
import type { ApproachChoice } from './approach-quiz'
import { ComposerDock } from './ComposerDock'
import { useOptionalContactEngagement } from './ContactEngagementContext'
import { EngagementCallBar } from './EngagementCallBar'
import { EngagementConversation } from './EngagementConversation'
import { EngagementPanelHeader } from './EngagementPanelHeader'
import { lastBriefedAssistantEntry, useEngagementConversation } from './conversation'
import { useEngagementDraftHydration } from './useEngagementDraftHydration'
import { panelPlacement, type PanelPlacement } from './floating-reserve'
import { closesPanelOnKey } from './panel-keyboard'
import type { MessageParameters } from './message-parameters'
import { generationActionType } from './engagement-tracking'
import { isPreparedOnlyChannel } from './channel'
import type { ContactMessage, EngagementChannel, ObjectionResponse, SendableChannel } from './types'

type EngagementPanelProps = {
  activeContactId?: string
  anchorRect?: DOMRect | null
  /** #3637 — l'éditeur est ouvert par « Préparer mon appel ». */
  callPreparation?: boolean
  /** #3263.46/.48 — l'objectif porté par le CTA qui a ouvert ce panneau, s'il y en a un. */
  initialParameters?: MessageParameters
  /** #4415.2 — l'angle de l'étape du plan. */
  initialContext?: string
  channel: EngagementChannel
  closing: boolean
  channels: EngagementChannel[]
  contact: Contact
  contacts?: Contact[]
  maximized: boolean
  message: ContactMessage
  objections: ObjectionResponse[]
  onChannelChange: (channel: EngagementChannel) => void
  onContactChange?: (contactId: string) => void
  onClose: () => void
  onMaximize: () => void
  onMinimize: () => void
}

export function EngagementPanel({
  activeContactId,
  anchorRect,
  callPreparation,
  initialParameters,
  initialContext,
  channel,
  closing,
  channels,
  contact,
  contacts,
  maximized,
  message,
  objections,
  onChannelChange,
  onContactChange,
  onClose,
  onMaximize,
  onMinimize,
}: EngagementPanelProps) {
  const { t } = useTranslation('engagement')
  const trackAction = useTrackAction()
  const shouldReduceMotion = useReducedMotion()
  const [showObjections, setShowObjections] = useState(false)
  const panelRef = useRef<HTMLElement | null>(null)
  const drafts = useOptionalContactEngagement()?.drafts
  // #3694.7 — le brief confirmé et le fil qui le porte, lus depuis le serveur
  // à l'ouverture (hors de `useEngagementConversation` : son propre banc de
  // tests mesure déjà « un seul appel `/ia/message» » sur plusieurs scénarios).
  const { hydrated: draftHydrated } = useEngagementDraftHydration(drafts, contact.id, channel)
  const conversation = useEngagementConversation({
    channel,
    contact,
    message,
    drafts,
    draftHydrated,
    initialParameters,
    initialContext,
    // #4333 — la fenêtre s'ouvre déjà rédigée par Laura.
    autoDraft: true,
  })
  const hasObjections = objections.length > 0
  const placement = panelPlacement({ anchorRect, maximized })
  // #2204.59-.65 (épopée #2947) — les styles `active` DE CET ESPACE, pour CE
  // canal seulement (un style porte un canal, `MessageStyleTemplate.channel`).
  // Vide = aucun sélecteur affiché (on n'affiche pas ce qu'on n'a pas).
  const { data: styleTemplates } = useMessageStyleTemplates()
  const styleOptions = useMemo(
    () => (styleTemplates ?? []).filter(template => template.status === 'active' && template.channel === channel),
    [styleTemplates, channel],
  )

  useEffect(() => {
    setShowObjections(false)
  }, [channel, contact])

  // #3696.7 — le clavier entre dans le panneau à l'ouverture et retrouve son point de départ à la fermeture.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })
    return () => opener?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    trackEngagementOpened(trackAction.mutate, contact, channel)
  }, [channel, contact, trackAction.mutate])

  // #3694.4 — le brief affiché est celui du DERNIER brouillon généré (jamais d'un brouillon pré-écrit).
  const briefSource = lastBriefedAssistantEntry(conversation.entries)

  const chooseParameters = (next: MessageParameters) => {
    if (conversation.chooseParameters(next)) trackMessageGenerated(trackAction.mutate, contact, channel)
  }

  const generateDraft = () => {
    trackMessageGenerated(trackAction.mutate, contact, channel)
    conversation.generateDraft()
  }

  // #3633 — le QCM d'approche répondu : même suivi, même générateur.
  const generateFromApproach = (choice: ApproachChoice) => {
    trackMessageGenerated(trackAction.mutate, contact, channel)
    void conversation.generateFromApproach(choice)
  }

  return (
    <motion.aside
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={event => {
        if (closesPanelOnKey(event.nativeEvent, event.currentTarget.contains(event.target as Node))) {
          event.stopPropagation()
          onClose()
        }
      }}
      aria-label={t('panel.aria')}
      className={panelClassName()}
      initial={panelInitial(placement)}
      animate={panelAnimate({ closing, placement })}
      transition={panelTransition(shouldReduceMotion)}
      style={{ right: 'auto' }}
    >
      <EngagementPanelHeader
        channel={channel}
        activeContactId={activeContactId}
        contact={contact}
        contacts={contacts}
        maximized={maximized}
        onContactChange={onContactChange}
        onClose={onClose}
        onMaximize={onMaximize}
        onMinimize={onMinimize}
      />
      {/* #3697.5/.6 — le support d'appel porte « Consigner le résultat » et dit l'absence de numéro. */}
      {channel === 'phone' ? <EngagementCallBar contact={contact} /> : null}
      <div className={panelBodyClassName(maximized)}>
        <EngagementConversation
          channel={channel}
          contact={contact}
          entries={conversation.entries}
          generationStep={conversation.generationStep}
          onLinkedinOpen={() => trackLinkedinOpened(trackAction.mutate, contact)}
          onLinkedinDeclaredSent={() => trackLinkedinDeclaredSent(trackAction.mutate, contact)}
          onMessageCopy={() => trackMessageCopied(trackAction.mutate, contact, channel)}
          onDismiss={() => trackMessageDismissed(trackAction.mutate, contact, channel)}
          onContextPreset={conversation.setContext}
          onApproachChosen={generateFromApproach}
          onRetry={conversation.retryDraft}
          onUseAlternativeAngle={conversation.useAlternativeAngle}
          onChangeTone={conversation.changeTone}
          // #3695 — même geste que « Paramètres du message › Objectif » : l'objectif choisi génère le brouillon.
          onChooseObjective={objective => chooseParameters({ ...conversation.parameters, objective })}
          onEditEntry={conversation.editEntry}
        />
        {/* #4333 — le composer est BORNÉ (45 dvh) et défile à part : le fil garde sa place pour le texte rédigé. */}
        <div className="max-h-[45dvh] shrink-0 overflow-y-auto">
          <ComposerDock
            channel={channel}
            channels={channels}
            contactId={contact.id}
            context={conversation.context}
            hasObjections={hasObjections}
            objectionsGap={Boolean(callPreparation) && channel === 'phone' && !hasObjections}
            objections={objections}
            showObjections={showObjections}
            onContextChange={conversation.setContext}
            onChannelChange={onChannelChange}
            onGenerate={generateDraft}
            parameters={conversation.parameters}
            // #2123.59 — choisir un objectif GÉNÈRE le brouillon (décision Louis 15/09).
            onParametersChange={chooseParameters}
            brief={briefSource?.brief}
            briefAngle={briefSource?.angle}
            onToggleObjections={() => setShowObjections(value => !value)}
            styleOptions={styleOptions}
            styleTemplateId={conversation.styleTemplateId}
            onStyleTemplateIdChange={conversation.setStyleTemplateId}
            onUseApprovedTemplate={conversation.useApprovedTemplate}
          />
        </div>
      </div>
    </motion.aside>
  )
}

function panelBodyClassName(maximized: boolean) {
  return cn(
    'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bellum-surface-1)]',
    maximized ? 'mx-auto w-full max-w-4xl' : 'w-full',
  )
}

type TrackAction = ReturnType<typeof useTrackAction>['mutate']

// #1473 — `account_id` est FACULTATIF dans `trackActionSchema`. Un contact à
// qualifier trace donc son geste sans compte : l'action a bien eu lieu, elle
// n'est simplement rattachée à aucune entreprise. L'omettre vaut mieux que de
// la perdre — le journal d'activité est ce qui reste quand on change d'outil.
export function trackEngagementOpened(track: TrackAction, contact: Contact, channel: EngagementChannel) {
  track({
    action_type: channel === 'phone' ? 'plan_action_call_prepared' : 'plan_action_opened',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: trackedChannel(channel),
    metadata: contactActionMetadata(
      contact,
      channel === 'phone' ? "Pitch d'appel préparé" : "Module d'approche ouvert",
      channelLabel(channel),
    ),
  })
}

export function trackMessageGenerated(track: TrackAction, contact: Contact, channel: EngagementChannel) {
  const actionType = generationActionType(channel)
  if (!actionType) return
  track({
    action_type: actionType,
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: trackedChannel(channel),
    metadata: contactActionMetadata(contact, 'Message généré', channelLabel(channel)),
  })
}

export function trackMessageCopied(track: TrackAction, contact: Contact, channel: EngagementChannel) {
  track({
    action_type: 'plan_action_message_copied',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: trackedChannel(channel),
    metadata: contactActionMetadata(contact, 'Message copié', channelLabel(channel)),
  })
}

/**
 * #2396.12 — « Écarter » : le commercial décide de ne pas utiliser ce
 * brouillon. Réutilise `plan_action_skipped` (`actionTypeSchema`), déjà dans
 * le contrat et déjà doté d'un libellé (`contacts.service.ts:565,589`), sans
 * appelant réel jusqu'ici — exactement le défaut que `agent_docs/chantiers-livres.md`
 * nomme : du code juste que personne n'appelait.
 */
export function trackMessageDismissed(track: TrackAction, contact: Contact, channel: EngagementChannel) {
  track({
    action_type: 'plan_action_skipped',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: trackedChannel(channel),
    metadata: contactActionMetadata(contact, 'Brouillon écarté', channelLabel(channel)),
  })
}

export function trackLinkedinOpened(track: TrackAction, contact: Contact) {
  track({
    action_type: 'plan_action_linkedin_opened',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: 'linkedin',
    metadata: contactActionMetadata(contact, 'Profil LinkedIn ouvert', 'LinkedIn'),
  })
}

/**
 * DÉCLARATION du commercial : « j'ai envoyé ce message sur LinkedIn ».
 *
 * Bellum ne peut PAS envoyer sur LinkedIn (aucune API de messagerie) et ne doit
 * jamais déduire un envoi d'un clic — ouvrir un profil n'est pas envoyer. Cette
 * action n'existe donc que sur geste explicite de l'utilisateur.
 *
 * `via: 'declaration'` (vs `via: 'bellum'` posé par `recordEmailSent` côté API)
 * garde les deux natures séparables en base : un envoi réellement effectué par
 * Bellum ne doit jamais être confondu, plus tard, avec une déclaration.
 */
export function trackLinkedinDeclaredSent(track: TrackAction, contact: Contact) {
  track({
    action_type: 'plan_action_message_sent',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: 'linkedin',
    metadata: {
      ...contactActionMetadata(contact, 'Message envoyé', 'Déclaré envoyé sur LinkedIn'),
      via: 'declaration',
      declared: true,
    },
  })
}

/**
 * Théo C6.A10 — « Marquer comme envoyé par moi » : l'e-mail est parti AILLEURS que de Bellum (ou LinkedIn). Même
 * action que la déclaration LinkedIn, jamais confondue avec un envoi vérifié (`via: 'declaration'`).
 */
export function trackMessageDeclaredSent(track: TrackAction, contact: Contact, channel: EngagementChannel) {
  track({
    action_type: 'plan_action_message_sent',
    account_id: contact.account_id ?? undefined,
    contact_id: contact.id,
    channel: trackedChannel(channel),
    metadata: {
      ...contactActionMetadata(contact, 'Message envoyé', `Déclaré envoyé · ${channelLabel(channel)}`),
      via: 'declaration',
      declared: true,
    },
  })
}

function contactActionMetadata(contact: Contact, label: string, detail: string) {
  return {
    label,
    detail,
    source: 'engagement_panel',
    source_label: 'Module approche contact',
    contact_name: contact.full_name,
    contact_title: contact.title,
  }
}

/**
 * #2123.72 — le journal d'actions ne connaît pas de canal « tâche »
 * (`actionChannelSchema`) : une tâche préparée s'y trace comme `other`, jamais
 * comme un e-mail qu'elle n'est pas.
 */
function trackedChannel(channel: EngagementChannel): SendableChannel | 'other' {
  return isPreparedOnlyChannel(channel) ? 'other' : channel
}

function channelLabel(channel: EngagementChannel): string {
  if (channel === 'linkedin') return 'LinkedIn'
  if (channel === 'phone') return 'Téléphone'
  if (channel === 'task') return 'Tâche de prise de contact'
  if (channel === 'recommendation') return 'Message de recommandation'
  // #2370 — les canaux préparés (métadonnée du journal d'actions, comme les libellés ci-dessus).
  if (channel === 'introduction_request') return "Demande d'introduction"
  if (channel === 'partner_message') return 'Message partenaire'
  if (channel === 'follow_up_email') return 'E-mail de suivi'
  if (channel === 'profile_push') return 'Push de profil consultant'
  if (channel === 'linkedin_connection_note') return 'Note de connexion LinkedIn'
  return 'Email'
}

function panelClassName() {
  return cn(
    'fixed z-50 flex flex-col overflow-hidden border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)] shadow-[0_12px_20px_color-mix(in_srgb,var(--bellum-text-primary)_8%,transparent)]',
    '[contain:layout_paint] will-change-[top,left,width,height,transform,opacity] rounded-xl focus:outline-none',
  )
}

function panelInitial(placement: PanelPlacement | undefined) {
  return {
    ...placement,
    opacity: 0,
    y: 12,
    scale: 0.985,
  }
}

function panelAnimate({ closing, placement }: { closing: boolean; placement: PanelPlacement | undefined }) {
  return {
    ...placement,
    opacity: closing ? 0 : 1,
    y: closing ? 12 : 0,
    scale: closing ? 0.985 : 1,
  }
}

function panelTransition(shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) return { duration: 0 }
  return {
    height: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
    left: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
    opacity: { duration: 0.1, ease: 'linear' },
    scale: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] },
    top: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
    width: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
    y: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] },
  } as const
}
