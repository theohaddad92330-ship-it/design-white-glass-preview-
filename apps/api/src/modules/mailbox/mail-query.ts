import type { MailSearchRequest } from '@bellum/contracts'

/**
 * La traduction « intention métier → requête fournisseur », en deux temps.
 *
 * Un commercial dit « les mails qui parlent de TJM » ; Gmail attend
 * `("TJM" OR "taux journalier") newer_than:30d`, Microsoft Graph attend du KQL.
 * Faire produire cette chaîne par un modèle serait la pire option disponible :
 * une recherche silencieusement fausse ne se voit pas — elle rend zéro résultat,
 * ce qui ressemble exactement à « il n'y a rien ». On passe donc par un
 * descripteur neutre, déterministe et testé, que chaque backend rend dans SA
 * syntaxe. Le modèle choisit l'intention ; il n'écrit jamais la requête.
 *
 * Les tables de mots-clés sont bilingues par construction : une ESN française
 * reçoit des « appels d'offres » et des « RFP » dans la même boîte.
 */

/**
 * Requête neutre. `keywordGroups` se lit : ET entre les groupes, OU à
 * l'intérieur d'un groupe — la forme normale conjonctive suffit à tout ce que
 * les méta-analyses demandent, et se rend dans les deux syntaxes sans perte.
 */
export type MailQuerySpec = {
  keywordGroups: string[][]
  /** Échanges avec cette adresse ou ce domaine, dans les deux sens. */
  participant?: string
  hasAttachment?: boolean
  unreadOnly?: boolean
  /** Ne garder que ce qui est parti de la boîte de l'utilisateur. */
  sentOnly?: boolean
  newerThanDays?: number
}

/**
 * Vocabulaire par intention. Volontairement court : chaque terme ajouté élargit
 * le rappel mais dilue la précision, et un commercial qui reçoit 400 fils
 * « budget » ne lit rien. Les expressions à plusieurs mots sont citées telles
 * quelles par les backends (guillemets), donc « taux journalier » ne matche pas
 * « taux » seul.
 */
const INTENT_KEYWORDS: Record<string, string[]> = {
  budget: ['budget', 'enveloppe budgétaire', 'budgétaire'],
  tjm: ['TJM', 'taux journalier', 'tarif journalier', 'daily rate'],
  cv: ['CV', 'curriculum vitae', 'dossier de compétences', 'resume'],
  job_description: ['fiche de poste', 'job description', 'descriptif de poste'],
  contract: ['contrat', 'signature', 'bon de commande', 'avenant'],
  tender: ["appel d'offres", 'appels d’offres', 'RFP', 'RFI', 'marché public'],
  invoice: ['facture', 'invoice', 'impayé', 'relance de paiement'],
  meeting: ['visio', 'réunion', 'rendez-vous', 'meeting', 'call'],
  positive_reply: ['intéressé', 'intéressant', 'volontiers', 'avec plaisir', 'interested'],
  out_of_office: ['absence', 'congés', 'out of office', 'de retour le'],
}

/**
 * Construit le descripteur neutre à partir de la demande utilisateur.
 *
 * Deux intentions ne portent pas de vocabulaire mais une FORME de requête :
 * `unread` (les non-lus) et `no_reply` (ce qui est parti sans réponse). La
 * seconde ne peut pas se répondre côté fournisseur — aucune API de messagerie
 * ne sait dire « ce fil attend une réponse » — donc on remonte les messages
 * ENVOYÉS de la fenêtre et le calcul se fait chez nous (voir `no-reply.ts`).
 */
export function buildMailQuery(request: MailSearchRequest): MailQuerySpec {
  const spec: MailQuerySpec = { keywordGroups: [], newerThanDays: request.windowDays }

  const free = request.query?.trim()
  if (free) spec.keywordGroups.push([free])

  const counterpart = request.counterpart?.trim()
  if (counterpart) spec.participant = counterpart.replace(/^@+/, '')

  switch (request.intent) {
    case 'unread':
      spec.unreadOnly = true
      break
    case 'no_reply':
      // On demande l'envoyé, pas le reçu : le silence se déduit d'un fil dont le
      // DERNIER message est sortant. La fenêtre est élargie au silence attendu
      // pour ne pas rater un fil parti il y a plus longtemps que `windowDays`.
      spec.sentOnly = true
      spec.newerThanDays = Math.max(request.windowDays, request.silenceDays * 3)
      break
    case 'attachments':
      spec.hasAttachment = true
      break
    case 'free':
      break
    default: {
      const words = INTENT_KEYWORDS[request.intent]
      if (words?.length) spec.keywordGroups.push(words)
      break
    }
  }

  // `cv` et `job_description` arrivent presque toujours en pièce jointe : le
  // dire au fournisseur coûte zéro et divise le bruit.
  if (request.intent === 'cv') spec.hasAttachment = true

  return spec
}

/** Un terme doit-il être cité ? Espaces et apostrophes cassent les deux syntaxes. */
function needsQuotes(term: string): boolean {
  return /[\s"'()]/.test(term)
}

function quote(term: string): string {
  return needsQuotes(term) ? `"${term.replace(/"/g, ' ')}"` : term
}

/**
 * Rend le descripteur en syntaxe de recherche Gmail
 * (support.google.com/mail/answer/7190). Les opérateurs employés — `newer_than`,
 * `is:unread`, `has:attachment`, `in:sent`, `from:`/`to:` — sont tous
 * documentés ; aucun n'est deviné.
 */
export function renderGmailQuery(spec: MailQuerySpec): string {
  const parts: string[] = []

  for (const group of spec.keywordGroups) {
    const terms = group.map(quote).filter(Boolean)
    if (!terms.length) continue
    parts.push(terms.length === 1 ? terms[0]! : `(${terms.join(' OR ')})`)
  }

  if (spec.participant) {
    const p = spec.participant
    // Un domaine nu (`acme.com`) doit matcher toute la société, pas une adresse.
    const needle = p.includes('@') ? p : `@${p}`
    parts.push(`(from:${needle} OR to:${needle})`)
  }

  if (spec.sentOnly) parts.push('in:sent')
  if (spec.unreadOnly) parts.push('is:unread')
  if (spec.hasAttachment) parts.push('has:attachment')
  if (spec.newerThanDays) parts.push(`newer_than:${spec.newerThanDays}d`)
  // Les notifications automatiques polluent chaque compteur de relance.
  parts.push('-category:promotions')

  return parts.join(' ')
}

/**
 * Rend le descripteur en KQL pour Microsoft Graph `$search`
 * (learn.microsoft.com/graph/search-query-parameter).
 *
 * Limite documentée et assumée : Graph refuse `$search` combiné à `$filter` sur
 * `/me/messages`. Les critères que KQL ne porte pas — `isRead` en particulier —
 * sont donc renvoyés à l'appelant, qui filtre côté client sur la page reçue.
 * Mieux vaut une seconde passe locale qu'une requête rejetée par le serveur.
 */
export function renderGraphSearch(spec: MailQuerySpec): { search: string; clientSideUnread: boolean } {
  const parts: string[] = []

  for (const group of spec.keywordGroups) {
    const terms = group.map(quote).filter(Boolean)
    if (!terms.length) continue
    parts.push(terms.length === 1 ? terms[0]! : `(${terms.join(' OR ')})`)
  }

  if (spec.participant) {
    const p = spec.participant
    const needle = p.includes('@') ? p : `@${p}`
    parts.push(`(from:${needle} OR to:${needle})`)
  }

  if (spec.hasAttachment) parts.push('hasAttachments:true')
  if (spec.newerThanDays) parts.push(`received>=${isoDaysAgo(spec.newerThanDays)}`)

  return { search: parts.join(' AND '), clientSideUnread: Boolean(spec.unreadOnly) }
}

/** `YYYY-MM-DD` d'il y a N jours — le format de date que KQL accepte. */
export function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}
