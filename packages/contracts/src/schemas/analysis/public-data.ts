import { z } from 'zod'
import { nullableNumber, nullableString } from './base.js'

/**
 * Factual "public data" sub-schemas embedded in ``Account.raw_analysis`` by the
 * FastAPI IA phase-1 collectors (Pappers financials, INPI beneficial owners,
 * BOAMP tenders, DECP awarded contracts, France Travail/APEC/WTTJ jobs, GitHub
 * org, tech-detect). Persisted verbatim through ``.passthrough()`` — these keys
 * were collected but never surfaced on the account detail page until this PR.
 *
 * Wire shape is canonical **snake_case**: the API persists ``raw_analysis`` via
 * ``toSnakeCaseKeys`` so every nested camelCase key from the IA (``publishedDate``,
 * ``contractType``, ``topLanguages``…) lands snake_case here. All fields are
 * tolerant (nullable/optional) so one malformed row never wipes the block.
 */

/** One year of Pappers financial history. */
export const financialYearSchema = z.object({
  year: nullableNumber,
  revenue: nullableNumber,
  net_result: nullableNumber,
  headcount: nullableNumber,
  /** #4744 — profondeur du compte ANALYSÉ (jamais la marge de l'ESN utilisatrice). Absent = non publié. */
  closing_date: nullableString,
  gross_margin: nullableNumber,
  ebitda: nullableNumber,
  operating_result: nullableNumber,
})
export type FinancialYear = z.infer<typeof financialYearSchema>

/** INPI RNE / Pappers beneficial owner (bénéficiaire effectif). */
export const beneficialOwnerSchema = z.object({
  name: nullableString,
  detention_part: nullableNumber,
  detention_vote: nullableNumber,
})
export type BeneficialOwner = z.infer<typeof beneficialOwnerSchema>

/** BOAMP open public tender (appel d'offres IT ouvert). */
export const publicTenderSchema = z.object({
  title: nullableString,
  buyer: nullableString,
  location: nullableString,
  department: nullableString,
  published_date: nullableString,
  deadline: nullableString,
  cpv: nullableString,
  url: nullableString,
})
export type PublicTender = z.infer<typeof publicTenderSchema>

/** DECP awarded IT contract (marché attribué — winner = concurrent en place). */
export const awardedContractSchema = z.object({
  title: nullableString,
  buyer: nullableString,
  winner: nullableString,
  amount: nullableNumber,
  location: nullableString,
  department: nullableString,
  notified_date: nullableString,
  cpv: nullableString,
  url: nullableString,
})
export type AwardedContract = z.infer<typeof awardedContractSchema>

/** Enriched IT job posting (France Travail / APEC / WTTJ, merged + deduped). */
export const jobSignalSchema = z.object({
  title: nullableString,
  location: nullableString,
  city: nullableString,
  department: nullableString,
  date: nullableString,
  contract_type: nullableString,
  experience: nullableString,
  salary: nullableString,
  rome_label: nullableString,
  company: nullableString,
  skills: z.array(z.string()).optional(),
  url: nullableString,
  source: nullableString,
  /** #2322.70 — le poste que la SOURCE signale en manque de candidats
   *  (France Travail `offresManqueCandidats`). Présent et `true` seulement
   *  quand la source le dit ; absent sinon — jamais déduit. Additif. */
  tension: z.boolean().optional(),
  /** #2322.70 — la famille de métier que le TITRE nomme (`job_family`), absente sinon. */
  role: z.string().optional(),
  /** #2322.70 — l'équipe que le texte nomme (« l'équipe X »), absente sinon. */
  team: z.string().optional(),
  /** #2322.70 — pourquoi l'offre est « en tension » : la source le dit, le texte le dit, ou la durée en ligne est mesurée. */
  tension_reason: z.enum(['source_flag', 'urgent_text', 'republished_text', 'online_long']).optional(),
  /** #2322.70 — jours en ligne mesurés, seulement avec `tension_reason: 'online_long'`. */
  tension_days: z.number().int().nonnegative().optional(),
})
export type JobSignal = z.infer<typeof jobSignalSchema>

/**
 * #3916 — annonce légale BODACC rattachée au SIREN du compte. Additif : tout
 * est optionnel (dossiers antérieurs, autres pays). `severity` est facultatif :
 * absent, l'écran la déduit du `type` (procédure collective ⇒ risque).
 */
export const legalSignalSchema = z.object({
  type: nullableString,
  /** #3916 — le type PRÉCIS (« modification survenue sur le capital »), quand l'annonce le porte. */
  precision: nullableString.optional(),
  label: nullableString,
  date: nullableString,
  tribunal: nullableString,
  url: nullableString,
  severity: z.enum(['risk', 'info']).optional(),
})
export type LegalSignal = z.infer<typeof legalSignalSchema>

/**
 * #4743.2 — un champ publié sur la page de MENTIONS LÉGALES du site du compte, tel que publié (raison sociale,
 * immatriculation, dirigeant, hébergeur…). Un champ que la page ne publie pas n'existe pas : jamais de valeur vide.
 */
export const siteLegalNoticeFieldSchema = z.object({
  field: z.string(),
  value: z.string(),
  sourceUrl: nullableString,
  detectedAt: nullableString,
})

/**
 * #3916.b — les annonces d'un registre public lues EN CONTINU pour le SIREN du
 * compte (`public_registry_announcements`, job `registry` de la veille) : TOUTES,
 * pas les 8 que l'analyse fige dans `legal_signals`. `kind` est le genre décidé
 * côté source (code de famille BODACC, ou `new_establishment` pour Sirene) —
 * une procédure collective y est un RISQUE, jamais une opportunité.
 */
export const REGISTRY_ANNOUNCEMENT_KINDS = [
  'collective_proceeding',
  'creation',
  'sale',
  'accounts_filing',
  'modification',
  'deregistration',
  'new_establishment',
  // #3921.2 — changement de dirigeant lu dans une annonce de modification BODACC, daté par la parution.
  'executive_change',
  // #3921 (décision Louis 13/10/2026) — une tranche d'effectif INSEE différente entre deux
  // relevés MESURÉS. Daté par notre jour d'observation (pas de date de fait dans la source) :
  // le libellé le DIT (« observé » — jamais « changé »), pour ne pas présenter une date de
  // lecture comme une date de fait (même refus que pour `executive_change`, lot W8).
  'headcount_change',
  // #3920.8 — un marché public ATTRIBUÉ, lu en continu pour le compte suivi (source `decp`, jamais
  // affichée dans les annonces légales : elle nourrit la veille, pas l'onglet).
  'award',
  // #3921.9 — fermeture d'un établissement, datée par le registre national des entreprises (`dateEffetFermeture`).
  'establishment_closure',
  // #3915.decp (décision Louis 16/10/2026) — le compte suivi est le TITULAIRE d'un marché public
  // attribué (lu par SIREN, jamais par le nom) ; `award` reste le compte ACHETEUR.
  'award_won',
  'other',
] as const
export const registryAnnouncementSchema = z.object({
  // #3915.decp — `decp` : un marché public attribué lu en continu par SIREN (genres `award` /
  // `award_won`). Jamais rendu dans les annonces légales : il va à la carte des marchés.
  // #3921.11 — `rne` : le registre national des entreprises (dirigeant, ouverture/fermeture d'établissement),
  // rendu dans les annonces légales comme les deux autres registres.
  source: z.enum(['bodacc', 'sirene', 'decp', 'rne']),
  kind: z.enum(REGISTRY_ANNOUNCEMENT_KINDS),
  /** Libellé de famille tel que la source l'écrit (« Ventes et cessions »). */
  type: z.string().nullable(),
  /** ISO `AAAA-MM-JJ` — toujours présent : une annonce non datée n'est pas écrite. */
  date: z.string(),
  url: z.string().nullable(),
  tribunal: z.string().nullable(),
  /** #3915.decp — la partie d'en face d'un marché attribué (le titulaire quand le compte achète,
   *  l'acheteur quand il remporte) ; `null` = non résolue, jamais devinée. Absent hors `decp`. */
  counterpart: z.string().nullable().optional(),
})
export type RegistryAnnouncement = z.infer<typeof registryAnnouncementSchema>

export const accountRegistryAnnouncementsSchema = z.object({
  announcements: z.array(registryAnnouncementSchema),
  /** Dernière lecture du registre pour ce SIREN — `null` = jamais lu en continu
   *  (la fiche n'a alors que ce que l'analyse a figé, et le DIT). */
  checkedAt: z.string().nullable(),
  /** Le plafond d'offset de la source a mordu : la liste n'est pas complète. */
  truncated: z.boolean(),
})
export type AccountRegistryAnnouncements = z.infer<typeof accountRegistryAnnouncementsSchema>

/** GitHub organisation engineering signal (anon-collectable, no key needed). */
export const githubSignalsSchema = z.object({
  org: nullableString,
  url: nullableString,
  public_repos: nullableNumber,
  top_languages: z.array(z.string()).optional(),
  active_recent_repos: nullableNumber,
  last_activity: nullableString,
})
export type GithubSignals = z.infer<typeof githubSignalsSchema>

/**
 * One dated XBRL fact from a US SEC 10-K (annual revenue / annual net income),
 * carried with its fiscal-period end and the 10-K filing date. ``val`` is the USD
 * amount recorded by the registrant — a real fact, never extrapolated.
 */
export const secFinancialFactSchema = z.object({
  end: nullableString, // fiscal-period end (YYYY-MM-DD)
  val: nullableNumber, // USD value
  filed: nullableString, // 10-K filing date (YYYY-MM-DD)
})
export type SecFinancialFact = z.infer<typeof secFinancialFactSchema>

/** One dated SEC/EDGAR full-text-search filing hit (sourced by the filing URL). */
export const secFilingSchema = z.object({
  form: nullableString, // e.g. "10-K", "8-K"
  date: nullableString, // filing date (YYYY-MM-DD)
  title: nullableString,
  url: nullableString, // public EDGAR Archives document URL
})
export type SecFiling = z.infer<typeof secFilingSchema>

/**
 * SEC/EDGAR (US) financial snapshot — persisted under
 * ``raw_analysis.us_sec_financials`` by the US country pack (``apps/ia``
 * ``country_packs/us.py``) for a resolved SEC registrant (a listed US company).
 *
 * Present-only, sourced, JAMAIS inventé: annual revenues + net income are recorded
 * XBRL 10-K facts (each dated by its filing), ``filing_url`` links the 10-K list on
 * EDGAR, ``filings`` are dated full-text-search hits. Absent (private US company /
 * non-US run / no XBRL facts) ⇒ the key is simply missing and the account block
 * hides itself. Canonical wire = snake_case (the API ``toSnakeCaseKeys`` pass).
 */
export const usSecFinancialsSchema = z.object({
  cik: nullableString, // Central Index Key (10-digit, SEC registrant pivot)
  filing_url: nullableString, // EDGAR 10-K filings list URL
  detail_url: nullableString, // EDGAR company detail page
  revenues: z.array(secFinancialFactSchema).optional(), // annual revenues, recent-first
  net_income: z.array(secFinancialFactSchema).optional(), // annual net income, recent-first
  shares_outstanding: secFinancialFactSchema.optional().nullable(),
  filings: z.array(secFilingSchema).optional(), // dated full-text-search filings
})
export type UsSecFinancials = z.infer<typeof usSecFinancialsSchema>

/**
 * #2291.2 (19/09/2026, complété lot R) — COMMENT CETTE ENTREPRISE
 * CONTRACTUALISE, OBSERVÉ (jamais déduit). Même forme que le contrat Découvrir
 * (``discoverContractModelSchema``, ``schemas/discover.ts``) — GA-26, un seul
 * endroit décide de la FORME de l'observation — mais snake_case ici, le wire
 * canonique de ``raw_analysis`` (l'API ``toSnakeCaseKeys`` snake chaque clé
 * camelCase de l'IA, y compris celles imbriquées : ``jobOffers`` →
 * ``job_offers``, ``fixedPrice`` → ``fixed_price``).
 *
 * Posée par la phase 1 (recherche) dès qu'elle passe sa phase de signaux —
 * TOUJOURS, même ``null`` (« cherché, rien d'attribuable ») : une clé ABSENTE
 * ne veut jamais dire « non observé », elle veut dire « analysé avant cette
 * capacité » (voir ``SEGMENT_CAPABILITY_EPOCH.signals``, ``segment-catchup.ts``).
 */
const contractModelCountSchema = z.number().int().nonnegative()
export const contractModelSchema = z.object({
  /** Jour du constat (ISO). */
  observed_at: z.string(),
  job_offers: z
    .object({
      source: z.string().min(1),
      total: z.number().int().positive(),
      counts: z.object({
        permanent: contractModelCountSchema,
        fixed_term: contractModelCountSchema,
        interim: contractModelCountSchema,
        freelance: contractModelCountSchema,
        other: contractModelCountSchema,
      }),
      since: z.string(),
      until: z.string(),
    })
    .nullable(),
  public_contracts: z
    .object({
      source: z.string().min(1),
      total: z.number().int().positive(),
      regie: contractModelCountSchema,
      fixed_price: contractModelCountSchema,
      since: z.string(),
      until: z.string(),
    })
    .nullable(),
})
export type ContractModel = z.infer<typeof contractModelSchema>
