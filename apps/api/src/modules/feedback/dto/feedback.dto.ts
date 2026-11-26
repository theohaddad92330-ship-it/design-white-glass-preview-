import { FEEDBACK_MESSAGE_MAX } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #1792 — LES BORNES D'UNE PIÈCE JOINTE DE SIGNALEMENT.
//
// `packages/contracts` est hors périmètre de ce lot (voir CLAUDE.md) : ces
// nombres sont donc dupliqués, à l'identique, côté web dans
// `apps/web/src/features/feedback/attachments.ts` — un futur changement de
// borne doit toucher LES DEUX fichiers. C'est une entorse assumée à « un
// réglage vit à un seul endroit » (GA-26), forcée par le périmètre de fichiers
// de ce lot, pas un choix.
//
// Le plafond PAR FICHIER reprend le repère du champ `screenshot` existant
// (4 Mo). Il est exprimé en OCTETS RÉELS — `ATTACHMENT_DATA_BASE64_MAX_CHARS`
// ci-dessous est la même borne, gonflée du facteur du base64 (4/3), pour
// s'appliquer à la CHAÎNE reçue.
export const ATTACHMENT_MAX_RAW_BYTES = 4_000_000
const ATTACHMENT_DATA_BASE64_MAX_CHARS = Math.ceil((ATTACHMENT_MAX_RAW_BYTES * 4) / 3)

/** Nombre de pièces jointes par signalement. */
export const ATTACHMENTS_MAX_COUNT = 5

/**
 * Le plafond TOTAL — délibérément plus bas que `ATTACHMENTS_MAX_COUNT ×
 * ATTACHMENT_MAX_RAW_BYTES` (20 Mo) : cinq fichiers presque au plafond
 * chacun produiraient sinon une rafale de commits de 20 Mo sur la branche
 * d'actifs à chaque signalement. 10 Mo laisse un usage réel (plusieurs
 * captures, un PDF court) sans transformer un retour en dépôt de masse.
 */
export const ATTACHMENTS_MAX_TOTAL_RAW_BYTES = 10_000_000
const ATTACHMENTS_TOTAL_BASE64_MAX_CHARS = Math.ceil((ATTACHMENTS_MAX_TOTAL_RAW_BYTES * 4) / 3)

/**
 * LISTE BLANCHE — jamais liste noire. Images, PDF, texte brut. Aucun
 * exécutable, aucun HTML, aucun SVG : un SVG est un document actif, il porte
 * du script.
 *
 * ⚠️ Ce contrôle est un PRÉ-FILTRE, pour un refus 400 clair et rapide. Il ne
 * décide PAS de l'extension écrite sur le disque ni de l'acceptation finale :
 * `GithubIssueService.uploadAsset` relit la SIGNATURE OCTETS du contenu
 * déposé — le `mimeType` déclaré ici vient du navigateur et est falsifiable,
 * il n'a jamais été l'autorité (github-issue.service.ts).
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const

export const attachmentSchema = z.object({
  /** Jamais utilisé pour construire un chemin — voir uploadAsset. Purement d'affichage. */
  name: z.string().min(1).max(200),
  mimeType: z.enum(ALLOWED_ATTACHMENT_MIME_TYPES),
  /** Base64 BRUT, sans le préfixe `data:...;base64,`. */
  dataBase64: z.string().min(1).max(ATTACHMENT_DATA_BASE64_MAX_CHARS),
})

// The DOM element the reporter pointed at. `sourceFile` is stamped at build
// time by the web app's `bellum-source-tag` Vite plugin, so it survives
// minification and names an actual line of source.
export const elementContextSchema = z.object({
  sourceFile: z.string().max(500).nullish(),
  sourceChain: z.array(z.string().max(500)).max(10).default([]),
  componentStack: z.array(z.string().max(200)).max(20).default([]),
  selector: z.string().max(1000),
  tagName: z.string().max(50),
  elementId: z.string().max(200).nullish(),
  classes: z.string().max(1000).nullish(),
  role: z.string().max(100).nullish(),
  ariaLabel: z.string().max(300).nullish(),
  text: z.string().max(500).nullish(),
  href: z.string().max(2000).nullish(),
  /** `tag#id.classe[role][data-*]` — l'identité de l'élément en une ligne. */
  descriptor: z.string().max(600).nullish(),
  /** `outerHTML` tronqué : le markup réel, que le sélecteur ne montre pas. */
  html: z.string().max(2000).nullish(),
  /**
   * #3895.1 — vrai quand `html` est un EXTRAIT : le markup réel dépassait la
   * troncature cliente. `false` par défaut (client d'avant ce champ) — un
   * markup jamais déclaré tronqué ne l'était pas, comportement inchangé.
   */
  htmlTruncated: z.boolean().default(false),
  /** Chaînes distinctives à chercher dans le code (libellé, id, data-testid). */
  grepTokens: z.array(z.string().max(60)).max(8).default([]),
  rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  viewport: z.object({ width: z.number(), height: z.number(), dpr: z.number() }),
})

/**
 * Un appel HTTP qui a échoué avant le signalement.
 *
 * `correlationId` est le champ qui vaut le détour : l'API pose un
 * `x-correlation-id` sur chaque réponse, et c'est la clé qui ouvre les logs
 * serveur de CETTE requête-là. Nullable — en cross-origin le navigateur ne le
 * laisse lire que si l'API l'expose, et un identifiant absent se dit, il ne
 * s'invente pas.
 */
export const networkFailureSchema = z.object({
  time: z.string().max(40),
  method: z.string().max(10),
  url: z.string().max(500),
  status: z.number().int().nullish(),
  error: z.string().max(500).nullish(),
  durationMs: z.number().nullish(),
  correlationId: z.string().max(100).nullish(),
})

/** Un geste précédent : un clic ou un changement de route. */
export const breadcrumbSchema = z.object({
  time: z.string().max(40),
  type: z.enum(['click', 'navigation']),
  label: z.string().max(300),
})

/**
 * L'état de l'app au moment du signalement. `buildVersion` porte le SHA du
 * commit déployé : c'est lui qui permet de relire la ligne de code POINTÉE dans
 * la version que la personne avait sous les yeux, et pas dans celle d'aujourd'hui.
 */
export const appContextSchema = z.object({
  buildVersion: z.string().max(200),
  environment: z.string().max(50),
  route: z.string().max(500),
  theme: z.enum(['dark', 'light']),
  language: z.string().max(20),
  timeZone: z.string().max(100),
  online: z.boolean(),
  viewport: z.string().max(60),
})

// Beta feedback capture. `userId` never comes from the client — the controller
// derives it from the JWT. The rest is context the SPA gathers automatically
// (page, agent, buffered console, runtime errors, pointed element, screenshot,
// failed calls, trail of gestures, build) so a bug is reproducible.
export const createFeedbackSchema = z.object({
  category: z.enum(['bug', 'metier', 'autre']),
  message: z.string().min(1).max(FEEDBACK_MESSAGE_MAX),
  accountId: z.string().guid().nullish(),
  userEmail: z.string().email().max(320).nullish(),
  pageUrl: z.string().max(2000).nullish(),
  userAgent: z.string().max(1000).nullish(),
  consoleLogs: z.string().max(20000).nullish(),
  errorLogs: z.string().max(20000).nullish(),
  elementContext: elementContextSchema.nullish(),
  // data URL (image/png;base64,...). Capped so a huge capture can't blow up the
  // request or the row.
  //
  // ⚠️ #1792 — CE CHAMP NE SE SUPPRIME PAS. Des onglets déjà chargés continuent
  // de l'envoyer seul (sans `attachments`) : le retirer casserait leur envoi
  // sans qu'aucun déploiement ne les touche. La capture automatique continue
  // de suivre EXACTEMENT ce chemin, inchangé.
  screenshot: z.string().max(4_000_000).nullish(),
  // #1792 — pièces jointes choisies par la personne (collées ou sélectionnées),
  // en plus de la capture automatique ci-dessus. Bornées en nombre ET en
  // taille totale — un refus clair (400) plutôt qu'une pièce qui disparaît.
  attachments: z
    .array(attachmentSchema)
    .max(ATTACHMENTS_MAX_COUNT)
    .default([])
    .refine(
      items => items.reduce((total, item) => total + item.dataBase64.length, 0) <= ATTACHMENTS_TOTAL_BASE64_MAX_CHARS,
      {
        message: `La taille totale des pièces jointes dépasse le plafond autorisé (${ATTACHMENTS_MAX_TOTAL_RAW_BYTES} octets).`,
      },
    ),
  networkFailures: z.array(networkFailureSchema).max(20).default([]),
  breadcrumbs: z.array(breadcrumbSchema).max(30).default([]),
  appContext: appContextSchema.nullish(),
})
export class CreateFeedbackDto extends createZodDto(createFeedbackSchema) {}
