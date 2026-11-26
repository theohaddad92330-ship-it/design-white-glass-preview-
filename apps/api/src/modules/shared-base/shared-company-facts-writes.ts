import type { EntityManager } from 'typeorm'
import {
  SHARED_BASE_CONTACT_SOURCE,
  SHARED_FACT_STALE_AFTER_DAYS,
  sharedCompanyKey,
  sharedEmploymentReading,
  toSharedCoordinates,
  toSharedPersonFact,
  type AnalysisContactSeed,
  type SharedEmploymentState,
  type SharedScope,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { canShareNamedFacts, sharedFactKey, sharedPersonFingerprints } from './shared-person-fingerprint'

/**
 * #3989 (suite de #3971 d, Louis 11/10/2026 — `c94_base_commune_capitalise_tout`)
 * — LES ÉCRITURES ET LECTURES DES FAITS SOCIÉTÉ PARTAGÉS.
 *
 * Toute ligne passe par `toSharedPersonFact` (la frontière : Bellum tel quel,
 * utilisateur anonymisé) — GA-43 relit cet appel. La base redit la frontière
 * par un CHECK (`shared_company_people_user_anonymized_check`).
 *
 * Fichier sans `service` dans son nom, et c'est voulu (GA-07) : la collecte
 * d'une analyse (`AnalysisPersistence`), l'effacement RGPD
 * (`PersonErasureService`) et le semis de démonstration l'importent sans aller
 * chercher un service voisin.
 */

type Manager = Pick<EntityManager, 'query'>

/** Une fiche d'espace telle que la base commune la lit — rien de plus. */
export type SharedSourceContact = {
  source: string | null
  fullName: string | null
  title: string | null
  linkedinUrl: string | null
  apolloId: string | null
  /** #3989.7 — les coordonnées de la fiche ; seules celles d'une fiche Bellum, pro, non corrigées, sortent. */
  email?: string | null
  phone?: string | null
  /** #3989.7 — l'e-mail ou le téléphone a été saisi/corrigé à la main (provenance `human`). */
  humanCoordinates?: boolean | null
  /** #4286.15.b — la personne est-elle encore chez la société ? `current` à défaut (ce que la fiche affirme). */
  employmentState?: SharedEmploymentState | null
  /** #4286.15.b — date de départ (AAAA-MM-JJ) quand on la connaît ; ignorée sur une personne actuelle. */
  leftAt?: string | null
}

/**
 * Verse les fiches d'UNE société dans la base commune. Jamais une suppression :
 * un second passage met à jour la même ligne (`fact_key`), complète un poste
 * ou un profil manquant, réunit les empreintes. Rend le nombre de lignes écrites.
 *
 * - une personne dont une empreinte figure parmi `erased` (effacement RGPD) ne
 *   revient pas ;
 * - sans clé d'empreinte, aucun fait NOMMÉ ne sort (on ne partage pas ce qu'on
 *   ne saurait pas effacer) — les faits anonymes, si.
 */
export async function upsertSharedCompanyPeople(
  manager: Manager,
  scope: SharedScope,
  companyKey: string,
  contacts: readonly SharedSourceContact[],
  erased: ReadonlySet<string>,
): Promise<number> {
  const named = canShareNamedFacts()
  let written = 0
  for (const contact of contacts) {
    const fact = toSharedPersonFact(contact)
    if (!fact) continue
    let fingerprints: string[] = []
    if (fact.origin === 'bellum') {
      if (!named) continue
      fingerprints = sharedPersonFingerprints({
        fullName: fact.fullName,
        linkedinUrl: fact.linkedinUrl,
        apolloId: contact.apolloId,
        companyKey,
      })
      if (fingerprints.some(print => erased.has(print))) continue
    }
    // #4286.15.b — l'état de la personne, à CHAQUE observation. Une date de départ n'accompagne qu'un ancien
    // (le CHECK `shared_company_people_left_at_check` le redit).
    const employmentState: SharedEmploymentState = contact.employmentState === 'former' ? 'former' : 'current'
    const leftAt =
      employmentState === 'former' && /^\d{4}-\d{2}-\d{2}$/.test(contact.leftAt ?? '') ? contact.leftAt : null
    // #4286.15.b — un ANCIEN reste ancien : une fiche « actuelle » d'un autre espace, souvent moins à jour,
    // ne le fait jamais revenir (un ancien n'est jamais présenté comme actuel). La première date de départ
    // connue reste.
    const inserted = await manager.query<Array<{ id: string }> | [Array<{ id: string }>, number]>(
      `INSERT INTO shared_company_people
         (scope, company_key, origin, fact_key, full_name, title, linkedin_url, person_fingerprints,
          employment_state, left_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (scope, company_key, fact_key) DO UPDATE
         SET title = COALESCE(shared_company_people.title, EXCLUDED.title),
             linkedin_url = COALESCE(shared_company_people.linkedin_url, EXCLUDED.linkedin_url),
             person_fingerprints = ARRAY(
               SELECT DISTINCT unnest(shared_company_people.person_fingerprints || EXCLUDED.person_fingerprints)
             ),
             employment_state = CASE WHEN shared_company_people.employment_state = 'former' OR EXCLUDED.employment_state = 'former' THEN 'former' ELSE 'current' END,
             left_at = CASE WHEN shared_company_people.employment_state = 'former' OR EXCLUDED.employment_state = 'former'
                            THEN COALESCE(shared_company_people.left_at, EXCLUDED.left_at) ELSE NULL END,
             last_seen_at = now()
       RETURNING id`,
      [
        scope,
        companyKey,
        fact.origin,
        sharedFactKey(companyKey, fact),
        fact.fullName,
        fact.title,
        fact.linkedinUrl,
        fingerprints,
        employmentState,
        leftAt,
      ],
    )
    // #3989.7 — Louis 15/10/2026 : la coordonnée PRO trouvée par Bellum devient un intrant commun,
    // rattachée au fait NOMMÉ (l'effacement de la personne l'emporte : FK en cascade). Jamais
    // l'espace, ni note, ni statut, ni coût. Un fait anonyme (« user ») n'en porte jamais.
    const coordinates = fact.origin === 'bellum' ? toSharedCoordinates(contact) : null
    const factId = returnedRows<{ id: string }>(inserted)[0]?.id
    if (coordinates && factId) {
      await manager.query(
        `INSERT INTO shared_person_coordinates (fact_id, email, phone)
         VALUES ($1, $2, $3)
         ON CONFLICT (fact_id) DO UPDATE
           SET email = COALESCE(shared_person_coordinates.email, EXCLUDED.email),
               phone = COALESCE(shared_person_coordinates.phone, EXCLUDED.phone),
               last_seen_at = now()`,
        [factId, coordinates.email, coordinates.phone],
      )
    }
    written += 1
  }
  return written
}

/** Les empreintes des personnes effacées de la base commune (c67 propagé). */
export async function sharedErasedFingerprints(manager: Manager): Promise<Set<string>> {
  const rows = await manager.query<Array<{ fingerprints: string[] | null }>>(
    `SELECT fingerprints FROM shared_person_erasures`,
  )
  return new Set(rows.flatMap(row => row.fingerprints ?? []))
}

/**
 * Ce qu'un espace qui analyse la société RECOPIE : les faits NOMMÉS (collectés
 * par Bellum), en seeds de contact `shared_base` qui portent l'identifiant de
 * leur ligne commune (`sharedFactId`, par lequel l'effacement les retrouvera).
 * Les faits anonymes ne deviennent pas des fiches — un rôle sans personne
 * n'identifie personne ; ils se lisent par {@link sharedAnonymousRolesForCompany}.
 */
export async function sharedSeedsForCompany(
  manager: Manager,
  scope: SharedScope,
  companyKey: string,
): Promise<AnalysisContactSeed[]> {
  const rows = await manager.query<
    Array<{
      id: string
      full_name: string | null
      title: string | null
      linkedin_url: string | null
      email: string | null
      phone: string | null
      employment_state: string | null
      last_seen_at: string | Date | null
    }>
  >(
    // #3989.7 — la coordonnée PRO déjà trouvée ailleurs suit la personne, la donnée seule.
    // #4286.15.b — seulement les personnes ACTUELLES et revues depuis le seuil : un ancien ou un fait
    // périmé reste archivé dans la base commune, il ne devient jamais une fiche « chez la société ».
    `SELECT p.id, p.full_name, p.title, p.linkedin_url, c.email, c.phone, p.employment_state, p.last_seen_at
     FROM shared_company_people p
     LEFT JOIN shared_person_coordinates c ON c.fact_id = p.id
     WHERE p.scope = $1 AND p.company_key = $2 AND p.origin = 'bellum'
       AND p.employment_state = 'current' AND p.last_seen_at >= now() - make_interval(days => $3)
     ORDER BY p.first_shared_at
     LIMIT 500`,
    [scope, companyKey, SHARED_FACT_STALE_AFTER_DAYS],
  )
  return (
    rows
      .filter(row => (row.full_name ?? '').trim())
      // #4286.15.b — la lecture redit la règle (une ligne écrite à la main, une horloge décalée).
      .filter(
        row =>
          sharedEmploymentReading({ employmentState: row.employment_state, lastSeenAt: row.last_seen_at }) ===
          'current',
      )
      .map(row => ({
        fullName: (row.full_name ?? '').trim(),
        title: row.title ?? '',
        linkedinUrl: row.linkedin_url ?? '',
        city: '',
        country: '',
        source: SHARED_BASE_CONTACT_SOURCE,
        sharedFactId: row.id,
        ...(row.email || row.phone
          ? { sharedCoordinates: { email: row.email ?? null, phone: row.phone ?? null } }
          : {}),
      }))
  )
}

/**
 * #4268.b (Louis 19/10/2026) — la coordonnée PRO que la base commune connaît déjà pour UNE
 * personne, lue AVANT l'appel payant d'un enrichissement à la demande. Avant, elle n'était
 * relue qu'à la recopie d'une analyse : une fiche importée, saisie, ou analysée avant le
 * versement repayait la cascade pour une donnée que Bellum avait déjà.
 *
 * - la personne se reconnaît par ses EMPREINTES dans SA société (même calcul que l'effacement :
 *   un homonyme d'une autre société n'est pas elle) ; fait d'origine Bellum seulement ;
 * - fraîcheur = celle du cache commun des coordonnées (`maxAgeSeconds`, 30 j par défaut chez
 *   l'appelant) ;
 * - sans clé d'empreinte, rien ne se lit (un fait qu'on ne saurait pas effacer ne sort pas) ;
 *   une personne effacée n'a plus de ligne (FK en cascade, c67).
 * Rend la donnée seule — jamais l'espace qui l'a trouvée, ni note, ni statut, ni coût.
 */
export async function sharedCoordinatesForPerson(
  manager: Manager,
  scope: SharedScope,
  companyKey: string,
  person: { fullName?: string | null; linkedinUrl?: string | null; apolloId?: string | null },
  maxAgeSeconds: number,
): Promise<{ email: string | null; phone: string | null } | null> {
  if (!canShareNamedFacts()) return null
  const fingerprints = sharedPersonFingerprints({ ...person, companyKey })
  if (fingerprints.length === 0) return null
  const [row] = await manager.query<Array<{ email: string | null; phone: string | null }>>(
    `SELECT c.email, c.phone
     FROM shared_company_people p
     JOIN shared_person_coordinates c ON c.fact_id = p.id
     WHERE p.scope = $1 AND p.company_key = $2 AND p.origin = 'bellum'
       AND p.employment_state = 'current'
       AND p.person_fingerprints && $3::text[]
       AND c.last_seen_at >= now() - make_interval(secs => $4)
     ORDER BY c.last_seen_at DESC
     LIMIT 1`,
    [scope, companyKey, fingerprints, maxAgeSeconds],
  )
  if (!row || (!row.email && !row.phone)) return null
  return { email: row.email ?? null, phone: row.phone ?? null }
}

/**
 * La société commune d'un compte et le périmètre de son espace (la salle de
 * démonstration lit `demo`, jamais le réel). `null` : compte introuvable, ou
 * société sans SIREN ni site — rien ne se partage, rien n'est deviné.
 */
export async function sharedCompanyOfAccount(
  manager: Manager,
  accountId: string,
): Promise<{ scope: SharedScope; companyKey: string } | null> {
  const [account] = await manager.query<Array<{ siren: string | null; website: string | null; is_demo: boolean }>>(
    `SELECT a.siren AS siren, a.website AS website, w.is_demo AS is_demo
     FROM accounts a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = $1`,
    [accountId],
  )
  const companyKey = account ? sharedCompanyKey(account) : null
  if (!account || !companyKey) return null
  return { scope: account.is_demo ? 'demo' : 'live', companyKey }
}

/** Les seeds `shared_base` d'un compte : {@link sharedSeedsForCompany} sur sa société commune. */
export async function sharedSeedsForAccount(manager: Manager, accountId: string): Promise<AnalysisContactSeed[]> {
  const company = await sharedCompanyOfAccount(manager, accountId)
  return company ? sharedSeedsForCompany(manager, company.scope, company.companyKey) : []
}

/** Les rôles ANONYMES connus de la base commune pour cette société (apportés par des utilisateurs). */
export async function sharedAnonymousRolesForCompany(
  manager: Manager,
  scope: SharedScope,
  companyKey: string,
): Promise<string[]> {
  const rows = await manager.query<Array<{ title: string | null }>>(
    `SELECT title FROM shared_company_people
     WHERE scope = $1 AND company_key = $2 AND origin = 'user' AND title IS NOT NULL
       AND employment_state = 'current' AND last_seen_at >= now() - make_interval(days => $3)
     ORDER BY first_shared_at
     LIMIT 50`,
    // #4286.15.b — le rôle d'un ancien, ou un rôle non revu depuis le seuil, n'est plus un rôle « chez la société ».
    [scope, companyKey, SHARED_FACT_STALE_AFTER_DAYS],
  )
  return rows.map(row => (row.title ?? '').trim()).filter(Boolean)
}

/**
 * L'effacement RGPD d'une personne (c67) PROPAGÉ à la base commune : chaque
 * ligne qui porte une de ses empreintes est supprimée, et l'empreinte reste
 * (`shared_person_erasures`) pour qu'aucun espace ne la reverse. Rend les
 * identifiants des lignes supprimées — ce sont eux qui désignent les COPIES
 * reçues par les autres espaces (`raw_data.sharedFactId`).
 */
export async function purgeErasedPersonFromSharedBase(
  manager: Manager,
  fingerprints: readonly string[],
): Promise<string[]> {
  if (fingerprints.length === 0) return []
  // TypeORM rend `[lignes, nombre]` pour un DELETE … RETURNING : `returnedRows` le déplie.
  const purged = returnedRows<{ id: string }>(
    await manager.query(`DELETE FROM shared_company_people WHERE person_fingerprints && $1::text[] RETURNING id`, [
      fingerprints,
    ]),
  )
  await manager.query(`INSERT INTO shared_person_erasures (fingerprints) VALUES ($1)`, [fingerprints])
  return purged.map(row => row.id)
}
