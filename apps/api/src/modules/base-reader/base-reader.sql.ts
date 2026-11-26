import type { BaseReaderCriteria } from '@bellum/contracts'

/**
 * #4792 — LES PRÉDICATS DU LECTEUR COMMUN, À UN SEUL ENDROIT (GA-26).
 *
 * Trois familles interrogent trois jeux de tables, mais elles rapprochent un métier et un lieu de la
 * MÊME façon. Si cette façon était écrite trois fois, « Lille » trouverait trois nombres de lignes
 * différents selon la famille — et personne ne saurait lequel est juste.
 *
 * Ce fichier est PUR : aucune base, aucun `Repository`. C'est ce qui le rend mesurable au caractère
 * près (`base-reader.sql.spec.ts`) là où une requête ne se lit qu'en production.
 */

/**
 * Un mot tapé par une personne n'est JAMAIS un joker SQL : `%`, `_` et `\` sont échappés avant de
 * partir dans un `ILIKE`. Sans cette ligne, taper « % » rendrait la base entière — et taper le nom
 * d'un client contenant un souligné en rendrait trop.
 */
export function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1')
}

/**
 * Les motifs d'un métier ou d'une compétence. Vide = AUCUN filtre de terme (et c'est l'appelant qui
 * décide : un critère absent n'est pas un critère vide).
 *
 * Un terme de moins de deux caractères est écarté : « a » rapprocherait tout, ce qui n'est pas une
 * réponse (même plancher que la lecture du cache commun d'offres).
 */
export const BASE_READER_MIN_TERM_LENGTH = 2

export function termPatterns(criteria: Pick<BaseReaderCriteria, 'terms'>): string[] {
  const out = new Set<string>()
  for (const term of criteria.terms) {
    const clean = String(term ?? '').trim()
    if (clean.length < BASE_READER_MIN_TERM_LENGTH) continue
    out.add(`%${escapeLike(clean)}%`)
  }
  return [...out]
}

/** Ce qu'est un CODE de département, écrit une fois : 01-95, 971-976, et la Corse (2A, 2B). */
const DEPARTMENT_CODE = /^(\d{2,3}|2[AB])$/i

/**
 * Les motifs d'un LIEU — ville, département, région, confondus à dessein : la base stocke les lieux en
 * TEXTE LIBRE (`accounts.headquarters`, `project_needs.location`, `consultants.location`), donc un lieu
 * se RAPPROCHE, il ne se résout pas.
 *
 * ⚠️ UN DÉPARTEMENT DONNÉ PAR SON CODE NE PART PAS NU. « 59 » en `%59%` rapprocherait « 59 rue de la
 * Gare » et le moindre nombre d'une adresse : le code part donc SOUS SA FORME PARENTHÉSÉE — `%(59)%` —,
 * celle que le dépôt écrit déjà (« Lyon (69) », `DEMO_FLAGSHIP_NEED` et ses voisins). Une ligne
 * manquée est moins grave qu'une ligne fausse ; et un département donné par son NOM (« Nord ») part,
 * lui, en texte, comme une ville.
 *
 * La forme reconnue est celle des codes RÉELS : deux ou trois chiffres (01-95, 971-976) et la Corse
 * (2A, 2B). « 2026 » n'est pas un département et part donc en texte, comme n'importe quel mot.
 */
export function placePatterns(criteria: Pick<BaseReaderCriteria, 'city' | 'departments' | 'regions'>): string[] {
  const labels = [criteria.city ?? '', ...criteria.departments, ...criteria.regions]
  const out = new Set<string>()
  for (const label of labels) {
    const clean = String(label ?? '').trim()
    if (!clean) continue
    if (DEPARTMENT_CODE.test(clean)) {
      out.add(`%(${escapeLike(clean)})%`)
      continue
    }
    out.add(`%${escapeLike(clean)}%`)
  }
  return [...out]
}

/**
 * LES CODES DE DÉPARTEMENT, NUS — pour les colonnes qui portent des CODES, pas des phrases.
 *
 * ⚠️ Pourquoi cette seconde fonction existe, et pourquoi elle n'est pas un doublon de
 * {@link placePatterns} : la base porte le lieu sous DEUX formes. `accounts.headquarters`,
 * `project_needs.location` et `consultants.location` sont des PHRASES (« Lyon (69) ») — un `ILIKE` les
 * rapproche. `consultants.zones` et `consultants.mobility_zones` sont des LISTES de jetons, où un
 * département s'écrit « 69 » tout court (et une zone peut aussi s'y écrire en clair, « IDF »,
 * « Lyon (69) »). Sur ces listes, le motif parenthésé ne rapprocherait JAMAIS « 69 », et le `%69%` nu
 * qu'on refuse ailleurs rapprocherait « 169 ». Un jeton se compare donc à l'ÉGAL, en majuscules.
 *
 * Les deux fonctions se complètent sur ces colonnes-là (ILIKE sur la phrase OU égalité sur le jeton),
 * elles ne se remplacent pas — et la décision de ce qu'est un code de département reste écrite une
 * fois, dans la même expression que {@link placePatterns} lit.
 */
export function placeCodes(criteria: Pick<BaseReaderCriteria, 'city' | 'departments' | 'regions'>): string[] {
  const out = new Set<string>()
  for (const label of [criteria.city ?? '', ...criteria.departments, ...criteria.regions]) {
    const clean = String(label ?? '').trim()
    if (clean && DEPARTMENT_CODE.test(clean)) out.add(clean.toUpperCase())
  }
  return [...out]
}

/**
 * La borne de période, normalisée. Une date illisible est IGNORÉE plutôt que transformée en « maintenant » :
 * une fenêtre inventée couperait des lignes que la base porte, et c'est exactement le défaut de Découvrir
 * que ce lot répare.
 */
export function periodBounds(criteria: Pick<BaseReaderCriteria, 'from' | 'to'>): {
  from: string | null
  to: string | null
} {
  const read = (value: string | null): string | null => {
    const clean = String(value ?? '').trim()
    if (!clean) return null
    const date = new Date(clean)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return { from: read(criteria.from), to: read(criteria.to) }
}

/** Les lignes `text[]` de Postgres rendues telles quelles ; `null` ou autre chose ⇒ `[]`, jamais `['']`. */
export function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item ?? '').trim()).filter(item => item.length > 0)
}

/** Une date de base (`Date` avec le driver pg, `string` selon la config) rendue en ISO ; `null` = absente. */
export function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  const clean = String(value ?? '').trim()
  if (!clean) return null
  const date = new Date(clean)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** #4793.1 — un statut de la base commune qui EXCLUT ou VERROUILLE un compte ne le fait jamais candidat
 *  (même règle que `OrionAccountsService.searchCandidates` : ces statuts ne sortent que nommés). */
const COMMON_BASE_BARRED_STATUSES = ['EXCLU_%', 'VERROUILLE_%']

/**
 * #5034 / #4792 (GA-26) — LA REQUÊTE DES CANDIDATS DE LA BASE COMMUNE, écrite ICI avec le reste des
 * prédicats de lieu : Découvrir n'écrit plus son propre rapprochement. Elle ne reçoit AUCUN espace
 * (#4791.3) : seulement des motifs de métier (`termPatterns`), de lieu (`placePatterns`), de NAF et un plafond.
 */
export function commonBaseCandidatesQuery(
  terms: string[],
  places: string[],
  nafs: string[],
  cap: number,
  /** #5203 — période (`all` | `recent` | `old`), borne « récent » (AAAA-MM-JJ) et natures retenues. Défaut : rien ne retire. */
  needs: { period?: 'all' | 'recent' | 'old'; recentSince?: string; natures?: readonly string[] } = {},
): { sql: string; params: [string[], string[], string[], string[], number, string, string, string[]] } {
  return {
    sql: `SELECT d.siren,
                COALESCE(NULLIF(d.legal_name, ''), d.name) AS name,
                COALESCE(NULLIF(s.headquarters, ''), NULLIF(s.city, ''), nd.location) AS city,
                d.sector,
                d.naf_code,
                nd.label AS need_label,
                nd.need_date,
                nd.nature AS need_nature
           FROM dataforge_accounts d
           LEFT JOIN dataforge_account_statuses s ON s.source_id = d.source_id
           LEFT JOIN LATERAL (
             SELECT n.need_date::text AS need_date, n.location,
                    COALESCE((SELECT t FROM unnest(n.technologies) t
                               WHERE cardinality($1::text[]) > 0 AND t ILIKE ANY($1::text[]) LIMIT 1),
                             NULLIF(n.title, ''), NULLIF(n.domain, '')) AS label,
                    CASE n.source_file WHEN '24_MISSIONS_BESOINS' THEN 'mission' END AS nature
               FROM dataforge_needs n
              WHERE n.account_source_id = d.source_id
                AND ($6::text = 'all'
                     OR ($6::text = 'recent' AND n.need_date >= $7::date)
                     OR ($6::text = 'old' AND n.need_date < $7::date))
                AND (cardinality($8::text[]) = 0
                     OR (CASE n.source_file WHEN '24_MISSIONS_BESOINS' THEN 'mission' END) = ANY($8::text[]))
                AND (cardinality($1::text[]) = 0
                     OR n.title ILIKE ANY($1::text[]) OR n.domain ILIKE ANY($1::text[])
                     OR EXISTS (SELECT 1 FROM unnest(n.technologies) t WHERE t ILIKE ANY($1::text[])))
              ORDER BY n.need_date DESC NULLS LAST
              LIMIT 1
           ) nd ON true
          WHERE d.siren ~ '^[0-9]{9}$'
            AND (d.cluster_id IS NULL OR d.is_cluster_primary)
            AND (s.statut_code IS NULL OR NOT (s.statut_code ILIKE ANY($4::text[])))
            AND ((cardinality($1::text[]) = 0 AND $6::text = 'all' AND cardinality($8::text[]) = 0) OR nd.label IS NOT NULL)
            AND (cardinality($2::text[]) = 0 OR s.headquarters ILIKE ANY($2::text[]) OR s.city ILIKE ANY($2::text[]) OR nd.location ILIKE ANY($2::text[]))
            AND (cardinality($3::text[]) = 0 OR upper(replace(d.naf_code, '.', '')) = ANY($3::text[]))
          ORDER BY nd.need_date DESC NULLS LAST, d.siren
          LIMIT $5`,
    params: [
      terms,
      places,
      nafs,
      COMMON_BASE_BARRED_STATUSES,
      cap,
      needs.period ?? 'all',
      needs.recentSince ?? '1970-01-01',
      [...(needs.natures ?? [])],
    ],
  }
}

/**
 * #4419.7 (GA-26) — l'IDENTITÉ d'un employeur par son NOM dans la base commune : le nom entier (jamais un
 * morceau — `escapeLike` empêche tout joker), SIREN valide seulement. Aucun espace en paramètre : la base
 * commune ne sert pas un espace (#4791.3). Le rapprochement exact est refait en TypeScript.
 */
export function commonBaseIdentityQuery(names: string[]): { sql: string; params: [string[]] } {
  return {
    sql: `SELECT DISTINCT d.siren, COALESCE(NULLIF(d.legal_name, ''), d.name) AS name
            FROM dataforge_accounts d
           WHERE d.siren ~ '^[0-9]{9}$'
             AND (d.cluster_id IS NULL OR d.is_cluster_primary)
             AND (d.name ILIKE ANY($1::text[]) OR d.legal_name ILIKE ANY($1::text[]))
           LIMIT 50`,
    params: [names.map(escapeLike)],
  }
}

/**
 * #4794 — les chiffres d'un code d'activité qui désignent une ESN FRANCHE : 620x hors 6209 (« autres activités
 * informatiques », ambigu) — miroir de `esnNafClass` (`discover-result-type.ts`), vérifié par `base-reader.sql.spec.ts`.
 */
export const ESN_NAF_DIGITS_PATTERN = '^620(?!9)'

/**
 * #4794 — la clause qui écarte les ESN franches d'un compte (`<alias>.naf_code`). Un code ABSENT garde le compte :
 * ne pas connaître le code n'est pas être une ESN. Écrite une fois ici (GA-26), lue par les comptes et les besoins.
 */
export function notEsnAccountClause(alias: string): string {
  const digits = `regexp_replace(${alias}.naf_code, '[^0-9]', '', 'g')`
  return `(${alias}.naf_code IS NULL OR ${digits} !~ '${ESN_NAF_DIGITS_PATTERN}')`
}
