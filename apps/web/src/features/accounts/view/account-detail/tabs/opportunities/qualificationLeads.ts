import {
  classifyLeadEvidence,
  INTAKE_STAGES,
  LEAD_MISSING_INFO,
  LEAD_NO_NAMED_ROLE_WITH_CONTACTS,
  rankQualificationLead,
  type LeadDismissReason,
  type LeadMissingInfo,
  type LeadProposalReason,
  type LeadRanking,
  type LeadRankingInput,
  type LeadVerification,
  type ProjectReadRow,
  type QualificationLead,
} from '@bellum/contracts'

/**
 * #2172 — LA DÉRIVATION DE LA FILE « PISTES À QUALIFIER ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne stocke rien et n'appelle rien : elle LIT les lignes que
 * `GET /projects?account_id=…` rend déjà — celles que la section Opportunités
 * charge pour sa tête et pour son tableau, sous la même clé React Query — et en
 * tire, pour chacune, ce qu'on sait, d'où ça vient, ce qui manque et la
 * vérification suivante.
 *
 * Une piste n'est pas une opportunité : seules les lignes d'INTAKE entrent ici
 * (`detected`, `potential`). Une ligne du pipe a déjà été regardée par quelqu'un
 * — la reproposer « à qualifier » ferait refaire un travail fait.
 *
 * ⚠️ RIEN NE S'INVENTE. Une ligne sans fait daté et sans source identifiée ne
 * produit AUCUNE piste : elle n'aurait ni raison ni vérification, et une file
 * qui affiche « à qualifier » sans dire quoi vérifier ne dit rien.
 *
 * ⚠️ TOUT CE QU'ON NE SAIT PAS EST NOMMÉ (GA-18 / GA-19). Pas de périmètre, pas
 * d'expertise rapprochée, pas d'interlocuteur : chacun sort en `missing`, avec
 * son libellé de contrat — jamais un blanc, jamais un zéro.
 */

/** Une décision prise sur une piste, telle que l'API la rend. */
export type LeadDecisionRow = {
  lead_key: string
  decision: 'dismissed' | 'snoozed'
  reason: LeadDismissReason | null
  note: string | null
  decided_at: string
  /** `null` pour un écartement : une pierre tombale n'expire pas. */
  snoozed_until: string | null
}

export type QualificationLeadCard = QualificationLead & {
  /** #3678 — l'affaire OUVERTE du même domaine déjà dans le pipe, quand il y en a une.
   *  `null` = aucune (jamais une affaire perdue ou gagnée, jamais un autre domaine). */
  existing_opportunity_id: string | null
  ranking: LeadRanking
  state: 'active' | 'snoozed' | 'dismissed'
  decision: LeadDecisionRow | null
  /** KEVIN-FIX (a) — combien de personnes l'écran connaît sur le compte ; `null` = non lu (jamais « 0 »). */
  known_contact_count: number | null
}

type QualificationLeadsInput = {
  rows: readonly ProjectReadRow[]
  decisions?: readonly LeadDecisionRow[]
  /** Les domaines d'offre de TON espace. Vide = on ne sait pas rapprocher, et
   *  l'axe « adéquation » est NON MESURÉ — jamais deviné. */
  ownDomainCodes?: readonly string[]
  /** Les contacts connus du compte. `null` = l'écran ne l'a pas dit. */
  contactCount?: number | null
  now?: Date
}

type QualificationLeadsResult = {
  active: QualificationLeadCard[]
  snoozed: QualificationLeadCard[]
  dismissed: QualificationLeadCard[]
  /**
   * ⚠️ CES COMPTEURS COMPTENT DES PISTES LUES, PAS DES FAITS DE MARCHÉ (GA-259).
   * « 3 pistes » veut dire « trois lignes de ce dossier méritent une
   * vérification », jamais « ce compte a trois projets ». L'écran doit le
   * nommer, et les trois seaux s'ADDITIONNENT jusqu'au total.
   */
  counts: { active: number; snoozed: number; dismissed: number; total: number }
}

/** Le seul témoin qu'une ligne porte d'une proposition de Laura : sa source. */
const COPILOT_SOURCES = ['copilot', 'laura']

export function accountQualificationLeads(input: QualificationLeadsInput): QualificationLeadsResult {
  const now = input.now ?? new Date()
  const intake = input.rows.filter(row => (INTAKE_STAGES as readonly string[]).includes(row.stage))
  const decisions = new Map((input.decisions ?? []).map(decision => [decision.lead_key, decision]))

  const cards: QualificationLeadCard[] = []
  for (const row of intake) {
    const card = toLead(row, intake, input, now)
    if (card) cards.push(withDecision(card, decisions.get(card.key) ?? null, now))
  }

  // Le rang d'abord, la date ensuite. Un score absent ne passe PAS derrière un
  // score nul : « non mesuré » n'est pas « mauvais ». Il passe derrière ceux
  // qu'on sait noter, et devant rien — c'est la seule place honnête.
  cards.sort((left, right) => {
    const gap = (right.ranking.score ?? -1) - (left.ranking.score ?? -1)
    if (gap !== 0) return gap
    return dateValue(right.observed_on) - dateValue(left.observed_on)
  })

  const active = cards.filter(card => card.state === 'active')
  const snoozed = cards.filter(card => card.state === 'snoozed')
  const dismissed = cards.filter(card => card.state === 'dismissed')
  return {
    active,
    snoozed,
    dismissed,
    counts: {
      active: active.length,
      snoozed: snoozed.length,
      dismissed: dismissed.length,
      total: cards.length,
    },
  }
}

/**
 * #4329.1 (call refonte UX 19/10 — « ça perd un peu en sens », 30 projets d'un bloc) — LE SEUIL DE
 * PREUVE d'un projet possible : SON PROPRE fait porte une source ET une date. Un fait voisin du même
 * domaine ne prête pas sa preuve à une généralité (« Cette activité implique des systèmes critiques »).
 * Ce qui passe le seuil se lit en tête ; le reste est REPLIÉ, jamais supprimé ni décidé à la place du
 * commercial. L'ordre de la file est gardé dans chaque moitié.
 */
export function splitLeadsByProof<T extends Pick<QualificationLeadCard, 'source_facts'>>(
  leads: readonly T[],
): { proven: T[]; unproven: T[] } {
  const proven: T[] = []
  const unproven: T[] = []
  for (const lead of leads) {
    const own = lead.source_facts[0]
    ;(own && trimmed(own.source) && validDate(own.observed_on) ? proven : unproven).push(lead)
  }
  return { proven, unproven }
}

/**
 * La décision prise sur la piste.
 *
 * ⚠️ On ARCHIVE, on ne supprime pas : une piste écartée reste, avec son motif et
 * sa date, et elle ne ressuscite pas à l'analyse suivante — la décision porte la
 * CLÉ de la ligne, pas sa date de détection.
 *
 * ⚠️ Une mise en veille est une PAUSE : passée son échéance, la piste revient
 * d'elle-même dans la file active. Sans ça, « plus tard » vaudrait « jamais ».
 */
function withDecision(card: QualificationLeadCard, decision: LeadDecisionRow | null, now: Date): QualificationLeadCard {
  if (!decision) return card
  if (decision.decision === 'dismissed') return { ...card, state: 'dismissed', decision }
  const until = decision.snoozed_until ? new Date(decision.snoozed_until).getTime() : Number.NaN
  const stillAsleep = !Number.isNaN(until) && until > now.getTime()
  return { ...card, state: stillAsleep ? 'snoozed' : 'active', decision }
}

function toLead(
  row: ProjectReadRow,
  siblings: readonly ProjectReadRow[],
  input: QualificationLeadsInput,
  now: Date,
): QualificationLeadCard | null {
  const facts = sourceFacts(row, siblings)
  if (facts.length === 0) return null

  const expressed = row.evidence?.level === 'confirmed_demand'
  const proposedByCopilot = typeof row.source === 'string' && COPILOT_SOURCES.includes(row.source.trim().toLowerCase())
  const level = classifyLeadEvidence({
    kind: row.kind,
    stage: row.stage,
    sourceFactCount: facts.length,
    expressed,
    proposedByCopilot,
  })
  if (!level) return null

  const perimeter = trimmed(row.offer)
  const matchedExpertise = matchedDomain(row, input.ownDomainCodes)
  const potentialRole = trimmed(row.btmmp?.management ?? null)
  const observedOn = mostRecent(facts)
  const contactCount = input.contactCount ?? null

  const missing: LeadMissingInfo[] = []
  if (!observedOn) missing.push('no_date')
  if (!facts.some(fact => fact.source !== null)) missing.push('no_source_detail')
  if (!perimeter) missing.push('no_perimeter')
  if (!matchedExpertise) missing.push('no_matched_expertise')
  if (!potentialRole) missing.push('no_named_role')
  // ⚠️ `contactCount === null` ne pousse RIEN : « l'écran ne l'a pas dit » n'est
  // pas « aucun interlocuteur identifié ». Affirmer le second sur le premier
  // serait exactement l'erreur que GA-18 attrape.
  if (contactCount === 0) missing.push('no_contact')

  const ranking = rankQualificationLead(rankingInput(row, facts, observedOn, input, matchedExpertise), now)

  return {
    key: row.id,
    account_id: row.account_id,
    company_name: row.company_name,
    logo_url: row.logo_url,
    label: row.label,
    evidence_level: level,
    perimeter,
    source_facts: facts,
    observed_on: observedOn,
    matched_expertise: matchedExpertise,
    potential_role: potentialRole,
    missing,
    proposal_reason: proposalReason(level, facts.length),
    next_verification: nextVerification(missing),
    existing_opportunity_id: existingOpportunityId(row, input.rows),
    ranking,
    state: 'active',
    decision: null,
    known_contact_count: contactCount,
  }
}

/** #3678 — une affaire OUVERTE (pipe, ni clôturée ni signal) du même domaine d'offre. */
function existingOpportunityId(row: ProjectReadRow, rows: readonly ProjectReadRow[]): string | null {
  const domain = trimmed(row.primary_domain_code ?? null)
  if (!domain) return null
  const open = rows.find(
    other =>
      other.id !== row.id &&
      other.kind !== 'signal' &&
      !(INTAKE_STAGES as readonly string[]).includes(other.stage) &&
      !CLOSED_STAGES.includes(other.stage) &&
      trimmed(other.primary_domain_code ?? null) === domain,
  )
  return open?.id ?? null
}

const CLOSED_STAGES: readonly string[] = ['won', 'lost', 'abandoned']

type LeadPrimaryAction =
  | { kind: 'tab'; tab: 'contacts'; label: 'identify_contact' }
  | { kind: 'panel'; panel: 'detail'; label: 'see_request' }
  // #3679 reste — « Préparer l'approche » ouvre un brouillon de message
  // allégé (le composer d'engagement existant), jamais la préparation de
  // conversion (`ConvertForm`, toujours atteignable via « Travailler dans le
  // pipe », dans « Autres options »).
  | { kind: 'draft_message'; label: 'prepare_approach' }
  | { kind: 'opportunity'; id: string; label: 'open_existing' }

/**
 * #3678.5 — UNE action principale, au libellé du résultat du clic. Ordre : une
 * affaire déjà ouverte prime (on n'en prépare pas une seconde) ; un rôle ou un
 * interlocuteur inconnu → à identifier (jamais de nom fabriqué) — ce sont les
 * MANQUES qui décident, pas `next_verification` qui ne nomme que le premier
 * (KO recette 06/10 : 22 pistes sans rôle montraient « Voir la demande »).
 */
export function leadPrimaryAction(lead: QualificationLeadCard): LeadPrimaryAction {
  if (lead.existing_opportunity_id) {
    return { kind: 'opportunity', id: lead.existing_opportunity_id, label: 'open_existing' }
  }
  // #3678.6 — un signal hors de l'offre connue reste consultable, jamais promu en recommandation :
  // ni « Préparer l'approche » ni « Identifier le responsable », seulement « Voir la demande ».
  if (leadImpact(lead).kind === 'off_target') return { kind: 'panel', panel: 'detail', label: 'see_request' }
  if (lead.missing.includes('no_named_role') || lead.missing.includes('no_contact')) {
    return { kind: 'tab', tab: 'contacts', label: 'identify_contact' }
  }
  if (lead.next_verification === 'confirm_with_contact') {
    return { kind: 'draft_message', label: 'prepare_approach' }
  }
  return { kind: 'panel', panel: 'detail', label: 'see_request' }
}

/**
 * #3678.2 — « ce que ça change pour la recherche ». Trois états seulement, tous
 * lus : lié à une expertise de l'espace ; hors cible (le catalogue est connu et
 * rien ne correspond — consultable, jamais promu en recommandation) ; inconnu
 * (catalogue ou domaine absent : on ne dit ni oui ni non).
 */
export function leadImpact(
  lead: Pick<QualificationLeadCard, 'matched_expertise' | 'missing' | 'ranking'>,
): { kind: 'matched'; expertise: string } | { kind: 'off_target' } | { kind: 'unknown' } {
  if (lead.matched_expertise) return { kind: 'matched', expertise: lead.matched_expertise }
  return lead.ranking.notMeasured.includes('offer_fit') ? { kind: 'unknown' } : { kind: 'off_target' }
}

const ACTION_CHANGING_GAPS: readonly LeadMissingInfo[] = ['no_source_detail', 'no_date', 'no_contact', 'no_named_role']

/** #3678.6 — la réserve qui change l'action, visible AVANT le dépliage. */
export function leadReserve(lead: Pick<QualificationLeadCard, 'missing'>): LeadMissingInfo | null {
  return ACTION_CHANGING_GAPS.find(gap => lead.missing.includes(gap)) ?? null
}

/**
 * Les faits qui soutiennent la piste : celui de la ligne, et ceux des AUTRES
 * lignes d'intake du même dossier qui pointent vers le même domaine d'offre.
 *
 * C'est ce qui fait la différence entre « signal isolé » et « convergence » —
 * et elle se MESURE, elle ne se décrète pas. Une ligne sans date ET sans source
 * n'est pas un fait : elle ne compte pas, même pour elle-même.
 */
function sourceFacts(row: ProjectReadRow, siblings: readonly ProjectReadRow[]): QualificationLead['source_facts'] {
  const own = asFact(row)
  if (!own) return []
  const domain = trimmed(row.primary_domain_code ?? null)
  if (!domain) return [own]
  const converging = siblings
    .filter(other => other.id !== row.id && trimmed(other.primary_domain_code ?? null) === domain)
    .map(asFact)
    .filter((fact): fact is NonNullable<ReturnType<typeof asFact>> => fact !== null)
  return [own, ...converging]
}

function asFact(row: ProjectReadRow): QualificationLead['source_facts'][number] | null {
  const source = trimmed(row.source)
  const observedOn = validDate(row.first_detected_at)
  if (!source && !observedOn) return null
  return { label: row.label, source, observed_on: observedOn }
}

/**
 * Ce qui nourrit les six axes. Chaque `null` est un axe qui SORT du
 * dénominateur — c'est le contrat qui l'applique, pas cet écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2172.26 / .27 / .55 — LA MÉMOIRE MARCHÉ N'EST PAS BRANCHÉE ICI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `applyMarketMemoryToLead` (`qualification-lead.ts`) est écrit, testé, et
 * n'a AUCUN appelant. Sa place est ICI et nulle part ailleurs : c'est la seule
 * fonction qui compose l'entrée des axes, donc le seul endroit où une
 * compatibilité structurelle venue du marché pourrait relever `offerFit` sans
 * toucher à la fraîcheur, à la demande ni à l'accès.
 *
 * Ce qui manque n'est pas le branchement, c'est son ENTRÉE.
 * `LeadMarketMemory.structuralFit` demande une GRADATION (`strong` / `partial`
 * / `none`) par piste. Or :
 *  · la seule compatibilité structurelle calculée dans le dépôt est un COMPTE
 *    de portefeuille (`marketStructuralFitSchema` : combien de comptes couverts
 *    recoupent une expertise déclarée), pas un verdict par compte ;
 *  · la gradation, elle, est REFUSÉE tant qu'elle n'est pas normalisée par
 *    cohorte — un grand groupe cite mécaniquement plus de technologies qu'une
 *    PME, donc recoupe plus souvent, et « forte » mesurerait alors la TAILLE de
 *    l'entreprise. C'est ce que dit `MarketStructuralFitCard`, et c'est ce que
 *    `MARKET_MEMORY_SCORING_ENABLED = false` tient fermé côté API
 *    (`market-memory.service.ts` — `cohortIndexFor` calcule l'index, le
 *    contrôleur ne l'allume pas, la calibration sur données réelles est due).
 *
 * Fabriquer la gradation ici pour avoir un appelant reviendrait à trancher au
 * passage une question ouverte, et à faire dire à la mémoire marché un fait sur
 * CE compte-ci à partir de ce qu'on sait du marché (GA-259). Le branchement
 * attend donc l'allumage du scoring — il tient en une ligne le jour venu.
 *
 * RECONFIRMÉ 16/09/2026 (`origin/main` `f2cdf286b`), troisième mesure
 * indépendante — même conclusion, avec deux faits qui la renforcent :
 *  · `MarketMemoryService` calcule bien un booléen PAR COMPTE en interne
 *    (`stackMatchesExpertises`, `market-memory.service.ts:1862`), mais seul
 *    `portfolioFor` l'expose, agrégé sur tout le portefeuille, et il classe
 *    chaque compte (`classifyPortfolio`) à chaque appel — un coût pensé pour
 *    un écran de portefeuille, pas pour une file rechargée à chaque piste ;
 *  · `rankingInput` est appelé depuis une dérivation qui documente elle-même
 *    « elle ne stocke rien et n'appelle rien » (`accountQualificationLeads`,
 *    ligne 21 de ce fichier) : la brancher sur une lecture réseau romprait ce
 *    contrat d'architecture, pas seulement la doctrine de gradation.
 * Ce même dossier de compte porte déjà le précédent qui tranche : à côté,
 * `AccountMarketMemoryCard` lit un fait par compte (recours externe observé)
 * mais son voisin, l'index par cohorte, est verrouillé par une garde DÉDIÉE
 * (GA-257) qui interdit justement la fuite d'un signal brut hors de son
 * unique point calibré. Brancher `applyMarketMemoryToLead` demanderait la
 * même famille de décision — un nouvel endpoint calibré, pas une ligne dans
 * ce fichier — donc ce lot ne le fait pas non plus. Ne pas re-mesurer une
 * quatrième fois sans donnée nouvelle : le registre porte cette conclusion
 * (`registre-2026-09-14-accounts-prospection.md:392-393,421`).
 */
function rankingInput(
  row: ProjectReadRow,
  facts: QualificationLead['source_facts'],
  observedOn: string | null,
  input: QualificationLeadsInput,
  matchedExpertise: string | null,
): LeadRankingInput {
  const domain = trimmed(row.primary_domain_code ?? null)
  const ownDomains = input.ownDomainCodes ?? []
  const contactCount = input.contactCount ?? null
  return {
    // Sans domaine sur la ligne, ou sans catalogue côté espace, on ne SAIT pas
    // rapprocher : `null`. Deviner « aucune adéquation » enverrait la piste au
    // fond de la file pour une donnée qui nous manque, à nous.
    offerFit: !domain || ownDomains.length === 0 ? null : matchedExpertise ? 'strong' : 'none',
    lastFactAt: observedOn,
    // On sait où aller chercher quand au moins un fait porte sa source.
    informationReachable: facts.some(fact => fact.source !== null) ? true : null,
    hasContactOrAccess: contactCount === null ? null : contactCount > 0,
    // Une ligne reprise d'un fichier vient de l'espace : quelqu'un l'y a mise.
    // Pour tout le reste, personne n'a demandé ce sujet — et on n'en sait rien.
    userRequested: row.kind === 'imported' ? true : null,
    // Les contraintes connues (marché réservé, prestataire en place, gel
    // budgétaire) ne vivent sur aucune colonne : non mesuré, et NOMMÉ.
    knownConstraints: null,
  }
}

function proposalReason(level: QualificationLead['evidence_level'], factCount: number): LeadProposalReason {
  if (level === 'crm_or_exchange') return 'expressed_demand'
  if (level === 'copilot_proposal') return 'copilot_reading'
  return factCount >= 2 ? 'converging_facts' : 'single_dated_fact'
}

/**
 * La vérification suivante est celle du PREMIER manque, dans l'ordre où il
 * bloque : une source introuvable rend tout le reste vain, un interlocuteur
 * absent rend la question impossible à poser, et ainsi de suite. Quand rien ne
 * manque, il reste à demander — c'est la seule chose qu'une piste demande.
 */
function nextVerification(missing: readonly LeadMissingInfo[]): LeadVerification {
  if (missing.includes('no_date') || missing.includes('no_source_detail')) return 'confirm_source'
  if (missing.includes('no_contact')) return 'find_contact'
  if (missing.includes('no_perimeter')) return 'confirm_scope'
  if (missing.includes('no_matched_expertise')) return 'confirm_expertise'
  return 'confirm_with_contact'
}

function matchedDomain(row: ProjectReadRow, ownDomains: readonly string[] | undefined): string | null {
  const domain = trimmed(row.primary_domain_code ?? null)
  if (!domain || !ownDomains || ownDomains.length === 0) return null
  return ownDomains.includes(domain) ? domain : null
}

function mostRecent(facts: QualificationLead['source_facts']): string | null {
  const dated = facts.map(fact => fact.observed_on).filter((date): date is string => date !== null)
  if (dated.length === 0) return null
  return dated.reduce((latest, date) => (new Date(date).getTime() > new Date(latest).getTime() ? date : latest))
}

function dateValue(date: string | null): number {
  if (!date) return 0
  const value = new Date(date).getTime()
  return Number.isNaN(value) ? 0 : value
}

function validDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return Number.isNaN(new Date(value).getTime()) ? null : value
}

function trimmed(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * KEVIN-FIX (a) — le libellé d'un manque, lu avec ce que l'écran sait du compte : « aucun rôle nommé » ne
 * contredit plus les personnes nommées ailleurs sur la fiche (une seule source : `contactCount`).
 */
export function leadGapLabel(
  lead: Pick<QualificationLeadCard, 'known_contact_count'>,
  gap: LeadMissingInfo,
  lang: 'fr' | 'en',
): string {
  // `null` (non lu) n'est jamais « 0 » : seul un compte POSITIF change le libellé.
  const known = lead.known_contact_count
  if (gap === 'no_named_role' && known !== null && known > 0) return LEAD_NO_NAMED_ROLE_WITH_CONTACTS[lang]
  return LEAD_MISSING_INFO[gap][lang]
}
