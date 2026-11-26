import {
  CASE_BUYING_MODEL_LABELS,
  CASE_ORGANISATION_LABELS,
  CASE_RELATION_LABELS,
  CASE_STRATEGY_LABELS,
  CASE_TIMING_LABELS,
  FINISHED_MISSION_STATUSES,
  MIN_CLOSED_CYCLES_FOR_TIMING,
  RUNNING_MISSION_STATUSES,
  type CaseTiming,
} from '@bellum/contracts'

/**
 * #3210 (LAU-FINAL-216) — « cette situation ressemble à un cas que ton
 * équipe a déjà réussi — ou échoué — pour telles raisons. »
 *
 * Fonction pure, séparée de la lecture DB (même découpage que
 * `portfolio-priorities.ts`). La similarité ne porte QUE sur ce que le
 * dépôt mesure réellement : secteur, taille déclarée, position dans un
 * groupe (#3210 lot 1) puis territoire, expertise, périmètre applicatif,
 * niveau d'accès, offre, partenaires en place (#3210.1/.3), et depuis ce lot
 * (R17) les canaux déjà utilisés et la référence client publiable (#3210.1,
 * sources « déjà en base ») — colonnes structurées, comparées à l'égalité
 * stricte (ou à la présence pour la référence), jamais par appariement
 * flou. Restent sans colonne (#3210.3) : plus aucune depuis la décision Louis du 16/10/2026 — la
 * relation est un stade SAISI dans une liste fermée et le timing une position
 * CALCULÉE dans le cycle habituel (`similarityDimensionGaps` nomme celles qui,
 * pour UN compte, ne sont pas évaluables). Modèle d'achat et stratégie (lot W9)
 * puis organisation de la décision (lot cloud 14/10) sont désormais
 * comparés, vocabulaires FERMÉS saisis par un humain.
 * #3210.1 (lot M11 09/10) — rendez-vous (`activities.kind = 'meeting'`, un
 * FAIT binaire, nommé absent quand l'espace n'en a aucun : {@link
 * meetingSourceGap}) et Market Memory agrégée PAR CAS ({@link
 * deriveCaseMemory}, comptes de CET espace, jamais un nom de client).
 *
 * NO-GO de la spec : cette fonction ne rend JAMAIS un verdict (« ça
 * marchera ») — seulement des similitudes et des différences nommées, à
 * charge du modèle de les formuler comme une analogie, jamais une preuve.
 */

/**
 * #3210.3 — les dimensions STRUCTURÉES que le dépôt porte réellement :
 * territoire (`accounts.registry_country`), expertise (`primary_domain_code`),
 * périmètre (`application_sector_codes`), niveau d'accès (`access_mode`),
 * offre (`offer`). Optionnelles : un côté qui ne les porte pas n'est PAS
 * comparé (ni similitude ni différence — jamais une ressemblance devinée).
 * Relation et timing : listes fermées depuis le 16/10/2026 (#3246).
 */
type StructuredDimensions = {
  country?: string | null
  domainCode?: string | null
  sectorCodes?: readonly string[] | null
  accessMode?: string | null
  offer?: string | null
  /** #3210.1 — noms des ESN PARTENAIRES en place (`account_partners`, hors concurrents et lignes écartées). */
  partners?: readonly string[] | null
  /**
   * #3210.1 (lot R17) — les CANAUX déjà utilisés pour approcher ce compte
   * (`outreach_messages.channel`, jamais le corps du message — D65). Une
   * source « déjà en base », au même patron que `partners`.
   */
  channels?: readonly string[] | null
  /**
   * #3210.1 (lot R17) — au moins une référence client PUBLIABLE existe pour
   * ce compte (`testimonials.publishable`). Un FAIT binaire, jamais comparé
   * valeur à valeur : une référence est unique à son client, elle ne peut
   * jamais être « la même » sur deux comptes différents.
   */
  hasPublishableReference?: boolean | null
  /**
   * #3210.1 (lot M11) — au moins un rendez-vous PASSÉ a été tenu sur ce compte
   * (`activities.kind = 'meeting'`, agenda capté). Un FAIT binaire, comme la
   * référence : présent des deux côtés → similitude ; jamais une différence
   * devinée (un rendez-vous non capté n'est pas un rendez-vous refusé).
   */
  hasMeeting?: boolean | null
  /**
   * #3246 / #3210.3 (lot W9) — stratégie d'approche et modèle d'achat : codes
   * d'un vocabulaire FERMÉ (`@bellum/contracts`, `case-dimensions`), saisis sur
   * le REX / l'opportunité perdue. Hors vocabulaire ou absent = non comparé.
   */
  strategy?: string | null
  buyingModel?: string | null
  /**
   * #3246 / #3210.3 (lot cloud 14/10) — organisation de la décision : code
   * d'un vocabulaire FERMÉ (`@bellum/contracts`, `case-dimensions`), saisi sur
   * le REX / l'opportunité perdue. Hors vocabulaire ou absent = non comparé.
   */
  organisation?: string | null
  /**
   * #3246.relation (décision Louis 16/10/2026) — stade de relation SAISI par le
   * commercial (`relationship_memory.relationStage`, liste fermée
   * `relationshipStateSchema`), jamais tiré du texte libre. Absent ou hors liste
   * = non comparé (sort du dénominateur, jamais 0).
   */
  relationStage?: string | null
  /**
   * #3246.timing (décision Louis 16/10/2026) — position CALCULÉE dans le cycle
   * habituel de l'espace ({@link timingOf}) : affaire ouverte côté cible, cycle
   * constaté côté cas. Non évaluable = non comparé.
   */
  timing?: CaseTiming | null
}

/**
 * #4289.4 (#3246.5, recette prod 19/10) — le stade de relation d'un compte pour la comparaison. Un stade SAISI
 * (liste fermée) gagne toujours. À défaut, les missions SIGNÉES de l'espace (un fait, jamais le texte libre) :
 * une mission en cours ⇒ client actif ; seulement terminées ⇒ ancien client. Annulée / archivée ne prouve rien.
 * Sans rien de tout cela : `null` (non mesuré, sort du dénominateur — jamais 0).
 */
export function relationStageOf(
  entered: string | null | undefined,
  missionStatuses: readonly string[] | undefined,
): string | null {
  if (entered && entered in CASE_RELATION_LABELS) return entered
  if (!missionStatuses?.length) return null
  if (missionStatuses.some(status => (RUNNING_MISSION_STATUSES as readonly string[]).includes(status)))
    return 'client_actif'
  const proven = ['ended', 'terminated', 'renewed', 'completed'].filter(status =>
    (FINISHED_MISSION_STATUSES as readonly string[]).includes(status),
  )
  return missionStatuses.some(status => proven.includes(status)) ? 'ancien_client' : null
}

/**
 * #3246 (décision Louis 16/10/2026) — les dimensions de similarité NON
 * ÉVALUABLES pour CE compte, NOMMÉES une fois par réponse — jamais une ligne
 * par cas comparé, puisqu'une absence ne fait AUCUNE LIGNE dans une LISTE
 * (Louis 20/09/2026, doctrine « on n'affiche pas ce qu'on n'a pas ») : une
 * dimension non évaluable sort du dénominateur, elle ne vaut jamais 0.
 * Depuis ce lot, plus aucune dimension n'est sans colonne : ne restent que
 * les deux qui peuvent manquer à un compte donné.
 */
export function similarityDimensionGaps(input: {
  relationStage: string | null | undefined
  timing: CaseTiming | null | undefined
  /** Le nombre de cycles clos DATÉS de l'espace (la base de la médiane). */
  closedCycles: number
  /**
   * #3246.3 (R44) — l'organisation de la décision de la demande OUVERTE du compte. `undefined` = non
   * vérifiée par l'appelant ; `null` = non renseignée : la dimension se NOMME au lieu de disparaître.
   */
  organisation?: string | null
}): Array<{ dimension: 'organisation' | 'relation' | 'timing'; reason: string }> {
  const gaps: Array<{ dimension: 'organisation' | 'relation' | 'timing'; reason: string }> = []
  // #3246.3 (R44) — sans organisation sur ce compte, « Même organisation de la décision » ne peut sortir.
  if (input.organisation === null) {
    gaps.push({
      dimension: 'organisation',
      reason:
        'organisation de la décision non renseignée sur la demande ouverte de ce compte — non comparée, jamais comptée comme 0',
    })
  }
  // #3246.relation
  if (!input.relationStage || !(input.relationStage in CASE_RELATION_LABELS)) {
    gaps.push({
      dimension: 'relation',
      reason: 'stade de relation non saisi sur ce compte (mémoire de relation) — non comparé, jamais compté comme 0',
    })
  }
  // #3246.timing
  if (!input.timing) {
    gaps.push({
      dimension: 'timing',
      reason:
        input.closedCycles < MIN_CLOSED_CYCLES_FOR_TIMING
          ? `${input.closedCycles} cycles clos datés dans cet espace, il en faut ${MIN_CLOSED_CYCLES_FOR_TIMING} pour un cycle habituel — non évaluable`
          : 'aucune affaire ouverte datée sur ce compte — position dans le cycle non évaluable',
    })
  }
  return gaps
}

export type CaseTarget = StructuredDimensions & {
  accountId: string
  sector: string | null
  employees: string | null
  groupRole: 'groupe' | 'filiale' | null
}

type CaseOutcome = 'won' | 'lost'

export type CaseCandidate = StructuredDimensions & {
  accountId: string
  accountLabel: string
  sector: string | null
  employees: string | null
  groupRole: 'groupe' | 'filiale' | null
  outcome: CaseOutcome
  /** REX (cas gagné) — mission débriefée. */
  missionLabel: string | null
  whatWorked: string | null
  whatFailed: string | null
  /** Opportunité `lost` (cas perdu). */
  projectLabel: string | null
  lossReason: string | null
  closedAt: string | null
}

export type SimilarCase = {
  accountId: string
  accountLabel: string
  outcome: CaseOutcome
  missionLabel: string | null
  projectLabel: string | null
  whatWorked: string | null
  whatFailed: string | null
  lossReason: string | null
  similarities: string[]
  differences: string[]
  closedAt: string | null
}

const norm = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim().toLowerCase().replace(/\s+/g, ' ')
  return trimmed ? trimmed : null
}

/** Compare deux valeurs fermées : absent d'un côté = rien à dire. */
function compareExact(
  left: string | null | undefined,
  right: string | null | undefined,
  same: (value: string) => string,
  different: (candidate: string, target: string) => string,
  out: { similarities: string[]; differences: string[] },
): void {
  const a = norm(left)
  const b = norm(right)
  if (!a || !b) return
  if (a === b) out.similarities.push(same(left!.trim()))
  else out.differences.push(different(right!.trim(), left!.trim()))
}

/** #3246 — compare deux codes d'un vocabulaire FERMÉ : un code absent ou hors vocabulaire d'un côté = rien à dire. */
function compareClosed(
  left: string | null | undefined,
  right: string | null | undefined,
  labels: Readonly<Record<string, string>>,
  same: (label: string) => string,
  different: (candidateLabel: string, targetLabel: string) => string,
  out: { similarities: string[]; differences: string[] },
): void {
  const a = left ? labels[left] : undefined
  const b = right ? labels[right] : undefined
  if (!a || !b) return
  if (left === right) out.similarities.push(same(a))
  else out.differences.push(different(b, a))
}

/** Le plafond du nombre de cas rendus — trois analogies, pas vingt. */
const MAX_CASES = 3

export function deriveSimilarCases(target: CaseTarget, candidates: readonly CaseCandidate[]): SimilarCase[] {
  const scored = candidates
    .filter(candidate => candidate.accountId !== target.accountId)
    .map(candidate => {
      const similarities: string[] = []
      const differences: string[] = []

      if (target.sector && candidate.sector) {
        if (target.sector === candidate.sector) similarities.push(`Même secteur (${target.sector}).`)
        else differences.push(`Secteur différent (${candidate.sector} contre ${target.sector}).`)
      }
      if (target.employees && candidate.employees) {
        if (target.employees === candidate.employees) similarities.push(`Taille comparable (${target.employees}).`)
        else differences.push(`Taille différente (${candidate.employees} contre ${target.employees}).`)
      }
      if (target.groupRole && candidate.groupRole) {
        if (target.groupRole === candidate.groupRole)
          similarities.push(`Même position dans un groupe (${target.groupRole}).`)
        else differences.push('Position différente dans un groupe (groupe/filiale).')
      }

      const out = { similarities, differences }
      compareExact(
        target.country,
        candidate.country,
        value => `Même territoire (${value}).`,
        (c, t) => `Territoire différent (${c} contre ${t}).`,
        out,
      )
      compareExact(
        target.domainCode,
        candidate.domainCode,
        value => `Même expertise achetée (${value}).`,
        (c, t) => `Expertise différente (${c} contre ${t}).`,
        out,
      )
      compareExact(
        target.accessMode,
        candidate.accessMode,
        value => `Même niveau d’accès (${value}).`,
        (c, t) => `Niveau d’accès différent (${c} contre ${t}).`,
        out,
      )
      compareExact(
        target.offer,
        candidate.offer,
        value => `Même offre (${value}).`,
        (c, t) => `Offre différente (${c} contre ${t}).`,
        out,
      )
      compareClosed(
        target.strategy,
        candidate.strategy,
        CASE_STRATEGY_LABELS,
        label => `Même stratégie d’approche (${label}).`,
        (c, t) => `Stratégie d’approche différente (${c} contre ${t}).`,
        out,
      )
      compareClosed(
        target.buyingModel,
        candidate.buyingModel,
        CASE_BUYING_MODEL_LABELS,
        label => `Même modèle d’achat (${label}).`,
        (c, t) => `Modèle d’achat différent (${c} contre ${t}).`,
        out,
      )
      compareClosed(
        target.organisation,
        candidate.organisation,
        CASE_ORGANISATION_LABELS,
        label => `Même organisation de la décision (${label}).`,
        (c, t) => `Organisation de la décision différente (${c} contre ${t}).`,
        out,
      )
      // #3246.relation — stade saisi, liste fermée ; non saisi d'un côté = rien à dire.
      compareClosed(
        target.relationStage,
        candidate.relationStage,
        CASE_RELATION_LABELS,
        label => `Même stade de relation (${label}).`,
        (c, t) => `Stade de relation différent (${c} sur ce cas, contre ${t} ici).`,
        out,
      )
      // #3246.timing — position calculée dans le cycle habituel ; non évaluable d'un côté = rien à dire.
      compareClosed(
        target.timing,
        candidate.timing,
        CASE_TIMING_LABELS,
        label => `Même position dans le cycle habituel (${label}).`,
        (c, t) => `Position différente dans le cycle habituel (${c} sur ce cas, contre ${t} ici).`,
        out,
      )
      if (target.sectorCodes?.length && candidate.sectorCodes?.length) {
        const shared = target.sectorCodes.filter(code => candidate.sectorCodes!.includes(code))
        if (shared.length > 0) similarities.push(`Périmètre applicatif en commun (${shared.join(', ')}).`)
        else differences.push('Périmètre applicatif différent (aucun secteur applicatif en commun).')
      }

      // #3210.1 — partenaires en place : égalité stricte des noms normalisés ;
      // un côté sans partenaire connu n'est NI similitude NI différence.
      if (target.partners?.length && candidate.partners?.length) {
        const theirs = new Set(candidate.partners.map(name => norm(name)))
        const shared = target.partners.filter(name => theirs.has(norm(name))).map(name => name.trim())
        if (shared.length > 0) similarities.push(`Partenaire en place en commun (${shared.join(', ')}).`)
        else differences.push('Aucun partenaire en place en commun.')
      }

      // #3210.1 (lot R17) — canaux déjà utilisés : même patron que les
      // partenaires (égalité stricte des noms normalisés, absence d'un côté
      // = rien à dire).
      if (target.channels?.length && candidate.channels?.length) {
        const theirs = new Set(candidate.channels.map(name => norm(name)))
        const shared = target.channels.filter(name => theirs.has(norm(name))).map(name => name.trim())
        if (shared.length > 0) similarities.push(`Même canal déjà utilisé (${shared.join(', ')}).`)
        else differences.push('Aucun canal de prise de contact en commun.')
      }

      // #3210.1 (lot R17) — référence client publiable : un FAIT binaire,
      // jamais une différence devinée (une référence est unique à son
      // client — elle n'est jamais « différente » de celle d'un autre compte,
      // juste absente ou présente).
      if (target.hasPublishableReference && candidate.hasPublishableReference) {
        similarities.push('Référence client publiable disponible des deux côtés.')
      }

      // #3210.1 (lot M11) — rendez-vous : même patron binaire que la référence.
      if (target.hasMeeting && candidate.hasMeeting) {
        similarities.push('Un rendez-vous a déjà été tenu des deux côtés.')
      }

      return { candidate, similarities, differences, matchCount: similarities.length }
    })
    // Aucun point commun mesurable : ce n'est pas une analogie, c'est du bruit.
    .filter(scored => scored.matchCount > 0)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
      return (b.candidate.closedAt ?? '').localeCompare(a.candidate.closedAt ?? '')
    })
    .slice(0, MAX_CASES)

  return scored.map(({ candidate, similarities, differences }) => ({
    accountId: candidate.accountId,
    accountLabel: candidate.accountLabel,
    outcome: candidate.outcome,
    missionLabel: candidate.missionLabel,
    projectLabel: candidate.projectLabel,
    whatWorked: candidate.whatWorked,
    whatFailed: candidate.whatFailed,
    lossReason: candidate.lossReason,
    similarities,
    differences,
    closedAt: candidate.closedAt,
  }))
}

const DAY_MS = 86_400_000

type CycleProject =
  | {
      first_detected_at?: Date | null
      closed_at?: Date | null
    }
  | null
  | undefined

/** #3210.3 (timing) — cycle CONSTATÉ d'une affaire close : clôture − détection, en jours entiers ; `null` sans les deux dates. */
export function observedCycleDays(project: CycleProject): number | null {
  if (!project?.first_detected_at || !project.closed_at) return null
  return Math.round((project.closed_at.getTime() - project.first_detected_at.getTime()) / DAY_MS)
}

/** #3246.timing — âge d'une affaire OUVERTE : aujourd'hui − détection, en jours entiers ; `null` sans date (jamais déduit). */
export function openAgeDays(project: { first_detected_at?: Date | null } | null | undefined, now: Date): number | null {
  if (!project?.first_detected_at) return null
  return Math.round((now.getTime() - project.first_detected_at.getTime()) / DAY_MS)
}

/**
 * #3246.timing — durée MÉDIANE des cycles clos de l'espace ; `null` sous
 * {@link MIN_CLOSED_CYCLES_FOR_TIMING} cycles mesurables (une médiane de deux
 * n'est pas un cycle habituel).
 */
export function medianClosedCycleDays(cycles: ReadonlyArray<number | null | undefined>): number | null {
  const valid = cycles
    .filter((days): days is number => typeof days === 'number' && Number.isFinite(days) && days >= 0)
    .sort((a, b) => a - b)
  if (valid.length < MIN_CLOSED_CYCLES_FOR_TIMING) return null
  const mid = Math.floor(valid.length / 2)
  return valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2
}

/**
 * #3246.timing — la position d'une affaire dans le cycle habituel de l'espace.
 * « Tranché sans Louis » (lot CAS-DIMENSIONS 16/10) : `tot` sous la moitié de
 * la médiane, `dans_le_cycle` jusqu'à la médiane incluse, `en_retard` au-delà.
 * `null` sans âge mesurable ou sans médiane : jamais « tôt » par défaut.
 */
export function timingOf(days: number | null | undefined, medianDays: number | null | undefined): CaseTiming | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return null
  if (typeof medianDays !== 'number' || !Number.isFinite(medianDays) || medianDays <= 0) return null
  if (days < medianDays / 2) return 'tot'
  return days <= medianDays ? 'dans_le_cycle' : 'en_retard'
}

/**
 * #3210.1 (lot M11 09/10) — la source « rendez-vous » NOMMÉE absente quand
 * l'espace n'a aucun rendez-vous capté (`meetingCount = 0`) ou quand la
 * lecture n'a pas pu se faire (`null`) : sans elle, « aucun rendez-vous en
 * commun » se lirait comme un fait alors que rien n'a été regardé.
 */
export function meetingSourceGap(meetingCount: number | null): Array<{ source: string; reason: string }> {
  if (meetingCount === null) {
    return [{ source: 'rendez-vous', reason: 'lecture indisponible — les rendez-vous ne sont pas comparés' }]
  }
  if (meetingCount === 0) {
    return [
      {
        source: 'rendez-vous',
        reason: 'aucun rendez-vous enregistré dans cet espace (agenda non connecté ou jamais capté)',
      },
    ]
  }
  return []
}

type CaseMemoryLine = {
  dimension: 'secteur' | 'secteur et taille' | 'taille' | 'position dans un groupe'
  value: string
  won: number
  lost: number
}

/**
 * #3210.1 (lot M11 09/10) — MARKET MEMORY AGRÉGÉE PAR CAS : parmi les cas
 * gagnés/perdus de CET espace, combien partagent le secteur, la taille, la
 * position de groupe du compte cible — des COMPTES, sans un seul nom de
 * client ni identifiant de compte (anonymisation par construction).
 *
 * C'est « CHEZ NOUS » : l'appelant ne passe que les cas de l'espace demandé.
 * ⚠️ La règle « jamais agrégée entre espaces » qui était écrite ici est
 * REMPLACÉE depuis le 09/10/2026 (décision Louis, `c92_base_anonyme_commune`) :
 * « AILLEURS » existe désormais À CÔTÉ, jamais mêlé à ces comptes — la base
 * anonyme commune (`SharedBaseReaderService.caseOutcomesElsewhere`, P05.b,
 * k >= 3 espaces, jamais un nom). Une dimension inconnue de la cible, ou
 * partagée par aucun cas, ne fait aucune ligne.
 */
export function deriveCaseMemory(target: CaseTarget, candidates: readonly CaseCandidate[]): CaseMemoryLine[] {
  const compared = candidates.filter(candidate => candidate.accountId !== target.accountId)
  const dimensions: Array<[CaseMemoryLine['dimension'], string | null, (c: CaseCandidate) => string | null]> = [
    ['secteur', target.sector, c => c.sector],
    ['taille', target.employees, c => c.employees],
    ['position dans un groupe', target.groupRole, c => c.groupRole],
  ]
  const lines: CaseMemoryLine[] = []
  for (const [dimension, value, read] of dimensions) {
    if (!value) continue
    const shared = compared.filter(candidate => read(candidate) === value)
    if (shared.length === 0) continue
    lines.push({
      dimension,
      value,
      won: shared.filter(candidate => candidate.outcome === 'won').length,
      lost: shared.filter(candidate => candidate.outcome === 'lost').length,
    })
  }
  // #3246 (décision Louis 10/10) — secteur d'abord, la taille en second : le croisement « même secteur ET
  // taille comparable » (le « dont K » de la phrase) se place juste après le secteur.
  if (target.sector && target.employees) {
    const both = compared.filter(c => c.sector === target.sector && c.employees === target.employees)
    if (both.length > 0) {
      const crossed: CaseMemoryLine = {
        dimension: 'secteur et taille',
        value: `${target.sector}, ${target.employees}`,
        won: both.filter(c => c.outcome === 'won').length,
        lost: both.filter(c => c.outcome === 'lost').length,
      }
      const at = lines.findIndex(l => l.dimension === 'taille')
      lines.splice(at === -1 ? lines.length : at, 0, crossed)
    }
  }
  return lines
}
