/**
 * Idempotence de l'enrichissement contact — LA règle partagée API ↔ web.
 *
 * Problème constaté en prod : Apollo remplit l'email mais ni le téléphone ni le
 * LinkedIn. Les canaux manquants le restent, donc l'action « Compléter les infos
 * manquantes » est reproposée indéfiniment et CHAQUE clic relance le provider —
 * qui re-renvoie l'email déjà connu, ce qui suffisait à déclencher le débit d'un
 * crédit. L'utilisateur payait pour zéro information nouvelle.
 *
 * ── Règle retenue ────────────────────────────────────────────────────────────
 * Une nouvelle tentative est mise en attente (aucun appel provider, aucun débit)
 * quand les TROIS conditions sont réunies :
 *   1. la dernière tentative n'a rien apporté de neuf (`no_new_data`) ;
 *   2. elle date de moins de {@link ENRICHMENT_RETRY_COOLDOWN_DAYS} jours ;
 *   3. les canaux encore manquants sont EXACTEMENT les mêmes qu'à ce moment-là.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 * • (1) borne le blocage aux seuls clics dont on sait déjà qu'ils ne rapportent
 *   rien : une tentative productive ne bloque jamais la suivante.
 * • (2) fait de la garde un DÉLAI, pas une interdiction. Les bases B2B se
 *   rafraîchissent par cycles de plusieurs semaines ; 30 jours est le premier
 *   moment où un nouveau passage a une chance réelle de ramener autre chose. Un
 *   contact dont la fiche provider s'améliore plus tard n'est donc jamais
 *   condamné — la porte se rouvre toute seule.
 * • (3) rend la garde juste plutôt que bêtement chronométrée : dès que quelque
 *   chose bouge sur le contact (le commercial saisit l'email à la main, une
 *   nouvelle analyse ajoute l'URL LinkedIn), le provider dispose d'une nouvelle
 *   clé de matching — la question posée n'est plus la même, le blocage saute
 *   immédiatement.
 *
 * Une sortie de secours explicite existe malgré tout (`force`) : le commercial
 * qui sait quelque chose que nous ignorons peut relancer, l'UI annonçant le
 * coût. La garde protège d'un débit subi, elle n'interdit pas un débit voulu.
 */

import { z } from 'zod'
import type { BackgroundJobAccepted, BackgroundJobState, BackgroundJobStatus } from './background-job.js'
import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'

/** Délai avant qu'une tentative restée vide vaille de nouveau un crédit. */
export const ENRICHMENT_RETRY_COOLDOWN_DAYS = 30

const DAY_MS = 86_400_000

/** Canaux de joignabilité qu'un enrichissement peut remplir. */
export type EnrichmentChannel = 'email' | 'linkedin' | 'phone'

/**
 * Valeur persistée dans `contacts.last_enrichment_result`. Contrainte SQL
 * élargie par la migration `1795712351210` (GA-11/GA-12 : la contrainte
 * avant le code qui écrit).
 *
 * - `matched` / `no_new_data` — les deux résultats d'origine.
 * - `ambiguous` (#2120.61) — le nom qu'on s'apprêtait à retenir correspond à
 *   UNE AUTRE fiche active du même compte : on ne sait pas laquelle des deux
 *   personnes réelles le fournisseur a trouvée. Rien n'est écrit ni débité —
 *   « on PROPOSE une fusion de doublons, on ne fusionne JAMAIS ».
 * - `newer_data_exists` (#2120.64) — l'arbitre de provenance a refusé au
 *   moins un champ facturable : une correction humaine ou un connecteur
 *   protège une valeur que le pipeline ne peut pas écraser, quelle que soit
 *   sa date. Ce n'est pas un « rien trouvé » ordinaire, le résultat le dit.
 */
export const CONTACT_ENRICHMENT_RESULTS = ['matched', 'no_new_data', 'ambiguous', 'newer_data_exists'] as const
export type EnrichmentAttemptResult = (typeof CONTACT_ENRICHMENT_RESULTS)[number]

/** Sous-ensemble du contact dont dépend la règle (snake_case = colonnes DB). */
export type EnrichmentTraceInput = {
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  last_enrichment_at?: string | Date | null
  last_enrichment_result?: string | null
  last_enrichment_missing?: readonly string[] | null
}

export type EnrichmentCooldown = {
  /** ISO — la tentative revenue vide. */
  lastAttemptAt: string
  /** ISO — à partir de quand un nouvel essai vaut de nouveau un crédit. */
  retryAvailableAt: string
}

/**
 * ── Enrichissement asynchrone ────────────────────────────────────────────────
 *
 * La cascade fournisseur (Apollo People-Match → People-Search → élargissement
 * d'org → SalesQL → Dropcontact) est séquentielle et peut faire la queue derrière
 * un throttle partagé : elle tient couramment 30-50 s, jusqu'à ~85 s dans le pire
 * cas. La tenir dans la requête HTTP du bouton exposait ce temps à tout ce qui
 * peut couper entre le navigateur et le worker (proxy, redéploiement, veille de
 * l'onglet), et le résultat PAYÉ était alors perdu pour l'utilisateur.
 *
 * Le POST accepte donc et rend la main ; le travail vit dans un job dont l'état
 * est lisible par n'importe quel replica. Ce qui NE change pas : les refus
 * immédiats (contact inconnu, cooldown, crédits épuisés) restent synchrones — ce
 * sont des faits connus avant d'appeler le moindre fournisseur.
 */
/**
 * Alias historiques de la forme générique {@link BackgroundJobState} & co.
 *
 * Ces noms vivent dans les appelants depuis l'origine ; les renommer n'aurait
 * rien appris à personne. Ce qui compte est qu'il n'existe plus qu'UNE
 * définition — la re-planification (#1092) a repris la même, et deux jumelles
 * auraient divergé au premier état ajouté.
 */
export type EnrichJobState = BackgroundJobState

/**
 * `failed` n'apparaît JAMAIS dans un corps 200 : l'endpoint de suivi rejoue
 * l'échec sous forme de statut HTTP (402 crédits, 409 cooldown, 502 fournisseur
 * indisponible…), exactement comme l'appel synchrone d'avant. Le client garde
 * donc un seul chemin d'erreur — et ses messages localisés par `code` — sans
 * savoir qu'un job est passé par là.
 */

/** Réponse du POST : le job est en file (ou déjà en cours si un clic précédent
 *  l'a lancé — même contact ⇒ même job, jamais deux enrichissements payés). */
export type EnrichJobAccepted = BackgroundJobAccepted

/**
 * État d'un job d'enrichissement. `TResult` = la charge utile du succès (côté
 * web : le contact enrichi + le solde de crédits), laissée générique pour que ce
 * module reste sans dépendance sur le schéma contact.
 *
 * `unknown` = plus aucune trace du job (résultat expiré, ou Redis vidé). Ce n'est
 * pas un échec de l'enrichissement : c'est nous qui avons perdu la réponse, et
 * l'UI doit le dire comme tel plutôt que d'annoncer « rien trouvé ».
 */
export type EnrichJobStatus<TResult> = BackgroundJobStatus<TResult>

/** Canaux encore vides sur ce contact. */
export function missingEnrichmentChannels(contact: EnrichmentTraceInput): EnrichmentChannel[] {
  return [
    contact.email ? null : 'email',
    contact.linkedin_url ? null : 'linkedin',
    contact.phone ? null : 'phone',
  ].filter((channel): channel is EnrichmentChannel => channel !== null)
}

function sameChannelSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = new Set(a)
  return b.every(channel => left.has(channel))
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * `null` = relancer l'enrichissement a du sens (l'UI propose, le serveur exécute).
 * Sinon = on sait que le clic ne rapporterait rien : l'UI grise en annonçant la
 * date, le serveur refuse sans appeler le provider ni débiter.
 */
export function enrichmentCooldown(contact: EnrichmentTraceInput, now: Date = new Date()): EnrichmentCooldown | null {
  if (contact.last_enrichment_result !== 'no_new_data') return null
  const attemptedAt = toDate(contact.last_enrichment_at)
  if (!attemptedAt) return null

  const retryAt = new Date(attemptedAt.getTime() + ENRICHMENT_RETRY_COOLDOWN_DAYS * DAY_MS)
  if (now.getTime() >= retryAt.getTime()) return null

  // Lignes antérieures à la migration : pas de liste de canaux enregistrée → on
  // ne peut pas comparer, on retombe sur le simple délai.
  const recordedGaps = contact.last_enrichment_missing
  if (recordedGaps && !sameChannelSet(missingEnrichmentChannels(contact), recordedGaps)) return null

  return { lastAttemptAt: attemptedAt.toISOString(), retryAvailableAt: retryAt.toISOString() }
}

/**
 * #2297.37 — les cinq statuts qu'un CHAMP enrichi (email, téléphone) peut
 * porter à l'écran. Jusqu'ici seul `not_found` manquait de nom : une valeur
 * vide + une tentative passée le traduisait, en dur et deux fois (email et
 * téléphone) dans `ContactKeyInfo.tsx`. Un seul endroit, réutilisable (GA-26).
 *
 * - `value` — la coordonnée est là, le reste ne se pose plus.
 * - `invalid` — #2297.39 (24/09/2026) : une valeur EST là, mais elle ne
 *   ressemble pas à une coordonnée exploitable (ex. un numéro qui a perdu sa
 *   forme). Gagne sur `value` — présenter une valeur suspecte comme fiable
 *   serait la faute inverse de « non mesuré rendu 0 » (GA-18/19). Fondé sur
 *   la FORME de la valeur (`looksLikePhoneNumber` ci-dessous), jamais sur le
 *   vocabulaire d'un fournisseur : le statut qu'Apollo calcule pour un numéro
 *   n'est documenté nulle part dans ce dépôt, et « un contrat d'API non
 *   vérifiable ne se devine pas ».
 * - `archived` — la rétention l'a archivée (#2297.51) : ni « jamais
 *   cherchée » ni « non trouvée », un geste daté à la place.
 * - `error` (#3822.2) — le DERNIER appel sur CE canal a ÉCHOUÉ (panne
 *   fournisseur, timeout) : distinct de `not_found`, où l'appel a répondu et
 *   n'a simplement rien rapporté. Confondre les deux dirait « recherché sans
 *   résultat » d'un canal jamais vraiment interrogé — persisté par contact
 *   ET par coordonnée (`contacts.enrichment_coordinates[canal].state ===
 *   'unknown'`, l'état d'E1 — une seule source d'état), visible
 *   après fermeture du toast et après reload.
 * - `pending` (#3782) — l'E1 a lancé une révélation qui livre PLUS TARD, par
 *   webhook (`contacts.enrichment_coordinates[canal].state === 'pending'`,
 *   `foldEnrichmentCoordinateStates`) : la tentative synchrone qui vient de
 *   matcher ailleurs (l'e-mail, par ex.) a déjà posé `enrichmentAttempted`,
 *   et sans ce statut le calcul retombait sur `not_found` — la fiche disait
 *   « introuvable » à une coordonnée que le fournisseur est en train de
 *   livrer. Gagne sur `not_found` et sur la promesse Apollo périmée, perd
 *   face à une panne CONSTATÉE (`error`) — une réponse négative fait plus
 *   autorité qu'une attente.
 * - `not_found` — un enrichissement a été TENTÉ et n'a rien rapporté
 *   (#2598.2) : le silence d'avant devient un fait dit.
 * - `available` — la recherche gratuite (Apollo, avant tout enrichissement
 *   payé) promet la coordonnée ; périmée dès qu'une tentative a eu lieu,
 *   qu'elle ait ou non rapporté cette coordonnée précise.
 * - `not_attempted` — rien à dire : jamais cherché, aucune promesse.
 */
export const CONTACT_FIELD_STATUSES = [
  'value',
  'invalid',
  'error',
  'pending',
  'archived',
  'not_found',
  'available',
  'not_attempted',
] as const
export type ContactFieldStatus = (typeof CONTACT_FIELD_STATUSES)[number]

export type ContactFieldStatusInput = {
  value: string | null | undefined
  enrichmentAttempted: boolean
  /** Apollo (recherche gratuite) annonce la coordonnée derrière un enrichissement payé. */
  apolloAvailable?: boolean | null
  /** Non-null quand la rétention a archivé cette coordonnée (#2297.51). */
  archivedAt?: string | Date | null
  /** #2297.39 — `value` ne ressemble pas à une coordonnée exploitable
   *  (calculé par l'appelant, ex. `looksLikePhoneNumber`). `undefined`/absent
   *  = pas de vérification de forme pour ce champ (email : la forme est déjà
   *  garantie par le fournisseur/le formulaire, jamais revérifiée ici). */
  invalid?: boolean
  /** #3822.2 — le DERNIER appel sur CE canal a échoué (panne, pas « rien trouvé »). */
  errored?: boolean
  /** #3782 — une révélation est en vol, livrée plus tard par webhook
   *  (`enrichment_coordinates[canal].state === 'pending'`). */
  pending?: boolean
}

export function computeContactFieldStatus(input: ContactFieldStatusInput): ContactFieldStatus {
  if (input.value && input.invalid) return 'invalid'
  if (input.value) return 'value'
  if (input.errored) return 'error'
  if (input.pending) return 'pending'
  if (input.archivedAt) return 'archived'
  if (input.enrichmentAttempted) return 'not_found'
  if (input.apolloAvailable) return 'available'
  return 'not_attempted'
}

/**
 * #2297.39 — un numéro exploitable : au moins huit chiffres, au plus quinze,
 * aucune lettre. MÊME heuristique que celle qui filtre déjà les réponses des
 * fournisseurs de secours sans contrat documenté (`tolerant-extract.ts`,
 * décision Louis du 03/08) — déplacée ici pour que la fiche contact (web)
 * puisse s'en servir SANS la recopier (GA-26 : un réglage vit à un seul
 * endroit). `tolerant-extract.ts` importe désormais celle-ci.
 */
export function looksLikePhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return false
  // Une chaîne qui contient des lettres n'est pas un numéro : « ext 4512 » et
  // « ID-20250814 » passeraient le seul test des chiffres.
  return /^[+\d][\d\s().-]*$/.test(value.trim())
}

/**
 * #3850.1 (lot V04, 08/10) — LA GARDE D'ÉCRITURE, distincte de
 * `looksLikePhoneNumber` ci-dessus.
 *
 * Mesuré en prod le 08/10 : un code postal brésilien « 90480-000 » a été
 * ENREGISTRÉ comme téléphone sur une fiche réelle. `looksLikePhoneNumber`
 * (8 à 15 chiffres, aucune lettre) existe pour l'AFFICHAGE d'une valeur déjà
 * en base — large à dessein, pour ne jamais cacher une valeur suspecte mais
 * réelle (§ `invalid` ci-dessus). Au POINT D'ÉCRITURE, rien n'oblige à cette
 * même largesse : une candidate qui n'a ni indicatif explicite (`+`/`00`) ni
 * la forme locale française usuelle n'est PAS acceptée, quel que soit son
 * nombre de chiffres — un code postal, une date ou un identifiant (SIREN…)
 * tombent tous dans la même fenêtre de 8 à 15 chiffres sans porter aucune
 * des deux formes retenues.
 *
 * Le repli « 0 + 9 chiffres » (France) n'est pas une préférence produit mais
 * un constat : les fournisseurs de ce dépôt (Kaspr, Lusha, FullEnrich…)
 * rendent très majoritairement des numéros FR non préfixés. Un numéro
 * étranger non préfixé est un contrat qu'on ne peut pas deviner (doctrine :
 * un contrat d'API non vérifiable ne se devine pas) — il est donc rejeté ICI,
 * jamais inventé avec un indicatif supposé.
 */
export function isPlausiblePhoneNumber(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || !looksLikePhoneNumber(trimmed)) return false
  const compact = trimmed.replace(/[\s().-]/g, '')
  if (compact.startsWith('+')) return /^\+\d{8,15}$/.test(compact)
  if (compact.startsWith('00')) return /^00\d{8,15}$/.test(compact)
  // Sans indicatif : seul le format local français usuel (0 + neuf chiffres,
  // le second chiffre jamais 0) est retenu — tout le reste (code postal,
  // date, identifiant) n'a pas la forme d'un numéro qu'on puisse affirmer.
  return /^0[1-9]\d{8}$/.test(compact)
}

/**
 * #3850.4 (lot V04, 08/10) — LE STOCKAGE, compact, sans espace.
 *
 * À appeler UNIQUEMENT sur une valeur déjà jugée plausible
 * ({@link isPlausiblePhoneNumber}) : cette fonction ne revalide rien, elle
 * normalise une des trois formes que la garde d'écriture a déjà acceptées
 * (`+`, `00`, ou le format local français) vers l'E.164 compact. Un appel sur
 * une valeur qui n'a pas cette forme est un bug de l'appelant, jamais un
 * numéro deviné.
 */
export function toE164(plausiblePhone: string): string {
  const compact = plausiblePhone.trim().replace(/[\s().-]/g, '')
  if (compact.startsWith('+')) return compact
  if (compact.startsWith('00')) return `+${compact.slice(2)}`
  // Format local français (0 + neuf chiffres) : le 0 initial tombe, +33 le remplace.
  return `+33${compact.slice(1)}`
}

/**
 * #3850.4 — L'AFFICHAGE, international et lisible (« +33 6 81 05 00 91 »).
 *
 * Tolérante en ENTRÉE (une valeur déjà stockée peut encore porter des
 * espaces — données antérieures à ce lot, ou un fournisseur qui les a
 * laissés) : elle normalise d'abord vers l'E.164 compact, puis regroupe les
 * chiffres pour la lecture. Une forme non reconnue (ni `+`/`00`, ni le format
 * local français) se rend TELLE QUELLE — on ne devine jamais un découpage
 * qu'on ne peut pas affirmer.
 *
 * La France (+33) a un découpage EXACT (indicatif, puis le premier chiffre
 * seul — le 0 national qu'il remplace —, puis des paires). #3850 : les autres
 * indicatifs du registre ci-dessous se lisent « indicatif + groupes » (la
 * longueur seule ne dit pas où s'arrête l'indicatif ; le registre, sans
 * préfixe, le dit). Un indicatif hors registre reste en E.164 COMPACT : un
 * format national faux serait pire qu'un compact vrai.
 */
export function formatPhoneForDisplay(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || !isPlausiblePhoneNumber(trimmed)) return trimmed
  const e164 = toE164(trimmed)
  const digits = e164.slice(1)
  if (digits.startsWith('33') && digits.length === 11) {
    const national = digits.slice(2)
    const pairs = national.slice(1).match(/.{2}/g) ?? []
    return `+33 ${national[0]} ${pairs.join(' ')}`
  }
  // #3850 (recette MO 10/10) — un +44 s'affichait compact, sans formatage, à côté des +33 lisibles.
  const callingCode = callingCodeOf(digits)
  if (callingCode === null) return e164
  const national = digits.slice(callingCode.length)
  if (national.length < 4) return e164
  return `+${callingCode} ${groupNationalDigits(callingCode, national)}`
}

/**
 * #3850 — indicatifs pays (UIT). Le plan est SANS PRÉFIXE (aucun indicatif n'en commence un autre), donc
 * un numéro commençant par l'un d'eux s'y découpe sans ambiguïté — contrairement à la seule longueur
 * (le piège +1 / +33 documenté ci-dessus). Hors de cette liste : on garde le compact vrai, jamais deviné.
 */
const CALLING_CODES: ReadonlySet<string> = new Set([
  '1',
  '7',
  '20',
  '27',
  '30',
  '31',
  '32',
  '33',
  '34',
  '36',
  '39',
  '40',
  '41',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '81',
  '82',
  '84',
  '86',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '98',
  '212',
  '213',
  '216',
  '218',
  '221',
  '225',
  '233',
  '234',
  '237',
  '250',
  '251',
  '254',
  '255',
  '351',
  '352',
  '353',
  '354',
  '355',
  '356',
  '357',
  '358',
  '359',
  '370',
  '371',
  '372',
  '373',
  '374',
  '375',
  '376',
  '377',
  '378',
  '380',
  '381',
  '382',
  '383',
  '385',
  '386',
  '387',
  '389',
  '420',
  '421',
  '423',
  '852',
  '853',
  '855',
  '856',
  '880',
  '886',
  '961',
  '962',
  '963',
  '964',
  '965',
  '966',
  '971',
  '972',
  '973',
  '974',
  '975',
  '976',
  '977',
])

function callingCodeOf(digits: string): string | null {
  for (const length of [1, 2, 3]) {
    const prefix = digits.slice(0, length)
    if (CALLING_CODES.has(prefix)) return prefix
  }
  return null
}

/** NANP 3-3-4 ; Royaume-Uni (10 chiffres) 4-6 ; sinon groupes de 3, un reste isolé rejoint le dernier groupe. */
function groupNationalDigits(callingCode: string, national: string): string {
  if (callingCode === '1' && national.length === 10) {
    return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`
  }
  if (callingCode === '44' && national.length === 10) return `${national.slice(0, 4)} ${national.slice(4)}`
  const groups = national.match(/\d{1,3}/g) ?? [national]
  if (groups.length > 1 && (groups[groups.length - 1] as string).length === 1) {
    const last = groups.pop() as string
    groups[groups.length - 1] = `${groups[groups.length - 1] as string}${last}`
  }
  return groups.join(' ')
}

/**
 * VÉRIFICATION EN MASSE — #2296.38 à .41 (épopée #2964).
 *
 * L'épopée demandait un moteur de vérification d'emploi à part entière (états,
 * historique, résolution de conflit) pour cinquante contacts à la fois. Ce que
 * l'audit du 25-27/09/2026 a trouvé DÉJÀ LÀ, sous un autre nom : la mise en
 * file par contact (`ContactEnrichmentService.enqueue`, un job idempotent par
 * `contactId`) tolère déjà, contact par contact, l'échec de l'un sans jamais
 * bloquer les autres — exactement #2296.40 (« ne pas invalider le lot pour des
 * ambiguïtés »). Ce qui manquait réellement : la PORTE d'entrée qui accepte
 * une LISTE plutôt qu'un contact, et rend un statut PAR CONTACT plutôt qu'un
 * seul résultat agrégé (#2296.39).
 *
 * `BULK_VERIFY_MAX_CONTACTS` = #2296.38 (« cinquante personnes en parallèle ») :
 * la borne haute, pas une promesse de parallélisme réel — la file BullMQ
 * traite chaque job à son tour, comme toute autre mise en file de ce module.
 *
 * #2296.41 (« cas particulier d'un poste mondial ») : AUCUNE règle dédiée —
 * un contact au périmètre mondial suit exactement le même chemin que les
 * autres, un par un. Le cas particulier est qu'il n'y EN A PAS : rien dans ce
 * lot ne filtre, ne priorise ni ne dégrade un contact sur la base de son
 * périmètre. Testé dans `contact-enrichment.test.ts`.
 */
export const BULK_VERIFY_MAX_CONTACTS = 50

export const bulkVerifyContactsRequestSchema = z
  .object({
    contact_ids: z.array(z.string().guid()).min(1).max(BULK_VERIFY_MAX_CONTACTS),
  })
  .strict()
export type BulkVerifyContactsRequest = z.infer<typeof bulkVerifyContactsRequestSchema>

/**
 * #2964 — le coût AVANT le clic d'une vérification FORCÉE, distinct de
 * `bulkEnrichmentCost` (`contact-views.ts`) : celui-ci ne compte que les
 * contacts à qui il MANQUE un champ, alors qu'une vérification forcée
 * (`force: true`, `enqueueBulk`) interroge le fournisseur pour CHAQUE contact
 * sélectionné, qu'un champ manque ou non — c'est le point qui manquait au
 * dernier bilan (#2964, 27/09 matin) : donner à ce bouton son propre prédicat
 * plutôt que d'emprunter celui d'« Enrichir maintenant », qui aurait annoncé
 * un chiffre que ce chemin ne débite pas.
 *
 * MÊME barème que l'enrichissement (`CREDIT_WEIGHTS.contact_enrichment`, un
 * seul réglage, GA-26) — une vérification forcée appelle le même fournisseur
 * pour le même geste, jamais un second chiffre inventé pour l'occasion.
 * « Jusqu'à » : comme l'enrichissement, le crédit n'est débité que sur un
 * résultat (voir `ContactEnrichmentService.enqueueBulk`).
 *
 * `billable` est borné à {@link BULK_VERIFY_MAX_CONTACTS} : au-delà, l'appel
 * réel est refusé par le contrat de la requête — annoncer un coût sur ce
 * qui ne partira jamais mentirait sur ce qui va être débité.
 */
export function bulkVerificationCost(selectedCount: number): { billable: number; maxCredits: number } {
  const billable = Math.max(0, Math.min(selectedCount, BULK_VERIFY_MAX_CONTACTS))
  return { billable, maxCredits: billable * CREDIT_WEIGHTS.contact_enrichment }
}

/**
 * Le statut PAR CONTACT (#2296.39) — jamais un total qui masquerait lequel des
 * cinquante a échoué. `ok: false` porte le `code` machine (même vocabulaire que
 * `ContactFailure` ailleurs dans ce module) : un contact non trouvé, écarté ou
 * en cooldown ne fait pas échouer les quarante-neuf autres.
 */
export type BulkVerifyOutcome =
  | { contact_id: string; ok: true; job_id: string; state: EnrichJobState }
  | { contact_id: string; ok: false; code: string }
