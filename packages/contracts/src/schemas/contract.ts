import { z } from 'zod'
import { missionChannelSchema, paymentTermsBasisSchema, type MissionChannel } from './staffing.js'

/**
 * #2422.4 — LE CONTRAT JURIDIQUE TYPÉ (LAU-FINAL-136), première tranche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, APRÈS CINQ NUITS SANS CODE SUR #2869
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq écrivains de nuit consécutifs (24 au 27/09) ont vérifié, chacun
 * indépendamment, qu'aucune entité contrat typée n'existait et que les six
 * sous-points de #2869 en dépendaient tous — et se sont arrêtés là : « système
 * fondateur, plus d'un jour ». C'est vrai du système ENTIER (13 attributs ×
 * neuf types × chaîne contractuelle × policy de facturation × versioning de
 * document × NO-GO croisé). Ce n'est pas vrai de la PREMIÈRE tranche verticale :
 * un type, un contrat, un appelant, un écran. Tranché sans Louis (27/09) :
 * livrer cette tranche plutôt que continuer d'écrire « reste, système absent »
 * une sixième fois.
 *
 * ⚠️ NOM : `LegalContract`, jamais `Contract` seul — `ContractType`/
 * `contractTypeSchema` existent déjà (`analysis/primitives.ts`, régie / forfait
 * / TMA / centre de services / consulting — le TYPE D'ENGAGEMENT d'une
 * mission, sans rapport). Un contrat client cadre/mission/avenant/PO/
 * sous-traitance est un objet différent ; lui donner le même nom aurait
 * recréé la collision que `git grep contract_type` trouvait déjà sur
 * `consultants.contract_type` (statut d'emploi, également sans rapport).
 *
 * Les treize attributs de #2422 (issue #2422, section CONTRATS) :
 * parties, dates, scope, tarif, volume, plafond, paiement, préavis,
 * renouvellement, pièces, source, statut, confidentialité — tous portés
 * ci-dessous. Champs déclaratifs en texte libre là où la forme exacte n'est
 * pas spécifiée (`scope`, `tariffNote`, `volumeNote`) : même choix que
 * `documentsExpected`/`declaredRisks` sur `staffing.ts` — un sous-système de
 * suivi n'est pas inventé pour un champ qui n'en demande pas.
 *
 * NE livre PAS (`reste`, voir le commentaire de #2869) : la visibilité tarifaire
 * par rôle CONTRACTUEL (#2422.6, un contact externe de la chaîne). Les
 * permissions par pièce (#2422.10) sont posées par `visibility` (lot X54).
 */

// ── Le TYPE de contrat (neuf valeurs, dans l'ordre de l'issue #2422) ──────────

export const LEGAL_CONTRACT_TYPES = [
  /** Contrat-cadre : la relation, sans mission précise. */
  'framework',
  /** Contrat de mission : une prestation nommée. */
  'mission_agreement',
  /** Avenant à un contrat existant. */
  'amendment',
  /** Bon de commande. */
  'purchase_order',
  /** Contrat de sous-traitance (nos consultants prêtés, ou l'inverse). */
  'subcontracting_agreement',
  /** Contrat de partenariat (référencement, apport d'affaires). */
  'partnership_agreement',
  /** Contrat directement avec un consultant (freelance, portage). */
  'consultant_contract',
  /** Convention (cadre non commercial : stage, école, association). */
  'convention',
  /** Non couvert par les huit types ci-dessus. */
  'other',
] as const
export const legalContractTypeSchema = z.enum(LEGAL_CONTRACT_TYPES)
export type LegalContractType = (typeof LEGAL_CONTRACT_TYPES)[number]

/**
 * Le STATUT DÉCLARÉ (attribut « statut ») — jamais deviné. Trois valeurs,
 * volontairement moins que le cycle de vie DÉRIVÉ ({@link legalContractLifecycle})
 * : un humain déclare seulement CE QU'IL SAIT (signé ou non, résilié ou non),
 * jamais si le contrat est aujourd'hui dans sa fenêtre de validité — ça, c'est
 * une date qui le dit, pas une case à cocher.
 */
export const LEGAL_CONTRACT_STATUSES = ['draft', 'signed', 'terminated'] as const
export const legalContractStatusSchema = z.enum(LEGAL_CONTRACT_STATUSES)
export type LegalContractStatus = (typeof LEGAL_CONTRACT_STATUSES)[number]

/**
 * Qui peut LIRE une pièce (#2422.10, lot X54) — trois portées, du plus ouvert
 * au plus fermé : `workspace` (tout membre), `finance` (le droit `finance:read`),
 * `owner` (le propriétaire du contrat, plus `finance:read`). Une pièce sans
 * visibilité (ligne antérieure à ce lot) se lit comme `workspace` : on ne
 * masque jamais par défaut ce qui était ouvert hier.
 */
export const LEGAL_DOCUMENT_VISIBILITIES = ['workspace', 'finance', 'owner'] as const
export const legalDocumentVisibilitySchema = z.enum(LEGAL_DOCUMENT_VISIBILITIES)
export type LegalDocumentVisibility = (typeof LEGAL_DOCUMENT_VISIBILITIES)[number]

/**
 * Une PIÈCE du contrat (attribut « pièces ») — #2422.10 : version, signature,
 * date, expiration et permission de lecture (`visibility`).
 */
export const legalContractDocumentSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    /** `null` = déposée hors produit (mentionnée, pas jointe) — jamais une
     *  pièce qu'on invente une URL pour. */
    url: z.string().trim().max(2000).nullable(),
    /** 1 à la première version. Une pièce sans numéro n'existe pas. */
    version: z.number().int().min(1),
    /** `null` = non signée. C'est CE champ, pas le statut du contrat entier,
     *  qui empêche `legalContractLifecycle` de lire un fichier joint comme actif. */
    signedAt: z.string().nullable(),
    expiresOn: z.string().nullable(),
    /** Absent = `workspace` (voir {@link LEGAL_DOCUMENT_VISIBILITIES}). */
    visibility: legalDocumentVisibilitySchema.optional(),
  })
  .strict()
export type LegalContractDocument = z.infer<typeof legalContractDocumentSchema>

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Déposer une pièce (#2422.10) — le numéro de version n'est JAMAIS saisi : il
 *  se déduit du libellé ({@link nextLegalContractDocumentVersion}). */
export const addLegalContractDocumentSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    url: z
      .string()
      .trim()
      .max(2000)
      .regex(/^https?:\/\//i, 'Une adresse http(s) est attendue')
      .nullable()
      .default(null),
    signedAt: z.string().regex(DATE_ONLY, 'Format attendu : AAAA-MM-JJ').nullable().default(null),
    expiresOn: z.string().regex(DATE_ONLY, 'Format attendu : AAAA-MM-JJ').nullable().default(null),
    visibility: legalDocumentVisibilitySchema.default('workspace'),
  })
  .strict()
export type AddLegalContractDocumentInput = z.infer<typeof addLegalContractDocumentSchema>

/** 1 pour un libellé neuf, sinon la plus haute version du MÊME libellé + 1
 *  (comparaison sans casse ni espaces de bord). */
export function nextLegalContractDocumentVersion(
  documents: readonly Pick<LegalContractDocument, 'label' | 'version'>[],
  label: string,
): number {
  const key = label.trim().toLowerCase()
  const same = documents.filter(d => d.label.trim().toLowerCase() === key)
  return same.reduce((max, d) => Math.max(max, d.version), 0) + 1
}

/** Les pièces que ce lecteur a le droit de voir. Une pièce refusée ne fait
 *  AUCUNE ligne : ni libellé masqué, ni compteur — son existence ne fuit pas. */
export function visibleLegalContractDocuments(
  documents: readonly LegalContractDocument[],
  viewer: { canReadFinance: boolean; isOwner: boolean },
): LegalContractDocument[] {
  return documents.filter(document => {
    switch (document.visibility ?? 'workspace') {
      case 'workspace':
        return true
      case 'finance':
        return viewer.canReadFinance
      case 'owner':
        return viewer.isOwner || viewer.canReadFinance
    }
  })
}

/**
 * La vue rendue par l'API — les treize attributs de #2422, plus le type et
 * l'identité. `parties` se lit en DEUX champs distincts (`counterpartyName`,
 * `legalEntityId`) plutôt qu'un seul : l'issue #2422 refuse nommément
 * d'appeler « compte » ce qui distingue société juridique ESN et entité
 * cliente, et un champ unique aurait recréé cette confusion.
 */
export const legalContractSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  /** Le COMPTE CRM porteur — jamais confondu avec `legalEntityId` (la société
   *  ESN) ni avec une future entité juridique cliente (hors tranche). */
  accountId: z.string().guid(),
  type: legalContractTypeSchema,
  label: z.string(),
  // ── parties ──────────────────────────────────────────────────────────────
  counterpartyName: z.string(),
  /** La société ESN qui SIGNE — `legal_entities.id`. `null` = non renseignée,
   *  ce qui reste une fiche incomplète, jamais une raison d'en deviner une. */
  legalEntityId: z.string().guid().nullable(),
  legalEntityName: z.string().nullable(),
  /** #2422.5 — le PROPRIÉTAIRE du contrat, premier champ réel de la chaîne
   *  contractuelle rang 2 (reste : rôle et permissions de réattribution). */
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  // ── dates ────────────────────────────────────────────────────────────────
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  // ── scope / tarif / volume — déclaratifs, texte libre ───────────────────
  scope: z.string().nullable(),
  tariffNote: z.string().nullable(),
  volumeNote: z.string().nullable(),
  // ── plafond ──────────────────────────────────────────────────────────────
  /** En centimes. `null` = non renseigné, jamais 0 — un plafond à 0 € n'existe
   *  pas (même règle que `poAmountCents`, `staffing.ts`). */
  capAmountCents: z.number().int().nonnegative().nullable(),
  // ── paiement ─────────────────────────────────────────────────────────────
  paymentTermsDays: z.number().int().nonnegative().nullable(),
  paymentTermsBasis: paymentTermsBasisSchema.nullable(),
  // ── préavis ──────────────────────────────────────────────────────────────
  noticeDays: z.number().int().nonnegative().nullable(),
  // ── renouvellement ───────────────────────────────────────────────────────
  autoRenew: z.boolean(),
  // ── pièces ───────────────────────────────────────────────────────────────
  documents: z.array(legalContractDocumentSchema),
  // ── source ───────────────────────────────────────────────────────────────
  /** Réutilise {@link missionChannelSchema} (`staffing.ts`) plutôt qu'une
   *  deuxième taxonomie direct/partenaire/sous-traitance : un réglage vit à un
   *  seul endroit (GA-26). */
  source: missionChannelSchema,
  // ── statut ───────────────────────────────────────────────────────────────
  status: legalContractStatusSchema,
  // ── confidentialité ──────────────────────────────────────────────────────
  confidential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type LegalContract = z.infer<typeof legalContractSchema>

export const createLegalContractSchema = z
  .object({
    type: legalContractTypeSchema,
    label: z.string().trim().min(1).max(200),
    counterpartyName: z.string().trim().min(1).max(200),
    legalEntityId: z.string().guid().nullable().default(null),
    ownerId: z.string().guid().nullable().default(null),
    startsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .default(null),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .default(null),
    scope: z.string().trim().min(1).max(2000).nullable().default(null),
    tariffNote: z.string().trim().min(1).max(2000).nullable().default(null),
    volumeNote: z.string().trim().min(1).max(2000).nullable().default(null),
    capAmountCents: z.number().int().nonnegative().nullable().default(null),
    paymentTermsDays: z.number().int().min(0).max(365).nullable().default(null),
    paymentTermsBasis: paymentTermsBasisSchema.nullable().default(null),
    noticeDays: z.number().int().min(0).max(365).nullable().default(null),
    autoRenew: z.boolean().default(false),
    source: missionChannelSchema.default('unknown'),
    status: legalContractStatusSchema.default('draft'),
    confidential: z.boolean().default(false),
  })
  .strict()
  .refine(value => value.endsOn === null || value.startsOn === null || value.endsOn >= value.startsOn, {
    message: 'Un contrat ne peut pas finir avant de commencer',
    path: ['endsOn'],
  })
export type CreateLegalContractInput = z.infer<typeof createLegalContractSchema>

/**
 * #2422.5 — réattribuer le PROPRIÉTAIRE du contrat (chaîne contractuelle rang
 * 2). Même forme que {@link setMissionCraContactSchema}/`setMissionClientManagerSchema`
 * (`mission.ts`) : `ownerId: null` retire le propriétaire — redevient « non
 * désigné », jamais un état à part.
 */
export const reassignLegalContractOwnerSchema = z.object({ ownerId: z.string().guid().nullable() }).strict()
export type ReassignLegalContractOwnerInput = z.infer<typeof reassignLegalContractOwnerSchema>

// ── Le cycle de vie DÉRIVÉ (jamais stocké) ────────────────────────────────────

export const LEGAL_CONTRACT_LIFECYCLES = ['draft', 'active', 'expiring_soon', 'expired', 'terminated'] as const
export const legalContractLifecycleSchema = z.enum(LEGAL_CONTRACT_LIFECYCLES)
export type LegalContractLifecycle = (typeof LEGAL_CONTRACT_LIFECYCLES)[number]

/**
 * Le jour ÉCOULÉ entre deux dates `YYYY-MM-DD`, en UTC (même piège que
 * `startOfDay` sur `staffing.ts` : ancrer sur un minuit local décalerait le
 * compte d'un jour selon le fuseau du serveur).
 */
function daysUntil(dateStr: string, today: Date): number {
  const target = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`)
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((target - now) / 86_400_000)
}

/**
 * Le cycle de vie d'un contrat — DÉRIVÉ, jamais stocké (GA-26). C'est LE
 * calcul que #2869 nommait « Laura ne doit pas interpréter un simple fichier
 * non signé comme contrat actif » : un contrat `draft` reste `draft` quelles
 * que soient ses dates, un fichier non signé ne devient jamais actif tout
 * seul.
 *
 * Seuil « bientôt expiré » : 30 jours, comme la plupart des fenêtres de ce
 * dépôt (préavis, renouvellement) — pas une garantie contractuelle, un
 * repère d'écran.
 */
export function legalContractLifecycle(
  contract: Pick<LegalContract, 'status' | 'startsOn' | 'endsOn'>,
  today: Date,
): LegalContractLifecycle {
  if (contract.status === 'terminated') return 'terminated'
  if (contract.status === 'draft') return 'draft'
  // `status === 'signed'` à partir d'ici : les dates décident.
  if (contract.endsOn !== null && daysUntil(contract.endsOn, today) < 0) return 'expired'
  if (contract.endsOn !== null && daysUntil(contract.endsOn, today) <= 30) return 'expiring_soon'
  return 'active'
}

// ── #2422.11 — NO-GO, calcul pur seul (aucun appelant encore, voir le docblock) ──

export const LEGAL_CONTRACT_NO_GO_REASONS = ['wrong_legal_entity', 'partner_skipped'] as const
export const legalContractNoGoReasonSchema = z.enum(LEGAL_CONTRACT_NO_GO_REASONS)
export type LegalContractNoGoReason = (typeof LEGAL_CONTRACT_NO_GO_REASONS)[number]

/**
 * #2422.11 — « une facture est préparée avec la mauvaise société juridique, ou
 * directement au client final alors que la chaîne passe par un partenaire »
 * (issue #2422, section NO-GO), en calcul pur.
 *
 * Deux refus, jamais un troisième deviné :
 *  - `wrong_legal_entity` — la mission facture sous une société ESN
 *    DIFFÉRENTE de celle que le contrat nomme. `null` d'un côté ou de l'autre
 *    ne déclenche RIEN : on ne bloque pas sur une information qu'on n'a pas ;
 *  - `partner_skipped` — le contrat nomme un `source` intermédié (`partner`,
 *    `subcontracting`, `portage`) mais la mission facture en `direct` : la
 *    chaîne que le contrat décrit n'est pas celle que la mission a suivie.
 *
 * `null` = aucun des deux, jamais une réponse par défaut positive : un
 * `source`/`channel` `unknown` des deux côtés ne prouve rien, donc ne bloque
 * rien.
 *
 * ⚠️ Aucun appelant ne consomme encore cette fonction (aucune route,
 * aucun écran) — `reste` explicite sur #2869 : elle est testée seule, pas
 * encore branchée à `assessInvoiceReadiness` ni à un écran de mission.
 */
export function legalContractChainNoGo(input: {
  contract: Pick<LegalContract, 'legalEntityId' | 'source'>
  mission: { legalEntityId: string | null; channel: MissionChannel }
}): LegalContractNoGoReason | null {
  const { contract, mission } = input
  if (
    contract.legalEntityId !== null &&
    mission.legalEntityId !== null &&
    contract.legalEntityId !== mission.legalEntityId
  ) {
    return 'wrong_legal_entity'
  }
  const intermediated =
    contract.source === 'partner' || contract.source === 'subcontracting' || contract.source === 'portage'
  if (intermediated && mission.channel === 'direct') return 'partner_skipped'
  return null
}

// ── #2422.9 — éligibilité facture par POLICY, jamais une exigence universelle ──

export const LEGAL_CONTRACT_COVERAGES = ['covered', 'uncovered'] as const
export type LegalContractCoverage = (typeof LEGAL_CONTRACT_COVERAGES)[number]

/**
 * #2422.9 (épopée #2869) — « l'éligibilité facture dépend de la POLICY, jamais
 * une exigence universelle codée en dur ». Ce n'est donc PAS « toute mission
 * doit avoir un contrat actif » (aucune mission n'a cette exigence si le
 * dépôt ne peut pas la relier à un contrat) : c'est « si l'espace porte un
 * contrat qui partage la société de cette mission — la MÊME correspondance
 * que {@link legalContractChainNoGo}, `legal_contracts` n'ayant toujours
 * aucune colonne qui nomme LA mission qu'il couvre — et qu'AUCUN de ceux qui
 * matchent n'est actif, la facturation s'arrête ».
 *
 * Trois lots (T02 29/09, puis d'autres avant) avaient cherché cette policy du
 * côté d'une colonne neuve (`mission_commercial_terms.legal_contract_id`),
 * bloqués par le risque réel de décaler les ~34 paramètres positionnels de
 * `StaffingService.upsertTerms`. Cette fonction ne l'attend pas : elle réutilise
 * la correspondance PAR SOCIÉTÉ que #2422.11 (NO-GO) a déjà validée et branchée
 * (`LegalContractService.list`) — le seul lien vérifiable que ce dépôt porte
 * aujourd'hui entre une mission et un contrat, sans inventer de FK.
 *
 * `undefined` = on ne peut pas juger honnêtement (société de la mission
 * inconnue, ou aucun contrat de l'espace ne la partage) : ne JAMAIS bloquer
 * sur une comparaison qu'on ne peut pas faire — c'est exactement le risque de
 * faux positif que #2422.9 avait identifié pour la voie FK et qui ne s'applique
 * pas ici, la correspondance étant par société, jamais par compte entier :
 * un compte à deux contrats (un actif, un expiré) d'une AUTRE société ne
 * bloque aucune mission dont la société matche le contrat actif.
 */
export function legalContractCoverage(
  mission: { legalEntityId: string | null },
  contracts: Pick<LegalContract, 'legalEntityId' | 'status' | 'startsOn' | 'endsOn'>[],
  today: Date,
): LegalContractCoverage | undefined {
  if (mission.legalEntityId === null) return undefined
  const matched = contracts.filter(c => c.legalEntityId === mission.legalEntityId)
  if (matched.length === 0) return undefined
  const healthy = matched.some(c => {
    const lifecycle = legalContractLifecycle(c, today)
    return lifecycle === 'active' || lifecycle === 'expiring_soon'
  })
  return healthy ? 'covered' : 'uncovered'
}
