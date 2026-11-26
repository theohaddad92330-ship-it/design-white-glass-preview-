import type { Repository } from 'typeorm'
import {
  EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY,
  sharedExternalSourcingSkills,
  type ExternalSourcingCandidate,
  type ExternalSourcingLimitCode,
  type ExternalSourcingSourceKind,
} from '@bellum/contracts'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'

/**
 * Le PORT (#2818) — voir le docblock de `external-sourcing.ts`
 * (`@bellum/contracts`) pour la décision produit complète : pourquoi ces trois
 * sources, jamais un scraping, jamais une structure devinée.
 *
 * Chaque implémentation sait interroger UNE source déjà branchée de l'espace,
 * ou dit honnêtement qu'elle ne l'est pas (`configured: false` →
 * `search()` n'est jamais appelée, voir `ExternalSourcingService.search`).
 * Un futur fournisseur externe VÉRIFIABLE en ajouterait une quatrième
 * implémentation, sans toucher aux trois premières.
 */
type ExternalSourcingProviderKey = ExternalSourcingSourceKind | typeof EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY

type ExternalSourcingCriteria = {
  workspaceId: string
  needId: string
  /** Les termes TELS QUE le besoin les porte — la casse d'affichage vient
   *  d'eux, jamais du candidat (voir `sharedExternalSourcingSkills`). */
  needSkillTerms: readonly string[]
  /** #2190.12 (RESTE devenu réglable, lot du 28/09) — déjà résolu et borné par
   *  `resolveExternalSourcingVolume` (`ExternalSourcingService.search`) : ce
   *  port reçoit une valeur prête à consommer, jamais une entrée brute. */
  maxPerSource: number
}

export interface ExternalSourcingProvider {
  readonly key: ExternalSourcingProviderKey
  /** `false` = le contrat de cette source n'est pas vérifiable aujourd'hui —
   *  `search` n'est JAMAIS appelée, zéro appel réseau, jamais un zéro inventé. */
  readonly configured: boolean
  search(criteria: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]>
}

type CandidateRow = { id: string; full_name: string | null; title: string | null; skills: string[] | null }

/** Une ligne SQL crue → un candidat de la forme partagée — même geste pour les
 *  trois sources internes, seule la requête change. */
function toCandidate(
  row: CandidateRow,
  sourceKind: ExternalSourcingSourceKind,
  needSkillTerms: readonly string[],
  limits: readonly ExternalSourcingLimitCode[],
): ExternalSourcingCandidate {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    sourceKind,
    sharedSkills: sharedExternalSourcingSkills(needSkillTerms, row.skills ?? []),
    limits: [...limits],
  }
}

/**
 * `network_referral` — #2190.3 (lot P07 30/09) : LES RECOMMANDATIONS ET LE
 * RÉSEAU, première source dans l'ordre de l'écran. Une fiche NON ENCORE RELUE
 * (`review_status = 'needs_review'`, hors banc partenaire) dont `consultants.source`
 * dit que le réseau l'a apportée : cooptation, recommandation, parrainage,
 * referral. Le signal existe déjà — il est saisi à la création de la fiche — et
 * rien n'est deviné : sans `source` de ce type, aucune ligne. Les deux sources
 * voisines (`inbound_candidacy`, `csv_ats_import`) EXCLUENT ces fiches : une même
 * personne n'apparaît jamais deux fois.
 */
export class NetworkReferralSourcingProvider implements ExternalSourcingProvider {
  readonly key = 'network_referral' as const
  readonly configured = true

  constructor(private readonly consultants: Repository<ConsultantEntity>) {}

  async search({
    workspaceId,
    needId,
    needSkillTerms,
    maxPerSource,
  }: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]> {
    const lowerTerms = needSkillTerms.map(term => term.trim().toLowerCase()).filter(term => term.length > 0)
    if (lowerTerms.length === 0) return []
    const rows = await this.consultants.manager.query<CandidateRow[]>(
      `
      SELECT c.id, c.full_name, c.title,
             COALESCE((SELECT array_agg(cs.skill) FROM consultant_skills cs WHERE cs.consultant_id = c.id), ARRAY[]::text[]) AS skills
        FROM consultants c
       WHERE c.workspace_id = $1 AND c.archived_at IS NULL
         AND c.review_status = 'needs_review'
         AND LOWER(COALESCE(c.source, '')) ~ '(cooptation|recommandation|parrainage|referral)'
         AND NOT (c.engagement_kind = 'sous_traitance' AND c.partner_account_id IS NOT NULL)
         AND EXISTS (SELECT 1 FROM consultant_skills cs WHERE cs.consultant_id = c.id AND LOWER(cs.skill) = ANY($2::text[]))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id AND s.need_id = $3)
       ORDER BY c.full_name
       LIMIT $4
      `,
      [workspaceId, lowerTerms, needId, maxPerSource],
    )
    return rows.map(row => toCandidate(row, this.key, needSkillTerms, ['not_yet_qualified']))
  }
}

/**
 * `partner_bench` — un consultant du vivier engagé en SOUS-TRAITANCE pour un
 * partenaire (`engagement_kind = 'sous_traitance'` ET `partner_account_id`
 * posé) : le banc d'un partenaire, pas le vôtre. Exclut les candidatures
 * (`kind = 'candidate'`) : ce ne sont pas les mêmes personnes.
 */
export class PartnerBenchSourcingProvider implements ExternalSourcingProvider {
  readonly key = 'partner_bench' as const
  readonly configured = true

  constructor(private readonly consultants: Repository<ConsultantEntity>) {}

  async search({
    workspaceId,
    needId,
    needSkillTerms,
    maxPerSource,
  }: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]> {
    const lowerTerms = needSkillTerms.map(term => term.trim().toLowerCase()).filter(term => term.length > 0)
    if (lowerTerms.length === 0) return []
    const rows = await this.consultants.manager.query<CandidateRow[]>(
      `
      SELECT c.id, c.full_name, c.title,
             COALESCE((SELECT array_agg(cs.skill) FROM consultant_skills cs WHERE cs.consultant_id = c.id), ARRAY[]::text[]) AS skills
        FROM consultants c
       WHERE c.workspace_id = $1 AND c.archived_at IS NULL
         AND c.kind = 'consultant'
         AND c.engagement_kind = 'sous_traitance' AND c.partner_account_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM consultant_skills cs WHERE cs.consultant_id = c.id AND LOWER(cs.skill) = ANY($2::text[]))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id AND s.need_id = $3)
       ORDER BY c.full_name
       LIMIT $4
      `,
      [workspaceId, lowerTerms, needId, maxPerSource],
    )
    return rows.map(row => toCandidate(row, this.key, needSkillTerms, ['partner_availability_unconfirmed']))
  }
}

/**
 * `inbound_candidacy` — une candidature entrante non encore qualifiée
 * (`kind = 'candidate'`) : une personne, pas encore le vivier.
 */
export class InboundCandidacySourcingProvider implements ExternalSourcingProvider {
  readonly key = 'inbound_candidacy' as const
  readonly configured = true

  constructor(private readonly consultants: Repository<ConsultantEntity>) {}

  async search({
    workspaceId,
    needId,
    needSkillTerms,
    maxPerSource,
  }: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]> {
    const lowerTerms = needSkillTerms.map(term => term.trim().toLowerCase()).filter(term => term.length > 0)
    if (lowerTerms.length === 0) return []
    const rows = await this.consultants.manager.query<CandidateRow[]>(
      `
      SELECT c.id, c.full_name, c.title,
             COALESCE((SELECT array_agg(cs.skill) FROM consultant_skills cs WHERE cs.consultant_id = c.id), ARRAY[]::text[]) AS skills
        FROM consultants c
       WHERE c.workspace_id = $1 AND c.archived_at IS NULL
         AND c.kind = 'candidate'
         AND COALESCE(LOWER(c.source), '') !~ '(cooptation|recommandation|parrainage|referral)'
         AND EXISTS (SELECT 1 FROM consultant_skills cs WHERE cs.consultant_id = c.id AND LOWER(cs.skill) = ANY($2::text[]))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id AND s.need_id = $3)
       ORDER BY c.full_name
       LIMIT $4
      `,
      [workspaceId, lowerTerms, needId, maxPerSource],
    )
    return rows.map(row => toCandidate(row, this.key, needSkillTerms, ['not_yet_qualified']))
  }
}

/**
 * `csv_ats_import` — une fiche née d'un import CSV/ATS/CV, jamais relue
 * (`kind = 'consultant'`, `review_status = 'needs_review'`, `source` posé) :
 * brute, pas encore le vivier qualifié. Exclut le banc partenaire ci-dessus :
 * une même fiche n'apparaît jamais dans deux sources à la fois.
 */
export class CsvAtsImportSourcingProvider implements ExternalSourcingProvider {
  readonly key = 'csv_ats_import' as const
  readonly configured = true

  constructor(private readonly consultants: Repository<ConsultantEntity>) {}

  async search({
    workspaceId,
    needId,
    needSkillTerms,
    maxPerSource,
  }: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]> {
    const lowerTerms = needSkillTerms.map(term => term.trim().toLowerCase()).filter(term => term.length > 0)
    if (lowerTerms.length === 0) return []
    const rows = await this.consultants.manager.query<CandidateRow[]>(
      `
      SELECT c.id, c.full_name, c.title,
             COALESCE((SELECT array_agg(cs.skill) FROM consultant_skills cs WHERE cs.consultant_id = c.id), ARRAY[]::text[]) AS skills
        FROM consultants c
       WHERE c.workspace_id = $1 AND c.archived_at IS NULL
         AND c.kind = 'consultant' AND c.review_status = 'needs_review' AND c.source IS NOT NULL
         AND LOWER(c.source) !~ '(cooptation|recommandation|parrainage|referral)'
         AND NOT (c.engagement_kind = 'sous_traitance' AND c.partner_account_id IS NOT NULL)
         AND EXISTS (SELECT 1 FROM consultant_skills cs WHERE cs.consultant_id = c.id AND LOWER(cs.skill) = ANY($2::text[]))
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id AND s.need_id = $3)
       ORDER BY c.full_name
       LIMIT $4
      `,
      [workspaceId, lowerTerms, needId, maxPerSource],
    )
    return rows.map(row => toCandidate(row, this.key, needSkillTerms, ['not_yet_qualified']))
  }
}

/**
 * `external_directory` — #2190.5 / #2190.7 (décision Louis 02/10 : « Apollo people
 * search, déjà dans la stack, contrat vérifiable »). L'annuaire externe de
 * profils, derrière la clé d'espace `APOLLO_API_KEY` déjà posée pour
 * l'enrichissement de contacts (`agent_docs/env-reference.md`).
 *
 * - **Sans clé = no-op STRICT** : `configured` est faux, `search` n'est jamais
 *   appelée par le service, et si elle l'était elle rendrait `[]` SANS appel
 *   réseau (testé).
 * - **Contrat** : `POST /api/v1/mixed_people/api_search`, en-tête `x-api-key`,
 *   corps `{ q_keywords, page: 1, per_page }` — celui que le service IA emploie
 *   et que son test de contrat sonde (`apps/ia/app/services/apollo.py`). La
 *   réponse porte `people[]` ; une réponse sans cette liste est une ERREUR, pas
 *   un « zéro profil ».
 * - **`res.ok` vérifié, timeout = `unknown`** : un délai dépassé lève une erreur
 *   dont le message porte « timeout » — le service la nomme `unanswered` et le
 *   lot asynchrone la classe `unknown` (`multi-source-search.service.ts`) : « pas
 *   de réponse » n'est pas « personne », et rien ne relance en boucle.
 * - **Profils : nom, poste, compétences.** La source ne fournit PAS de
 *   compétences structurées : sont « partagées » les seules compétences du besoin
 *   qu'on LIT dans le poste/titre affiché (égalité de mot, jamais une
 *   sous-chaîne), et la limite `skills_not_provided` le dit sur chaque ligne.
 *   Le nom de famille masqué par la source reste une initiale — jamais deviné.
 * - **Le fournisseur ne se nomme JAMAIS** : ni dans la clé de source, ni dans un
 *   libellé, ni dans la charge utile qui part vers l'écran.
 */
const EXTERNAL_DIRECTORY_URL = 'https://api.apollo.io/api/v1/mixed_people/api_search'
const EXTERNAL_DIRECTORY_TIMEOUT_MS = 8000

export class ExternalDirectoryUnreachableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExternalDirectoryUnreachableError'
  }
}

type DirectoryPerson = {
  id?: unknown
  first_name?: unknown
  last_name?: unknown
  last_name_obfuscated?: unknown
  title?: unknown
  headline?: unknown
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function directoryFullName(person: DirectoryPerson): string | null {
  const first = asText(person.first_name)
  const last = asText(person.last_name)
  // Nom masqué à la source ("Du***t") : l'initiale publiée, point final.
  const initial = asText(person.last_name_obfuscated).charAt(0)
  const surname = last || (initial ? `${initial.toUpperCase()}.` : '')
  return [first, surname].filter(part => part.length > 0).join(' ') || null
}

function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}+#.]+/u)
      .map(word => word.replace(/^\.+|\.+$/g, ''))
      .filter(word => word.length > 0),
  )
}

export class ExternalDirectoryProvider implements ExternalSourcingProvider {
  readonly key = EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY
  readonly configured: boolean
  private readonly apiKey: string

  constructor(
    apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey.trim()
    this.configured = this.apiKey.length > 0
  }

  async search({ needSkillTerms, maxPerSource }: ExternalSourcingCriteria): Promise<ExternalSourcingCandidate[]> {
    if (!this.configured) return []
    const terms = needSkillTerms.map(term => term.trim()).filter(term => term.length > 0)
    if (terms.length === 0) return []

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EXTERNAL_DIRECTORY_TIMEOUT_MS)
    let body: unknown
    try {
      const res = await this.fetchFn(EXTERNAL_DIRECTORY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({ q_keywords: terms.join(' '), page: 1, per_page: maxPerSource }),
        signal: controller.signal,
      })
      if (!res.ok) throw new ExternalDirectoryUnreachableError(`Annuaire externe : réponse ${res.status}`)
      body = await res.json()
    } catch (error) {
      if (error instanceof ExternalDirectoryUnreachableError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalDirectoryUnreachableError('Annuaire externe : timeout, aucune réponse observée')
      }
      throw new ExternalDirectoryUnreachableError('Annuaire externe : réponse illisible ou injoignable')
    } finally {
      clearTimeout(timer)
    }

    const people = (body as { people?: unknown } | null)?.people
    if (!Array.isArray(people))
      throw new ExternalDirectoryUnreachableError('Annuaire externe : réponse sans liste de profils')

    const candidates: ExternalSourcingCandidate[] = []
    for (const person of people as DirectoryPerson[]) {
      const id = asText(person?.id)
      if (!id) continue
      const title = asText(person.title) || null
      const words = wordsOf([title ?? '', asText(person.headline)].join(' '))
      candidates.push({
        id: `${EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY}:${id}`,
        fullName: directoryFullName(person),
        title,
        sourceKind: EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY,
        sharedSkills: needSkillTerms.filter(term => words.has(term.trim().toLowerCase())),
        limits: ['not_yet_qualified', 'skills_not_provided'],
      })
      if (candidates.length >= maxPerSource) break
    }
    return candidates
  }
}
