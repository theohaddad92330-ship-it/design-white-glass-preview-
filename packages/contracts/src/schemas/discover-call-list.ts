import { z } from 'zod'
import { contactListItemSchema } from './contact.js'
import { signalKindSchema, type SignalKind } from './analysis/primitives.js'

/**
 * #2545 / #2546 / #3819 (démo Ludovic, recette prod 07/10/2026) — LA SOURCE
 * UNIQUE des personnes et des signaux CONNUS de l'espace pour les entreprises
 * d'une recherche Découvrir.
 *
 * Avant : la liste d'appels et l'onglet « Contacts » joignaient les candidats
 * aux CINQUANTE derniers contacts de l'espace (`GET /contacts?limit=50`), par
 * nom — mesuré en prod : 10 contacts tous chez Arquus (prénom seul, aucune
 * coordonnée) alors que le compte en avait 160 dont des vérifiés, et l'onglet
 * Contacts de la MÊME recherche disait 0. Ici, une requête par recherche : les
 * comptes de l'espace qui correspondent aux candidats (SIREN, id, ou nom), et
 * pour chacun ses dix contacts CLASSÉS (même noyau que le chemin recommandé du
 * compte) avec leurs coordonnées EN CLAIR, et ses signaux historisés datés.
 *
 * Lecture seule, aucun crédit. Jamais un contact inventé : une entreprise sans
 * compte, ou sans contact, rend une liste VIDE (l'écran propose alors le geste
 * « Trouver 10 personnes à appeler »).
 */

/** Formes juridiques neutralisées pour le rapprochement — « Société Générale »
 *  et « Société Générale SA » doivent joindre la même entreprise. */
const LEGAL_SUFFIXES = new Set(['sa', 'sas', 'sasu', 'sarl', 'eurl', 'sci', 'scop', 'scic', 'ei', 'eirl', 'groupe'])

/**
 * Clé de rapprochement ENTREPRISE par NOM (#2545.1) — UN seul endroit (GA-26) :
 * l'écran Découvrir et la route qui sert la liste d'appels joignent avec la
 * MÊME règle. Heuristique de rapprochement, jamais une identité légale : le
 * SIREN, quand il existe des deux côtés, passe avant.
 */
export function normalizeCompanyNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token !== '' && !LEGAL_SUFFIXES.has(token))
    .join(' ')
    .trim()
}

/** Plafond d'une requête : une page de Découvrir, jamais tout un parc. */
export const DISCOVER_CALL_LIST_MAX_COMPANIES = 50

/** Le nombre du client (#2545) : dix personnes par entreprise. */
export const DISCOVER_CALL_LIST_CONTACTS_PER_COMPANY = 10

/** Les signaux connus rendus par entreprise — les plus récents d'abord. */
export const DISCOVER_CALL_LIST_SIGNALS_PER_COMPANY = 10

/**
 * #3819 — nature historisée → famille de signal de Découvrir. Ce qui n'est ni
 * un appel d'offres, ni un recrutement, ni une technologie, ni une levée
 * (projet, contrat, nomination, presse…) est une ACTUALITÉ (`business`).
 * #4068 — déplacé du web vers le contrat : l'API en a besoin pour classer les
 * signaux connus (`classifyCardFact`) AVANT de les plafonner.
 */
export function discoverSignalTypeOfKind(
  kind: SignalKind | null,
): 'tender' | 'hiring' | 'tech' | 'funding' | 'ecosystem' | 'business' {
  switch (kind) {
    case 'appel_offres':
    case 'marche_public':
      return 'tender'
    case 'recrutement':
      return 'hiring'
    case 'technologie':
      return 'tech'
    case 'levee_fonds':
      return 'funding'
    // F2 — la nature voyage jusqu'au bout : une appartenance relue de l'historique reste un signal d'écosystème.
    case 'ecosystem':
      return 'ecosystem'
    default:
      return 'business'
  }
}

export const discoverCallListRequestSchema = z
  .object({
    companies: z
      .array(
        z
          .object({
            /** Clé de l'écran (le SIREN du candidat), rendue telle quelle. */
            key: z.string().trim().min(1).max(64),
            siren: z.string().trim().max(32).nullable().optional(),
            accountId: z.string().guid().nullable().optional(),
            name: z.string().trim().max(300).nullable().optional(),
          })
          .strict(),
      )
      .max(DISCOVER_CALL_LIST_MAX_COMPANIES),
  })
  .strict()
export type DiscoverCallListRequest = z.infer<typeof discoverCallListRequestSchema>

/**
 * Une personne à appeler — les MÊMES champs que la liste de contacts (pour que
 * l'onglet Contacts et la liste d'appels lisent la même ligne), plus la
 * vérification de l'adresse. Les coordonnées sont EN CLAIR : cette liste existe
 * pour être appelée.
 */
export const discoverCallListContactSchema = contactListItemSchema
  .pick({
    id: true,
    account_id: true,
    full_name: true,
    title: true,
    entity: true,
    decision_role: true,
    email: true,
    phone: true,
    why_contact: true,
    user_status: true,
    source: true,
    company_name: true,
    last_name_obfuscated: true,
    last_enrichment_at: true,
    location: true,
  })
  .extend({
    /** `true` = adresse vérifiée par une source ; `null` = jamais vérifiée. */
    email_verified: z.boolean().nullable(),
  })
export type DiscoverCallListContact = z.infer<typeof discoverCallListContactSchema>

/**
 * Un signal HISTORISÉ du compte (`signal_history`, actif). `date` est la date DU
 * signal quand elle est lisible (ISO `AAAA-MM-JJ` ou `AAAA-MM`), sinon la date
 * EXACTE de première détection (`dateIsDetection: true`) — jamais une date
 * devinée ; un signal sans l'une ni l'autre n'est pas rendu.
 */
export const discoverCallListSignalSchema = z.object({
  kind: signalKindSchema.nullable(),
  label: z.string(),
  date: z.string(),
  dateIsDetection: z.boolean(),
  /** La source PUBLIQUE nommée par l'analyse (publication, registre). */
  source: z.string().nullable(),
  /** #4045.1 — l'URL http(s) vérifiable du signal (offre, article), lue sur l'analyse ; absente = aucun lien, jamais deviné. */
  url: z.string().nullish(),
})
export type DiscoverCallListSignal = z.infer<typeof discoverCallListSignalSchema>

export const discoverCallListCompanySchema = z.object({
  key: z.string(),
  /** `null` = aucune entreprise de l'espace ne correspond à ce candidat. */
  accountId: z.string().nullable(),
  /** Contacts éligibles du compte ; `null` quand aucun compte ne correspond. */
  contactsTotal: z.number().int().nullable(),
  contacts: z.array(discoverCallListContactSchema),
  signals: z.array(discoverCallListSignalSchema),
})
export type DiscoverCallListCompany = z.infer<typeof discoverCallListCompanySchema>

export const discoverCallListResponseSchema = z.object({
  companies: z.array(discoverCallListCompanySchema),
})
export type DiscoverCallListResponse = z.infer<typeof discoverCallListResponseSchema>
