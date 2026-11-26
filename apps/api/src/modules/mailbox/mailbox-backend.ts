import type {
  MailAttachment,
  MailDraftRequest,
  MailDraftResult,
  MailMessage,
  MailboxProvider,
  MailboxSender,
  MailboxStatus,
  OutOfOfficeRequest,
} from '@bellum/contracts'
import type { MailQuerySpec } from './mail-query'

/**
 * Les quatre gestes de messagerie qu'une portée peut interdire.
 *
 * `labels` n'y est pas : aucun chemin du service ne le refuse — Graph n'a pas
 * d'équivalent, et le dire ici plutôt que de le laisser vide évite qu'on
 * cherche un jour la branche manquante.
 */
export type MailboxCapability = 'read' | 'draft' | 'send' | 'outOfOffice'

/**
 * La portée que chaque geste exige, par fournisseur — NOMMÉE telle que le
 * fournisseur l'écrit.
 *
 * Un `scope_missing` sans portée nommée est exactement l'erreur qu'il remplace :
 * il dit qu'il manque quelque chose sans dire quoi, et l'opérateur qui doit la
 * déclarer chez le fournisseur ne peut rien en faire. « Il me manque
 * `MailboxSettings.ReadWrite` » lui dit quoi cocher.
 *
 * ⚠️ Les chaînes sont RECOPIÉES, pour la raison exacte que
 * `tool-registry/tool-capabilities.ts` a déjà tranchée : GA-07 compte les
 * imports service → service. Le vrai risque n'est donc pas la copie, c'est la
 * DIVERGENCE — et elle est gardée dans `mailbox.service.spec.ts`, qui compare
 * ces chaînes au registre des capacités (Google) et aux constantes que le
 * backend teste réellement (Microsoft).
 */
export const MAILBOX_SCOPES: Readonly<Record<MailboxProvider, Readonly<Record<MailboxCapability, readonly string[]>>>> =
  {
    google: {
      read: ['https://www.googleapis.com/auth/gmail.readonly'],
      // Rédiger n'est pas envoyer : `gmail.compose` dépose un brouillon et ne
      // peut rien faire partir. C'est la portée que la doctrine impose ici.
      draft: ['https://www.googleapis.com/auth/gmail.compose'],
      send: ['https://www.googleapis.com/auth/gmail.send'],
      outOfOffice: ['https://www.googleapis.com/auth/gmail.settings.basic'],
    },
    microsoft: {
      // Graph n'a pas de portée de lecture seule utilisable ici : le backend
      // accepte `Mail.Read`, mais la portée qu'on DEMANDE est celle-ci.
      read: ['Mail.ReadWrite'],
      draft: ['Mail.ReadWrite'],
      send: ['Mail.Send'],
      outOfOffice: ['MailboxSettings.ReadWrite'],
    },
  }

/**
 * Ce qu'une messagerie doit savoir faire pour servir le socle exécutif — et
 * rien de plus.
 *
 * L'interface est délibérément petite. Elle ne cherche pas à couvrir Gmail et
 * Graph, elle couvre les SIX gestes que les méta-analyses réclament : chercher,
 * lire les pièces jointes, déposer un brouillon, lire/écrire la réponse
 * d'absence, retrouver la vraie signature. Tout ce qui est propre à un
 * fournisseur (syntaxe de recherche, format d'un brouillon, façon de threader
 * une réponse) reste enfermé dans son implémentation.
 *
 * Chaque méthode rend `null` plutôt que de lever quand la capacité n'est
 * simplement pas disponible dans cet espace : « pas connecté » n'est pas une
 * panne, c'est un état, et l'écran doit pouvoir le dire sans transformer un
 * brief du jour en page d'erreur.
 */

export type MailSearchOutcome = {
  messages: MailMessage[]
  /** Ce qui a réellement été envoyé au fournisseur — visible en détail technique. */
  resolvedQuery: string
  /** La borne a coupé : il y a probablement plus de résultats. */
  truncated: boolean
}

export type MailboxSignature = {
  /** Signature réelle, en texte brut. `null` = introuvable — on ne l'invente pas. */
  text: string | null
  /** Adresse de la boîte, utile pour ne pas s'auto-inviter ni s'auto-relancer. */
  address: string | null
}

/**
 * #3234 — ce que le fournisseur rend à l'envoi : des IDENTIFIANTS, jamais le
 * corps. `null` = ce fournisseur n'en rend pas (on ne le devine pas) ; la
 * réponse entrante retombe alors sur l'heuristique d'adresse.
 */
export type MailSendReceipt = { messageId: string | null; threadId: string | null }

export type MailThreadBodies = {
  subject: string | null
  messages: Array<{
    direction: MailMessage['direction']
    date: string | null
    from: string | null
    plain: string | null
    html: string | null
  }>
}

export interface MailboxBackend {
  /**
   * Statut de la connexion, ou `null` si ce fournisseur n'est pas branché ici.
   *
   * Sans `connectedCount` (#2756) : un backend individuel ne sait parler que
   * de LUI-MÊME, jamais de ses voisins. C'est `MailboxService.status` qui
   * interroge TOUS les backends et compte combien répondent connectés — un
   * backend qui inventerait ce total ferait diverger le compte du reste.
   */
  status(userId: string): Promise<Omit<MailboxStatus, 'connectedCount'> | null>

  search(userId: string, spec: MailQuerySpec, limit: number): Promise<MailSearchOutcome>

  listAttachments(userId: string, messageId: string): Promise<MailAttachment[]>

  /**
   * Le CONTENU d'une pièce jointe (#2568.1). `attachmentId` vient toujours de
   * {@link listAttachments} — jamais deviné. Rend `null` quand elle n'est plus
   * lisible (message supprimé entre-temps, etc.) plutôt que de lever : ce
   * n'est pas une panne de la messagerie, c'est un état.
   */
  getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ filename: string; mimeType: string | null; dataB64: string; messageDate: string | null } | null>

  /**
   * Le CORPS d'un message, pour la capture des activités (T2, arbitrage Louis
   * du 16/08 : l'historique du CRM stocke le texte intégral).
   *
   * Le seul point de l'interface qui rapporte du texte écrit par un humain.
   * `search` reste sur les métadonnées : ce qu'on ne lit pas ne peut pas fuiter,
   * et seule la capture — pas la recherche, pas les relances, pas le copilote —
   * a une raison de descendre jusque-là.
   */
  fetchBody(userId: string, messageId: string): Promise<{ plain: string | null; html: string | null }>

  /**
   * #4405.1 — un FIL lu PAR SON IDENTIFIANT, corps compris, quand le fournisseur sait le faire (Gmail :
   * `threads.get`). Facultatif : sans lui, `MailboxService.readOwnThread` retombe sur la recherche.
   * `null` = fil inconnu du fournisseur. Même statut que `fetchBody` (c96) : jamais conservé ni journalisé.
   */
  readThreadBodies?(userId: string, threadId: string): Promise<MailThreadBodies | null>

  createDraft(
    userId: string,
    request: MailDraftRequest,
    signature: string | null,
    /** #4546.5 — la boîte désignée ; absent = la boîte par défaut. */
    connectionId?: string,
  ): Promise<MailDraftResult>

  /**
   * Supprime un brouillon (#2277.34, épopée #2771) — jamais un envoi, jamais un
   * message déjà parti.
   *
   * Gmail range les brouillons dans un espace d'identifiants SÉPARÉ des
   * messages : `DELETE drafts/{id}` ne peut atteindre qu'un brouillon, un id de
   * message y répond 404. Graph, lui, N'A PAS cette séparation — un brouillon
   * EST un message (`isDraft: true`) — donc l'implémentation Microsoft
   * (`microsoft-mail.backend.ts`) vérifie `isDraft` avant de supprimer :
   * jamais de suppression d'un message envoyé ou reçu par cette voie, même
   * appelée avec le mauvais identifiant.
   *
   * `deleted: false` quand le brouillon n'existe déjà plus (idempotent — un
   * second rollback sur la même cible n'est pas un échec).
   */
  deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }>

  /**
   * Envoie RÉELLEMENT un message. Le seul geste de l'interface qui atteint
   * quelqu'un d'autre — d'où sa signature volontairement étroite : UN
   * destinataire, un objet, un corps. Pas de liste, pas de planification. Ce
   * qui n'est pas exprimable ici ne peut pas partir en masse.
   *
   * #3699.6 — `attachments` : les pièces que le COMMERCIAL a choisies pour un
   * envoi individuel, déjà validées (type, taille, signature) par l'appelant.
   * Le lot (`sendBatch`) n'en passe jamais. Un transport qui ne sait pas les
   * joindre doit LEVER, jamais envoyer sans elles.
   *
   * #3234 — rend le reçu du fournisseur (identifiants seulement) : la clé
   * stable sur laquelle une réponse entrante s'apparie à l'envoi.
   */
  send(
    userId: string,
    input: { to: string; subject: string; body: string; attachments?: readonly OutgoingMailAttachment[] },
    /** #4546.5 — la boîte d'où l'envoi part ; absent = la boîte par défaut. */
    connectionId?: string,
  ): Promise<MailSendReceipt>

  /**
   * #4546.5 — TOUTES les boîtes du commercial chez ce fournisseur (jamais celles d'un collègue), chacune avec les
   * capacités de SES portées. C'est la liste parmi laquelle l'expéditeur se choisit.
   */
  senders(userId: string): Promise<MailboxSender[]>

  getOutOfOffice(userId: string): Promise<OutOfOfficeRequest | null>

  setOutOfOffice(userId: string, request: OutOfOfficeRequest): Promise<OutOfOfficeRequest>

  signature(userId: string): Promise<MailboxSignature>
}

/** #3699.6 — une pièce jointe sortante : nom, type rangé, octets en base64. */
export type OutgoingMailAttachment = { fileName: string; contentType: string; contentBase64: string }

/**
 * #3973 — l'identifiant, au registre des outils (`tool-catalog.ts`), de l'outil
 * qui sert chaque messagerie. C'est ce que « Outils et sources » décoche pour un
 * fil (`excludedToolProviders`) ; recopié et non importé (GA-07 compte les
 * imports service → service), la divergence est gardée par
 * `mailbox.service.spec.ts`, qui retrouve chaque identifiant au registre.
 */
export const MAILBOX_TOOL_PROVIDERS: Readonly<Record<MailboxProvider, string>> = {
  google: 'gmail',
  microsoft: 'microsoft',
}

/** Les messageries que ces outils décochés désignent ; tout autre identifiant est ignoré. */
export function mailboxProvidersExcludedBy(toolProviders: readonly string[] | null | undefined): MailboxProvider[] {
  const excluded = new Set(toolProviders ?? [])
  return (Object.keys(MAILBOX_TOOL_PROVIDERS) as MailboxProvider[]).filter(provider =>
    excluded.has(MAILBOX_TOOL_PROVIDERS[provider]),
  )
}

/** Ce que le copilote a le droit de lire pour CE fil : sans exclusion, toutes les messageries branchées. */
export type MailboxReadScope = { excludedProviders?: readonly MailboxProvider[] }

/**
 * Injection token pour la liste des backends disponibles. Mêmes conventions que
 * `CALENDAR_BACKENDS` de l'Action Router : un tableau, ordonné, dont le premier
 * connecté gagne.
 */
export const MAILBOX_BACKENDS = Symbol('MAILBOX_BACKENDS')

/**
 * Une signature HTML devient du texte brut lisible.
 *
 * Gmail stocke la signature en HTML ; un brouillon en `text/plain` qui
 * contiendrait des balises serait pire que pas de signature du tout. La
 * conversion est volontairement grossière — on ne rend pas du HTML, on en
 * extrait les lignes.
 */
export function htmlSignatureToText(html: string | null): string | null {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

/**
 * Colle la signature réelle au pied du corps.
 *
 * Garde-fou n°2 des méta-analyses : ne JAMAIS écrire « signature » comme
 * marque-place. Corollaire appliqué ici : quand aucune signature n'a pu être
 * lue, on ne met rien — un brouillon sans signature se corrige en deux
 * secondes, un brouillon signé du nom de quelqu'un d'autre part chez le client.
 */
export function appendSignature(body: string, signature: string | null): string {
  if (!signature?.trim()) return body
  if (body.includes(signature.trim())) return body
  return `${body.trimEnd()}\n\n${signature.trim()}\n`
}
