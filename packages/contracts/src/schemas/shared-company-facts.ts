import { isPersonalEmail } from './campaign-audience-builder.js'

/**
 * #3989 (suite de #3971 point d) — LES FAITS SOCIÉTÉ PARTAGÉS PAR LA BASE COMMUNE.
 *
 * ⚠️ ÉLARGISSEMENT DATÉ de `c92_base_anonyme_commune` — Louis, 11/10/2026,
 * verbatim : « le plus possible si ça peut aider, je vois pas pourquoi on
 * priverait les gens d'infos de Bellum ; si c'est Bellum qui les a sorties, on
 * se doit de les réutiliser, et si c'est nos utilisateurs, on garde tout mais
 * juste on anonymise ; on se doit de capitaliser sur la donnée qu'on génère et
 * qu'on reçoit. » Registre : `c94_base_commune_capitalise_tout`.
 *
 * Ce module porte la RÈGLE de la frontière, pure et testée à part — c'est elle
 * qui décide ce qu'un espace voit de ce qu'un autre a collecté :
 *
 * - **ce que Bellum a collecté** (registre, recherche publique, nos analyses,
 *   nos enrichisseurs) entre dans la base commune TEL QUEL : nom, poste,
 *   profil public ;
 * - **ce qu'un utilisateur a apporté** (saisie, import, CRM, réunion) entre
 *   ANONYMISÉ : le rôle (le poste) reste, la personne part — ni nom, ni profil,
 *   ni coordonnée, ni empreinte ; un poste qui porte une adresse ou un numéro
 *   ne sort pas du tout ;
 * - la salle de démonstration et une copie déjà venue de la base commune ne
 *   repartent JAMAIS vers elle (pas de boucle, pas de fictif dans le réel).
 *
 * La base le tient aussi par un CHECK (`shared_company_people_user_anonymized_check`)
 * que GA-43 relit : une ligne « user » qui porterait un nom est REFUSÉE par
 * PostgreSQL, quel que soit le code qui l'écrit.
 *
 * Provenance : un fait recopié dans un espace se nomme « base commune »
 * ({@link SHARED_BASE_PROVENANCE_LABEL}) — jamais le nom de l'espace qui l'a
 * collecté (aucune colonne de portée dans la table commune).
 */

/** Les deux origines d'un fait commun. */
export const SHARED_FACT_ORIGINS = ['bellum', 'user'] as const
export type SharedFactOrigin = (typeof SHARED_FACT_ORIGINS)[number]

/** La source (`contacts.source`) d'une fiche recopiée depuis la base commune. */
export const SHARED_BASE_CONTACT_SOURCE = 'shared_base'

/** Ce que l'écran et Laura disent de la provenance — jamais le nom d'un autre espace. */
export const SHARED_BASE_PROVENANCE_LABEL = 'base commune'

/** Les tables de faits communs — GA-43 les relit (voir `community-aggregation-kinds.spec.ts`). */
export const SHARED_FACT_TABLES = ['shared_company_people'] as const

/** Ce qu'une ligne d'origine « user » ne porte JAMAIS (le CHECK de la base le redit). */
export const SHARED_FACT_USER_FORBIDDEN_COLUMNS = ['full_name', 'linkedin_url', 'person_fingerprints'] as const

/**
 * #4286.15.b — Décision Louis 19/10/2026 (#4268) : les ANCIENS se partagent aussi, mais un ancien
 * n'est JAMAIS présenté comme actuel. Une ligne commune dit l'état de la personne chez la société
 * (`employment_state`, avec la date de départ quand on la connaît) ; « inconnu » ne se STOCKE pas, il se
 * LIT ({@link sharedEmploymentReading}) : un fait qu'aucun espace n'a revu depuis
 * {@link SHARED_FACT_STALE_AFTER_DAYS} jours redevient inconnu — archivé, jamais supprimé (seul
 * l'effacement RGPD c67 supprime).
 */
export const SHARED_EMPLOYMENT_STATES = ['current', 'former'] as const
export type SharedEmploymentState = (typeof SHARED_EMPLOYMENT_STATES)[number]

/**
 * #4286.15.b — un an sans qu'aucun espace ne revoie la personne chez la société : on ne SAIT plus si
 * elle y est. C'est la cadence d'une réanalyse annuelle d'un compte suivi ; plus court, un compte
 * peu travaillé perdrait ses faits entre deux passages, plus long, on recopierait un organigramme
 * dont on n'a plus aucune preuve.
 */
export const SHARED_FACT_STALE_AFTER_DAYS = 365

/** #4286.15.b — l'état d'une fiche d'espace : passée à l'historique (« a quitté l'entreprise ») = ancienne. */
export function sharedEmploymentOfLifecycle(lifecycleState: string | null | undefined): SharedEmploymentState {
  return lifecycleState === 'historique' ? 'former' : 'current'
}

/**
 * #4286.15.b — ce qu'on SAIT d'un fait commun aujourd'hui. Un ancien reste ancien (le perdre de vue ne
 * le fait pas revenir) ; un actuel non revu depuis le seuil, sans date, ou un état illisible = inconnu,
 * jamais « actuel ».
 */
export function sharedEmploymentReading(
  fact: { employmentState: string | null | undefined; lastSeenAt: string | Date | null | undefined },
  now: Date = new Date(),
): SharedEmploymentState | 'unknown' {
  if (fact.employmentState === 'former') return 'former'
  if (fact.employmentState !== 'current' || !fact.lastSeenAt) return 'unknown'
  const seen = new Date(fact.lastSeenAt).getTime()
  if (!Number.isFinite(seen)) return 'unknown'
  return now.getTime() - seen <= SHARED_FACT_STALE_AFTER_DAYS * 86_400_000 ? 'current' : 'unknown'
}

/**
 * #3989.7 — Décision Louis 15/10/2026 : une coordonnée PRO (e-mail, téléphone) déjà
 * trouvée dans un autre espace est RÉUTILISÉE dans un nouvel espace — la donnée
 * seule, comme intrant commun. Elle vit à part (`shared_person_coordinates`),
 * rattachée à la ligne commune NOMMÉE (FK `ON DELETE CASCADE` : l'effacement RGPD
 * d'une personne, c67, emporte ses coordonnées). Jamais l'espace source, ni notes,
 * ni statut, ni coût — aucune de ces colonnes n'existe (GA-43).
 */
export const SHARED_COORDINATE_TABLES = ['shared_person_coordinates'] as const

/**
 * La règle des coordonnées partagées, pure : seule une fiche d'origine BELLUM
 * (trouvée par nos collectes, jamais saisie ni importée, jamais corrigée à la main)
 * partage ses coordonnées, et seulement PROFESSIONNELLES — une boîte de webmail
 * grand public reste dans l'espace. `null` : rien à partager.
 */
export function toSharedCoordinates(contact: {
  source: string | null | undefined
  email?: string | null | undefined
  phone?: string | null | undefined
  humanCoordinates?: boolean | null | undefined
}): { email: string | null; phone: string | null } | null {
  if (sharedFactOriginOfSource(contact.source) !== 'bellum' || contact.humanCoordinates) return null
  const rawEmail = (contact.email ?? '').trim().toLowerCase()
  const email =
    /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(rawEmail) && !isPersonalEmail(rawEmail) ? rawEmail.slice(0, 254) : null
  const rawPhone = (contact.phone ?? '').trim()
  const phone = rawPhone.replace(/\D/g, '').length >= 8 ? rawPhone.slice(0, 40) : null
  return email || phone ? { email, phone } : null
}

/**
 * Les sources que BELLUM a produites : registre public, recherche publique,
 * nos reconstructions et nos enrichisseurs. Leurs noms ne sortent jamais vers
 * un écran (doctrine « nos fournisseurs ne se nomment jamais ») — ce sont des
 * valeurs de `contacts.source`, pas des libellés.
 */
const BELLUM_COLLECTED_SOURCES: ReadonlySet<string> = new Set([
  'linkedin_apify',
  'apollo',
  'ai_generated',
  'brave_search',
  'ia_reconstruction',
  'pappers',
  'dropcontact',
  'hunter',
  'lusha',
  'kaspr',
  'fullenrich',
  // SIG-B × #3989 — un recruteur nommé par une offre publiée : fait public collecté par Bellum.
  'job_posting',
])

/** Les sources qu'un UTILISATEUR a apportées : saisie, import, CRM, réunion. */
const USER_PROVIDED_SOURCES: ReadonlySet<string> = new Set(['manual', 'import', 'crm', 'meeting'])

/**
 * L'origine d'une fiche, ou `null` quand elle ne repart JAMAIS vers la base
 * commune : `demo` (fictif), `shared_base` (elle en vient déjà), inconnue.
 */
export function sharedFactOriginOfSource(source: string | null | undefined): SharedFactOrigin | null {
  if (!source) return null
  if (BELLUM_COLLECTED_SOURCES.has(source)) return 'bellum'
  if (USER_PROVIDED_SOURCES.has(source)) return 'user'
  return null
}

/**
 * La société commune à plusieurs espaces : le SIREN (9 chiffres) d'abord, sinon
 * le domaine du site. Jamais une raison sociale — deux espaces l'écrivent
 * différemment, et un nom n'est pas un jeton. Illisible = `null` : la société
 * ne se partage pas, rien n'est deviné.
 */
export function sharedCompanyKey(account: { siren?: string | null; website?: string | null }): string | null {
  const siren = (account.siren ?? '').replace(/\D/g, '')
  if (siren.length === 9) return `siren_${siren}`
  const raw = (account.website ?? '').trim().toLowerCase()
  if (!raw) return null
  const host = raw
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/?#]/)[0]
    ?.replace(/^www\./, '')
    .replace(/:\d+$/, '')
  if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null
  const key = `domain_${host.replace(/[.-]/g, '_')}`
  return key.length <= 120 ? key : null
}

type SharedPersonFact = {
  origin: SharedFactOrigin
  fullName: string | null
  title: string | null
  linkedinUrl: string | null
}

/** Un poste saisi qui porte une adresse, un numéro ou un lien n'est plus un rôle : il désigne quelqu'un. */
function carriesPersonalData(text: string): boolean {
  return /@|https?:\/\/|www\.|(\d[\s.-]?){6,}/i.test(text)
}

/**
 * LA règle de la frontière (Louis 11/10/2026, élargie le 15/10/2026) : ce qu'une fiche d'espace
 * devient dans la base commune, ou `null` quand elle n'y entre pas. Ne restent écartées que : une
 * source sans réponse écrite (démo, recopie de la base commune elle-même), et un fait Bellum sans nom
 * complet — rien ne permettrait de l'EFFACER (aucune empreinte, c67).
 */
export function toSharedPersonFact(contact: {
  source: string | null | undefined
  fullName: string | null | undefined
  title: string | null | undefined
  linkedinUrl: string | null | undefined
}): SharedPersonFact | null {
  const origin = sharedFactOriginOfSource(contact.source)
  if (!origin) return null
  const title = (contact.title ?? '').trim() || null
  if (origin === 'user') {
    // On garde tout, mais on anonymise : le rôle reste, la personne part. Décision Louis 15/10/2026
    // (#3989) : la base commune garde TOUTES les personnes — une fiche sans poste, ou dont le poste porte
    // une adresse, un numéro ou un lien, n'est plus écartée : elle entre SANS son poste (il désignerait
    // quelqu'un), jamais avec.
    const role = title && !carriesPersonalData(title) ? title.slice(0, 200) : null
    return { origin, fullName: null, title: role, linkedinUrl: null }
  }
  const fullName = (contact.fullName ?? '').trim().replace(/\s+/g, ' ')
  // Un prénom seul n'identifie personne (même règle que `isIdentifiablePerson`).
  if (fullName.split(' ').filter(Boolean).length < 2) return null
  return {
    origin,
    fullName,
    title: title ? title.slice(0, 200) : null,
    linkedinUrl: (contact.linkedinUrl ?? '').trim() || null,
  }
}
