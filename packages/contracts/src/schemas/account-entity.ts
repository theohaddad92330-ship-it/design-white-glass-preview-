import { z } from 'zod'
import { siteTypeSchema } from './analysis/primitives.js'
import { APPLICATION_SECTOR_CODES, applicationSectorCodeSchema } from './application-sectors.js'

/**
 * Compte → Entité → Site : les trois niveaux d'un CRM d'ESN (PDF 2 §2).
 *
 * - Le **compte** est le périmètre commercial (« EDF ») : propriétaire, score,
 *   plan d'action, veille.
 * - L'**entité** est une personne morale ou une business unit budgétaire
 *   (« EDF DSI Groupe », « EDF Renouvelables ») : c'est elle qui porte les
 *   contacts, les projets et le rang 1 en place.
 * - Le **site** est une implantation physique (« EDF Saclay ») : c'est lui qui
 *   porte la mission et la mobilité réelle du consultant.
 *
 * Un CRM générique aplatit tout sur « Account ». C'est exactement ce que le
 * produit refuse : sans entité, impossible de dire qu'une BU est accessible et
 * l'autre non ; sans site, le matching sur la mobilité se fait contre le siège
 * social au lieu du lieu où la mission se déroule.
 */

/** Ce que l'entité EST. `unknown` est une réponse légitime — beaucoup de
 *  divisions ne se rangent pas, et les ranger de force fabriquerait une
 *  information que personne n'a vérifiée. */
export const ACCOUNT_ENTITY_KINDS = ['bu', 'subsidiary', 'division', 'unknown'] as const
export const accountEntityKindSchema = z.enum(ACCOUNT_ENTITY_KINDS)
export type AccountEntityKind = (typeof ACCOUNT_ENTITY_KINDS)[number]

/**
 * Une ESN de rang 1 est-elle déjà installée sur cette entité ?
 *
 * Trois valeurs, et `unknown` n'est pas un remplissage : « on ne sait pas » et
 * « il n'y en a pas » mènent à deux stratégies commerciales opposées — dans un
 * cas on va chercher l'information, dans l'autre on attaque en direct.
 */
export const RANK1_INCUMBENT_VALUES = ['yes', 'no', 'unknown'] as const
export const rank1IncumbentSchema = z.enum(RANK1_INCUMBENT_VALUES)
export type Rank1Incumbent = (typeof RANK1_INCUMBENT_VALUES)[number]

/**
 * QUI a confirmé l'identité légale d'une entité (31/08/2026).
 *
 * La pastille « vérifié » de la maquette est un ornement tant qu'elle ne dit
 * pas ce qu'elle vérifie. Ces deux valeurs sont ce qu'elle peut affirmer :
 *
 *  · `public_registry` — un registre public porte cette raison sociale et cet
 *    identifiant. C'est le cas où le NOM de la source EST la garantie ;
 *  · `human_declared` — quelqu'un de l'espace l'a saisi et en répond. Moins
 *    fort qu'un registre, et infiniment plus fort que rien.
 *
 * ⚠️ **Deux valeurs, et pas trois.** « Le modèle l'a proposé » n'est PAS une
 * vérification : lui donner un nom ici le ferait cocher un jour, et la pastille
 * affirmerait alors une identité que personne n'a regardée. Une proposition de
 * modèle reste une proposition tant qu'un humain ou un registre ne l'a pas
 * confirmée — c'est exactement la frontière que `Provenance` trace ailleurs
 * entre `model` et `public` / `human`.
 *
 * Contrainte SQL `account_entities_identity_source_check`, inscrite au MAPPING
 * de GA-12.
 */
export const ACCOUNT_ENTITY_IDENTITY_SOURCES = ['public_registry', 'human_declared'] as const
export const accountEntityIdentitySourceSchema = z.enum(ACCOUNT_ENTITY_IDENTITY_SOURCES)
export type AccountEntityIdentitySource = (typeof ACCOUNT_ENTITY_IDENTITY_SOURCES)[number]

/**
 * Le nom de l'entité qui accueille les contacts dont on ignore la division.
 *
 * Stocké en français parce qu'un lecteur SQL doit comprendre la ligne sans
 * ouvrir l'application ; l'écran, lui, affiche la traduction de sa langue en
 * se fiant à `is_default`, jamais au texte.
 */
export const DEFAULT_ENTITY_NAME = 'Périmètre non déterminé'

export const accountEntitySchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  name: z.string(),
  kind: accountEntityKindSchema,
  siren: z.string().nullable(),
  /**
   * L'ÉTABLISSEMENT, quatorze chiffres (31/08/2026). `null` = jamais saisi —
   * jamais déduit du SIREN, dont il ne se dérive pas (voir
   * {@link siretBelongsToSiren}).
   *
   * `.catch(null).default(null)` : une API antérieure au 31/08 ne renvoie pas
   * le champ, et une liste entière ne doit pas tomber pour un champ neuf.
   */
  siret: z.string().nullable().catch(null).default(null),
  /** Qui a confirmé l'identité légale. `null` = personne. Va toujours avec
   *  `identity_checked_on` — la base le tient aussi. */
  identity_source: accountEntityIdentitySourceSchema.nullable().catch(null).default(null),
  /** Quand elle a été confirmée (`YYYY-MM-DD`). Va toujours avec la source. */
  identity_checked_on: z.string().nullable().catch(null).default(null),
  domain: z.string().nullable(),
  /** L'entité d'accueil du compte. Au plus une par compte (index partiel unique). */
  is_default: z.boolean(),
  rank1_incumbent: rank1IncumbentSchema,
  rank1_note: z.string().nullable(),
  /**
   * LE DOSSIER DE FACTURATION (26/08/2026) — cette entité est-elle celle qui
   * REÇOIT la facture, et que sait-on d'elle ?
   *
   * ⚠️ Ne pas confondre avec `legal_entities`, qui porte les sociétés DE L'ESN,
   * celles qui ÉMETTENT. Ici, c'est le client qui paie.
   *
   * Au plus une entité payeuse par compte. Aucun défaut « vrai » : tant que
   * personne n'a désigné le payeur, il n'y en a pas — en deviner un ferait
   * afficher un SIREN qui n'est pas le sien.
   */
  is_billing: z.boolean(),
  /** La raison sociale du payeur. `null` = jamais saisie, et l'écran le dit —
   *  aucun repli sur `name`, qui est un libellé d'usage. */
  legal_name: z.string().nullable(),
  /** Délai de règlement en JOURS. `null` = inconnu (un bloqueur nommé) ; `0` =
   *  comptant, une valeur saisie et légitime. */
  payment_terms_days: z.number().int().nullable(),
  /** Échéance du contrat-cadre (`YYYY-MM-DD`). `null` = aucune échéance connue,
   *  jamais « expiré ». */
  contract_expires_on: z.string().nullable(),
  /** À qui la facture part, chez le client. */
  billing_contact_id: z.string().guid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AccountEntity = z.infer<typeof accountEntitySchema>

/**
 * Ce que vaut un effectif de site (§8.1).
 *
 * `high` — quelqu'un l'a saisi ou une source officielle le porte ;
 * `medium` — importé d'un registre ou d'un connecteur ;
 * `low` — dérivé (une tranche, une estimation).
 *
 * Il n'y a PAS de valeur « inconnu » : l'absence de confiance EST l'inconnu, et
 * lui donner un nom la ferait cocher par défaut.
 */
export const HEADCOUNT_CONFIDENCES = ['high', 'medium', 'low'] as const
export const headcountConfidenceSchema = z.enum(HEADCOUNT_CONFIDENCES)
export type HeadcountConfidence = (typeof HEADCOUNT_CONFIDENCES)[number]

export const siteSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  entity_id: z.string().guid().nullable(),
  label: z.string(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
  siret: z.string().nullable(),
  /** Effectif du site. `null` = jamais renseigné — jamais 0, qui se lirait
   *  « site vide » et ferait renoncer à y staffer. */
  headcount: z.number().int().min(0).nullable(),
  /**
   * Ce que le site FAIT (addendum Stelya §8). Vocabulaire PARTAGÉ avec ce que
   * l'IA produit dans `sitesFrance[].type` : en créer un second garantirait
   * qu'un ciblage « usine » ne rapproche jamais un site typé « usine ».
   * `null` = non dit. Un site administratif n'est pas promu usine parce qu'un
   * SIRET existe.
   */
  site_type: siteTypeSchema.nullable().catch(null).default(null),
  /** Les activités réellement observées SUR le site — distinctes du secteur du
   *  compte, qui est une donnée firmographique du groupe. */
  activity_sector_codes: z.array(z.string()).catch([]).default([]),
  /** Les fonctions industrielles présentes (BE, méthodes, qualité…). */
  industrial_function_codes: z.array(z.string()).catch([]).default([]),
  /**
   * Ce que vaut l'effectif ci-dessus.
   *
   * `null` avec un effectif renseigné n'est PAS une erreur : c'est un chiffre
   * dont personne n'a dit d'où il vient. Sans ce champ, un effectif approché se
   * lisait comme un effectif connu — et c'est sur lui qu'on décide d'aller ou
   * non sur un site.
   */
  headcount_confidence: headcountConfidenceSchema.nullable().catch(null).default(null),
  /** D'où vient l'effectif, en clair. Une confiance sans source est une opinion. */
  headcount_source: z.string().nullable().catch(null).default(null),
  /** Quand l'effectif était vrai — pas quand la ligne a été écrite. */
  headcount_observed_at: z.string().nullable().catch(null).default(null),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Site = z.infer<typeof siteSchema>

export const createAccountEntitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: accountEntityKindSchema.optional(),
  siren: z.string().trim().max(20).nullish(),
  domain: z.string().trim().max(160).nullish(),
  rank1_incumbent: rank1IncumbentSchema.optional(),
  rank1_note: z.string().trim().max(500).nullish(),
  /**
   * Le dossier de facturation. Tout est FACULTATIF à l'écriture : une entité se
   * déclare d'abord, se qualifie ensuite — exiger le délai de règlement pour
   * créer une division ferait renoncer à créer la division.
   *
   * ⚠️ `payment_terms_days` admet `0` (comptant) et refuse le négatif ; la
   * contrainte SQL le tient aussi, pas seulement ici.
   */
  is_billing: z.boolean().optional(),
  legal_name: z.string().trim().max(200).nullish(),
  payment_terms_days: z.number().int().min(0).max(365).nullish(),
  contract_expires_on: z.string().date().nullish(),
  billing_contact_id: z.string().guid().nullish(),
  /**
   * L'ÉTABLISSEMENT — saisi, jamais deviné (31/08/2026).
   *
   * `max(20)` et non `length(14)` : la saisie arrive avec ses espaces
   * (« 420 624 777 00034 »). C'est {@link normaliseSiret} qui décide s'il en
   * reste quatorze chiffres, et le service refuse la valeur sinon — il ne la
   * tronque ni ne la complète.
   */
  siret: z.string().trim().max(20).nullish(),
  /** Qui a confirmé l'identité. Exigé dès qu'une date est donnée, et
   *  réciproquement — voir {@link accountEntityIdentityProblem}. */
  identity_source: accountEntityIdentitySourceSchema.nullish(),
  identity_checked_on: z.string().date().nullish(),
})
export type CreateAccountEntity = z.infer<typeof createAccountEntitySchema>

export const updateAccountEntitySchema = createAccountEntitySchema.partial()
export type UpdateAccountEntity = z.infer<typeof updateAccountEntitySchema>

/**
 * Ce qu'on peut écrire sur un site.
 *
 * Les six champs de contexte industriel (type, activités, fonctions, et les
 * trois qui QUALIFIENT l'effectif) ont été ajoutés en base le 24/08 et lus par
 * `siteFit` dès le lendemain — sans qu'aucun chemin puisse les écrire.
 * `siteFit` répondait donc invariablement « inconnu », ce qui est la bonne
 * réponse pour une donnée absente et la mauvaise pour une donnée impossible à
 * saisir.
 *
 * Un refus est conservé : **la confiance n'a pas de défaut**. Écrire `high`
 * parce que quelqu'un a tapé un nombre ferait passer une saisie approximative
 * pour un chiffre officiel, et c'est sur ce chiffre qu'on décide d'envoyer ou
 * non un consultant sur le site.
 */
export const createSiteSchema = z.object({
  label: z.string().trim().min(1).max(160),
  entity_id: z.string().guid().nullish(),
  city: z.string().trim().max(120).nullish(),
  postal_code: z.string().trim().max(20).nullish(),
  country: z.string().trim().max(80).nullish(),
  siret: z.string().trim().max(20).nullish(),
  headcount: z.number().int().min(0).nullish(),
  site_type: siteTypeSchema.nullish(),
  activity_sector_codes: z.array(applicationSectorCodeSchema).max(APPLICATION_SECTOR_CODES.length).optional(),
  industrial_function_codes: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  headcount_confidence: headcountConfidenceSchema.nullish(),
  /** D'où vient l'effectif. Exigé dès qu'une confiance est déclarée — voir
   *  {@link siteHeadcountProvenanceProblem}. */
  headcount_source: z.string().trim().max(160).nullish(),
  /** Quand l'effectif était VRAI. Jamais renseigné par défaut à aujourd'hui :
   *  un effectif importé d'un registre date de ce registre, pas de l'import. */
  headcount_observed_at: z.string().datetime({ offset: true }).nullish(),
})
export type CreateSite = z.infer<typeof createSiteSchema>

/**
 * Le seul couple qu'on refuse : une confiance sans source.
 *
 * « Cet effectif est fiable » sans dire d'où il vient est une opinion présentée
 * comme une mesure — exactement ce que les trois colonnes ont été ajoutées pour
 * empêcher. L'inverse est autorisé : une source sans confiance déclarée reste
 * une information utile, et exiger les deux ferait renoncer à saisir la source.
 *
 * Rend `null` quand il n'y a rien à redire, sinon le message à afficher.
 */
export function siteHeadcountProvenanceProblem(input: {
  headcount_confidence?: HeadcountConfidence | null
  headcount_source?: string | null
}): string | null {
  const confidence = input.headcount_confidence ?? null
  const source = (input.headcount_source ?? '').trim()
  if (confidence && !source) return "Une confiance d'effectif exige sa source : sans elle, c'est une opinion."
  return null
}

/**
 * Le SIRET tel qu'on le STOCKE, ou `null` si ce n'en est pas un.
 *
 * Un SIRET est exactement quatorze chiffres. Les séparateurs de saisie
 * (espaces, points, tirets) sont retirés parce qu'ils sont une décoration
 * d'affichage : les garder ferait de « 420 624 777 00034 » et
 * « 42062477700034 » deux valeurs différentes pour le même établissement.
 *
 * ⚠️ **Tout le reste est REFUSÉ, jamais réparé.** Treize chiffres ne sont pas
 * complétés par un zéro, quinze ne sont pas tronqués, et neuf chiffres — un
 * SIREN — ne deviennent pas un SIRET. Chacun de ces « rattrapages » désignerait
 * un établissement qu'on n'a pas vérifié, et un identifiant fabriqué part sur
 * un document sans que personne ne le relise.
 */
export function normaliseSiret(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[\s.-]+/g, '')
  return /^[0-9]{14}$/.test(digits) ? digits : null
}

/** Le SIREN tel qu'on le COMPARE : neuf chiffres, ou `null`. Le stockage reste
 *  libre (une entité étrangère n'a pas de SIREN), c'est la comparaison qui a
 *  besoin d'une forme. */
function sirenDigits(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[\s.-]+/g, '')
  return /^[0-9]{9}$/.test(digits) ? digits : null
}

/**
 * Ce SIRET appartient-il bien à ce SIREN ?
 *
 * Les neuf premiers chiffres d'un SIRET SONT le SIREN de sa personne morale.
 * C'est la seule vérification que l'arithmétique autorise, et elle va dans un
 * seul sens : elle permet de REFUSER un SIRET incohérent, jamais d'en produire
 * un — le NIC (les cinq derniers) n'est déductible de rien.
 *
 * Rend `true` quand rien ne s'oppose au rapprochement : un SIREN absent ou
 * illisible ne DÉMENT pas le SIRET (une entité étrangère n'a pas de SIREN), et
 * refuser dans ce cas empêcherait de saisir un établissement parfaitement
 * valide.
 */
export function siretBelongsToSiren(siret: string | null | undefined, siren: string | null | undefined): boolean {
  const normalised = normaliseSiret(siret)
  if (!normalised) return true
  const owner = sirenDigits(siren)
  if (!owner) return true
  return normalised.startsWith(owner)
}

/**
 * Ce que l'écriture d'une identité légale REFUSE, ou `null` si tout va bien.
 *
 * Trois refus, et chacun protège la pastille « vérifié » d'un mensonge :
 *
 *  1. un SIRET qui n'est pas quatorze chiffres — voir {@link normaliseSiret} ;
 *  2. un SIRET qui ne commence pas par le SIREN connu — il désigne un
 *     établissement d'une AUTRE société ;
 *  3. une source sans date, ou une date sans source — la pastille afficherait
 *     « vérifié » sans pouvoir dire quand, ou une fraîcheur sans garantie.
 *
 * Miroir exact des contraintes `account_entities_siret_check` et
 * `account_entities_identity_pair_check` : le code refuse avec une phrase, la
 * base refuse quoi qu'il arrive. Le troisième cas est celui que la base ne
 * saurait pas nommer, d'où le message.
 */
export function accountEntityIdentityProblem(input: {
  siret?: string | null
  siren?: string | null
  identity_source?: AccountEntityIdentitySource | null
  identity_checked_on?: string | null
}): string | null {
  const rawSiret = (input.siret ?? '').trim()
  if (rawSiret.length > 0 && normaliseSiret(rawSiret) === null) {
    return 'Un SIRET compte exactement quatorze chiffres. On ne le complète pas : les cinq derniers désignent un établissement précis.'
  }
  if (!siretBelongsToSiren(rawSiret, input.siren)) {
    return 'Ce SIRET ne commence pas par le SIREN de cette entité : il désigne un établissement d’une autre société.'
  }
  const source = input.identity_source ?? null
  const checkedOn = (input.identity_checked_on ?? '').trim()
  if (source && !checkedOn)
    return 'Une identité vérifiée porte sa date : sans elle, on ne sait pas quand elle était vraie.'
  if (!source && checkedOn) return 'Une date de vérification exige sa source : sans elle, rien n’est garanti.'
  return null
}

/** Le libellé tel qu'on l'affiche : sans espaces parasites, ou `null` s'il n'y
 *  a rien à afficher. Un libellé vide n'est pas une entité. */
export function normaliseEntityLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** La clé de comparaison de deux libellés : casse et espaces multiples ignorés.
 *  « TF1  Pub » et « tf1 pub » nomment la même division ; les traiter comme
 *  deux entités rendrait le rattachement d'un contact indéterministe. */
export function entityLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * L'entité qui porte ce libellé, ou `null`.
 *
 * Ne retombe JAMAIS sur l'entité par défaut : cette fonction répond à
 * « connaît-on cette division ? », et répondre « oui, la par-défaut » à une
 * division inconnue serait un faux positif. Le repli est la décision de
 * {@link resolveEntityIdForContact}, qui l'assume explicitement.
 */
export function matchEntityByLabel(
  entities: readonly Pick<AccountEntity, 'id' | 'name' | 'is_default'>[],
  label: string | null | undefined,
): Pick<AccountEntity, 'id' | 'name' | 'is_default'> | null {
  const normalised = normaliseEntityLabel(label)
  if (!normalised) return null
  const key = entityLabelKey(normalised)
  return entities.find(entity => entityLabelKey(entity.name) === key) ?? null
}

/**
 * À quelle entité rattacher un contact, à partir du libellé libre que le
 * pipeline a écrit dans `contacts.entity`.
 *
 * Un libellé inconnu ne CRÉE pas d'entité : un modèle qui écrit « Direction
 * Innovation » là où l'entreprise dit « Direction de l'Innovation » remplirait
 * le compte de divisions jumelles que personne n'a validées. Le contact rejoint
 * donc le périmètre non déterminé, où il reste visible et rattachable à la main.
 *
 * Rend `null` quand le compte n'a pas encore d'entité par défaut — c'est à
 * l'appelant de la créer, pas à cette fonction de deviner un rattachement.
 */
export function resolveEntityIdForContact(
  entities: readonly Pick<AccountEntity, 'id' | 'name' | 'is_default'>[],
  label: string | null | undefined,
): string | null {
  const matched = matchEntityByLabel(entities, label)
  if (matched) return matched.id
  return entities.find(entity => entity.is_default)?.id ?? null
}
