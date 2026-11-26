import type { MessageParameters } from './message-parameters'
import type { AssistantEntry, ConversationEntry } from './conversation'

/**
 * #3696.4 — ce que le commercial a devant lui pour UN contact sur UN canal :
 * le fil (brouillons, versions précédentes, corrections manuelles), la saisie
 * non envoyée à Laura et le brief choisi. « Fermer » n'envoie rien et ne jette
 * rien : le panneau se démonte, ce cliché survit dans le fournisseur.
 */
export type EngagementDraftSnapshot = {
  entries: ConversationEntry[]
  context: string
  parameters: MessageParameters
}

export type EngagementDraftStore = {
  get: (key: string) => EngagementDraftSnapshot | undefined
  set: (key: string, snapshot: EngagementDraftSnapshot) => void
  clearContact: (contactId: string) => void
  /**
   * #3696.8 — une génération part (`begin`) puis finit (`end`) : tant qu'elle
   * court, l'écran peut le DIRE, même panneau fermé. Un compteur par clé — deux
   * générations d'un même fil ne s'effacent pas l'une l'autre.
   */
  begin: (key: string) => void
  end: (key: string) => void
  isPending: (key: string) => boolean
  isContactPending: (contactId: string) => boolean
  /**
   * #3696.8 — une réponse arrivée APRÈS la fermeture (ou le changement de
   * contact) est rangée sous la clé qui l'a demandée — jamais sous la clé
   * courante. Un panneau rouvert la reprend par `subscribe`.
   */
  deliver: (key: string, update: (current: EngagementDraftSnapshot | undefined) => EngagementDraftSnapshot) => void
  /** Tout changement d'état « en cours » — de quoi se brancher sur `useSyncExternalStore`. */
  subscribe: (listener: () => void) => () => void
  /** Une réponse tardive vient d'être rangée sous `key` — le panneau ouvert sur cette clé l'adopte. */
  onDeliver: (listener: (key: string) => void) => () => void
  /**
   * #3696 (parité démo) + #3694.7 (brief confirmé lu après le premier rendu) — pose un cliché venu du SERVEUR (`message_draft_versions`), mais
   * seulement si rien n'existe encore pour cette clé : une édition déjà en cours (ou un fil déjà
   * restauré) ne doit jamais être écrasée par une lecture de rattrapage. Notifie comme `deliver`
   * (`onDeliver`) pour que le fil déjà ouvert sur cette clé l'adopte sans recharger le panneau.
   */
  hydrate: (key: string, snapshot: EngagementDraftSnapshot) => void
}

/** #3696 — un cliché sans tour ni saisie ne porte rien à protéger d'une lecture serveur. */
export function isPristine(snapshot: EngagementDraftSnapshot): boolean {
  return snapshot.entries.length === 0 && snapshot.context === ''
}

/** Un brouillon est attribué à `contact.id` ET à son canal — jamais à un autre contact. */
export function draftKey(contactId: string, channel: string): string {
  return `${contactId}:${channel}`
}

/** L'inverse de `draftKey` — le contact peut être un UUID, le canal n'en porte jamais. */
export function parseDraftKey(key: string): { contactId: string; channel: string } {
  const separator = key.lastIndexOf(':')
  return { contactId: key.slice(0, separator), channel: key.slice(separator + 1) }
}

type DraftVersionPersistKind = 'generated' | 'edited'

export function createEngagementDraftStore(options?: {
  /**
   * #3695.4/.6 — un tour qui porte un modèle/style appliqué (nouveau), ou une correction
   * manuelle (sur un tour déjà présent), part vers `message_draft_versions`. Absent en test :
   * aucun appel réseau, comportement historique inchangé.
   */
  persistVersion?: (key: string, entry: AssistantEntry, kind: DraftVersionPersistKind) => void
}): EngagementDraftStore {
  const snapshots = new Map<string, EngagementDraftSnapshot>()
  const pending = new Map<string, number>()
  const listeners = new Set<() => void>()
  const deliveryListeners = new Set<(key: string) => void>()
  // Le dernier cliché déjà SCANNÉ pour la persistance — jamais celui affiché, pour ne
  // jamais reposter un tour déjà envoyé (une frappe dans `context` ne change pas `entries`,
  // donc ne déclenche rien ici).
  const scanned = new Map<string, EngagementDraftSnapshot>()
  const notify = () => listeners.forEach(listener => listener())
  const persist = options?.persistVersion
  function scanForNewVersions(key: string, snapshot: EngagementDraftSnapshot): void {
    if (!persist) return
    const previous = scanned.get(key)
    scanned.set(key, snapshot)
    if (previous?.entries === snapshot.entries) return
    const previousById = new Map<string, AssistantEntry>()
    for (const previousEntry of previous?.entries ?? []) {
      if (previousEntry.role === 'assistant') previousById.set(previousEntry.id, previousEntry)
    }
    for (const entry of snapshot.entries) {
      if (entry.role !== 'assistant') continue
      const previousEntry = previousById.get(entry.id)
      if (!previousEntry) {
        if (entry.usedTemplate || entry.usedStyleId) persist(key, entry, 'generated')
        continue
      }
      if (entry.edited && entry.edited !== previousEntry.edited) persist(key, entry, 'edited')
    }
  }
  return {
    get: key => snapshots.get(key),
    set: (key, snapshot) => {
      snapshots.set(key, snapshot)
      scanForNewVersions(key, snapshot)
    },
    clearContact: contactId => {
      for (const key of [...snapshots.keys()]) if (key.startsWith(`${contactId}:`)) snapshots.delete(key)
      for (const key of [...pending.keys()]) if (key.startsWith(`${contactId}:`)) pending.delete(key)
      notify()
    },
    begin: key => {
      pending.set(key, (pending.get(key) ?? 0) + 1)
      notify()
    },
    end: key => {
      const left = (pending.get(key) ?? 0) - 1
      if (left > 0) pending.set(key, left)
      else pending.delete(key)
      notify()
    },
    isPending: key => (pending.get(key) ?? 0) > 0,
    isContactPending: contactId => [...pending.keys()].some(key => key.startsWith(`${contactId}:`)),
    deliver: (key, update) => {
      // Onglet fermé entre-temps (`clearContact`) : le commercial a abandonné ce brouillon,
      // une réponse tardive ne le ressuscite pas.
      if (!pending.has(key)) return
      const next = update(snapshots.get(key))
      snapshots.set(key, next)
      scanForNewVersions(key, next)
      deliveryListeners.forEach(listener => listener(key))
      notify()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onDeliver: listener => {
      deliveryListeners.add(listener)
      return () => {
        deliveryListeners.delete(listener)
      }
    },
    hydrate: (key, snapshot) => {
      const existing = snapshots.get(key)
      // #3696 — le montage du fil pose un cliché VIDE (aucun tour, aucune saisie) avant que la lecture
      // serveur n'arrive : sans cette exception, le panneau s'ouvrait vide sur Nadia Perrin alors que
      // `message_draft_versions` portait ses deux brouillons. Vide = rien à protéger.
      if (existing && !isPristine(existing)) return
      // Le brief déjà choisi dans le panneau (CTA, réglages) survit à la lecture.
      const next = existing ? { ...snapshot, parameters: { ...snapshot.parameters, ...existing.parameters } } : snapshot
      snapshots.set(key, next)
      // Vient du serveur : ne pas reposter ce qu'on vient de lire.
      scanned.set(key, next)
      deliveryListeners.forEach(listener => listener(key))
      notify()
    },
  }
}
