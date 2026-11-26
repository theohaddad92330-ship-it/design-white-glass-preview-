import type { Contact, MessageGrounding } from '@bellum/contracts'
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { ApiError, sessionIsDead } from '@/lib/api-error'
import { contactsApi } from '@/features/contacts/api'
import { chosenParameters, type MessageParameters } from './message-parameters'
import { combineAngleWithTone, type MessageInsight, type MessageToneOption } from '@/lib/message-insight'
import { getInitialDraft } from './message'
import { draftKey, type EngagementDraftSnapshot, type EngagementDraftStore } from './draft-store'
import type { ContactMessage, EngagementChannel } from './types'

export type AssistantEntry = MessageInsight & {
  channel: EngagementChannel
  id: string
  role: 'assistant'
  subject: string
  text: string
  /**
   * #1926.31 — l'angle qui a produit CE brouillon (chaîne vide = aucun angle,
   * signal le plus actionnable du compte). Nécessaire pour « changer le ton »,
   * qui AJOUTE son instruction à cet angle plutôt que de le remplacer
   * (`message_brief.py::tone_options`). Absent sur les brouillons pré-écrits
   * de `buildInitialEntries` — ils ne viennent pas de `/message/generate`.
   */
  angle?: string
  /**
   * #3696.3 — les corrections manuelles du commercial sur CE brouillon. Elles
   * vivent dans le fil (pas dans l'état local de la bulle) : une nouvelle
   * variante, une fermeture du panneau ou un changement d'onglet ne les perdent pas.
   */
  edited?: { subject: string; body: string }
  /**
   * #3695.4 — le style de message appliqué à CE brouillon. Posé seulement quand le
   * serveur a répondu : un style introuvable ou inactif échoue (`resolveActiveTemplateForGeneration`)
   * au lieu de générer un texte qui prétend le suivre.
   */
  usedStyleId?: string
  /** #3695.4 — le modèle approuvé inséré tel quel : sa source et sa version, vérifiables. */
  usedTemplate?: { source: string; version: number }
  /**
   * #3695.5 — le texte est IDENTIQUE à celui du brouillon précédent : l'écran le dit,
   * il n'annonce jamais une adaptation qui n'a pas eu lieu.
   */
  unchanged?: boolean
}

type UserEntry = {
  id: string
  role: 'user'
  text: string
}

/** A generation that failed — kept INLINE (not a transient toast) so the rep can
 *  retry with the same angle without re-typing it (Théo restitution P0-05 :
 *  « aucun bouton mort — retry + message d'erreur actionnable »). */
type ErrorEntry = {
  id: string
  role: 'error'
  channel: EngagementChannel
  /** The angle the failed attempt used — replayed verbatim on retry. */
  angle: string
  /** #3458 — la raison NOMMÉE par le moteur (contexte insuffisant, brouillon rejeté) ; absente pour une panne. */
  reason?: string
}

export type ConversationEntry = AssistantEntry | UserEntry | ErrorEntry

type GeneratedDraft = MessageInsight & { subject: string; body: string }

const NAMED_REFUSAL_CODES = new Set([
  'message_refused',
  'message_contact_not_found',
  'message_account_not_found', // #4609
  'account_no_go',
])

/** #3458 — seul un refus que le moteur a NOMMÉ porte une raison ; une panne reste le message générique. */
function refusalReason(error: unknown): { reason: string } | Record<string, never> {
  // #4609.4 — un 401/403 n'est pas « contact introuvable » : la session ne vaut plus rien, et l'écran le DIT.
  if (error instanceof ApiError && sessionIsDead(error.status)) {
    return { reason: i18n.t('engagement:generation.sessionExpired') }
  }
  // #3418 — `account_no_go` (409) et `message_contact_not_found` (404) portent aussi une phrase NOMMÉE du serveur.
  const named = error instanceof ApiError && NAMED_REFUSAL_CODES.has(error.code ?? '')
  if (named && error.message) return { reason: error.message }
  // #4962 — une panne se NOMME : quota atteint (429) ≠ service indisponible (502/503/délai). Jamais le même texte.
  if (error instanceof ApiError && error.status === 429) return { reason: i18n.t('engagement:generation.rateLimited') }
  const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
  if (
    timedOut ||
    (error instanceof ApiError && (error.status === 502 || error.status === 503 || error.status === 504))
  ) {
    return { reason: i18n.t('engagement:generation.unavailable') }
  }
  return {}
}

export function useEngagementConversation({
  channel,
  contact,
  message,
  drafts,
  draftHydrated = true,
  initialParameters,
  initialContext,
  autoDraft = false,
  grounding,
}: {
  channel: EngagementChannel
  contact: Contact
  message: ContactMessage
  /** #3696.4 — le cliché du fil survit à la fermeture du panneau ; absent = comportement historique. */
  drafts?: EngagementDraftStore
  /**
   * #3694.7 — la lecture du brouillon serveur (`EngagementPanel`, via
   * `drafts.hydrate`) s'est-elle terminée (succès ou échec) ? `true` par
   * défaut — un appelant qui n'hydrate pas depuis le serveur (ou aucun test)
   * n'a rien à attendre. Tant que `false`, la fermeture n'écrit RIEN : un
   * panneau fermé avant la fin du chargement écrirait un cliché vide par-
   * dessus un brouillon pas encore reçu.
   */
  draftHydrated?: boolean
  /**
   * #3263.46/.48 — l'objectif porté par le CTA qui a ouvert ce fil (« préparer l'approche »,
   * « créer une introduction »). N'écrase JAMAIS un fil déjà restauré : seulement l'absence totale.
   */
  initialParameters?: MessageParameters
  /**
   * #4415.2 — l'angle de l'étape du plan qui a ouvert ce fil : le champ s'ouvre pré-rempli et la rédaction
   * automatique (#4333) le prend pour angle. N'écrase JAMAIS un fil restauré ; absent = champ vide.
   */
  initialContext?: string
  /**
   * #4333 — la fenêtre s'ouvre DÉJÀ RÉDIGÉE (décision Louis 19/10) : un fil vide, une fois la lecture
   * du brouillon serveur terminée, déclenche UNE génération sans geste. Un échec se dit dans le fil
   * (bulle d'erreur + « Réessayer »), jamais de texte inventé ; absent = comportement historique.
   */
  autoDraft?: boolean
  /**
   * #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés (ou « angle libre »), envoyés à CHAQUE génération.
   * Absent = clé omise, corps identique à avant.
   */
  grounding?: MessageGrounding
}) {
  const key = draftKey(contact.id, channel)
  const restored = drafts?.get(key)
  const [context, setContext] = useState(restored?.context ?? initialContext ?? '')
  // #2123.61-.68 — les paramètres choisis cadrent CHAQUE génération du fil.
  const [parameters, setParameters] = useState<MessageParameters>(restored?.parameters ?? initialParameters ?? {})
  // #2204.59-.65 (épopée #2947) — le style de message ACTIF choisi, distinct de
  // `parameters` (des codes revalidés par le MOTEUR) : c'est un identifiant de
  // ressource d'espace, résolu et vérifié côté `IaProxyController`. `null` =
  // comportement historique inchangé (aucun style appliqué).
  const [styleTemplateId, setStyleTemplateId] = useState<string | null>(null)
  const [entries, setEntries] = useState<ConversationEntry[]>(
    () => restored?.entries ?? buildInitialEntries(contact, channel, message),
  )
  // #3696.5 — la clé à laquelle appartiennent `entries`/`context`/`parameters` : au changement de
  // contact ou de canal, l'état reste celui de l'ANCIEN le temps d'un rendu — on ne le range
  // jamais sous la clé du nouveau.
  const [stateKey, setStateKey] = useState(key)
  const [generationStep, setGenerationStep] = useState<string | null>(null)
  // Monotonic token — a channel/contact switch (reset effect) or unmount bumps it
  // so a still-in-flight IA generation can't append a stale draft to a thread it
  // no longer belongs to.
  const generationRef = useRef(0)
  // #3696.8 — le jeton en vol à cette valeur a été DÉTACHÉ (fermeture, autre contact) : leur
  // réponse, si elle vient, est rangée sous leur propre clé au lieu d'être jetée. Un jeton
  // simplement dépassé par une génération plus récente du MÊME fil n'y est jamais.
  const detachedRef = useRef(0)
  const mountedRef = useRef(false)
  // #3694.7 — `draftHydrated` est un PROP (lecture faite par `EngagementPanel`,
  // via `drafts.hydrate`) : cette ref n'existe que pour la lire depuis la
  // fermeture du panneau (effet ci-dessous) sans la remettre dans ses deps —
  // un changement de `draftHydrated` seul ne doit pas reprogrammer l'effet.
  const hydratedRef = useRef(draftHydrated)
  hydratedRef.current = draftHydrated
  /**
   * #3694.7 — enregistre le cliché en quittant CETTE clé (autre contact,
   * autre canal, ou fermeture du panneau) — jamais à chaque frappe : pas de
   * minuteur à annuler, pas de fuite entre deux instances du composer. La
   * fermeture lit le DERNIER cliché posé en mémoire (`drafts.get`, tenu à
   * jour par l'effet juste au-dessous), jamais un état capturé en retard.
   */
  useEffect(() => {
    if (!drafts) return
    const closingContactId = contact.id
    const closingChannel = channel
    const closingKey = key
    return () => {
      // Jamais écrit avant la lecture initiale : un panneau fermé AVANT la fin
      // du chargement n'a rien de neuf à dire, et écrirait un cliché vide
      // par-dessus un brouillon pas encore reçu.
      if (!hydratedRef.current) return
      const snapshot = drafts.get(closingKey)
      if (!snapshot) return
      // `Promise.resolve(...)` — même garde que la lecture : un appelant qui ne
      // rendrait pas une vraie promesse ne doit jamais faire planter la fermeture.
      void Promise.resolve(
        contactsApi.saveEngagementDraft(closingContactId, closingChannel, {
          entries: snapshot.entries as unknown as Record<string, unknown>[],
          context: snapshot.context,
          parameters: snapshot.parameters as Record<string, string>,
        }),
      ).catch(() => {})
    }
  }, [drafts, key, contact.id, channel])
  useEffect(() => {
    const first = !mountedRef.current
    mountedRef.current = true
    // Au premier montage, le fil restauré (ou initial) est déjà en place.
    if (first && restored) return
    const next = drafts?.get(key)
    setStateKey(key)
    setParameters(next?.parameters ?? initialParameters ?? {})
    detachedRef.current = generationRef.current
    return resetConversation(
      generationRef,
      setEntries,
      setContext,
      setGenerationStep,
      contact,
      channel,
      message,
      next,
      initialContext,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `restored`/`drafts` ne relancent pas un reset
  }, [channel, contact, message])
  useEffect(() => {
    if (stateKey !== key) return
    drafts?.set(key, { entries, context, parameters })
  }, [drafts, entries, context, parameters, key, stateKey])
  // #2204.59-.65 — un style est enregistré POUR UN CANAL (`MessageStyleTemplate.channel`) ;
  // changer de canal invalide le choix précédent plutôt que d'envoyer un style
  // dont le contrat n'a plus de sens pour ce canal.
  useEffect(() => {
    setStyleTemplateId(null)
  }, [channel])
  useEffect(
    () => () => {
      detachedRef.current = generationRef.current
      generationRef.current += 1
    },
    [],
  )
  // #3696.8 — une réponse arrivée pendant que le panneau était fermé est rangée sous sa clé ;
  // rouvert (ou resté ouvert sur cette clé), le fil l'adopte.
  const keyRef = useRef(key)
  keyRef.current = key
  useEffect(
    () =>
      drafts?.onDeliver(deliveredKey => {
        if (deliveredKey !== keyRef.current) return
        const snapshot = drafts.get(deliveredKey)
        if (!snapshot) return
        setEntries(snapshot.entries)
        // #3694.7 — une hydratation depuis le serveur passe par ce même canal
        // (`hydrate`) : le brief confirmé (paramètres) et l'angle (`context`)
        // doivent arriver avec le fil, pas seulement les bulles. Sans effet sur
        // une livraison de génération « détachée » : `deliver` y laisse
        // `context`/`parameters` identiques à ce qu'ils étaient déjà.
        setContext(snapshot.context)
        setParameters(snapshot.parameters)
      }),
    [drafts],
  )
  // La génération court-elle encore pour CE fil (lancée avant la fermeture) ? L'écran le dit.
  const keptPending = useSyncExternalStore(drafts?.subscribe ?? noopSubscribe, () => drafts?.isPending(key) ?? false)

  const params = () => ({
    drafts,
    key,
    detachedRef,
    channel,
    contact,
    context,
    message,
    parameters,
    styleTemplateId,
    grounding,
    setContext,
    setEntries,
    setGenerationStep,
  })

  const generateDraft = () => generateConversationDraft(generationRef, params())

  // #4333 — une seule rédaction automatique par fil (clé contact + canal) : la bulle d'erreur ne reboucle pas.
  const autoDraftedKeyRef = useRef<string | null>(null)
  const canAutoDraft =
    autoDraft && draftHydrated && stateKey === key && entries.length === 0 && !generationStep && !keptPending
  useEffect(() => {
    if (!canAutoDraft || autoDraftedKeyRef.current === key) return
    autoDraftedKeyRef.current = key
    void generateConversationDraft(generationRef, params(), { appendUserEntry: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois par clé ; `params()` relit l'état courant
  }, [canAutoDraft, key])

  /** #3696.3 — retient la correction manuelle d'un brouillon dans le fil. */
  const editEntry = (entryId: string, edited: { subject: string; body: string }) =>
    setEntries(current =>
      current.map(entry => (entry.id === entryId && entry.role === 'assistant' ? { ...entry, edited } : entry)),
    )

  // Retry the failed attempt with its stored angle — drops the error bubble and
  // regenerates WITHOUT re-appending the prompt (it is still in the thread).
  const retryDraft = (entry: ErrorEntry) =>
    generateConversationDraft(generationRef, params(), {
      angleOverride: entry.angle,
      appendUserEntry: false,
      removeEntryId: entry.id,
    })

  // #1926.28 — régénère avec l'ANGLE ALTERNATIF proposé par le modèle, verbatim.
  // Réutilise le même chemin `/ia/message` que « Générer » : ce n'est PAS une
  // régénération automatique, c'est le geste explicite du commercial qui pose
  // ce texte comme angle et relance un appel, exactement comme un angle tapé
  // à la main dans le composer.
  const useAlternativeAngle = (angle: string) =>
    generateConversationDraft(generationRef, params(), { angleOverride: angle })

  // #1926.31 — « changer le ton » AJOUTE l'instruction au ton au tour
  // PRÉCÉDENT qui a produit `entry` (`entry.angle`), il ne le remplace pas :
  // `derive_message_brief` relit l'angle envoyé pour en tirer tu/vous.
  const changeTone = (entry: AssistantEntry, tone: MessageToneOption) =>
    generateConversationDraft(generationRef, params(), {
      angleOverride: combineAngleWithTone(entry.angle ?? '', tone),
    })

  /**
   * #3417 (retour bêta 30/09) — « modèle approuvé » : le texte EXACT choisi
   * dans la bibliothèque versionnée, variables déjà substituées côté API
   * (`ApprovedMessageTemplateService`, jamais une invention côté client).
   * Contrairement à `generateConversationDraft`, AUCUN appel `/ia/message` —
   * ce n'est pas une génération, c'est une insertion verbatim. La raison
   * l'affiche comme telle dans `MessageInsightPanel` (« pourquoi ce message »)
   * plutôt que de fabriquer une rationale qui ferait croire à une génération.
   */
  const useApprovedTemplate = (candidate: { source: string; version: number; renderedText: string }) => {
    const entry = buildAssistantEntry(
      channel,
      channel === 'email' ? message.emailSubject : '',
      candidate.renderedText,
      undefined,
      {
        rationale: i18n.t('engagement:generation.templateRationale', {
          source: candidate.source,
          version: candidate.version,
        }),
      },
      { usedTemplate: { source: candidate.source, version: candidate.version } },
    )
    setEntries(current => [...current, entry])
  }

  /**
   * #2123.59 — décision Louis 15/09 : CHOISIR un objectif génère le brouillon
   * (un appel modèle par choix, contre la recommandation « garder le clic »).
   * #3695 — la version PRÉCÉDENTE est conservée (comparer, revenir) : le nouvel
   * objectif s'ajoute, il n'écrase rien.
   *
   * Seul un objectif NOUVEAU et non vide déclenche l'appel : les autres
   * paramètres cadrent la prochaine génération sans en lancer une. Aucune bulle
   * de consigne n'est ajoutée (le geste est le choix, pas un texte) et l'angle
   * tapé reste dans le composer. `/ia/message` ne débite AUCUN crédit — rien à
   * annoncer avant (GA-49/86 visent un débit) ; il est borné à 20 appels par
   * minute côté API (`LLM_DRAFT_RATE_LIMIT`).
   *
   * Rend la génération lancée, ou `null` quand rien ne part.
   */
  const chooseParameters = (next: MessageParameters): Promise<void> | null => {
    const objective = next.objective?.trim() ?? ''
    const changed = objective !== (parameters.objective?.trim() ?? '')
    setParameters(next)
    if (!changed || !objective) return null
    return generateConversationDraft(
      generationRef,
      { ...params(), parameters: next },
      {
        appendUserEntry: false,
      },
    )
  }

  /**
   * #3633 (Louis 05/10/2026) — « Email suggéré » pose d'abord un QCM
   * (`EngagementApproachQuiz`) ; ses réponses partent par le MÊME chemin que
   * « Générer » : l'angle en `context`, objectif et contraintes de forme en
   * `parameters` (fusionnés à ceux déjà choisis, qui restent pour la suite).
   */
  const generateFromApproach = (choice: { angle: string; parameters: MessageParameters }) => {
    const merged = { ...parameters, ...choice.parameters }
    setParameters(merged)
    return generateConversationDraft(
      generationRef,
      { ...params(), parameters: merged },
      { angleOverride: choice.angle },
    )
  }

  return {
    context,
    entries,
    generationStep: generationStep ?? (keptPending ? i18n.t('engagement:generation.writing') : null),
    generateDraft,
    generateFromApproach,
    retryDraft,
    useAlternativeAngle,
    useApprovedTemplate,
    changeTone,
    editEntry,
    setContext,
    parameters,
    setParameters,
    chooseParameters,
    styleTemplateId,
    setStyleTemplateId,
  }
}

const noopSubscribe = () => () => undefined

export function contextPresetForChannel(channel: EngagementChannel): string {
  // i18n keys: preset.email | preset.linkedin | preset.phone | preset.task
  return i18n.t(`engagement:preset.${channel}`)
}

function resetConversation(
  generationRef: MutableRefObject<number>,
  setEntries: (entries: ConversationEntry[]) => void,
  setContext: (context: string) => void,
  setGenerationStep: (step: string | null) => void,
  contact: Contact,
  channel: EngagementChannel,
  message: ContactMessage,
  snapshot?: EngagementDraftSnapshot,
  initialContext?: string,
) {
  // Invalidate any in-flight generation before swapping threads.
  generationRef.current += 1
  setEntries(snapshot?.entries ?? buildInitialEntries(contact, channel, message))
  setContext(snapshot?.context ?? initialContext ?? '')
  setGenerationStep(null)
}

/** Retire les bulles d'erreur et la consigne qui les précède immédiatement. */
function dropFailedAttempts(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.filter((entry, index) => {
    if (entry.role === 'error') return false
    return !(entry.role === 'user' && entries[index + 1]?.role === 'error')
  })
}

async function generateConversationDraft(
  generationRef: MutableRefObject<number>,
  params: {
    drafts?: EngagementDraftStore
    key: string
    detachedRef: MutableRefObject<number>
    channel: EngagementChannel
    contact: Contact
    context: string
    message: ContactMessage
    parameters: MessageParameters
    styleTemplateId: string | null
    grounding?: MessageGrounding
    setContext: (context: string) => void
    setEntries: Dispatch<SetStateAction<ConversationEntry[]>>
    setGenerationStep: (step: string | null) => void
  },
  opts?: {
    angleOverride?: string
    appendUserEntry?: boolean
    removeEntryId?: string
  },
) {
  const token = (generationRef.current += 1)
  const angle = opts?.angleOverride ?? params.context
  // On retry, drop the stale error bubble; the prompt bubble stays in place.
  if (opts?.removeEntryId) params.setEntries(current => current.filter(entry => entry.id !== opts.removeEntryId))
  // #3550.1 — une nouvelle tentative REMPLACE la tentative échouée (consigne + erreur) :
  // sans cela, deux « Générer » en échec empilent deux blocs identiques.
  params.setEntries(current => dropFailedAttempts(current))
  if (opts?.appendUserEntry !== false) {
    params.setEntries(current => [...current, { id: createEntryId('user'), role: 'user', text: userPrompt(angle) }])
    params.setContext('')
  }
  params.setGenerationStep(i18n.t('engagement:generation.writing'))
  params.drafts?.begin(params.key)
  try {
    const draft = await resolveGeneratedDraft(
      params.contact,
      params.channel,
      angle,
      params.parameters,
      params.styleTemplateId,
      params.grounding,
    )
    const subject = draft.subject || (params.channel === 'email' ? params.message.emailSubject : '')
    if (generationRef.current !== token) {
      // Détachée (fermeture, autre contact : c'était la génération COURANTE) : rangée sous SA clé. Remplacée par une plus récente : jetée.
      if (token === params.detachedRef.current && draft.body.trim()) {
        deliverDetached(
          params,
          buildAssistantEntry(params.channel, subject, draft.body, angle, draft, {
            ...(params.styleTemplateId ? { usedStyleId: params.styleTemplateId } : {}),
          }),
        )
      }
      return
    }
    appendAssistantEntry(params, subject, draft.body, angle, draft, params.styleTemplateId)
  } catch (error) {
    if (generationRef.current !== token) {
      if (token === params.detachedRef.current) {
        const failed: ErrorEntry = {
          id: createEntryId('error'),
          role: 'error',
          channel: params.channel,
          angle,
          ...refusalReason(error),
        }
        deliverDetached(params, failed)
      }
      return
    }
    console.error('[Engagement]', error)
    // #4062.2 — la consigne vidée au départ revient au champ : un échec ne la perd pas.
    if (opts?.appendUserEntry !== false) params.setContext(angle)
    // Actionable INLINE failure (P0-05) — carries the angle so retry replays it.
    params.setEntries(current => [
      ...current,
      { id: createEntryId('error'), role: 'error', channel: params.channel, angle, ...refusalReason(error) },
    ])
  } finally {
    if (generationRef.current === token) params.setGenerationStep(null)
    params.drafts?.end(params.key)
  }
}

/**
 * #3696.8 — la réponse d'une génération partie AVANT « Fermer » (ou avant un changement
 * de contact) : rangée dans le cliché de la clé qui l'a demandée, après retrait des bulles
 * d'une tentative échouée précédente. Sans magasin (comportement historique), rien n'est rangé.
 */
function deliverDetached(params: { drafts?: EngagementDraftStore; key: string }, entry: ConversationEntry): void {
  params.drafts?.deliver(params.key, current => ({
    entries: [...dropFailedAttempts(current?.entries ?? []), entry],
    context: current?.context ?? '',
    parameters: current?.parameters ?? {},
  }))
}

function appendAssistantEntry(
  params: {
    channel: EngagementChannel
    setEntries: Dispatch<SetStateAction<ConversationEntry[]>>
  },
  subject: string,
  body: string,
  angle: string,
  insight: MessageInsight,
  styleTemplateId: string | null,
): void {
  if (!body.trim()) return
  params.setEntries(current => {
    const entry = buildAssistantEntry(params.channel, subject, body, angle, insight, {
      ...(styleTemplateId ? { usedStyleId: styleTemplateId } : {}),
      ...(sameText(lastAssistantText(current), body) ? { unchanged: true } : {}),
    })
    return [...current, entry]
  })
}

/** Le texte que le commercial a réellement sous les yeux : sa correction, sinon le brouillon généré. */
function lastAssistantText(entries: ConversationEntry[]): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.role === 'assistant') return entry.edited?.body ?? entry.text
  }
  return null
}

function sameText(previous: string | null, next: string): boolean {
  return previous !== null && previous.trim() === next.trim()
}

/**
 * Real IA draft (Claude) via the JWT-authenticated proxy: channel + free-text
 * angle in, one ready-to-send draft out.
 *
 * #1926.28-.31, #1925 — `rationale` / `alternativeAngle` / `brief` /
 * `specificity` / `toneOptions` sont TOUS facultatifs sur la réponse : un
 * déploiement en cours peut encore servir l'ancienne forme de l'API
 * (`subject`/`body` seuls), et ce chemin doit rester byte-identique dans ce cas.
 */
async function resolveGeneratedDraft(
  contact: Contact,
  channel: EngagementChannel,
  context: string,
  parameters: MessageParameters = {},
  styleTemplateId: string | null = null,
  grounding?: MessageGrounding,
): Promise<GeneratedDraft> {
  const angle = context.trim()
  // #2123.61-.68 — clé OMISE sans paramètre choisi : corps identique à avant.
  const chosen = chosenParameters(parameters)
  const res = await apiFetch<
    { success: boolean; data: { channel: string; subject: string; body: string } & MessageInsight },
    {
      contactId: string
      channel: EngagementChannel
      context?: string
      parameters?: MessageParameters
      messageStyleTemplateId?: string
      grounding?: MessageGrounding
    }
  >({
    path: '/ia/message',
    method: 'POST',
    body: {
      contactId: contact.id,
      channel,
      context: angle || undefined,
      ...(chosen ? { parameters: chosen } : {}),
      // #2204.59-.65 — clé OMISE sans style choisi : corps identique à avant.
      ...(styleTemplateId ? { messageStyleTemplateId: styleTemplateId } : {}),
      // #4524.2 — clé OMISE sans choix du commercial : corps identique à avant.
      ...(grounding ? { grounding } : {}),
    },
  })
  if (!res?.success || !res.data?.body) throw new Error('generation failed')
  return {
    subject: res.data.subject || '',
    body: res.data.body,
    rationale: res.data.rationale,
    alternativeAngle: res.data.alternativeAngle,
    brief: res.data.brief,
    specificity: res.data.specificity,
    toneOptions: res.data.toneOptions,
    knowledgeSources: res.data.knowledgeSources,
    lexiconWarning: res.data.lexiconWarning,
  }
}

function buildInitialEntries(
  contact: Contact,
  channel: EngagementChannel,
  message: ContactMessage,
): ConversationEntry[] {
  const draft = getInitialDraft(channel, message)
  if (!draft) return []
  const entries = [buildAssistantEntry(channel, channel === 'email' ? message.emailSubject : '', draft)]
  // Séquence LinkedIn p10 : M1 ouvre, M2 apporte de la valeur, M3 propose 15 min
  // — puis on s'arrête. Le fil de conversation est exactement la bonne surface :
  // le commercial voit les trois temps dans l'ordre où il les enverra, au lieu
  // d'un M1 seul suivi de rien le jour où la réponse ne vient pas.
  if (channel === 'linkedin') {
    for (const follow of message.linkedinSequence) {
      entries.push(buildAssistantEntry(channel, '', follow))
    }
  }
  return entries
}

function buildAssistantEntry(
  channel: EngagementChannel,
  subject: string,
  text: string,
  angle?: string,
  insight?: MessageInsight,
  trace?: Pick<AssistantEntry, 'usedStyleId' | 'usedTemplate' | 'unchanged'>,
): AssistantEntry {
  return { channel, id: createEntryId('assistant'), role: 'assistant', subject, text, angle, ...insight, ...trace }
}

/** Le dernier tour d'assistante qui porte un brief — lu ici pour que le panneau ne fabrique ni ne rende aucun tour. */
export function lastBriefedAssistantEntry(entries: ConversationEntry[]): AssistantEntry | null {
  const found = [...entries].reverse().find(entry => entry.role === 'assistant' && entry.brief)
  return found?.role === 'assistant' ? found : null
}

function userPrompt(context: string): string {
  return context.trim() || i18n.t('engagement:generation.defaultPrompt')
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
