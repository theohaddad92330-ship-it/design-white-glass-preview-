import type { MailDirection, MailMessage, MailThread } from '@bellum/contracts'

/**
 * « Qui ne m'a pas répondu ? » — le besoin le plus cité des deux méta-analyses
 * (§5.1 n°2, requête n°2, déclencheur n°7) et celui qu'AUCUNE API de messagerie
 * ne sait servir. Gmail et Graph savent rendre des messages ; ils ne savent pas
 * dire qu'un fil attend une réponse. Le calcul est donc ici, déterministe et
 * testé.
 *
 * Garde-fou n°14 des rapports : « détecter correctement no-reply ; ne pas
 * inventer que tout a reçu une réponse ». Le piège symétrique est pire : compter
 * comme silencieux un fil auquel on a soi-même répondu en dernier, et faire
 * relancer un client qui attend NOTRE retour. D'où la règle unique ci-dessous —
 * seul compte le sens du DERNIER message du fil.
 */

/** Une réponse automatique n'est pas une réponse : ces fils restent en attente. */
const AUTO_REPLY_MARKERS = [
  'out of office',
  'automatic reply',
  'réponse automatique',
  'absence du bureau',
  'je suis actuellement absent',
  'auto-reply',
  'autoreply',
]

export function looksLikeAutoReply(subject: string | null, snippet: string | null): boolean {
  const haystack = `${subject ?? ''} ${snippet ?? ''}`.toLowerCase()
  return AUTO_REPLY_MARKERS.some(marker => haystack.includes(marker))
}

/**
 * #3671.2 — recette prod 08/10 : le titre d'une carte du briefing portait le
 * contenu BRUT d'un billet de train (PNR, places). Le SUJET réel d'un
 * e-billet/confirmation de voyage N'EST PAS le corps d'un message (doctrine :
 * « le CORPS des messages ne sort jamais vers un humain ni vers le modèle »)
 * — mais ce sujet lui-même n'a rien de commercial, et ne doit donc produire
 * AUCUNE carte, jamais un titre à filtrer après coup. Même principe que
 * `looksLikeAutoReply` : un lexique FERMÉ, volontairement court.
 */
const NON_COMMERCIAL_TRAVEL_MARKERS = [
  'e-billet',
  'billet électronique',
  'billet electronique',
  'billet de train',
  'carte d’embarquement',
  "carte d'embarquement",
  'boarding pass',
  'e-ticket',
  'confirmation de réservation',
  'confirmation de reservation',
  'numéro de réservation',
  'numero de reservation',
  'booking confirmation',
  'itinéraire de voyage',
  'itineraire de voyage',
  'note de frais',
  'facture de voyage',
  'pnr',
]

export function looksLikeNonCommercialTravelDocument(subject: string | null, snippet: string | null): boolean {
  const haystack = `${subject ?? ''} ${snippet ?? ''}`.toLowerCase()
  return NON_COMMERCIAL_TRAVEL_MARKERS.some(marker => haystack.includes(marker))
}

/** Millisecondes → jours pleins écoulés, jamais négatif. */
function daysBetween(fromIso: string | null, now: Date): number | null {
  if (!fromIso) return null
  const ts = Date.parse(fromIso)
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.floor((now.getTime() - ts) / (24 * 60 * 60 * 1000)))
}

/**
 * Fenêtre, en jours, dans laquelle deux fils NATIVEMENT distincts (deux
 * `threadId` différents) sont considérés comme LA MÊME conversation reprise en
 * nouveau message plutôt qu'en réponse. Alignée sur `windowDays` par défaut
 * (`mailSearchRequestSchema`, 30 j) : au-delà, un même sujet avec la même
 * personne redevient plausiblement une AUTRE affaire, pas la suite de
 * celle-ci — le fusionner serait le mensonge symétrique de ne rien fusionner.
 */
const MERGE_WINDOW_DAYS = 30

/**
 * Normalise un sujet pour comparer deux fils : enlève les préfixes de réponse
 * ou de transfert (« Re: », « Fwd: », « Tr: », répétés) et les espaces
 * superflus. `null` pour un sujet vide — un sujet vide ne prouve rien, il ne
 * doit donc jamais servir de clé de fusion.
 */
function normalizeSubjectForMerge(subject: string | null): string | null {
  if (!subject) return null
  let s = subject.trim()
  for (;;) {
    const match = /^(re|fwd?|tr)\s*:\s*/i.exec(s)
    if (!match) break
    s = s.slice(match[0].length).trim()
  }
  return s ? s.toLowerCase() : null
}

/**
 * Fusionne des paniers de messages déjà groupés par `threadId` NATIF quand ils
 * sont, en réalité, la MÊME conversation reprise en nouveau message.
 *
 * Observé en production le 30/08/2026 (compte réel, écran /mailbox) : six fils
 * au libellé strictement identique — « Louis, toujours intéressé ? », même
 * expéditeur, dates du 24 au 29 août — présentés comme six lignes jumelles.
 * Gmail et Graph donnent un identifiant de fil NEUF dès qu'un message est
 * composé plutôt que répondu — ce que font la plupart des outils de relance —
 * et rien ne rattachait ces six fils entre eux. La règle « rien n'apparaît deux
 * fois sous la même forme avec le même contenu » (loi 4, tome 7) s'applique
 * ici : deux paniers qui partagent le MÊME interlocuteur et le MÊME sujet
 * normalisé, à moins de `MERGE_WINDOW_DAYS` d'écart, sont une seule
 * conversation.
 *
 * Volontairement PRUDENT : un panier sans interlocuteur lisible ou sans sujet
 * exploitable ne fusionne avec rien — se tromper de fusion mélangerait deux
 * conversations sous un seul fil, ce qui serait pire que deux lignes jumelles.
 * Un message sans date exploitable ne sert pas non plus de base à une fusion :
 * on ne mesure pas un écart qu'on ne connaît pas.
 */
function mergeRelatedBuckets(buckets: MailMessage[][]): MailMessage[][] {
  type BucketInfo = { messages: MailMessage[]; counterpart: string | null; subjectKey: string | null; lastDate: number }

  const infos: BucketInfo[] = buckets.map(messages => {
    const sorted = [...messages].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const last = sorted[sorted.length - 1]!
    return {
      messages,
      counterpart: counterpartOf(sorted),
      subjectKey: normalizeSubjectForMerge(sorted.find(m => m.subject)?.subject ?? null),
      lastDate: last.date ? Date.parse(last.date) : NaN,
    }
  })

  // Union-find minimal : pas besoin de plus pour fusionner par transitivité
  // (r1↔r2, r2↔r3 doivent finir dans le même groupe que r1↔r3).
  const parent = infos.map((_, index) => index)
  function find(index: number): number {
    if (parent[index] !== index) parent[index] = find(parent[index]!)
    return parent[index]!
  }
  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootA] = rootB
  }

  for (let i = 0; i < infos.length; i += 1) {
    for (let j = i + 1; j < infos.length; j += 1) {
      const a = infos[i]!
      const b = infos[j]!
      if (!a.counterpart || !b.counterpart || a.counterpart !== b.counterpart) continue
      if (!a.subjectKey || !b.subjectKey || a.subjectKey !== b.subjectKey) continue
      if (Number.isNaN(a.lastDate) || Number.isNaN(b.lastDate)) continue
      const gapDays = Math.abs(a.lastDate - b.lastDate) / (24 * 60 * 60 * 1000)
      if (gapDays > MERGE_WINDOW_DAYS) continue
      union(i, j)
    }
  }

  const merged = new Map<number, MailMessage[]>()
  infos.forEach((info, index) => {
    const root = find(index)
    const existing = merged.get(root)
    if (existing) existing.push(...info.messages)
    else merged.set(root, [...info.messages])
  })
  return [...merged.values()]
}

/**
 * Agrège des messages en fils.
 *
 * Un point qui a l'air d'un détail et n'en est pas : les messages sans `date`
 * exploitable ne sont pas jetés. Un fournisseur peut rendre un en-tête `Date`
 * illisible ; jeter le message ferait disparaître le fil entier du décompte des
 * relances, c'est-à-dire produirait exactement le mensonge que le garde-fou
 * n°14 interdit. Ils sont conservés, comptés, et leur ancienneté vaut `null`.
 *
 * Deuxième temps, après le groupement par `threadId` natif : `mergeRelatedBuckets`
 * recolle les fils qui sont la même conversation reprise en nouveau message —
 * voir sa documentation.
 */
/**
 * Combien de messages un fil transporte vers l'écran (#1400).
 *
 * Douze : un panneau de détail sert à comprendre de quoi on parle et depuis
 * quand, pas à relire un fil de support à deux cents messages. La borne protège
 * aussi la réponse — quarante fils sans borne, et une recherche devient énorme.
 */
const THREAD_MESSAGE_WINDOW = 12

export function groupIntoThreads(messages: MailMessage[], now: Date = new Date()): MailThread[] {
  const byThread = new Map<string, MailMessage[]>()
  for (const message of messages) {
    const key = message.threadId ?? message.id
    const bucket = byThread.get(key)
    if (bucket) bucket.push(message)
    else byThread.set(key, [message])
  }

  const threads: MailThread[] = []
  for (const group of mergeRelatedBuckets([...byThread.values()])) {
    // Tri chronologique : les dates ISO se comparent lexicalement. Les messages
    // sans date se rangent en tête, donc ne peuvent pas usurper le rôle de
    // « dernier message » et fausser le sens du fil.
    const sorted = [...group].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    const last = sorted[sorted.length - 1]!
    const lastDirection: MailDirection = last.direction

    // Un fil attend une réponse si notre dernier message est sorti — ou si le
    // dernier message entrant n'est qu'un répondeur d'absence.
    const awaitingReply =
      lastDirection === 'outbound' || (lastDirection === 'inbound' && looksLikeAutoReply(last.subject, last.snippet))

    threads.push({
      // L'identifiant du fil NATIF le plus RÉCENT : une réponse doit s'attacher
      // à la conversation la plus fraîche, pas à la première de la séquence
      // fusionnée.
      threadId: last.threadId ?? last.id,
      subject: sorted.find(m => m.subject)?.subject ?? null,
      counterpart: counterpartOf(sorted),
      lastMessageAt: last.date,
      lastDirection,
      messageCount: sorted.length,
      awaitingReply,
      daysSinceLastMessage: daysBetween(last.date, now),
      unread: sorted.some(m => m.unread),
      hasAttachments: sorted.some(m => m.hasAttachments),
      otherParticipants: otherParticipantsOf(sorted),
      // #1400 — les messages du fil, en métadonnées. Ils étaient déjà là, dans
      // `sorted`, et repartaient à la poubelle à chaque recherche : le panneau
      // de détail ne coûte donc AUCUN appel fournisseur de plus. Les douze
      // derniers, dans l'ordre de lecture — la borne vit ici, à l'endroit qui
      // replie, et nulle part ailleurs.
      messages: sorted.slice(-THREAD_MESSAGE_WINDOW),
    })
  }

  return threads.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
}

/**
 * Les autres personnes du fil — garde-fou n°12.
 *
 * On retire l'interlocuteur principal (il est déjà en destinataire) et tout ce
 * qui n'a pas la forme d'une adresse. On NE retire PAS l'utilisateur lui-même :
 * son adresse n'est pas connue ici, et la retirer au jugé écarterait un vrai
 * participant. L'écran, lui, la connaît et la filtre.
 */
function otherParticipantsOf(sortedMessages: MailMessage[]): string[] {
  const counterpart = counterpartOf(sortedMessages)
  const seen = new Set<string>()
  for (const message of sortedMessages) {
    for (const raw of [message.from ?? '', ...message.to, ...message.cc]) {
      if (!raw) continue
      const address = normalizeAddress(raw)
      if (!address.includes('@') || address === counterpart) continue
      seen.add(address)
    }
  }
  return [...seen].slice(0, 10)
}

/**
 * L'interlocuteur externe du fil : le destinataire de notre dernier envoi,
 * sinon l'expéditeur du dernier message reçu. C'est LUI qu'on relance, et c'est
 * son adresse qui pré-remplit le brouillon.
 */
function counterpartOf(sortedMessages: MailMessage[]): string | null {
  for (let i = sortedMessages.length - 1; i >= 0; i -= 1) {
    const message = sortedMessages[i]!
    if (message.direction === 'outbound') {
      const to = message.to.find(Boolean)
      if (to) return normalizeAddress(to)
    } else if (message.from) {
      return normalizeAddress(message.from)
    }
  }
  return null
}

/** `Jean Dupont <jean@acme.com>` → `jean@acme.com`. */
export function normalizeAddress(raw: string): string {
  const angled = /<([^>]+)>/.exec(raw)
  return (angled?.[1] ?? raw).trim().toLowerCase()
}

/**
 * Les fils à relancer : sortants, silencieux depuis au moins `silenceDays`.
 *
 * Un fil dont la date est inconnue n'est PAS relancé automatiquement — on ne
 * peut pas affirmer un silence qu'on n'a pas mesuré. Il reste visible dans la
 * liste complète des fils, où l'utilisateur le voit et décide.
 */
export function selectAwaitingReply(threads: MailThread[], silenceDays: number): MailThread[] {
  return threads.filter(
    thread =>
      thread.awaitingReply && thread.daysSinceLastMessage !== null && thread.daysSinceLastMessage >= silenceDays,
  )
}

/**
 * Les fils dont le dernier message ENTRANT ressemble à un accord.
 *
 * Le mot « ressemble » est le contrat : c'est une hypothèse lexicale, pas une
 * classification. Elle sert à faire remonter un fil en tête de brief, jamais à
 * changer un statut ni à déclencher une écriture — ce qui serait de la donnée
 * inventée au sens de la règle produit.
 */
// Exporté pour #2381.4 (`reply-classify.ts`) : la classe « positive » de la
// classification déterministe réutilise CE lexique — GA-26, un seul endroit.
// `selectPositiveReplies` reste, lui, réservé au CLASSEMENT de l'écran
// (jamais une écriture) ; `reply-classify.ts` en tire la CONSÉQUENCE forte.
export const POSITIVE_MARKERS = [
  'intéressé',
  'interesse',
  'intéressant',
  'volontiers',
  'avec plaisir',
  'ça marche',
  'ca marche',
  "d'accord",
  'partant',
  'interested',
  'sounds good',
  'happy to',
]

export function selectPositiveReplies(threads: MailThread[], messages: MailMessage[]): MailThread[] {
  const lastInboundSnippet = new Map<string, string>()
  for (const message of messages) {
    if (message.direction !== 'inbound') continue
    const key = message.threadId ?? message.id
    const previous = lastInboundSnippet.get(key)
    if (previous === undefined) lastInboundSnippet.set(key, `${message.subject ?? ''} ${message.snippet ?? ''}`)
  }

  return threads.filter(thread => {
    if (thread.lastDirection !== 'inbound') return false
    const text = (lastInboundSnippet.get(thread.threadId) ?? '').toLowerCase()
    if (!text.trim()) return false
    if (looksLikeAutoReply(thread.subject, text)) return false
    return POSITIVE_MARKERS.some(marker => text.includes(marker))
  })
}
