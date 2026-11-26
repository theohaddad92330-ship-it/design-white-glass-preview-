import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  BaseReaderAccountRow,
  BaseReaderConsultantRow,
  BaseReaderCriteria,
  BaseReaderFamily,
  BaseReaderNeedRow,
  BaseReaderPage,
  BaseReaderResult,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { type BusinessUnitScopeClause, businessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { baseReaderCriteriaOf } from './base-reader.criteria'
import {
  BASE_READER_FAMILY_ORDER,
  BASE_READER_MAX_LIMIT,
  clampBaseReaderLimit,
  clampBaseReaderOffset,
} from './base-reader.limits'
import {
  BASE_READER_MIN_TERM_LENGTH,
  commonBaseIdentityQuery,
  isoOrNull,
  notEsnAccountClause,
  periodBounds,
  placeCodes,
  placePatterns,
  termPatterns,
  textArray,
} from './base-reader.sql'

/** Une fiche supprimée ne ressort JAMAIS — même valeur que partout ailleurs dans le dépôt. */
const DELETED_ACCOUNT_STATUS = 'deleted'

/**
 * La nature de recrutement dans `signal_history` : c'est elle, et elle seule, qui porte les OFFRES
 * collectées pour un compte. Un seul endroit (GA-26) : la même chaîne ailleurs dériverait en silence.
 */
const RECRUITMENT_SIGNAL_TYPE = 'recrutement'

/**
 * LE PÉRIMÈTRE DE LA LECTURE, résolu AU BORD (contrôleur) et passé entier jusqu'à la requête.
 *
 * ⚠️ Deux champs, et les deux comptent. `workspaceId` est la borne d'espace, qui va DANS le `WHERE`
 * (GA-380 : l'absence d'espace fait REFUSER, elle n'ouvre rien). `businessUnitScope` s'AJOUTE à elle,
 * il ne la remplace jamais — une jointure qui aurait remplacé la borne aurait l'air juste à l'écran
 * tout en ouvrant l'espace entier.
 */
export type BaseReaderScope = {
  workspaceId: string
  businessUnitScope: BusinessUnitScopeClause
}

type AccountSqlRow = {
  id: string
  company_name: string | null
  sector: string | null
  place: string | null
  siren: string | null
  business_unit_id: string | null
  collected_at: unknown
  total: number | string
}

type NeedSqlRow = {
  need_id: string | null
  account_id: string
  account_name: string | null
  title: string | null
  skills: unknown
  place: string | null
  status: string | null
  source: string
  collected_at: unknown
  total: number | string
}

type ConsultantSqlRow = {
  id: string
  full_name: string | null
  title: string | null
  place: string | null
  zones: unknown
  skills: unknown
  source: string
  experience_client: string | null
  experience_role: string | null
  experience_from: string | null
  experience_to: string | null
  mission_place: string | null
  collected_at: unknown
  total: number | string
}

export type BaseReaderIdentity = { siren: string; name: string; origin: 'choice' | 'space' | 'common_base' }

/** Un nom comparé sans casse, accents ni ponctuation (« Consort-Group » = « consort group »). */
function foldName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * #4792 (épopée #4791) — LE LECTEUR COMMUN DE NOTRE BASE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION À LAQUELLE IL RÉPOND, ET LA RAISON DE SON UNICITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Quels COMPTES, quels BESOINS et quels CONSULTANTS de notre base correspondent à ces critères ? »
 * — métier ou compétence, lieu, période, famille, pagination.
 *
 * Quatre surfaces la posent (Découvrir, Laura, l'analyse, Signaux). Mesuré le 29/10/2026 : AUCUNE ne la
 * posait à la base. Découvrir ne lisait que les appels live du moment (fenêtre de 90 jours, aucune
 * pagination, coupe au palier de l'équipe) pendant que la base portait déjà des milliers de besoins et
 * de consultants, déjà collectés, déjà payés, invisibles partout. Écrire la requête quatre fois
 * garantissait quatre comportements différents dans trois semaines : elle vit donc ICI, une fois
 * (garde GA-26), et les prédicats qu'elle partage entre familles vivent dans `base-reader.sql.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS, ET CE QU'IL NE DOUBLE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * - **Zéro crédit, zéro réseau.** Il lit ce qui est DÉJÀ stocké : doctrine
 *   `c145_historique_stocke_se_lit_sans_credit`. Aucun appel à un fournisseur n'entre ici, jamais.
 * - **Aucun score, aucune probabilité.** Il rend des lignes et leur date ; le rang est l'affaire de
 *   l'appelant (doctrine : aucune probabilité, refusée six fois).
 * - **Il ne double aucune lecture existante** — les trois voisines, et pourquoi elles ne répondent pas
 *   à la même question :
 *     · `NeedsHistoryService` (#4759) répond « quels besoins pour CE compte », `accountId` OBLIGATOIRE,
 *       avec son agrégat de contexte. Ici l'`accountId` est un filtre facultatif et la question part des
 *       CRITÈRES, à travers tous les comptes ;
 *     · `TalentService.findByExperienceClient` (#3889.1) répond « qui a travaillé CHEZ ce client »,
 *       par le NOM d'un client. Ici le rapprochement porte sur un métier et un LIEU ;
 *     · `discover_skill_offers.cached_offers` (apps/ia) lit le CACHE COMMUN d'offres publiques
 *       (`source_cache`, clé SIREN, 500 lignes / 365 j, aucune colonne de portée) : un fait de marché
 *       partagé entre tous les espaces. Ce lecteur-ci lit les tables de L'ESPACE, cloisonnées. Les deux
 *       coexistent parce qu'ils lisent deux STOCKS différents sous deux périmètres différents ; les
 *       fondre ferait entrer la donnée d'un espace dans un cache partagé, soit l'inverse de GA-336.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CLOISONNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE requête porte `workspace_id = $1`, et un espace vide fait LEVER (fail-closed) plutôt que de
 * lire sans borne. Le périmètre de Business Unit s'ajoute par `businessUnitScopeClause` — la FORME de
 * la règle vit déjà à un seul endroit, elle n'est pas recopiée ici.
 *
 * ⚠️ Les consultants ne portent AUCUNE colonne de périmètre : le cloisonnement de BU ne s'y applique
 * donc pas, et c'est DIT (ici et dans la PR) plutôt que simulé par une jointure devinée.
 *
 * ⚠️ Le consentement borne la famille consultants comme il borne déjà `findByExperienceClient` : une
 * fiche archivée, sans consentement ou à consentement expiré ne fait AUCUNE ligne, et une expérience
 * dont le client est masqué n'en fait aucune non plus.
 *
 * ⚠️ « QUI A BOSSÉ À LILLE ? » — un lieu rapproche la fiche (sa ville, ses zones déclarées) ET le lieu
 * d'une MISSION réalisée (`mission_assignments.work_location`, puis `missions.location`). Les deux
 * réponses sont vraies mais ne disent pas la même chose : la ligne porte `missionPlace`, qui NOMME la
 * mission quand le rapprochement vient de là et reste `null` quand il vient de la fiche. Une mobilité
 * déclarée n'est pas une mission faite. Les expériences de CV, elles, ne portent AUCUN lieu en base —
 * c'est une limite de la base, pas un choix du lecteur, et elle est écrite dans la PR.
 */
@Injectable()
export class BaseReaderService {
  private readonly logger = new Logger(BaseReaderService.name)

  constructor(@InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>) {}

  /**
   * La lecture. Les familles demandées partent ENSEMBLE (une requête par famille, en parallèle) : lire
   * l'une après l'autre tripleraient la latence d'un tour de Laura sans rien ajouter.
   */
  async read(scope: BaseReaderScope, criteria: BaseReaderCriteria): Promise<BaseReaderResult> {
    if (!scope.workspaceId) {
      // GA-380 — l'absence d'espace REFUSE. Le repli « pas d'espace, donc pas de filtre » lirait la
      // base de tous les clients, et aucun écran ne changerait d'apparence.
      throw new Error('base_reader_requires_workspace')
    }
    const limit = clampBaseReaderLimit(criteria.limit)
    const offset = clampBaseReaderOffset(criteria.offset)
    const asked: BaseReaderFamily[] =
      criteria.families.length > 0
        ? BASE_READER_FAMILY_ORDER.filter(family => criteria.families.includes(family))
        : [...BASE_READER_FAMILY_ORDER]
    const normalised: BaseReaderCriteria = { ...criteria, limit, offset }

    const [accounts, needs, consultants] = await Promise.all([
      asked.includes('accounts') ? this.readAccounts(scope, normalised) : Promise.resolve(undefined),
      asked.includes('needs') ? this.readNeeds(scope, normalised) : Promise.resolve(undefined),
      asked.includes('consultants') ? this.readConsultants(scope, normalised) : Promise.resolve(undefined),
    ])

    // Le journal : de quoi relever un plafond si un appelant bute dessus. Des NOMBRES, jamais un
    // contenu (ni nom de compte, ni intitulé de besoin, ni nom de personne).
    this.logger.log(
      `base_reader.read workspace=${scope.workspaceId} families=${asked.join('+')} ` +
        `terms=${termPatterns(normalised).length} places=${placePatterns(normalised).length} ` +
        `limit=${limit} offset=${offset} accounts=${accounts?.total ?? '-'} needs=${needs?.total ?? '-'} ` +
        `consultants=${consultants?.total ?? '-'}`,
    )

    return {
      readAt: new Date().toISOString(),
      ...(accounts ? { accounts } : {}),
      ...(needs ? { needs } : {}),
      ...(consultants ? { consultants } : {}),
    }
  }

  /**
   * #4419.7 — l'identité d'un employeur nommé par une offre, lue dans NOTRE base avant le registre public :
   * les comptes de l'ESPACE qui ont un SIREN (même périmètre que `read`), puis la base commune. Un nom
   * présent avec UN seul SIREN ⇒ identité ; deux SIREN ⇒ ``null`` (jamais un SIREN deviné).
   */
  async identityByName(scope: BaseReaderScope, name: string): Promise<BaseReaderIdentity | null> {
    const wanted = foldName(name)
    if (wanted.length < BASE_READER_MIN_TERM_LENGTH) return null
    // #4419.8 — le choix d'un commercial de CET espace gagne toujours sur le calcul (la correction humaine gagne).
    const chosen = await this.accounts.manager.query<Array<{ siren: string | null; legal_name: string | null }>>(
      `SELECT siren, legal_name FROM employer_identity_choices WHERE workspace_id = $1 AND name_key = $2 LIMIT 1`,
      [scope.workspaceId, wanted],
    )
    const choice = chosen?.[0]
    if (choice && /^\d{9}$/.test(String(choice.siren ?? ''))) {
      return { siren: String(choice.siren), name: String(choice.legal_name ?? name).trim(), origin: 'choice' }
    }
    const [space, common] = await Promise.all([
      this.readAccounts(
        scope,
        baseReaderCriteriaOf({ terms: [name], families: ['accounts'], limit: BASE_READER_MAX_LIMIT }),
      ),
      (async () => {
        const query = commonBaseIdentityQuery([name])
        return this.accounts.manager.query<Array<{ siren: string | null; name: string | null }>>(
          query.sql,
          query.params,
        )
      })(),
    ])
    const found = new Map<string, BaseReaderIdentity>()
    for (const row of space.rows) {
      const siren = String(row.siren ?? '').replace(/\s/g, '')
      if (/^\d{9}$/.test(siren) && foldName(row.companyName) === wanted && !found.has(siren)) {
        found.set(siren, { siren, name: row.companyName, origin: 'space' })
      }
    }
    for (const row of common ?? []) {
      const siren = String(row?.siren ?? '').replace(/\s/g, '')
      if (/^\d{9}$/.test(siren) && foldName(row.name) === wanted && !found.has(siren)) {
        found.set(siren, { siren, name: String(row.name).trim(), origin: 'common_base' })
      }
    }
    return found.size === 1 ? [...found.values()][0] : null
  }

  /**
   * #4419.8 — le commercial CHOISIT l'entreprise d'une ligne « Plusieurs entreprises portent ce nom » : gardé pour
   * l'espace (clé = espace + nom normalisé), il remplace un choix précédent. Un SIREN qui n'a pas 9 chiffres est refusé.
   */
  async chooseIdentity(
    scope: BaseReaderScope,
    userId: string,
    name: string,
    chosen: { siren: string; name: string | null },
  ): Promise<void> {
    if (!scope.workspaceId) throw new Error('base_reader_requires_workspace')
    const siren = String(chosen.siren ?? '').replace(/\s/g, '')
    if (!/^\d{9}$/.test(siren)) throw new Error('invalid_siren')
    const key = foldName(name)
    if (key.length < BASE_READER_MIN_TERM_LENGTH) throw new Error('invalid_name')
    await this.accounts.manager.query(
      `INSERT INTO employer_identity_choices (workspace_id, name_key, siren, legal_name, chosen_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, name_key)
       DO UPDATE SET siren = EXCLUDED.siren, legal_name = EXCLUDED.legal_name,
                     chosen_by = EXCLUDED.chosen_by, chosen_at = now()`,
      [scope.workspaceId, key, siren, chosen.name ? String(chosen.name).trim() : null, userId],
    )
  }

  /**
   * Les COMPTES qui correspondent.
   *
   * Un terme rapproche le nom, le nom commercial et le secteur de la fiche — ET les comptes qui PORTENT
   * un besoin citant ce terme. C'est cette seconde moitié qui répond à la vraie question (« quels
   * comptes attaquer sur Java ? ») : un compte ne s'appelle jamais « Java ». Elle réutilise le
   * prédicat de la famille besoins plutôt que d'en écrire un jumeau.
   */
  private async readAccounts(
    scope: BaseReaderScope,
    criteria: BaseReaderCriteria,
  ): Promise<BaseReaderPage<BaseReaderAccountRow>> {
    const params: unknown[] = [scope.workspaceId]
    const p = (value: unknown): string => `$${params.push(value)}`
    const where: string[] = [`a.workspace_id = $1`, `a.status <> ${p(DELETED_ACCOUNT_STATUS)}`]

    // #4793.3 — l'expression n'est PAS évaluée si la clause n'a pas besoin des ids : un paramètre poussé
    // et jamais référencé fait refuser la requête (« could not determine data type of parameter $3 »).
    const bu = businessUnitScopeClause(scope.businessUnitScope, 'a.business_unit_id', this.buIdsExpression(scope, p))
    if (bu) where.push(bu)
    if (criteria.accountIds.length > 0) where.push(`a.id = ANY(${p(criteria.accountIds)}::uuid[])`)
    if (criteria.excludeEsn) where.push(notEsnAccountClause('a'))

    const terms = termPatterns(criteria)
    if (terms.length > 0) {
      const t = p(terms)
      where.push(
        `(a.company_name ILIKE ANY(${t}) OR a.trade_name ILIKE ANY(${t}) OR a.sector ILIKE ANY(${t})
          OR EXISTS (SELECT 1 FROM project_needs n
                      WHERE n.workspace_id = $1 AND n.account_id = a.id AND n.archived_at IS NULL
                        AND (n.title ILIKE ANY(${t}) OR COALESCE(n.expertise,'') ILIKE ANY(${t})
                             OR EXISTS (SELECT 1 FROM jsonb_array_elements(n.skills) s
                                         WHERE jsonb_typeof(n.skills) = 'array'
                                           AND COALESCE(s->>'term','') ILIKE ANY(${t}))
                             OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.stack) k
                                         WHERE jsonb_typeof(n.stack) = 'array' AND k ILIKE ANY(${t})))))`,
      )
    }
    const places = placePatterns(criteria)
    if (places.length > 0) {
      const l = p(places)
      where.push(`(COALESCE(a.headquarters,'') ILIKE ANY(${l}) OR COALESCE(a.address,'') ILIKE ANY(${l}))`)
    }
    // `last_analyzed_at` n'est PAS une colonne d'`accounts` : c'est la dernière analyse
    // terminée, lue dans `analysis_runs` (même définition que `resolveLastAnalyzedByAccount`).
    const collectedAt = `COALESCE((SELECT MAX(r.completed_at) FROM analysis_runs r
                                    WHERE r.account_id = a.id AND r.status = 'completed'
                                      AND r.completed_at IS NOT NULL), a.created_at)`
    const { from, to } = periodBounds(criteria)
    if (from) where.push(`${collectedAt} >= ${p(from)}::timestamptz`)
    if (to) where.push(`${collectedAt} <= ${p(to)}::timestamptz`)

    const rows = await this.accounts.manager.query<AccountSqlRow[]>(
      `SELECT m.*, (COUNT(*) OVER ())::int AS total FROM (
         SELECT a.id, a.company_name, a.sector,
                NULLIF(COALESCE(NULLIF(a.headquarters,''), NULLIF(a.address,'')),'') AS place,
                a.siren, a.business_unit_id,
                ${collectedAt} AS collected_at
           FROM accounts a
          WHERE ${where.join(' AND ')}
       ) m
       ORDER BY m.collected_at DESC NULLS LAST, m.id
       LIMIT ${p(criteria.limit)} OFFSET ${p(criteria.offset)}`,
      params,
    )
    return this.page(rows, criteria, (row): BaseReaderAccountRow => ({
      source: 'account_record',
      collectedAt: isoOrNull(row.collected_at),
      accountId: row.id,
      companyName: String(row.company_name ?? '').trim(),
      sector: this.nullIfBlank(row.sector),
      place: this.nullIfBlank(row.place),
      siren: this.nullIfBlank(row.siren),
      businessUnitId: row.business_unit_id ?? null,
    }))
  }

  /**
   * Les BESOINS qui correspondent — DEUX natures sous une seule famille, jamais confondues : les besoins
   * ENREGISTRÉS de l'espace (`project_needs`) et les offres COLLECTÉES historisées pour un compte
   * (`signal_history`, nature recrutement). Chaque ligne dit laquelle elle est (`source`).
   *
   * ⚠️ LE LIEU. Un besoin enregistré porte le sien (`location`) : c'est lui qu'on rapproche. Une ligne
   * d'historique n'en porte AUCUN : on rapproche alors le lieu du COMPTE (son siège), et la ligne rend
   * ce lieu-là — l'attribuer au besoin sans le dire serait une donnée inventée.
   *
   * ⚠️ `signal_history.workspace_id` est nullable (lignes antérieures à la colonne) : la borne qui tient
   * est celle du COMPTE, posée dans la jointure. Un `h.workspace_id` nul ne traverse donc aucun espace,
   * et la comparaison reste FRANCHE — jamais un `&&` qui s'effondre (GA-380).
   */
  private async readNeeds(
    scope: BaseReaderScope,
    criteria: BaseReaderCriteria,
  ): Promise<BaseReaderPage<BaseReaderNeedRow>> {
    const params: unknown[] = [scope.workspaceId]
    const p = (value: unknown): string => `$${params.push(value)}`
    const deleted = p(DELETED_ACCOUNT_STATUS)
    // #4793.3 — jamais de paramètre poussé sans être référencé (voir `buIdsExpression`).
    const bu = businessUnitScopeClause(scope.businessUnitScope, 'a.business_unit_id', this.buIdsExpression(scope, p))
    const accountFilter = criteria.accountIds.length > 0 ? `a.id = ANY(${p(criteria.accountIds)}::uuid[])` : null
    const terms = termPatterns(criteria)
    const t = terms.length > 0 ? p(terms) : null
    const places = placePatterns(criteria)
    const l = places.length > 0 ? p(places) : null
    const { from, to } = periodBounds(criteria)
    const fromAt = from ? p(from) : null
    const toAt = to ? p(to) : null

    const common = [`a.workspace_id = $1`, `a.status <> ${deleted}`]
    if (bu) common.push(bu)
    if (accountFilter) common.push(accountFilter)
    if (criteria.excludeEsn) common.push(notEsnAccountClause('a'))

    const needWhere = [...common, `n.workspace_id = $1`, `n.archived_at IS NULL`]
    if (t) {
      needWhere.push(
        `(n.title ILIKE ANY(${t}) OR COALESCE(n.expertise,'') ILIKE ANY(${t})
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(n.skills) s
                      WHERE jsonb_typeof(n.skills) = 'array' AND COALESCE(s->>'term','') ILIKE ANY(${t}))
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.stack) k
                      WHERE jsonb_typeof(n.stack) = 'array' AND k ILIKE ANY(${t})))`,
      )
    }
    if (l) needWhere.push(`COALESCE(n.location,'') ILIKE ANY(${l})`)
    if (fromAt) needWhere.push(`COALESCE(n.detected_at, n.created_at) >= ${fromAt}::timestamptz`)
    if (toAt) needWhere.push(`COALESCE(n.detected_at, n.created_at) <= ${toAt}::timestamptz`)

    const offerWhere = [
      ...common,
      `(h.workspace_id IS NULL OR h.workspace_id = $1)`,
      `h.signal_type = ${p(RECRUITMENT_SIGNAL_TYPE)}`,
    ]
    if (t) offerWhere.push(`h.label ILIKE ANY(${t})`)
    if (l) offerWhere.push(`(COALESCE(a.headquarters,'') ILIKE ANY(${l}) OR COALESCE(a.address,'') ILIKE ANY(${l}))`)
    if (fromAt) offerWhere.push(`h.first_detected_at >= ${fromAt}::timestamptz`)
    if (toAt) offerWhere.push(`h.first_detected_at <= ${toAt}::timestamptz`)

    const rows = await this.accounts.manager.query<NeedSqlRow[]>(
      `SELECT m.*, (COUNT(*) OVER ())::int AS total FROM (
         SELECT n.id AS need_id, n.account_id, a.company_name AS account_name, n.title,
                CASE WHEN jsonb_typeof(n.skills) = 'array'
                     THEN COALESCE((SELECT array_agg(s->>'term') FROM jsonb_array_elements(n.skills) s
                                     WHERE COALESCE(s->>'term','') <> ''), '{}')
                     ELSE '{}' END AS skills,
                NULLIF(COALESCE(n.location,''),'') AS place, n.status,
                'registered_need' AS source,
                COALESCE(n.detected_at, n.created_at) AS collected_at
           FROM project_needs n
           JOIN accounts a ON a.id = n.account_id
          WHERE ${needWhere.join(' AND ')}
         UNION ALL
         SELECT NULL::uuid AS need_id, h.account_id, a.company_name AS account_name, h.label AS title,
                '{}'::text[] AS skills,
                NULLIF(COALESCE(NULLIF(a.headquarters,''), NULLIF(a.address,'')),'') AS place,
                NULL::text AS status,
                'collected_offer' AS source,
                h.first_detected_at AS collected_at
           FROM signal_history h
           JOIN accounts a ON a.id = h.account_id
          WHERE ${offerWhere.join(' AND ')}
       ) m
       ORDER BY m.collected_at DESC NULLS LAST, m.account_id, m.need_id NULLS LAST
       LIMIT ${p(criteria.limit)} OFFSET ${p(criteria.offset)}`,
      params,
    )
    return this.page(rows, criteria, (row): BaseReaderNeedRow => ({
      source: row.source === 'collected_offer' ? 'collected_offer' : 'registered_need',
      collectedAt: isoOrNull(row.collected_at),
      needId: row.need_id ?? null,
      accountId: row.account_id,
      accountName: this.nullIfBlank(row.account_name),
      title: String(row.title ?? '').trim(),
      skills: textArray(row.skills),
      place: this.nullIfBlank(row.place),
      status: this.nullIfBlank(row.status),
    }))
  }

  /**
   * Les CONSULTANTS qui correspondent — par leur fiche (intitulé, compétences, environnements, outils)
   * ou par une EXPÉRIENCE déclarée sur un CV autorisé (rôle, technologies).
   *
   * ⚠️ La jointure sur les expériences n'est posée QUE si un terme est demandé. Sans terme, elle
   * joindrait toutes les expériences de chaque fiche et la ligne se dirait « correspond par une
   * expérience » alors que rien n'a été rapproché.
   *
   * ⚠️ Le consentement et l'archivage bornent la lecture, comme ils bornent déjà
   * `findByExperienceClient` : une fiche archivée, sans consentement ou expiré ne fait aucune ligne ;
   * une expérience dont le client est masqué n'en fait aucune.
   */
  private async readConsultants(
    scope: BaseReaderScope,
    criteria: BaseReaderCriteria,
  ): Promise<BaseReaderPage<BaseReaderConsultantRow>> {
    const params: unknown[] = [scope.workspaceId]
    const p = (value: unknown): string => `$${params.push(value)}`
    const terms = termPatterns(criteria)
    const t = terms.length > 0 ? p(terms) : null
    const places = placePatterns(criteria)
    const l = places.length > 0 ? p(places) : null
    const { from, to } = periodBounds(criteria)

    const where = [
      `c.workspace_id = $1`,
      `c.archived_at IS NULL`,
      `c.consent_given_at IS NOT NULL`,
      `(c.consent_expires_at IS NULL OR c.consent_expires_at > now())`,
    ]
    if (t) {
      where.push(
        `(COALESCE(c.title,'') ILIKE ANY(${t})
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(c.stack,'{}')) v WHERE v ILIKE ANY(${t}))
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(c.environments,'{}')) v WHERE v ILIKE ANY(${t}))
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(c.tools,'{}')) v WHERE v ILIKE ANY(${t}))
          OR e.id IS NOT NULL)`,
      )
    }
    // ⚠️ LE LIEU D'UNE MISSION RÉALISÉE — « qui a bossé à Lille ? ». Les expériences de CV ne portent
    // AUCUN lieu en base ; les MISSIONS, si (`mission_assignments.work_location`, puis
    // `missions.location`). La jointure latérale rend le lieu de la mission la plus récente qui
    // correspond, pour que la ligne DISE d'où vient le rapprochement : une mobilité déclarée n'est pas
    // une mission faite, et les confondre serait une donnée inventée.
    //
    // ⚠️ `mission_assignments.workspace_id` est nullable (lignes antérieures à la colonne) : la borne
    // qui tient est celle de la MISSION, posée dans la jointure — la comparaison reste FRANCHE.
    const missionPlace = l
      ? `LEFT JOIN LATERAL (
           SELECT NULLIF(COALESCE(NULLIF(ma.work_location,''), NULLIF(mi.location,'')),'') AS place
             FROM mission_assignments ma
             JOIN missions mi ON mi.id = ma.mission_id AND mi.workspace_id = $1
            WHERE ma.consultant_id = c.id AND (ma.workspace_id IS NULL OR ma.workspace_id = $1)
              AND (COALESCE(ma.work_location,'') ILIKE ANY(${l}) OR COALESCE(mi.location,'') ILIKE ANY(${l}))
            ORDER BY ma.starts_on DESC NULLS LAST
            LIMIT 1
         ) mp ON true`
      : ''
    if (l) {
      // ⚠️ DEUX formes, et les deux comptent. `c.location` est une PHRASE : un `ILIKE` la rapproche.
      // `zones` / `mobility_zones` sont des LISTES de jetons, où un département s'écrit « 69 » tout
      // court — le motif parenthésé ne le rapprocherait jamais, et un `%69%` nu rapprocherait « 169 ».
      // Le jeton se compare donc à l'ÉGAL (`placeCodes`), EN PLUS du rapprochement en clair.
      const codes = p(placeCodes(criteria))
      where.push(
        `(COALESCE(c.location,'') ILIKE ANY(${l})
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(c.zones,'{}')) z
                      WHERE z ILIKE ANY(${l}) OR upper(z) = ANY(${codes}))
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(c.mobility_zones,'{}')) z
                      WHERE z ILIKE ANY(${l}) OR upper(z) = ANY(${codes}))
          OR mp.place IS NOT NULL)`,
      )
    }
    const collectedAt = t ? `COALESCE(e.created_at, c.created_at)` : `c.created_at`
    if (from) where.push(`${collectedAt} >= ${p(from)}::timestamptz`)
    if (to) where.push(`${collectedAt} <= ${p(to)}::timestamptz`)

    const join = t
      ? `LEFT JOIN consultant_experiences e
             ON e.consultant_id = c.id AND e.workspace_id = $1 AND e.client_masked = false
            AND (COALESCE(e.role,'') ILIKE ANY(${t})
                 OR EXISTS (SELECT 1 FROM unnest(COALESCE(e.technologies,'{}')) v WHERE v ILIKE ANY(${t})))`
      : ''
    const experience = t
      ? `CASE WHEN e.id IS NULL THEN 'consultant_record' ELSE 'consultant_experience' END AS source,
         COALESCE(e.client_final, e.entreprise) AS experience_client, e.role AS experience_role,
         e.date_debut AS experience_from, e.date_fin AS experience_to`
      : `'consultant_record' AS source, NULL::text AS experience_client, NULL::text AS experience_role,
         NULL::text AS experience_from, NULL::text AS experience_to`

    const rows = await this.accounts.manager.query<ConsultantSqlRow[]>(
      `SELECT m.*, (COUNT(*) OVER ())::int AS total FROM (
         SELECT DISTINCT ON (c.id) c.id, c.full_name, c.title,
                NULLIF(COALESCE(c.location,''),'') AS place,
                COALESCE(c.zones,'{}') || COALESCE(c.mobility_zones,'{}') AS zones,
                COALESCE(c.stack,'{}') AS skills,
                ${experience},
                ${l ? 'mp.place' : 'NULL::text'} AS mission_place,
                ${collectedAt} AS collected_at
           FROM consultants c
           ${join}
           ${missionPlace}
          WHERE ${where.join(' AND ')}
          ORDER BY c.id, ${collectedAt} DESC NULLS LAST
       ) m
       ORDER BY m.collected_at DESC NULLS LAST, m.id
       LIMIT ${p(criteria.limit)} OFFSET ${p(criteria.offset)}`,
      params,
    )
    return this.page(rows, criteria, (row): BaseReaderConsultantRow => ({
      source: row.source === 'consultant_experience' ? 'consultant_experience' : 'consultant_record',
      collectedAt: isoOrNull(row.collected_at),
      consultantId: row.id,
      fullName: this.nullIfBlank(row.full_name),
      title: this.nullIfBlank(row.title),
      place: this.nullIfBlank(row.place),
      zones: textArray(row.zones),
      skills: textArray(row.skills),
      missionPlace: this.nullIfBlank(row.mission_place),
      experience:
        row.source === 'consultant_experience'
          ? {
              client: this.nullIfBlank(row.experience_client),
              role: this.nullIfBlank(row.experience_role),
              from: this.nullIfBlank(row.experience_from),
              to: this.nullIfBlank(row.experience_to),
            }
          : null,
    }))
  }

  /**
   * `total` vient de la fenêtre `COUNT(*) OVER ()` de la requête, jamais de `rows.length` : une page
   * pleine ne dit rien du volume, et c'est tout l'enjeu d'une pagination vraie. Aucune ligne rendue ⇒
   * `total: 0` MESURÉ (la requête a tourné), pas un « non mesuré » déguisé.
   */
  private page<Sql extends { total: number | string }, Row>(
    rows: Sql[],
    criteria: BaseReaderCriteria,
    project: (row: Sql) => Row,
  ): BaseReaderPage<Row> {
    const list = rows ?? []
    const total = list.length > 0 ? Number(list[0]?.total ?? 0) : 0
    return {
      total: Number.isFinite(total) ? total : 0,
      offset: criteria.offset,
      limit: criteria.limit,
      hasMore: criteria.offset + list.length < total,
      rows: list.map(project),
    }
  }

  /** #4793.3 — l'expression des ids de BU, qui ne pousse son paramètre QUE si la clause en a besoin. */
  private buIdsExpression(scope: BaseReaderScope, p: (value: unknown) => string): string {
    const ids = this.buIds(scope)
    return ids.length === 0 ? 'SELECT NULL::uuid WHERE false' : `SELECT unnest(${p(ids)}::uuid[])`
  }

  /** `[]` est une réponse (« il ne porte aucun périmètre »), pas une absence de filtre. */
  private buIds(scope: BaseReaderScope): string[] {
    return [...(scope.businessUnitScope?.businessUnitIds ?? [])]
  }

  /** Une chaîne vide n'est pas une valeur : elle devient `null` (GA-18 / GA-19). */
  private nullIfBlank(value: string | null | undefined): string | null {
    const clean = String(value ?? '').trim()
    return clean.length > 0 ? clean : null
  }
}
