import type { Contact, MessageDraftVersionItem } from '@bellum/contracts'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { getAvailableChannels } from './channel'
import type { AssistantEntry } from './conversation'
import {
  ContactEngagementContext,
  useContactEngagement,
  type ContactEngagementContextValue,
  type ContactEngagementPanelKind,
  type ContactEngagementState,
} from './ContactEngagementContext'
import { ContactEngagementFloatingPanel } from './ContactEngagementFloatingPanel'
import { createEngagementDraftStore, draftKey, isPristine, parseDraftKey } from './draft-store'
import { ContactEngagementLauncher } from './ContactEngagementLauncher'
import type { MessageParameters } from './message-parameters'
import type { EngagementChannel } from './types'

const EMPTY_ANALYSIS: Record<string, unknown> = {}
const CLOSE_DURATION_MS = 180

/** #3695.4/.6 — un tour qui porte une trace (modèle/style appliqué, ou une correction
 *  manuelle) part vers `message_draft_versions`. Best-effort : une panne de persistance
 *  ne bloque jamais l'affichage, déjà fait côté client (même doctrine que le journal
 *  d'erreurs de génération, `conversation.ts`). */
function persistDraftVersion(key: string, entry: AssistantEntry, kind: 'generated' | 'edited'): void {
  const { contactId, channel } = parseDraftKey(key)
  apiFetch({
    path: `/contacts/${contactId}/message-draft-versions`,
    method: 'POST',
    body: {
      channel,
      subject: entry.subject || undefined,
      body: entry.text,
      ...(kind === 'edited' && entry.edited
        ? { editedSubject: entry.edited.subject || undefined, editedBody: entry.edited.body }
        : {}),
      ...(entry.usedTemplate
        ? { usedTemplateSource: entry.usedTemplate.source, usedTemplateVersion: entry.usedTemplate.version }
        : {}),
      ...(entry.usedStyleId ? { usedStyleId: entry.usedStyleId } : {}),
      ...(entry.unchanged ? { unchanged: true } : {}),
      ...(entry.angle ? { angle: entry.angle } : {}),
    },
  }).catch((error: unknown) => console.error('[Engagement] draft version persistence failed', error))
}

/** #3696 (parité démo) — le fil déjà là pour CE contact sur CE canal, lu
 *  à l'ouverture du panneau. `message_draft_versions` dans l'ordre d'apparition
 *  devient directement le fil (le rendu — badge « remplacée », trace de modèle/style,
 *  « rien n'a été adapté » — est déjà celui de `EngagementMessage.tsx`). */
function toAssistantEntry(item: MessageDraftVersionItem): AssistantEntry {
  return {
    id: item.id,
    role: 'assistant',
    channel: item.channel as EngagementChannel,
    subject: item.subject ?? '',
    text: item.body,
    ...(item.angle ? { angle: item.angle } : {}),
    ...(item.editedSubject !== null || item.editedBody !== null
      ? { edited: { subject: item.editedSubject ?? item.subject ?? '', body: item.editedBody ?? item.body } }
      : {}),
    ...(item.usedTemplateSource && item.usedTemplateVersion
      ? { usedTemplate: { source: item.usedTemplateSource, version: item.usedTemplateVersion } }
      : {}),
    ...(item.usedStyleId ? { usedStyleId: item.usedStyleId } : {}),
    ...(item.unchanged ? { unchanged: true } : {}),
  }
}

export function ContactEngagementProvider({ children }: { children: ReactNode }) {
  const closeTimerRef = useRef<number | null>(null)
  const draftsRef = useRef(createEngagementDraftStore({ persistVersion: persistDraftVersion }))
  const [activeEngagement, setActiveEngagement] = useState<ContactEngagementState | null>(null)
  const [lastEngagement, setLastEngagement] = useState<ContactEngagementState | null>(null)
  const [tabAnchors, setTabAnchors] = useState<Record<string, DOMRect>>({})
  const [activePanel, setActivePanel] = useState<ContactEngagementPanelKind | null>(null)
  const [closingEngagement, setClosingEngagement] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [panelInstanceId, setPanelInstanceId] = useState(0)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  // #3696 (parité démo) — à l'ouverture d'un contact+canal qui n'a ENCORE rien en
  // mémoire de session, on va lire ce que `message_draft_versions` porte déjà pour
  // lui. `hydrate` (draft-store.ts) n'écrase jamais un fil déjà restauré ou en cours
  // d'édition — seulement l'absence totale.
  const activeKey = activeEngagement ? draftKey(activeEngagement.activeContactId, activeEngagement.channel) : null
  useEffect(() => {
    if (!activeKey) return
    const existing = draftsRef.current.get(activeKey)
    // #3696 — le fil monté pose un cliché vide avant cet effet : « vide » ne vaut pas « déjà là ».
    if (existing && !isPristine(existing)) return
    const { contactId, channel } = parseDraftKey(activeKey)
    let cancelled = false
    apiFetch<{ items: MessageDraftVersionItem[] }>({
      path: `/contacts/${contactId}/message-draft-versions?channel=${encodeURIComponent(channel)}`,
      method: 'GET',
    })
      .then(res => {
        if (cancelled) return
        const items = res?.items ?? []
        if (items.length === 0) return
        draftsRef.current.hydrate(activeKey, { entries: items.map(toAssistantEntry), context: '', parameters: {} })
      })
      .catch((error: unknown) => console.error('[Engagement] draft version hydration failed', error))
    return () => {
      cancelled = true
    }
  }, [activeKey])

  const value = useMemo<ContactEngagementContextValue>(
    () => ({
      activeContactId: activeEngagement?.activeContactId ?? lastEngagement?.activeContactId ?? null,
      activePanel,
      activeEngagement,
      lastEngagement,
      tabAnchors,
      closingEngagement,
      maximized,
      panelInstanceId,
      drafts: draftsRef.current,
      closeContact: contactId => {
        // Fermer l'ONGLET d'un contact est un geste explicite d'abandon ; fermer le panneau, non.
        draftsRef.current.clearContact(contactId)
        const nextState = closeContact(activeEngagement, lastEngagement, contactId)
        setTabAnchors(current => omitContactAnchor(current, contactId))
        setActiveEngagement(nextState.active)
        setLastEngagement(nextState.last)
        if (!nextState.last) setClosingEngagement(false)
      },
      closePanel: () => {
        setClosingEngagement(true)
        closeTimerRef.current = window.setTimeout(() => {
          setActiveEngagement(null)
          setActivePanel(null)
          setClosingEngagement(false)
          closeTimerRef.current = null
        }, CLOSE_DURATION_MS)
      },
      openContact: (contactId, rect) => {
        if (!lastEngagement) return
        const nextState = openContact(lastEngagement, contactId, rect)
        if (!nextState) return
        clearCloseTimer()
        if (rect) setTabAnchors(current => ({ ...current, [contactId]: rect }))
        setPanelInstanceId(id => id + 1)
        setClosingEngagement(false)
        setActiveEngagement(nextState)
        setActivePanel('contact')
      },
      openEngagement: (contacts, channel, options) => {
        if (contacts.length === 0) return
        clearCloseTimer()
        const anchorRect = options?.anchorRect ?? null
        const nextState = buildEngagement(
          contacts,
          channel,
          options?.rawAnalysis ?? EMPTY_ANALYSIS,
          anchorRect,
          options?.callPreparation,
          options?.initialParameters,
          options?.initialContext,
        )
        if (anchorRect) {
          setTabAnchors(current => ({ ...current, [nextState.activeContactId]: anchorRect }))
        }
        setPanelInstanceId(id => id + 1)
        setClosingEngagement(false)
        setActiveEngagement(nextState)
        setLastEngagement(nextState)
        setActivePanel('contact')
      },
      registerTabLayout: (contactId, rect) => {
        setTabAnchors(current => (sameRect(current[contactId], rect) ? current : { ...current, [contactId]: rect }))
      },
      setActiveContact: contactId => {
        if (!activeEngagement) return
        const nextState = setActiveContact(activeEngagement, contactId)
        if (!nextState) return
        setActiveEngagement(nextState)
        setLastEngagement(nextState)
        setActivePanel('contact')
      },
      setChannel: channel => {
        if (!activeEngagement) return
        const nextState = {
          ...activeEngagement,
          channel,
          channelsByContactId: {
            ...activeEngagement.channelsByContactId,
            [activeEngagement.activeContactId]: channel,
          },
        }
        setActiveEngagement(nextState)
        setLastEngagement(nextState)
      },
      toggleMaximized: () => setMaximized(value => !value),
    }),
    [
      activeEngagement,
      activePanel,
      clearCloseTimer,
      closingEngagement,
      lastEngagement,
      maximized,
      panelInstanceId,
      tabAnchors,
    ],
  )

  return <ContactEngagementContext.Provider value={value}>{children}</ContactEngagementContext.Provider>
}

export function ContactEngagementTabs() {
  const engagement = useContactEngagement()
  const { activeContactId, lastEngagement } = engagement

  return (
    <ContactEngagementLauncher
      inline
      activeContactId={activeContactId}
      channel={lastEngagement?.channel ?? 'linkedin'}
      channelsByContactId={lastEngagement?.channelsByContactId}
      contacts={lastEngagement?.contacts ?? []}
      onCloseContact={engagement.closeContact}
      onOpenContact={engagement.openContact}
      onTabLayout={engagement.registerTabLayout}
    />
  )
}

export function ContactEngagementPanelHost() {
  const engagement = useContactEngagement()
  const { activeEngagement } = engagement

  if (!activeEngagement) return null

  const activeContact = resolveActiveContact(activeEngagement) ?? activeEngagement.contacts[0]!

  return (
    <ContactEngagementFloatingPanel
      key={`engagement-panel-${engagement.panelInstanceId}`}
      contact={activeContact}
      contacts={activeEngagement.contacts}
      activeContactId={activeEngagement.activeContactId}
      anchorRect={engagement.tabAnchors[activeEngagement.activeContactId] ?? activeEngagement.anchorRect ?? null}
      rawAnalysis={activeEngagement.rawAnalysis}
      callPreparation={activeEngagement.callPreparation}
      initialParameters={activeEngagement.initialParameters}
      initialContext={activeEngagement.initialContext}
      channel={activeEngagement.channel}
      closing={engagement.closingEngagement}
      maximized={engagement.maximized}
      onContactChange={engagement.setActiveContact}
      onChannelChange={engagement.setChannel}
      onClose={engagement.closePanel}
      onMaximize={engagement.toggleMaximized}
      onMinimize={engagement.closePanel}
    />
  )
}

function buildEngagement(
  contacts: Contact[],
  channel: EngagementChannel,
  rawAnalysis: Record<string, unknown>,
  anchorRect?: DOMRect | null,
  callPreparation?: boolean,
  initialParameters?: MessageParameters,
  initialContext?: string,
): ContactEngagementState {
  const firstContact = contacts[0]!
  const channelsByContactId = buildContactChannels(contacts, channel, callPreparation)
  const firstChannel =
    channelsByContactId[firstContact.id] ?? resolveChannelForContact(firstContact, channel, callPreparation)

  return {
    ...(callPreparation ? { callPreparation } : {}),
    ...(initialParameters ? { initialParameters } : {}),
    ...(initialContext ? { initialContext } : {}),
    contacts,
    anchorRect,
    channelsByContactId,
    rawAnalysis,
    activeContactId: firstContact.id,
    channel: firstChannel,
  }
}

function closeContact(
  activeEngagement: ContactEngagementState | null,
  lastEngagement: ContactEngagementState | null,
  contactId: string,
): { active: ContactEngagementState | null; last: ContactEngagementState | null } {
  if (!lastEngagement) return { active: activeEngagement, last: null }
  const remainingContacts = lastEngagement.contacts.filter(contact => contact.id !== contactId)
  if (remainingContacts.length === 0) return { active: null, last: null }
  const nextState = buildNextEngagement(activeEngagement, lastEngagement, contactId, remainingContacts)
  return { active: activeEngagement ? nextState : null, last: nextState }
}

function openContact(
  lastEngagement: ContactEngagementState,
  contactId: string,
  anchorRect?: DOMRect,
): ContactEngagementState | null {
  const nextContact = lastEngagement.contacts.find(contact => contact.id === contactId)
  if (!nextContact) return null
  return {
    ...lastEngagement,
    anchorRect: anchorRect ?? lastEngagement.anchorRect ?? null,
    activeContactId: contactId,
    channel: resolveChannelForContact(
      nextContact,
      lastEngagement.channelsByContactId[contactId] ?? lastEngagement.channel,
      lastEngagement.callPreparation,
    ),
  }
}

function setActiveContact(activeEngagement: ContactEngagementState, contactId: string): ContactEngagementState | null {
  const nextContact = activeEngagement.contacts.find(contact => contact.id === contactId)
  if (!nextContact) return null
  return {
    ...activeEngagement,
    activeContactId: contactId,
    channel: resolveChannelForContact(
      nextContact,
      activeEngagement.channelsByContactId[contactId] ?? activeEngagement.channel,
      activeEngagement.callPreparation,
    ),
  }
}

function buildNextEngagement(
  activeEngagement: ContactEngagementState | null,
  lastEngagement: ContactEngagementState,
  closedContactId: string,
  remainingContacts: Contact[],
): ContactEngagementState {
  const currentActiveId = activeEngagement?.activeContactId ?? lastEngagement.activeContactId
  const nextContact =
    currentActiveId === closedContactId
      ? remainingContacts[Math.max(remainingContacts.length - 1, 0)]!
      : (remainingContacts.find(contact => contact.id === currentActiveId) ?? remainingContacts[0]!)
  return {
    ...lastEngagement,
    contacts: remainingContacts,
    activeContactId: nextContact.id,
    channelsByContactId: pickContactChannels(lastEngagement.channelsByContactId, remainingContacts),
    channel: resolveChannelForContact(
      nextContact,
      lastEngagement.channelsByContactId[nextContact.id] ?? lastEngagement.channel,
      lastEngagement.callPreparation,
    ),
  }
}

function omitContactAnchor(anchors: Record<string, DOMRect>, contactId: string): Record<string, DOMRect> {
  const next = { ...anchors }
  delete next[contactId]
  return next
}

function resolveActiveContact(engagement: ContactEngagementState): Contact | null {
  return engagement.contacts.find(contact => contact.id === engagement.activeContactId) ?? null
}

function resolveChannelForContact(
  contact: Contact,
  preferredChannel: EngagementChannel,
  callPreparation?: boolean,
): EngagementChannel {
  if (hasChannelData(contact, preferredChannel, callPreparation)) return preferredChannel
  return getAvailableChannels(contact)[0] ?? preferredChannel
}

function buildContactChannels(
  contacts: Contact[],
  preferredChannel: EngagementChannel,
  callPreparation?: boolean,
): Record<string, EngagementChannel> {
  return Object.fromEntries(
    contacts.map(contact => [contact.id, resolveChannelForContact(contact, preferredChannel, callPreparation)]),
  )
}

function pickContactChannels(
  channelsByContactId: Record<string, EngagementChannel>,
  contacts: Contact[],
): Record<string, EngagementChannel> {
  return Object.fromEntries(
    contacts.map(contact => [
      contact.id,
      channelsByContactId[contact.id] ?? resolveChannelForContact(contact, 'linkedin'),
    ]),
  )
}

function hasChannelData(
  contact: Pick<Contact, 'email' | 'linkedin_url' | 'phone' | 'account_id'>,
  channel: EngagementChannel,
  callPreparation?: boolean,
): boolean {
  // #2123.72 — une tâche ne demande aucune coordonnée, seulement un compte où vivre.
  if (
    channel === 'task' ||
    channel === 'recommendation' ||
    channel === 'introduction_request' ||
    channel === 'partner_message' ||
    channel === 'profile_push'
  ) {
    return Boolean(contact.account_id)
  }
  // #2370 (R41) — la note LinkedIn se PRÉPARE sans coordonnée (le menu « Contacter » la propose toujours) :
  // rien ne part d'ici, le commercial envoie lui-même. Théo B C5.A24 — SMS, WhatsApp et message vocal sont retirés.
  if (channel === 'linkedin_connection_note') return true
  if (channel === 'linkedin') return Boolean(contact.linkedin_url)
  // #3697.5 — préparer l'appel ne demande pas de numéro ; le passer, si.
  if (channel === 'phone') return Boolean(contact.phone) || callPreparation === true
  return Boolean(contact.email)
}

function sameRect(current: DOMRect | undefined, next: DOMRect): boolean {
  if (!current) return false
  return (
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height
  )
}
