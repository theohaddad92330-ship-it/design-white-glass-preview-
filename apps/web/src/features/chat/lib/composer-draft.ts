import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * #1953.15 / #1953.16 / #1953.17 / #1953.18 — LE BROUILLON DE LA SAISIE, PAR FIL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `Chat.tsx` ne tenait le texte tapé que dans un `useState` : un rafraîchissement,
 * une perte de réseau qui force à recharger, une navigation accidentelle ou la
 * fermeture d'un panneau qui remonte l'écran effaçaient la question en cours de
 * frappe, sans confirmation ni retour arrière possible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CLÉ — PAR UTILISATEUR ET PAR FIL, JAMAIS PAR WORKSPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `localStorage` est partagé par tout le navigateur : sans l'identifiant de
 * l'utilisateur dans la clé, la personne suivante qui se connecte sur le même
 * poste verrait le brouillon de la précédente. L'identifiant du fil isole
 * ensuite un brouillon PAR conversation — changer de fil ne doit ni écraser
 * l'ancien brouillon ni en hériter un qui n'est pas le sien.
 *
 * ⚠️ Le workspace n'entre PAS dans la clé, à dessein. `useSession()` résout
 * l'utilisateur de façon SYNCHRONE au montage (le fournisseur de session attend
 * avant de rendre ses enfants) ; l'espace actif, lui, vient d'une requête
 * react-query (`useTeam`) encore vide au premier rendu — exactement le moment où
 * la lecture du brouillon doit avoir lieu pour survivre à un rafraîchissement.
 * Composer la clé avec un espace pas encore chargé aurait recréé le défaut que
 * cette capacité corrige. Le risque restant — un même compte qui changerait
 * d'espace insonorisant deux clients différents — n'existe pas dans ce produit
 * (un compte appartient à un seul espace) ; à re-vérifier si ça change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'IDENTIFIANT DU FIL — CE QUI SURVIT VRAIMENT À UN RAFRAÎCHISSEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `activeConversationId` n'est PAS toujours stable au rechargement : un fil
 * neuf sans compte ni `?conversationId=` dans l'URL tire un UUID aléatoire à
 * CHAQUE montage (`newConversationId`, `Chat.tsx`). Coller le brouillon à cet
 * identifiant l'aurait rendu introuvable au rafraîchissement — exactement le cas
 * le plus fréquent en recette (« j'écris sur `/chat` nu, j'appuie sur F5 »).
 * `Chat.tsx` calcule donc une clé de PORTÉE stable (fil partagé par son URL, ou
 * compte actif, ou un panier commun pour un fil neuf sans portée) et la passe
 * ici sous le nom `threadId` — voir le commentaire au point d'appel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne touche pas la bulle flottante de Laura (`features/laura/bubble/`) : son
 * fil est délibérément ÉPHÉMÈRE et « un rechargement efface » est une décision
 * documentée (`ephemeral-thread.ts`), pas un oubli — lui appliquer cette
 * persistance ressusciterait un fil sans son contexte serveur, ce que ce
 * fichier-là refuse explicitement. Voir le rapport de livraison pour le détail.
 */

const DRAFT_KEY_PREFIX = 'bellum:chat-draft:'
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DRAFT_WRITE_DEBOUNCE_MS = 300
/**
 * #3648 (recette prod 06/10) — la fenêtre de CHARGEMENT : la clé de portée du fil
 * se précise quand les requêtes du dossier répondent (fil neuf → compte actif).
 * Un changement de fil qui survient dans cette fenêtre n'est pas un geste de la
 * personne : la saisie déjà tapée le traverse, elle ne se fait pas écraser par le
 * brouillon (vide) du fil d'arrivée.
 */
const HYDRATION_WINDOW_MS = 5000

/**
 * La génération des brouillons — elle avance à chaque purge (`clearAllChatDrafts`).
 *
 * Revue d'intégration du lot fils (13/09) : la purge de déconnexion est
 * synchrone et passe AVANT que React ne rende l'écran sans session ; une frappe
 * encore dans le débounce était ensuite réécrite par le démontage ou par le
 * changement d'utilisateur, et le brouillon ressuscitait après la purge. Une
 * frappe en attente retient la génération où elle est née : si une purge est
 * passée depuis, elle n'est plus écrite.
 */
let draftGeneration = 0

type StoredDraft = { text: string; savedAt: number }

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<StoredDraft>).text === 'string' &&
    typeof (value as Partial<StoredDraft>).savedAt === 'number'
  )
}

const TAB_ID_KEY = 'bellum:chat-tab-id'
let tabId: string | null = null

/**
 * #6 (recette prod 31/10) — l'identité de CET onglet. `sessionStorage` est propre à l'onglet et survit à un
 * rechargement (F5) : la saisie neuve se retrouve, sans être vue par un autre onglet. Stockage indisponible :
 * un identifiant de module, propre à l'onglet pour sa durée de vie.
 */
function currentTabId(): string {
  if (tabId) return tabId
  let id: string | null = null
  try {
    id = sessionStorage.getItem(TAB_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(TAB_ID_KEY, id)
    }
  } catch {
    id = id ?? Math.random().toString(36).slice(2)
  }
  tabId = id
  return id
}

/**
 * La clé `localStorage` d'un brouillon — utilisateur + fil, jamais un seul des deux.
 *
 * #6 — un brouillon PAR CONVERSATION (clé = identifiant du fil). Le panier d'une conversation NEUVE (`new`) est
 * propre à l'onglet : `localStorage` est partagé, deux onglets sur `/chat` mélangeaient leur saisie.
 */
export function chatDraftKey(userId: string, threadId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}:${threadId === 'new' ? `new:${currentTabId()}` : threadId}`
}

/**
 * Lit le brouillon d'un fil. `''` quand il est absent, illisible, ou périmé
 * (plus de 7 jours) — un brouillon périmé est aussi RETIRÉ du stockage, pour ne
 * pas le relire indéfiniment à chaque montage.
 *
 * Sous `try/catch` : un stockage indisponible (navigation privée, quota plein,
 * contexte non sécurisé) rend le comportement d'avant — aucun brouillon — plutôt
 * que de faire planter l'écran.
 */
export function readChatDraft(userId: string, threadId: string): string {
  try {
    const key = chatDraftKey(userId, threadId)
    const raw = localStorage.getItem(key)
    if (!raw) return ''
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      localStorage.removeItem(key)
      return ''
    }
    if (!isStoredDraft(parsed) || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key)
      return ''
    }
    return parsed.text
  } catch {
    return ''
  }
}

/** Écrit le brouillon d'un fil, ou l'efface si le texte est vide. */
export function writeChatDraft(userId: string, threadId: string, text: string): void {
  try {
    const key = chatDraftKey(userId, threadId)
    if (!text) {
      localStorage.removeItem(key)
      return
    }
    const draft: StoredDraft = { text, savedAt: Date.now() }
    localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Stockage indisponible : le brouillon vit le temps de l'onglet, comme avant.
  }
}

/** Efface le brouillon d'UN fil — utilisé quand le serveur a accepté le message. */
export function clearChatDraft(userId: string, threadId: string): void {
  try {
    localStorage.removeItem(chatDraftKey(userId, threadId))
  } catch {
    // idem
  }
}

/**
 * #3769 — après un envoi ACCEPTÉ : purge la clé du fil courant ET le panier
 * commun `new`. Le fil se précise en cours de route (panier `new` → fil du
 * compte) : la frappe a pu être écrite sous `:new` puis sous la clé précisée ;
 * ne purger que la seconde laissait un brouillon périmé qui, au rechargement,
 * écrasait la nouvelle frappe.
 */
export function clearChatDraftAfterSend(userId: string, threadId: string): void {
  clearChatDraft(userId, threadId)
  if (threadId !== 'new') clearChatDraft(userId, 'new')
}

/**
 * Efface TOUS les brouillons — à la déconnexion. Voir
 * `features/auth/clear-client-user-state.ts`, qui l'appelle au même endroit que
 * le vidage du cache IndexedDB : un brouillon reste des données de compte, pas
 * une préférence de poste.
 */
export function clearAllChatDrafts(): void {
  // Avant tout accès au stockage : même un stockage qui jette doit invalider les
  // frappes en attente.
  draftGeneration += 1
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key)
    }
    keys.forEach(key => localStorage.removeItem(key))
  } catch {
    // idem
  }
}

/**
 * Synchronise `input`/`setInput` avec le brouillon persistant du fil `threadId`.
 *
 * - Au montage et à CHAQUE changement de fil (ou d'utilisateur) : écrit
 *   d'abord le brouillon EN COURS de l'ancien fil (il ne doit pas attendre le
 *   débounce pour survivre à un changement de fil), puis charge le brouillon du
 *   nouveau fil dans la saisie — sauf `skipInitialRestore`, qui laisse gagner un
 *   pré-remplissage explicite (`?prompt=`) UNE fois, au tout premier montage.
 * - À chaque frappe : écrit en DEBOUNCE (~300 ms) pour ne pas taper sur le
 *   disque à chaque caractère.
 * - Au démontage : flush immédiat, pour qu'une navigation qui démonte l'écran
 *   ne perde pas les dernières frappes non encore débouncées.
 * - `keepStoredWhileEmpty` (un envoi en vol) : une saisie VIDE n'efface pas le
 *   brouillon stocké — voir l'effet de frappe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `ready` (V13.3, #3563.5 bis — recette prod 08/10) : LA COURSE AU CHARGEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `userId` arrive de façon ASYNCHRONE après le premier rendu (la session se
 * résout après le montage). Une frappe tapée dans cette fenêtre tombe dans le
 * vide : l'effet de restauration ci-dessous tourne ensuite et appelle
 * `setInput(stored)`, qui écrase ce qui vient d'être tapé — ou, pire, une
 * saisie laissée focus pendant qu'un re-rendu la démonte/remonte produit des
 * caractères parasites (recette prod 08/10 : « ééä » envoyé après navigation
 * vers /chat). `ready` ne passe à `true` qu'une fois cette course terminée
 * (`userId` connu ET ce premier passage de l'effet exécuté) — l'appelant s'en
 * sert pour DÉSACTIVER le champ jusque-là, pas pour en déduire quoi écrire.
 * Elle ne redevient jamais `false` : un changement de fil ultérieur (compte
 * ouvert, nouvelle conversation) est un geste de la personne DÉJÀ en train
 * d'écrire, jamais une raison de lui reprendre le clavier.
 */
export function useChatComposerDraft(
  userId: string | null,
  threadId: string,
  input: string,
  setInput: Dispatch<SetStateAction<string>>,
  options?: { skipInitialRestore?: boolean; keepStoredWhileEmpty?: boolean; carryFromThread?: string },
): { ready: boolean } {
  const keepStoredWhileEmpty = Boolean(options?.keepStoredWhileEmpty)
  const skipNextRestore = useRef(Boolean(options?.skipInitialRestore))
  const pendingRef = useRef<{ userId: string; threadId: string; text: string; generation: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // #3864 (vu en passant, recette prod 09/10) — « la saisie perd les premières
  // frappes après navigation ». `useState(false)` démarrait TOUJOURS désactivé,
  // même quand `userId` est déjà connu au tout premier rendu — le cas courant
  // d'une navigation EN SPA vers /chat depuis un compte déjà authentifié
  // (`useSession` résout l'utilisateur AVANT de rendre ses enfants). Un
  // initialiseur PARESSEUX lit l'état réel dès ce premier rendu : la course
  // n'existe plus quand elle n'a, en réalité, jamais commencé. Un montage où
  // `userId` est encore `null` (chargement à froid) reste `false`, inchangé —
  // c'est la seule course qui existe vraiment.
  const [ready, setReady] = useState(() => Boolean(userId))

  // `useCallback([])` plutôt qu'une fonction locale : une identité STABLE,
  // listable dans les dépendances des effets ci-dessous sans les faire
  // rejouer à chaque rendu ni recourir à un `eslint-disable`.
  const flushPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    // Une frappe née avant une purge appartient à l'avant-purge : ne pas la
    // réécrire (voir `draftGeneration`).
    if (pending && pending.generation === draftGeneration) {
      writeChatDraft(pending.userId, pending.threadId, pending.text)
    }
  }, [])

  // #3469 — la saisie COURANTE, lisible par l'effet de restauration sans qu'elle
  // en soit une dépendance (sinon chaque frappe rechargerait le brouillon).
  const inputRef = useRef(input)
  inputRef.current = input
  const restoredThreadRef = useRef<string | null>(null)
  const carryFromThread = options?.carryFromThread
  const mountedAtRef = useRef(Date.now())
  // chat saisie à froid (recette 10/10, Q08) — la dernière frappe : la fenêtre de
  // chargement ne s'arrête pas 5 s après le montage tant que la personne tape
  // encore (un historique lent précise le fil APRÈS ce délai, en pleine frappe).
  // chat saisie à froid (recette 10/10)
  const lastInputChangeAtRef = useRef(0)
  useEffect(() => {
    lastInputChangeAtRef.current = Date.now()
  }, [input])

  // #4006 — « le champ se remplit de éééé » : une touche morte (é, è, ê, ô) est une
  // COMPOSITION. Remplacer la valeur du champ pendant qu'elle court (restauration
  // d'un brouillon quand le fil se précise) la fait rejouer en boucle. Écoute au
  // niveau du document (capture) : le champ vit dans un composant fils.
  const composingRef = useRef(false)
  useEffect(() => {
    const start = () => {
      composingRef.current = true
    }
    const end = () => {
      composingRef.current = false
    }
    document.addEventListener('compositionstart', start, true)
    document.addEventListener('compositionend', end, true)
    // Un champ qui perd le focus en pleine composition n'enverra jamais `compositionend`.
    document.addEventListener('focusout', end, true)
    return () => {
      document.removeEventListener('compositionstart', start, true)
      document.removeEventListener('compositionend', end, true)
      document.removeEventListener('focusout', end, true)
    }
  }, [])

  useEffect(() => {
    // Le brouillon en attente appartient au fil qu'on QUITTE : l'écrire avant
    // de charger le suivant, sans attendre le débounce.
    flushPending()
    if (!userId) return
    // La course est terminée dès que `userId` est connu : la suite ne fait
    // que choisir QUOI écrire dans la saisie, plus QUAND l'accepter.
    setReady(true)
    if (skipNextRestore.current) {
      skipNextRestore.current = false
      return
    }
    // #3469 — « la première saisie après un chargement à froid est perdue » : la
    // session arrive APRÈS le premier rendu (`userId` passe de null à connu), et
    // ce même effet rechargeait alors le brouillon stocké (vide) PAR-DESSUS ce
    // que la personne venait de taper. Sur le MÊME fil, une saisie déjà là gagne.
    const sameThread = restoredThreadRef.current === threadId || restoredThreadRef.current === null
    const leftThread = restoredThreadRef.current
    restoredThreadRef.current = threadId
    if (sameThread && inputRef.current !== '') return
    // #4006 — jamais de remplacement pendant une composition en cours, MÊME champ encore
    // vide : la première mise à jour d'une touche morte n'est pas encore remontée à
    // `input` quand cet effet tourne.
    if (composingRef.current) return
    const stored = readChatDraft(userId, threadId)
    // #3648 — le fil se précise pendant le chargement (panier commun `carryFromThread`
    // → fil du compte) : la frappe passe sur le nouveau fil (l'effet de frappe la
    // réécrit sous sa clé) au lieu d'être remplacée par un brouillon vide. Un
    // changement de fil explicite (autre conversation) change bien de saisie.
    const fromCarrierThread = carryFromThread !== undefined && leftThread === carryFromThread
    const explicitThreadChange = !sameThread && !fromCarrierThread
    // #3769 (lot RAA 10/10) — une frappe gagne TOUJOURS sur une restauration
    // asynchrone : même si le fil d'arrivée a un brouillon non vide, ce que la
    // personne vient de taper n'est pas remplacé (la restauration ne vaut que
    // pour un champ encore vide), tant que la fenêtre de chargement court.
    const withinHydration =
      fromCarrierThread &&
      Date.now() - Math.max(mountedAtRef.current, lastInputChangeAtRef.current) < HYDRATION_WINDOW_MS
    // #4006 / #3769 (lot W1, 11/10) — « première saisie perdue », « 1er caractère manquant »,
    // « ancien brouillon resservi » : cet effet est PASSIF, il tourne après le premier
    // affichage. Une frappe tombée entre le commit et lui est déjà dans la file de React
    // mais pas encore dans `inputRef` ; `setInput(stored)` passait derrière elle et la
    // remplaçait. La forme fonctionnelle lit la valeur À JOUR : un champ déjà touché garde
    // sa frappe. Seul un changement de fil explicite (autre conversation), ou un fil qui se
    // précise APRÈS la fenêtre de chargement, remplace pour de bon.
    if (explicitThreadChange || (fromCarrierThread && !withinHydration)) {
      setInput(stored)
    } else {
      setInput(current => (current === '' ? stored : current))
    }
  }, [userId, threadId, flushPending, setInput, carryFromThread])

  useEffect(() => {
    if (!userId) return
    /**
     * Revue d'intégration du lot fils (13/09) — un envoi vide la saisie
     * (affichage optimiste), et écrire cette saisie VIDE effaçait le brouillon
     * stocké 300 ms après le clic, bien avant la réponse. Tant que l'envoi est en
     * vol, le vide n'est donc pas écrit : la frappe en attente (celle d'avant
     * Entrée) part tout de suite, et le brouillon reste jusqu'à l'acceptation
     * (`clearChatDraft`) ou jusqu'à l'échec, qui rend le texte à la saisie. Cette
     * dépendance rejoue l'effet à la fin de l'envoi : la saisie d'alors (vide,
     * ou une relance tapée pendant l'attente) est écrite normalement.
     */
    if (keepStoredWhileEmpty && input === '') {
      flushPending()
      return
    }
    pendingRef.current = { userId, threadId, text: input, generation: draftGeneration }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      flushPending()
    }, DRAFT_WRITE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [input, userId, threadId, keepStoredWhileEmpty, flushPending])

  useEffect(() => {
    return () => flushPending()
  }, [flushPending])

  return { ready }
}
