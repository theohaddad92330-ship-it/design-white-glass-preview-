/**
 * Wire shapes for the payloads the IA service returns to the API service.
 *
 * Single canonical format: **camelCase**. The IA emits these via Pydantic
 * ``model_dump(by_alias=True)``; the API worker reads them and writes the
 * matching TypeORM entities. Any normalisation (Apollo's snake_case fields,
 * Pappers numeric values) happens inside the IA router so the wire format
 * stays narrow and predictable here.
 *
 * The new typed ``raw_analysis`` schemas live in ``./analysis/*`` and are
 * re-exported below — those are the source of truth for what the FastAPI
 * service persists. The ``Legacy*`` types here describe the minimal slice
 * the API worker consumes (it picks fields off ``researchData.data`` and
 * passes them to TypeORM); they intentionally stay flat + non-null so the
 * worker doesn't have to deal with partial Claude output.
 */

// Re-export the typed ``raw_analysis`` schema so consumers get one import path.
export * from './analysis/index.js'

export type LegacyItChallenge = {
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  esnOfferMatch: string
  timeframe: string
}

export type LegacyRecentSignal = {
  /** #2687 — l'identifiant du signal dans CETTE analyse (« s1 », « s2 »…), que
   *  `AnalysisResearchData.qualifiedHypotheses[].basedOnSignalIds` cite. Absent
   *  sur toute analyse antérieure au lien. */
  id?: string
  signal: string
  source: string
  type: string
  date: string
  salesImplication: string
  /** #3922 — le lien vérifiable de la source (pipeline), absent avant la capacité. */
  url?: string
  source_kind?: string
}

/**
 * #2687 — une hypothèse qualifiée sur le fil, telle que la phase 1 l'écrit
 * (`ResearchSignals.model_dump(by_alias=True)`).
 *
 * Déclarée ici pour la raison que ce fichier donne déjà à `scoreAxes` : le
 * pipeline l'écrit depuis #275, et un champ qu'on écrit sans le déclarer finit
 * par disparaître au premier refactor de la forme, sans que rien ne le signale.
 * Il a failli : personne ne pouvait le LIRE, faute d'être déclaré côté
 * `accountAnalysisShape`.
 */
export type AnalysisQualifiedHypothesis = {
  hypothesis: string
  /** Les signaux fondateurs EN PROSE — une reformulation, jamais une clé. */
  basedOnSignals?: string[]
  /** Les `recentSignals[].id` fondateurs — LE lien, et le seul. */
  basedOnSignalIds?: string[]
  /** Échelle de CONVERGENCE (1 signal → `a_verifier`, 3+ → `confirmee`), jamais
   *  une probabilité de signature. */
  confidence?: string
  esnAngle?: string
  firstAction?: string
}

export type AnalysisAttackAngle = {
  title: string
  description: string
  strategy: string
  // snake_case: the Phase-1 angle wire shape (see analysis/strategy.ts). The IA
  // serialises angles snake_case even though the rest of the research overlay is
  // camelCase — the worker reads this key verbatim off the raw research JSON.
  entry_contact_persona: string
}

/** One term of a group's reading grid (Théo) — see AccountVocabulary. */
export type AnalysisVocabularyTerm = {
  term: string
  kind: string
  meaning?: string
  commercialWhy?: string
  aliases?: string[]
  relatedEntity?: string
  truthStatus?: string
  sourceRefs?: string[]
}

export type AnalysisAccountVocabulary = {
  version: string
  terms: AnalysisVocabularyTerm[]
}

export type AnalysisResearchData = {
  sector: string
  employees: string
  revenue: string
  headquarters: string
  website: string
  subsidiaries: string[]
  itChallenges: LegacyItChallenge[]
  recentSignals: LegacyRecentSignal[]
  /**
   * #3219 (#190.2, lot P02 07/10) — le périmètre d'analyse DÉCLARÉ de CE run
   * (`AnalysisScopeMode` : groupe/business_unit/filiales/…, choisi par le
   * commercial avant de lancer, jamais déduit). Stampé par
   * `analysis.worker.ts` juste avant la persistance, pour que
   * `AccountsService.applyResearch` puisse journaliser la PORTÉE d'un
   * effectif collecté sous ce périmètre (`pipelineFieldScopeClaim`,
   * `ProvenanceService.commit`). Absent (run legacy, périmètre non choisi) ⇒
   * aucune portée journalisée, comportement inchangé.
   */
  scopeMode?: string | null
  /**
   * #2687 — les hypothèses qualifiées, et avec elles le SEUL angle ESN et la
   * seule première action rattachables à un signal.
   *
   * Optionnel : une analyse dont la phase 1 n'en a produit aucune n'a pas la
   * clé, et l'absence se lit « aucune hypothèse », jamais « aucun angle
   * possible ».
   */
  qualifiedHypotheses?: AnalysisQualifiedHypothesis[]
  priorityScore: number
  priorityJustification: string
  angles: AnalysisAttackAngle[]
  // The group's reading grid, promoted from raw_analysis into account_vocabulary.
  accountVocabulary?: AnalysisAccountVocabulary
  /**
   * Le score en cinq axes (recette finale §27-28), calculé par la phase 1 et
   * RECALCULÉ après une correction utilisateur (P1-10) sans rejouer le dossier.
   *
   * Déclaré ici plutôt qu'écrit à travers un cast : le pipeline le produit
   * déjà, et un champ qu'on écrit sans le déclarer finit par disparaître au
   * premier refactor de la forme, sans que rien ne le signale.
   *
   * Optionnel : un dossier antérieur à la feature n'en a pas, et l'absence se
   * lit « pas encore calculé », jamais « score nul ».
   */
  scoreAxes?: {
    axes: { axis: string; points: number; evidence: string; lever: string | null; limitedByData?: boolean }[]
    total: number
    max: number
    limitedByData: string[]
  }
  // Pappers SIREN (9-digit French company identifier). Carried through from
  // the Phase-1 research overlay so the API can persist it on the account and
  // key the per-company result cache (C1) on it. Optional because legacy
  // payloads / non-French companies may not carry one.
  siren?: string
  // Registry NAF/APE code of the root company (e.g. "62.01Z"). Persisted on the
  // account so the "comptes similaires" feature (Théo p.41) can find same-sector
  // companies by NAF proximity instead of a fuzzy sector-label text match.
  nafCode?: string
  // #2265.14 — le jugement `classify_actor_type` (apps/ia), calculé sur ce même
  // NAF au moment de la recherche Phase 1. Optionnel : un payload d'avant ce
  // lot, ou une recherche qui n'a pas résolu de NAF, ne le porte pas — le
  // compte reste alors NULL (silence), jamais un `false` deviné.
  actorType?: string
  isIntermediary?: boolean
  // Cross-border registry identity resolved by the run's country pack — the
  // non-FR analogue of ``siren`` (CIK US / corp id CA / UID CH / BCE BE / RCS
  // LU). ``registryId`` arrives in the pack's display form (e.g.
  // "CHE-105.944.452"); the API canonicalises it (registry-id.util.ts) before
  // persisting ``registry_id`` / ``registry_country`` and deduping the
  // workspace's canonical account on them. NEVER present on an FR run (the
  // pack is a strict no-op for FR) — the French payload stays byte-identical.
  registryId?: string
  registryCountry?: string
  // Derived logo URL (public logo CDN keyed on the website domain) — the
  // display fallback the IA has always emitted inside raw_analysis. The
  // persisted ``accounts.logo_url`` column only ever gets the REAL Apollo
  // ``apolloEnrichment.logoUrl``, never this derived one.
  companyLogoUrl?: string | null
  // Factual firmographics from Apollo Organizations Enrich (1 Apollo credit /
  // domain, 30-day cache IA-side). Absent when the key is missing, the domain
  // is unknown, or Apollo has no record — a missing field is MISSING, never
  // invented. Persisted as-is on ``accounts.apollo_enrichment``.
  apolloEnrichment?: AnalysisApolloOrgEnrichment
  // SEC/EDGAR (US) financial snapshot resolved by the US country pack — annual
  // revenues + net income (recorded XBRL 10-K facts, each dated by its filing),
  // CIK + 10-K filings link, dated full-text-search filings. camelCase on the
  // wire; the API ``toSnakeCaseKeys`` pass persists it under
  // ``raw_analysis.us_sec_financials`` (typed ``usSecFinancialsSchema``). NEVER
  // present on an FR run or a private US company — the payload stays byte-identical.
  usSecFinancials?: {
    cik?: string | null
    filingUrl?: string | null
    detailUrl?: string | null
    revenues?: Array<{ end?: string | null; val?: number | null; filed?: string | null }>
    netIncome?: Array<{ end?: string | null; val?: number | null; filed?: string | null }>
    sharesOutstanding?: { end?: string | null; val?: number | null; filed?: string | null } | null
    filings?: Array<{ form?: string | null; date?: string | null; title?: string | null; url?: string | null }>
  }
  /**
   * #2291.2 (lot R, 19/09/2026) — le modèle de contrat OBSERVÉ de la cible
   * (jamais déduit), calculé par la phase 1 dès qu'elle passe sa phase de
   * signaux, sur les offres d'emploi et les avis BOAMP déjà collectés (zéro
   * appel réseau de plus). Persisté sous ``raw_analysis.contract_model`` (le
   * pass ``toSnakeCaseKeys`` snake chaque clé, y compris imbriquée — voir
   * ``contractModelSchema`` dans ``./analysis/public-data.js``).
   *
   * TOUJOURS présent (jamais ``undefined``) sur une analyse qui a passé la
   * phase de signaux depuis cette capacité : ``null`` = cherché, rien
   * d'attribuable. Absent sur un dossier ANTÉRIEUR à cette capacité — c'est ce
   * que ``SEGMENT_CAPABILITY_EPOCH.signals`` (segment-catchup.ts) compare à
   * ``signals_collected_at`` pour cibler le rattrapage.
   */
  contractModel?: {
    observedAt: string
    jobOffers: {
      source: string
      total: number
      counts: { permanent: number; fixedTerm: number; interim: number; freelance: number; other: number }
      since: string
      until: string
    } | null
    publicContracts: {
      source: string
      total: number
      regie: number
      fixedPrice: number
      since: string
      until: string
    } | null
  } | null
}

/**
 * Factual subset of Apollo's `organizations/enrich` payload the pipeline
 * persists (camelCase mirror of ``apps/ia/app/services/apollo_org.py``).
 * Every field is optional: Apollo omits what it doesn't know and so do we.
 */
export type AnalysisApolloOrgEnrichment = {
  /**
   * Apollo's own organization id (the `id` on the enriched org). Persisted so a
   * later per-contact enrichment can scope Apollo People-Search by
   * `organization_ids` — the strongest, unambiguous org filter (vs. fuzzy name
   * matching on a messy entity label). Absent on legacy rows enriched before this
   * field existed — the enrich path then degrades to domain, then canonical name.
   */
  organizationId?: string
  /** Registrable domain the enrichment was keyed on (e.g. "vinci.com"). */
  domain?: string
  logoUrl?: string
  estimatedNumEmployees?: number
  industry?: string
  foundedYear?: number
  linkedinUrl?: string
  twitterUrl?: string
  /** Apollo's pre-printed funding total (e.g. "$1.2B") — kept verbatim. */
  totalFundingPrinted?: string
  latestFundingStage?: string
  /** #3917.a — date (YYYY-MM-DD) of the latest round. Without it the funding total
   *  and stage are withdrawn: an undated round is never shown as if it were recent. */
  latestFundingRoundDate?: string
  /** Numeric annual revenue, alongside {@link annualRevenuePrinted}. Needed to
   *  CONFRONT Apollo with the figure filed at the registry (#818): "$1.2B" can't
   *  be compared to a filed amount. Absent at Apollo ⇒ absent here ⇒ no gap is
   *  computed. */
  annualRevenue?: number
  annualRevenuePrinted?: string
  /** Technology names Apollo detected on the org (bounded list). */
  technologies?: string[]
  // ── Extra factual fields from the SAME organizations/enrich call (no extra
  //    Apollo credit). Every field optional — Apollo omits what it doesn't know
  //    and so do we (present-only, never invented).
  /** Company blurb (short_description, else seo_description). */
  shortDescription?: string
  /** Single display address line (Apollo raw_address, else composed). */
  rawAddress?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  phone?: string
  /** Stock ticker + exchange when the company is publicly traded. */
  publiclyTradedSymbol?: string
  publiclyTradedExchange?: string
  /** Positive headcount per department (Apollo departmental_head_count). */
  departmentalHeadCount?: Record<string, number>
  /** Industry/market keywords Apollo tags the org with (bounded list). */
  keywords?: string[]
  /** Parent / owning company name (owned_by_organization / parent). */
  parentOrganization?: string
  /** Number of retail locations, when Apollo reports one. */
  retailLocationCount?: number
  // ── LOT (15/10) DATA-A point 9 — payés par le MÊME appel et jusqu'ici jetés ; stockés, pas encore
  //    affichés. Présent seulement : jamais de « 0 » pour une absence.
  /** Croissance des effectifs (ratio, 0.04 = +4 %) sur 6 / 12 / 24 mois ; une période absente est absente. */
  headcountGrowth?: { sixMonths?: number; twelveMonths?: number; twentyFourMonths?: number }
  /** Tours de financement DATÉS, le plus récent d'abord. */
  fundingEvents?: Array<{
    date: string
    type?: string
    amount?: string
    currency?: string
    investors?: string
    newsUrl?: string
  }>
  suborganizations?: Array<{ name: string; websiteUrl?: string }>
  /** Maison mère ULTIME (au-delà de {@link parentOrganization}, qui est le propriétaire direct). */
  ultimateParent?: { name: string; websiteUrl?: string }
  naicsCodes?: string[]
  /** Technologies AVEC leur catégorie ; {@link technologies} (noms seuls) est inchangé. */
  technologiesDetailed?: Array<{ name: string; category?: string }>
}

// Rich Apollo People-Search fields beyond the headline (title/photo/location).
// Carried on the seed so the API can persist them in contact.raw_data and the
// dashboard can show the maximum detail per contact (seniority, departments,
// career path) — Apollo returns these on the basic search, no extra credit.
export type ContactApolloDetails = {
  organization?: string
  seniority?: string
  departments?: string[]
  functions?: string[]
  headline?: string
  employmentHistory?: Array<{
    title?: string
    organization?: string
    current?: boolean
    /** #4465 — présentes seulement : sans elles, impossible de dire quelle expérience est la plus récente. */
    start_date?: string
    end_date?: string
  }>
  /** Availability flags Apollo returns on the FREE search tier (booleans, not
   *  values): a work email / direct phone EXISTS to be revealed by a paid
   *  People-Match. Drives the « email dispo » badge and the credit-targeted
   *  auto-enrich. */
  hasEmail?: boolean
  hasPhone?: boolean
  /** #3911.1 — la recherche qui a trouvé ce contact n'avait aucune ancre
   *  EXACTE (id Apollo / domaine du compte), seulement le nom en texte
   *  libre : deux entités homonymes la passent toutes les deux. Absent =
   *  ancre exacte (comportement historique) — jamais un `false` qui
   *  laisserait croire à une vérification positive. */
  employerUnverified?: boolean
}

/**
 * #2290.4-.9 — PAR QUEL CHEMIN ce contact a été trouvé : famille, terme direct
 * déclencheur, type de chemin (terme direct / acronyme / synonyme / association
 * sectorielle / repli brut), version du dictionnaire qui a servi. UNE seule
 * notion (GA-26) plutôt que cinq champs cousus à la main.
 *
 * Absent = non mesuré (recherche non thématisée) — jamais un défaut inventé
 * (GA-18/19). ``widened: true`` = ce contact vient d'une passe ÉLARGIE (bande
 * de séniorité, ou relance automatique sur une famille entière) : il n'a PAS
 * matché le terme exact, et ne doit JAMAIS s'afficher comme une correspondance
 * exacte (#2290.8).
 */
export type ContactMatchProvenance = {
  /** Famille du dictionnaire (cyber, data, achats, dsi, cloud) — `null` quand
   *  aucune famille connue n'a matché (thème inconnu, ou faux ami exclu). */
  family: string | null
  /** Le terme brut qui a déclenché la correspondance (ex. "rssi", "cortaix"),
   *  `null` sur une passe élargie qui n'a pas de terme unique. */
  matchedTerm: string | null
  matchedVia:
    | 'direct'
    | 'acronym'
    | 'synonym'
    | 'sector_association'
    | 'raw_fallback'
    | 'widened_seniority_band'
    | 'family'
    | 'checked_entity'
  /** Lot 757 — l'entité du groupe COCHÉE dont la passe a trouvé ce contact (`matchedVia: 'checked_entity'`). */
  entity?: string | null
  /** Libellé complet de l'association sectorielle (ex. "CIGREF — Club
   *  Informatique des Grandes Entreprises Françaises") quand `matchedVia` vaut
   *  `sector_association`. */
  sectorAssociation?: string | null
  /** Famille reconnue mais ÉCARTÉE par un faux ami identifié (ex. "sécurité
   *  sociale" n'active jamais "cyber") — tracée même sur un repli brut. */
  excludedAsFauxAmi?: string | null
  dictionaryVersion: string
  widened: boolean
}

export type AnalysisContactSeed = {
  fullName: string
  title: string
  linkedinUrl: string
  photoUrl?: string
  city: string
  country: string
  source: string
  apolloDetails?: ContactApolloDetails
  /** Apollo People-Search person id. The strongest People-Match key — it unlocks
   *  a search-tier hit whose last name Apollo obfuscated (a first-name+org match
   *  returns an empty record). Persisted in ``contact.raw_data.apolloId`` so the
   *  on-demand « Enrichir » button can reveal the real contact BY ID instead of a
   *  fresh org+title search. Absent on non-Apollo seeds (Pappers / Brave). */
  apolloId?: string
  /** Last name as the search tier masks it (`"Mo***y"`). Lets the UI show an
   *  honest partial identity ("Severine M.") on a not-yet-enriched Apollo hit
   *  instead of a bare first name. Shown verbatim-derived (first letter only) —
   *  the full name arrives with the People-Match, never from a guess. */
  lastNameObfuscated?: string
  /** #2290.4-.9 — voir {@link ContactMatchProvenance}. */
  matchProvenance?: ContactMatchProvenance
  /** #3989 — la ligne de la base commune dont cette fiche est la COPIE (source
   *  `shared_base`). Persisté dans `raw_data.sharedFactId` : c'est par lui que
   *  l'effacement RGPD d'une personne retrouve ses copies dans les autres espaces. */
  sharedFactId?: string
  /** #3989.7 (Louis 15/10/2026) — la coordonnée PRO déjà trouvée dans un autre espace,
   *  réutilisée ici : la donnée seule (jamais l'espace, ni note, ni statut, ni coût).
   *  Écrite sur la fiche par la même porte que la collecte — une correction humaine gagne. */
  sharedCoordinates?: { email: string | null; phone: string | null }
  /** SIG-B — la PREUVE d'un recruteur nommé par une offre d'emploi publiée.
   *  Persistée dans ``contact.raw_data.jobPosting``. Absente sur toute autre source. */
  jobPosting?: ContactJobPostingEvidence
}

/**
 * SIG-B (11/10/2026) — l'offre d'emploi publiée qui NOMME ce recruteur : son
 * intitulé, son URL (la preuve se vérifie) et sa date de publication quand la
 * source la donne — jamais une date devinée.
 */
export type ContactJobPostingEvidence = {
  title: string
  url: string
  postedAt?: string
}

export type ContactBucket = 'decideur' | 'sponsor' | 'operationnel' | 'influenceur' | 'a_verifier' | 'bruit'

export type AnalysisEnrichedContact = {
  fullName: string
  entity: string
  family?: string
  role: string
  priority: number
  summary: string
  whyContact: string
  email: string
  phone: string
  emailVerified: boolean
  /** Apollo person id, re-attached by the IA from the phase-2 seed. The match key
   *  the persistence needs: phase 3 REVEALS the identity of a search-tier hit
   *  ("Severine" → "Severine Mondy"), so matching the update on the name alone
   *  would hit no row and discard the email the credit just paid for. */
  apolloId?: string
  /** Deterministic triage bucket (always present on fresh analyses). */
  bucket?: ContactBucket
  /** Decider psychology (deck / ORION) — career levers to orient the pitch and
   *  implicit organisational fears to defuse. Produced by Phase-3 for the top-N
   *  deciders only; absent/empty for the rest. */
  careerLevers?: string[]
  implicitFears?: string[]
  /** LUDB.5 — l'IA a reconnu un HOMONYME (domaine de l'e-mail révélé hors du compte et de son
   *  groupe) : l'API l'écarte avec `exclusionReason`, jamais rattaché ni supprimé. */
  excluded?: boolean
  exclusionReason?: string
}

// Ready-to-send M1 messages produced by Phase 4 (bellum_messages) for a priority
// contact, applied onto the persisted contact (email_message / linkedin_message /
// phone_script) so the dossier shows "messages prêts à envoyer".
export type AnalysisContactMessage = {
  contactName: string
  persona?: string
  linkedinMessage?: string
  /** Les temps SUIVANTS de la séquence LinkedIn (p10 : M1 / M2 / M3, puis stop).
   *  Le produit s'arrêtait à M1 — un commercial sans réponse au premier message
   *  n'avait rien. Non persistés sur la ligne contact (ils ne s'éditent pas, ils
   *  se copient) : ils vivent dans le dossier et sont relus depuis lui. */
  linkedinMessageM2?: string
  linkedinMessageM3?: string
  emailSubject?: string
  emailBody?: string
  /** Script téléphone — les QUATRE moments de l'annexe méthodo p11. Le produit
   *  n'en générait qu'un (l'ouverture), donc « le cold call doit qualifier un
   *  signal, un besoin, un interlocuteur ou un processus » restait un slogan :
   *  sans découverte ni sortie, l'appel ne qualifie rien et ne se termine sur
   *  aucun next step. Les quatre sont assemblés en un seul script lisible dans
   *  `contacts.phone_script` (colonne TEXT déjà affichée) — aucune migration.
   *  Un dossier antérieur n'a que `phoneOpener` et s'affiche comme avant. */
  phoneOpener?: string
  phoneTenSeconds?: string
  phoneDiscovery?: string[]
  phoneExit?: string
  /** Le CONTENU de chaque touche de la cadence email (annexe méthodo p12 : « une
   *  preuve NEUVE par touche »). Les touches étaient jusqu'ici des rappels datés
   *  pointant sur le MÊME email initial — J+3, J+6, J+9 ne portaient aucun texte
   *  propre, ce qui n'est pas une séquence mais une répétition. Comme M2/M3, ces
   *  bodies vivent dans le dossier (pas de colonne : ils se copient, ils ne
   *  s'éditent pas) et sont relus par la carte de cadence. Absent = un dossier
   *  antérieur, la carte reste au comportement historique. */
  cadence?: {
    relance?: string
    preuveSociale?: string
    closeLoop?: string
  }
}

export type AnalysisActionPlanPhase = {
  name: string
  title: string
  objective: string
  actions: AnalysisActionPlanAction[]
}

export type AnalysisActionPlanAction = {
  actionId: string
  action: string
  contact: string
  channel: string
  deadline: string
  expectedOutcome: string
  kpi: string
}

export type AnalysisActionPlanBody = {
  strategy: string
  justification: string
  phases: AnalysisActionPlanPhase[]
}

export type AnalysisPlanData = {
  actionPlan: AnalysisActionPlanBody
  /** Reconciled account score (§1): phase 4 derives the canonical /10 from the
   *  /25 verdict so ``applyPlan`` can overwrite the ``priority_score`` column and
   *  keep the account bucket consistent with the plan's evaluation. Optional —
   *  present only once phase 4 has produced a scored evaluation. */
  priorityScore?: number
  priorityJustification?: string
  /** Self-consistency A1 (double dérivation des jugements clés — score /25,
   *  top-3 plays, top-5 contacts) : ``{ sections, divergences, overallConfidence,
   *  notes, secondPassCostUsd }``. Advisory — the retained values are always
   *  pass 1; ``applyPlan`` hoists it to ``raw_analysis.selfConsistency`` so the
   *  dossier/chat can say « score confirmé par double passe ». Absent when the
   *  break-glass kill-switch (SELF_CONSISTENCY_DISABLED) is on. */
  selfConsistency?: Record<string, unknown>
  /** LOIC-FIX O.1 — posé par l'API quand le plan arrive SANS aucun message contact
   *  (étape « messages » interrompue, dégradée ou sans personne). Absent = des
   *  messages ont été livrés avec le plan. */
  messagesStatus?: 'missing'
}
