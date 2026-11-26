import { z } from 'zod'
import { storageUploadSchema } from './storage.js'

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LE LIEN SIGNÉ À PORTÉE LIMITÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RESTE, DEPUIS NEUF LOTS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2422.6 porte deux moitiés. La première (tarifs visibles selon le rôle
 * contractuel, pour un membre INTERNE de l'espace) est livrée depuis le lot
 * X54 (`viewFor`, `legal-contract.service.ts`). La seconde — un contact
 * EXTERNE (client, partenaire) SANS compte BellumAI dépose une pièce sur un
 * contrat de mission — restait bloquée, neuf lots de suite, par l'absence
 * d'une SESSION externe : aucun mécanisme de ce dépôt ne laisse un acteur sans
 * compte agir sur une ligne, et construire un contrôle d'accès pour qui ne se
 * connecte nulle part aurait inventé un mécanisme plutôt que d'en livrer un.
 *
 * Décision appliquée (recommandation, tranchée sans Louis, lot R24) : la
 * réponse n'est PAS une session — c'est un LIEN SIGNÉ à USAGE LIMITÉ, même
 * famille que {@link import('./storage.js').storageUploadSchema} pour le
 * transport et que `ApiKeysService` (`apps/api/src/modules/api-keys/`) pour le
 * stockage : un jeton ALÉATOIRE (256 bits), jamais stocké en clair — seul son
 * SHA-256 vit en base (`legal_contract_upload_links.token_hash`). Revoquer =
 * poser `revoked_at`, même geste que `ApiKeysService.revoke` /
 * `AccountShareService` (`account-share.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTÉE — « une mission + un contrat », jamais plus
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lien porte EXACTEMENT un `contractId` et un `missionId`, écrits à la
 * CRÉATION, jamais reçus du dépôt public : rien dans
 * {@link depositLegalContractUploadSchema} ne nomme un contrat ou une mission
 * — la cible du dépôt est ENTIÈREMENT déterminée par la ligne que le jeton
 * résout, jamais par ce que l'appelant prétend. Un jeton valide pour la
 * mission A ne peut donc jamais écrire sur la mission B : il n'existe
 * structurellement aucun champ par lequel le demander.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉPÔT SEULEMENT — aucune lecture des AUTRES pièces
 * ─────────────────────────────────────────────────────────────────────────────
 * La réponse publique ({@link legalContractUploadLinkPublicStatusSchema}) ne
 * porte JAMAIS la liste des pièces déjà déposées sur le contrat, ni son
 * tarif, ni son statut au-delà de ce qui rassure le dépôt (le libellé du
 * contrat et de la mission, pour que le contact externe confirme qu'il dépose
 * au bon endroit). Le journal des dépôts (`deposits`) n'est rendu qu'au
 * commercial ({@link legalContractUploadLinkSchema}), jamais sur la porte
 * publique.
 */

/** Sept jours — la fenêtre que la décision applicable nomme explicitement. */
export const LEGAL_CONTRACT_UPLOAD_LINK_TTL_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** L'échéance d'un lien neuf, dérivée de sa création — jamais une seconde
 *  constante pour la même fenêtre (GA-26). */
export function legalContractUploadLinkExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + LEGAL_CONTRACT_UPLOAD_LINK_TTL_DAYS * MS_PER_DAY)
}

/**
 * Le lien sait dire NON — calcul pur, testé seul. Un lien RÉVOQUÉ reste
 * refusé même avant son échéance (`revokedAt` l'emporte toujours) ; un lien
 * ÉCHU reste refusé même s'il n'a jamais été révoqué.
 */
export function legalContractUploadLinkIsUsable(
  link: { expiresAt: string; revokedAt: string | null },
  now: Date,
): boolean {
  if (link.revokedAt !== null) return false
  return now.getTime() < new Date(link.expiresAt).getTime()
}

/** Pourquoi un lien, VU DE L'EXTÉRIEUR, ne peut pas recevoir de dépôt. */
export const LEGAL_CONTRACT_UPLOAD_LINK_REFUSALS = ['not_found', 'expired', 'revoked'] as const
export const legalContractUploadLinkRefusalSchema = z.enum(LEGAL_CONTRACT_UPLOAD_LINK_REFUSALS)
export type LegalContractUploadLinkRefusal = (typeof LEGAL_CONTRACT_UPLOAD_LINK_REFUSALS)[number]

/**
 * Créer un lien — `.strict()` : ni `contractId` (dans l'URL), ni
 * `workspaceId`/`accountId` (résolus côté serveur depuis la session) n'entrent
 * ici. Le commercial choisit UNE mission du MÊME compte que le contrat — la
 * vérification d'appartenance vit dans le service, jamais ici.
 */
export const createLegalContractUploadLinkSchema = z.object({ missionId: z.string().guid() }).strict()
export type CreateLegalContractUploadLinkInput = z.infer<typeof createLegalContractUploadLinkSchema>

/** Une ligne du JOURNAL DE DÉPÔT — ce qu'un contact externe a réellement déposé. */
export const legalContractUploadDepositSchema = z.object({
  fileName: z.string(),
  byteSize: z.number().int().positive(),
  contentType: z.string(),
  depositedAt: z.string(),
})
export type LegalContractUploadDeposit = z.infer<typeof legalContractUploadDepositSchema>

/**
 * Le lien tel que le COMMERCIAL le voit — jamais le jeton brut (rendu une
 * seule fois, à la création, comme {@link import('../modules/api-keys/api-keys.service.js')}
 * côté API). Le journal des dépôts est ICI, jamais sur la porte publique.
 */
export const legalContractUploadLinkSchema = z.object({
  id: z.string().guid(),
  contractId: z.string().guid(),
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  deposits: z.array(legalContractUploadDepositSchema),
})
export type LegalContractUploadLink = z.infer<typeof legalContractUploadLinkSchema>

/** La réponse à la CRÉATION — le jeton brut part UNE fois, dans l'URL prête à copier. */
export const createdLegalContractUploadLinkSchema = z.object({
  link: legalContractUploadLinkSchema,
  url: z.string().url(),
})
export type CreatedLegalContractUploadLink = z.infer<typeof createdLegalContractUploadLinkSchema>

/**
 * Ce que la PORTE PUBLIQUE rend — jamais le journal, jamais le tarif, jamais
 * le statut du contrat : juste assez pour que le dépôt confirme qu'il est au
 * bon endroit, et pour que l'écran sache quoi accepter.
 */
export const legalContractUploadLinkPublicStatusSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('valid'),
      contractLabel: z.string(),
      missionLabel: z.string().nullable(),
      accountName: z.string(),
      acceptedExtensions: z.string(),
      maxBytes: z.number().int().positive(),
    })
    .strict(),
  z.object({ status: legalContractUploadLinkRefusalSchema }).strict(),
])
export type LegalContractUploadLinkPublicStatus = z.infer<typeof legalContractUploadLinkPublicStatusSchema>

/**
 * Le dépôt public lui-même — EXACTEMENT la forme du fichier
 * ({@link storageUploadSchema}), rien de plus : aucun champ ne nomme un
 * contrat, une mission ou un espace. C'est ce qui rend « un jeton d'une
 * mission ne peut jamais écrire sur une autre » vrai PAR CONSTRUCTION, pas
 * par discipline du serveur.
 */
export const depositLegalContractUploadSchema = storageUploadSchema
export type DepositLegalContractUploadInput = z.infer<typeof depositLegalContractUploadSchema>
