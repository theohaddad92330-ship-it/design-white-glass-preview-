import type {
  MatchCandidate,
  MatchEvidence,
  MatchEvidenceSource,
  MatchNeed,
  MatchSkill,
  MatchAxis,
} from '@bellum/contracts'
import {
  accountFactAgePhrase,
  accountFactAgeDays,
  accountFactDecay,
  languageLevelRank,
  type AccountFact,
  type MatchClientFact,
} from '@bellum/contracts'
import { availabilityIsStale } from './pushable'
import { mentions, normalise, overlaps, sameTerm, words } from './text'

/**
 * Les TREIZE axes de correspondance (PDF 4 §3), tous déterministes (D26).
 *
 * Le PDF en marquait deux comme « sémantiques », donc portés par un modèle.
 * L'arbitrage du 20/08 les a ramenés au déterminisme, pour deux raisons qui
 * comptent plus que la finesse : le même besoin comparé au même vivier doit
 * rendre le même classement (c'est une obligation de conformité, pas un
 * confort), et le matching est gratuit — un appel de modèle par profil et par
 * axe ferait payer à l'ESN le geste qu'on veut la voir répéter.
 *
 * Trois disciplines traversent tout le fichier :
 *
 *  - un axe qu'on ne peut PAS évaluer rend `null`. Il sort du dénominateur au
 *    lieu de coûter des points. Zéro voudrait dire « ce profil est mauvais sur
 *    ce point » ; `null` veut dire « le besoin ne l'a pas demandé, ou la fiche
 *    ne le dit pas ». Les confondre fait mesurer la complétude de nos données.
 *  - chaque point porte une PREUVE lisible, avec sa source. Un score sans
 *    justification n'est pas explicable, et l'explication est due.
 *  - rien n'est deviné. Une compétence absente de toutes les sources est
 *    `missing` avec une preuve vide, jamais « probablement acquise ».
 *
 * Ce fichier ne reçoit NI identité, NI photo, NI date de naissance, NI adresse :
 * `MatchCandidate` ne les porte pas. La garde GA-06 le vérifie en plus, mais
 * c'est le type qui l'empêche.
 */

export type AxisOutcome = {
  score: number | null
  detail: string
  evidence: MatchEvidence[]
}

const NOT_EVALUABLE = (detail: string): AxisOutcome => ({ score: null, detail, evidence: [] })

/* ------------------------------------------------------------------ */
/* Compétences — la couverture du §3.1                                 */
/* ------------------------------------------------------------------ */

/**
 * La force d'une source (§3.1).
 *
 * Une compétence prouvée par une mission vaut deux fois et demie une compétence
 * simplement déclarée. C'est la hiérarchie qui décide de ce qu'on ose écrire au
 * client : une compétence démontrée se cite, une compétence déclarée se fait
 * valider en entretien.
 */
const SOURCE_COVERAGE: Readonly<Record<MatchEvidenceSource, number>> = {
  mission: 1,
  interview: 0.9,
  cv: 0.7,
  declared: 0.4,
  derived: 0.4,
}

/** Le facteur de niveau (§3.1). `inconnu` n'y figure pas : voir {@link levelFactor}. */
const LEVEL_FACTOR: Readonly<Record<string, number>> = {
  notions: 0.4,
  autonome: 0.7,
  confirme: 0.9,
  expert: 1,
}

/** Un niveau écrit à la main dans un besoin, ramené au vocabulaire du référentiel. */
export function readLevel(raw: string | null): string | null {
  if (!raw) return null
  const value = normalise(raw)
  if (!value) return null
  if (value.startsWith('notion') || value.includes('debutant') || value.includes('junior')) return 'notions'
  if (value.startsWith('autonome') || value.includes('intermediaire')) return 'autonome'
  if (value.startsWith('confirme') || value.includes('senior')) return 'confirme'
  if (value.startsWith('expert') || value.includes('architecte')) return 'expert'
  return null
}

/**
 * Le facteur de niveau, comparé au niveau DEMANDÉ, plafonné à 1 (§3.1).
 *
 * `inconnu` — le cinquième niveau, ajouté quand les compétences ont commencé à
 * arriver des CV sans évaluation — rend 1 et lève `levelUnknown`. Le punir
 * reviendrait à reprocher une réponse qu'on n'a jamais demandée ; le créditer en
 * silence reviendrait à afficher devant un client une évaluation que personne
 * n'a faite. Il devient donc une QUESTION à poser au consultant, ce qui est la
 * seule chose honnête à en faire.
 */
export function levelFactor(candidateLevel: string | null, requiredLevel: string | null): number {
  const wanted = requiredLevel ? LEVEL_FACTOR[requiredLevel] : undefined
  if (!candidateLevel || candidateLevel === 'inconnu' || !(candidateLevel in LEVEL_FACTOR)) return 1
  const held = LEVEL_FACTOR[candidateLevel] ?? 1
  if (wanted === undefined) return held
  return Math.min(1, held / wanted)
}

/**
 * #4433.8 (Louis, recette 23/10) — la part qu'une compétence ADJACENTE (même famille du référentiel partagé)
 * apporte à l'axe : un profil voisin n'est plus noté comme un profil sans rien. Elle ne vaut JAMAIS « trouvée » :
 * le statut reste `adjacent`, la compétence obligatoire reste un manque NOMMÉ (exclusion `missing_required_skill`)
 * et l'adjacence reste dite dans `adjacency`. Une part, pas une preuve.
 */
export const ADJACENT_COVERAGE = 0.3

/**
 * Le sort de CHAQUE compétence attendue : trouvée, adjacente ou absente.
 *
 * L'adjacence est signalée dans `adjacency`, jamais comptée dans `matched` (§3.1) ; elle pèse seulement une part
 * {@link ADJACENT_COVERAGE} dans la couverture de l'axe.
 */
export function resolveSkills(need: MatchNeed, candidate: MatchCandidate): MatchSkill[] {
  return need.skills.map(wanted => {
    const requiredLevel = readLevel(wanted.level)
    const held = candidate.skills.find(
      skill => sameTerm(skill.term, wanted.term) || sameTerm(skill.label, wanted.label),
    )
    if (held) {
      const factor = levelFactor(held.level, requiredLevel)
      const unknownLevel = !held.level || held.level === 'inconnu'
      // #2328.24 (second volet) : le terme est exact, mais seulement extrait —
      // jamais validé. Sur un must-have, ça ne compte JAMAIS comme trouvé.
      const mustHaveUnverified = wanted.required && held.inferred === true
      return {
        term: wanted.term,
        // Le libellé ÉCRIT, jamais le canonique : le référentiel range
        // « PostgreSQL » sous « sql », ce qui est utile pour rapprocher et faux
        // sur un dossier envoyé au client.
        label: held.label,
        required: wanted.required,
        status: mustHaveUnverified ? ('unverified' as const) : ('matched' as const),
        coverage: mustHaveUnverified ? 0 : Math.min(1, (SOURCE_COVERAGE[held.source] ?? 0.4) * factor),
        level: held.level,
        source: held.source,
        proof: held.proof,
        levelUnknown: unknownLevel,
      }
    }
    const near = candidate.skills.find(
      skill => overlaps(skill.term, wanted.term) || overlaps(skill.label, wanted.label),
    )
    if (near) {
      return {
        term: wanted.term,
        label: near.label,
        required: wanted.required,
        status: 'adjacent' as const,
        coverage: ADJACENT_COVERAGE,
        level: near.level,
        source: near.source,
        proof: near.proof,
        levelUnknown: !near.level || near.level === 'inconnu',
      }
    }
    return {
      term: wanted.term,
      label: wanted.label,
      required: wanted.required,
      status: 'missing' as const,
      coverage: 0,
      level: null,
      source: null,
      // Preuve VIDE : on ne fabrique pas la justification d'une absence.
      proof: null,
      levelUnknown: false,
    }
  })
}

function skillAxis(skills: MatchSkill[], required: boolean, emptyDetail: string): AxisOutcome {
  const scope = skills.filter(skill => skill.required === required)
  if (scope.length === 0) return NOT_EVALUABLE(emptyDetail)
  // Poids égaux : le besoin ne porte pas de pondération par compétence, et en
  // inventer une (par ordre de saisie, par exemple) ferait dépendre le classement
  // de la façon dont quelqu'un a rempli un formulaire.
  const covered = scope.reduce((sum, skill) => sum + skill.coverage, 0)
  const score = Math.round((covered * 100) / scope.length)
  const hits = scope.filter(skill => skill.status === 'matched')
  const evidence: MatchEvidence[] = hits.map(skill => ({
    label: skill.proof ? `${skill.label} — ${skill.proof}` : skill.label,
    source: skill.source ?? 'declared',
  }))
  const missing = scope.filter(skill => skill.status === 'missing').map(skill => skill.label)
  // #2328.24 — présente mais seulement extraite, jamais validée : ni couverte,
  // ni « manquante » (le terme EST là). Une ligne à part, jamais confondue.
  const unverified = scope.filter(skill => skill.status === 'unverified').map(skill => skill.label)
  // Le détail dit la FORCE de la preuve, pas seulement le compte. « Les 2
  // compétences attendues sont couvertes » à côté d'un 40/100 se lit comme une
  // contradiction : ce qui manque, ce n'est pas la compétence, c'est la preuve.
  const proven = scope.filter(skill => skill.source === 'mission' || skill.source === 'interview')
  const coverageLine =
    proven.length === hits.length
      ? `les ${scope.length} compétences attendues sont prouvées`
      : `les ${scope.length} compétences attendues sont présentes, ${proven.length}/${hits.length} prouvées`
  // #4433.8 — l'adjacence pèse une part dans le score : elle se NOMME dans la phrase de l'axe.
  const adjacent = scope
    .filter(skill => skill.status === 'adjacent')
    .map(skill => `${skill.label} (pour ${skill.term})`)
  const unverifiedSuffix =
    (unverified.length === 0 ? '' : ` — à vérifier : ${unverified.join(', ')}`) +
    (adjacent.length === 0 ? '' : ` — adjacent : ${adjacent.join(', ')}`)
  const detail =
    hits.length === 0
      ? `aucune des ${scope.length} compétences attendues n'est portée par ce profil${unverifiedSuffix}`
      : missing.length === 0
        ? `${coverageLine}${unverifiedSuffix}`
        : `${hits.length}/${scope.length} couvertes — manque ${missing.join(', ')}${unverifiedSuffix}`
  return { score, detail, evidence }
}

export function axisMustHave(skills: MatchSkill[]): AxisOutcome {
  return skillAxis(skills, true, 'le besoin ne déclare aucune compétence obligatoire')
}

export function axisNiceToHave(skills: MatchSkill[]): AxisOutcome {
  return skillAxis(skills, false, 'le besoin ne déclare aucune compétence souhaitée')
}

/* ------------------------------------------------------------------ */
/* Séniorité                                                           */
/* ------------------------------------------------------------------ */

/**
 * Les bandes de séniorité, ordonnées. C'est le repli quand personne n'a écrit
 * d'années — deux bandes DÉCLARÉES se comparent honnêtement, là où déduire des
 * années depuis un CV a été explicitement refusé au chantier précédent.
 */
const SENIORITY_BANDS = ['junior', 'confirme', 'senior', 'expert']

export function seniorityRank(band: string | null): number | null {
  if (!band) return null
  const value = normalise(band)
  const index = SENIORITY_BANDS.indexOf(value)
  return index === -1 ? null : index
}

/**
 * Années réelles contre années attendues, AVEC TOLÉRANCE (§3).
 *
 * Un an de moins que demandé n'est pas un défaut ; quatre ans de moins en est
 * un. La décroissance est douce puis franche, plutôt qu'un couperet à l'année
 * pile — un couperet ferait disparaître des profils que n'importe quel recruteur
 * proposerait.
 *
 * Quand les années manquent d'un côté ou de l'autre — c'est le cas le plus
 * fréquent, aucune fiche ne les porte aujourd'hui — on compare les BANDES
 * déclarées. Et quand ni l'un ni l'autre n'est comparable, l'axe rend `null` :
 * on ne devine pas une séniorité.
 */
export function axisSeniority(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  if (need.minYears !== null && candidate.yearsExperience !== null) {
    const gap = need.minYears - candidate.yearsExperience
    const evidence: MatchEvidence[] = [
      { label: `${candidate.yearsExperience} ans d'expérience, ${need.minYears} attendus`, source: 'declared' },
    ]
    const detail = `${candidate.yearsExperience} ans pour ${need.minYears} attendus`
    if (gap <= 0)
      return { score: 100, detail: `${candidate.yearsExperience} ans, au-delà des ${need.minYears} attendus`, evidence }
    if (gap <= 1) return { score: 85, detail, evidence }
    if (gap <= 2) return { score: 65, detail, evidence }
    if (gap <= 3) return { score: 40, detail, evidence }
    return { score: Math.max(0, 40 - (gap - 3) * 20), detail, evidence }
  }

  const wanted = seniorityRank(need.seniorityBand)
  const held = seniorityRank(candidate.seniorityBand)
  if (wanted === null) return NOT_EVALUABLE('le besoin ne fixe pas de séniorité')
  if (held === null) return NOT_EVALUABLE("la séniorité du profil n'est pas renseignée")
  const evidence: MatchEvidence[] = [
    { label: `${candidate.seniorityBand} pour un besoin ${need.seniorityBand}`, source: 'declared' },
  ]
  const gap = wanted - held
  if (gap <= 0) return { score: 100, detail: `séniorité ${candidate.seniorityBand}, au niveau attendu`, evidence }
  if (gap === 1)
    return { score: 60, detail: `séniorité ${candidate.seniorityBand} pour un besoin ${need.seniorityBand}`, evidence }
  return { score: 20, detail: `séniorité ${candidate.seniorityBand} pour un besoin ${need.seniorityBand}`, evidence }
}

/* ------------------------------------------------------------------ */
/* Secteur et environnement — déterministes (D26)                      */
/* ------------------------------------------------------------------ */

export function axisSector(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  // Le secteur de la DEMANDE d'abord (addendum Stelya §4.1) : « le secteur doit
  // être porté par la mission, pas par le compte ». Un même compte industriel
  // porte un projet d'automatisation automobile et un projet de maintenance
  // nucléaire — leur appliquer le secteur du groupe rend interchangeables deux
  // profils qui ne le sont pas.
  const projectSectors = (need.projectSectors ?? []).map(sector => sector.trim()).filter(Boolean)
  const accountSector = (need.accountSector ?? '').trim()
  const sectors = projectSectors.length > 0 ? projectSectors : accountSector ? [accountSector] : []
  // Un repli TU se lit comme une donnée : quand le secteur employé est celui du
  // compte faute de mieux, l'explication le dit.
  const fallback = projectSectors.length === 0 && !!accountSector

  if (sectors.length === 0) return NOT_EVALUABLE("le secteur de la demande n'est pas connu")
  if (candidate.sectors.length === 0) return NOT_EVALUABLE("aucun secteur n'est déclaré sur ce profil")

  for (const sector of sectors) {
    const hit = candidate.sectors.find(known => mentions(known, sector) || mentions(sector, known))
    if (hit) {
      return {
        score: 100,
        detail: fallback
          ? `a déjà travaillé dans ce secteur (${hit}) — secteur du compte, la demande n'en précise aucun`
          : `a déjà travaillé dans ce secteur (${hit})`,
        evidence: [{ label: hit, source: 'mission' }],
      }
    }
  }
  const named = sectors.join(' / ')
  return {
    score: 0,
    detail: fallback
      ? `aucune expérience déclarée dans « ${named} » — secteur du compte, la demande n'en précise aucun`
      : `aucune expérience déclarée dans « ${named} »`,
    evidence: [],
  }
}

/**
 * La proximité de l'environnement technique du client.
 *
 * On lit ce qui a été VU en mission ou cité en référence, pas la liste déclarée
 * — c'est la différence entre « connaît » et « a pratiqué ».
 */
export function axisEnvironment(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  const wanted = need.environment.map(item => item.trim()).filter(Boolean)
  if (wanted.length === 0) return NOT_EVALUABLE("le besoin ne décrit pas l'environnement technique")
  if (candidate.environment.length === 0) return NOT_EVALUABLE("l'environnement du profil n'est pas documenté")
  const evidence: MatchEvidence[] = []
  const hits = wanted.filter(item => {
    const found = candidate.environment.find(known => sameTerm(known, item) || mentions(known, item))
    if (found) evidence.push({ label: `${item} — ${found}`, source: 'mission' })
    return Boolean(found)
  })
  const score = Math.round((hits.length * 100) / wanted.length)
  return {
    score,
    detail:
      hits.length === 0
        ? `aucun élément commun avec l'environnement annoncé (${wanted.join(', ')})`
        : `${hits.length}/${wanted.length} de l'environnement client déjà pratiqués`,
    evidence,
  }
}

/* ------------------------------------------------------------------ */
/* Langue                                                              */
/* ------------------------------------------------------------------ */

/**
 * Le rang d'un niveau de langue, ou `null` s'il n'est pas comparable.
 *
 * L'échelle elle-même vit dans le contrat (`LANGUAGE_LEVELS`) et n'est PAS
 * recopiée ici — garde GA-54. Ce fichier n'ajoute qu'une chose, et c'est la
 * seule qui lui appartienne : la normalisation du moteur (sans accent, sans
 * ponctuation), parce qu'il reçoit du texte saisi là où le contrat reçoit un
 * niveau. Deux copies de l'échelle ne divergeraient pas bruyamment — le moteur
 * classerait « non précisé » un niveau que le formulaire vient d'accepter.
 */
export function languageRank(level: string | null): number | null {
  if (!level) return null
  return languageLevelRank(normalise(level))
}

export function axisLanguage(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  if (need.languages.length === 0) return NOT_EVALUABLE('le besoin ne demande aucune langue')
  if (candidate.languages.length === 0) return NOT_EVALUABLE("aucune langue n'est renseignée sur ce profil")
  const evidence: MatchEvidence[] = []
  let comparable = 0
  let points = 0
  for (const wanted of need.languages) {
    const held = candidate.languages.find(item => normalise(item.code) === normalise(wanted.code))
    if (!held) {
      // La langue n'est pas déclarée : c'est un manque CONNU, pas une ignorance.
      comparable += 1
      evidence.push({ label: `${wanted.code} non déclarée`, source: 'declared' })
      continue
    }
    const wantedRank = languageRank(wanted.level)
    const heldRank = languageRank(held.level)
    if (wantedRank === null || heldRank === null) {
      // Un niveau non comparable ne se devine pas : la langue est là, le niveau
      // deviendra une question.
      evidence.push({ label: `${wanted.code} déclarée, niveau non précisé`, source: 'declared' })
      continue
    }
    comparable += 1
    points += heldRank >= wantedRank ? 100 : Math.max(0, 100 - (wantedRank - heldRank) * 35)
    evidence.push({ label: `${wanted.code} ${held.level} pour ${wanted.level} attendu`, source: 'declared' })
  }
  if (comparable === 0) return NOT_EVALUABLE('aucun niveau de langue comparable')
  const score = Math.round(points / comparable)
  return {
    score,
    detail: score === 100 ? 'les langues demandées sont couvertes' : 'niveau de langue en deçà du besoin',
    evidence,
  }
}

/* ------------------------------------------------------------------ */
/* Localisation et mobilité                                            */
/* ------------------------------------------------------------------ */

/**
 * La zone — et les deux endroits où l'on ne peut PAS conclure.
 *
 * `out_of_zone` est un motif d'exclusion BLOQUANT d'une liste que la source
 * qualifie de conformité (§4.1). Il ne se pose donc que sur un désaccord
 * CONSTATÉ entre un lieu écrit sur le besoin et des zones écrites sur la fiche.
 * Deux absences le rendaient pourtant, et chacune faisait mesurer au score la
 * complétude de NOS données plutôt que l'adéquation de la personne :
 *
 *  - **le besoin sans lieu.** L'ancienne garde ne sortait que si `remote` valait
 *    aussi `null`. Un besoin sur site sans adresse tombait donc jusqu'au dernier
 *    `return`, et écartait tout le monde avec la phrase « zones déclarées hors
 *    «  » » — un motif de conformité posé sur un guillemet vide.
 *  - **le profil sans zone.** L'ancienne garde exigeait zones vides ET préférence
 *    de distanciel absente. Quelqu'un qui a coché « sur site » sans jamais
 *    renseigner de zone était donc déclaré hors zone : or « sur site » dit
 *    comment il veut travailler, jamais où il est.
 *
 * Dans les deux cas la réponse est la même, et c'est la doctrine du dépôt : un
 * axe non évaluable SORT du dénominateur, il ne devient ni un « oui » silencieux
 * ni un « non ».
 */
export function axisLocation(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  const place = (need.location ?? '').trim()
  // Le plein distanciel se tranche SANS lieu : c'est le seul mode qui rende la
  // zone indifférente, donc il passe avant la question du lieu.
  if (need.remote === 'remote') {
    return {
      score: 100,
      detail: 'mission à distance — la zone ne contraint pas',
      evidence: [{ label: 'full remote', source: 'declared' }],
    }
  }
  if (!place) return NOT_EVALUABLE('le besoin ne précise pas le lieu de la mission')
  if (candidate.zones.length === 0) {
    // Une préférence de distanciel reste une information : elle ne dit pas OÙ,
    // mais elle dit que la distance ne bloque pas. Le détail ne prétend pas pour
    // autant que le profil est « hors zone » — on n'en connaît aucune.
    if (candidate.remote === 'remote' || candidate.remote === 'hybrid') {
      return {
        score: need.remote === 'hybrid' ? 60 : 35,
        detail: 'aucune zone déclarée, mais accepte le distanciel',
        evidence: [{ label: candidate.remote, source: 'declared' }],
      }
    }
    return NOT_EVALUABLE("aucune zone n'est déclarée sur ce profil")
  }
  const hit = candidate.zones.find(zone => mentions(zone, place) || mentions(place, zone))
  if (hit) return { score: 100, detail: `couvre la zone (${hit})`, evidence: [{ label: hit, source: 'declared' }] }
  if (candidate.remote === 'remote' || candidate.remote === 'hybrid') {
    const score = need.remote === 'hybrid' ? 60 : 35
    return {
      score,
      detail: 'hors zone, mais accepte le distanciel',
      evidence: [{ label: candidate.remote, source: 'declared' }],
    }
  }
  return { score: 0, detail: `zones déclarées hors « ${place} »`, evidence: [] }
}

/* ------------------------------------------------------------------ */
/* Disponibilité — la règle la plus importante du module (§3.2)        */
/* ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  return new Date(date.getTime() + days * DAY).toISOString().slice(0, 10)
}

/** Ce que la fiche DÉCLARE, quand aucune affectation n'est enregistrée. */
const DECLARED_DELAY_DAYS: Readonly<Record<string, number | null>> = {
  immediate: 0,
  sous_1_mois: 30,
  sous_3_mois: 90,
  indisponible: null,
  inconnu: null,
}

/**
 * La disponibilité, comparée à la date de démarrage demandée.
 *
 * « C'est la règle la plus importante du module : on ne confond jamais "je ne
 * sais pas" avec "non". » Une disponibilité inconnue rend `null` et envoie le
 * profil dans « non évaluables » — pas dans « écartés ». La différence tient un
 * profil vivant au lieu de le faire disparaître sans un mot.
 *
 * La disponibilité DÉRIVÉE des affectations prime sur le champ saisi. C'est le
 * défaut que ce chantier corrige : l'écran Vivier affichait les deux côte à côte
 * pendant que le matching ne lisait que le second, si bien qu'un consultant dont
 * la mission venait de finir restait « indisponible » au classement.
 */
export function axisAvailability(need: MatchNeed, candidate: MatchCandidate, today: string): AxisOutcome {
  const start = need.startOn ?? today
  const derived = candidate.derivedAvailability

  if (derived === 'busy_open_ended') {
    return {
      score: 0,
      detail: 'occupé, fin inconnue',
      evidence: [{ label: 'affectation sans date de fin', source: 'derived' }],
    }
  }
  let freeFrom: string | null = null
  let source: 'derived' | 'declared' = 'derived'
  if (derived === 'available') freeFrom = candidate.freeFrom ?? today
  else if ((derived === 'busy' || derived === 'partial') && candidate.freeFrom) freeFrom = candidate.freeFrom
  else {
    // Aucune affectation enregistrée : on retombe sur ce que la fiche DÉCLARE,
    // en le disant. Ne rien répondre ferait disparaître tout le vivier d'une ESN
    // qui ne saisit pas ses missions.
    source = 'declared'
    const delay = DECLARED_DELAY_DAYS[candidate.declaredAvailability] ?? null
    if (candidate.declaredAvailability === 'indisponible') {
      return {
        score: 0,
        detail: 'la fiche déclare le profil indisponible, sans date de fin',
        evidence: [{ label: 'fiche', source: 'declared' }],
      }
    }
    if (delay === null) return NOT_EVALUABLE("la disponibilité n'est pas connue")
    freeFrom = addDays(today, delay)
  }

  const label = source === 'derived' ? `libre le ${freeFrom} (affectations)` : `libre le ${freeFrom} (déclaré)`
  const evidence: MatchEvidence[] = [{ label, source }]
  if (freeFrom <= start) return { score: 100, detail: `disponible le ${start}`, evidence }
  if (freeFrom <= addDays(start, 15)) {
    return { score: 70, detail: `libre le ${freeFrom}, démarrage demandé le ${start}`, evidence }
  }
  // Entre 15 et 30 jours, le PDF ne donne pas de valeur : une marche nette
  // ferait basculer deux profils voisins de 70 à 20 pour un jour d'écart.
  if (freeFrom <= addDays(start, 30)) return { score: 45, detail: `libre le ${freeFrom}`, evidence }
  return { score: 20, detail: `libre le ${freeFrom}`, evidence }
}

/* ------------------------------------------------------------------ */
/* Statut contractuel                                                  */
/* ------------------------------------------------------------------ */

/**
 * Le cadre du besoin contre le statut du profil.
 *
 * Le besoin porte un TYPE DE MISSION (régie, forfait, recrutement) et le profil
 * un STATUT (CDI, freelance, portage…). Ce ne sont pas les mêmes taxonomies, et
 * les faire correspondre terme à terme reviendrait à inventer une règle. On ne
 * tranche donc que le seul cas où les deux se contredisent vraiment : un besoin
 * de RECRUTEMENT ne se sert pas avec un indépendant.
 */
export function axisContract(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  const kind = normalise(need.contractKind ?? '')
  if (!kind || kind === 'inconnu') return NOT_EVALUABLE('le besoin ne précise pas son cadre contractuel')
  if (candidate.contractKind === 'inconnu') return NOT_EVALUABLE("le statut du profil n'est pas renseigné")
  const evidence: MatchEvidence[] = [
    { label: `${candidate.contractKind} pour un besoin en ${kind}`, source: 'declared' },
  ]
  if (kind !== 'recrutement') return { score: 100, detail: `cadre compatible (${kind})`, evidence }
  const salaried = candidate.contractKind === 'cdi' || candidate.contractKind === 'cdd'
  return salaried
    ? { score: 100, detail: 'profil salarié pour un besoin de recrutement', evidence }
    : { score: 0, detail: `besoin de recrutement, profil ${candidate.contractKind}`, evidence }
}

/* ------------------------------------------------------------------ */
/* TJM                                                                 */
/* ------------------------------------------------------------------ */

/**
 * L'écart au TJM cible.
 *
 * Les MONTANTS ne sortent qu'avec `finance:read` : sans le droit, le détail dit
 * l'écart en pourcentage sans jamais nommer un euro. On ne met pas zéro à la
 * place — un zéro se lirait comme un tarif.
 */
export function axisRate(need: MatchNeed, candidate: MatchCandidate, canReadFinance: boolean): AxisOutcome {
  if (need.targetRateCents === null) return NOT_EVALUABLE('le besoin ne fixe pas de TJM cible')
  if (candidate.dailyRateCents === null) return NOT_EVALUABLE("le TJM du profil n'est pas renseigné")
  if (need.targetRateCents <= 0) return NOT_EVALUABLE('le TJM cible du besoin est vide')
  const delta = (candidate.dailyRateCents - need.targetRateCents) / need.targetRateCents
  const percent = Math.round(delta * 100)
  const amounts = canReadFinance
    ? `${Math.round(candidate.dailyRateCents / 100)} € pour une cible à ${Math.round(need.targetRateCents / 100)} €`
    : `écart de ${percent > 0 ? '+' : ''}${percent} % au TJM cible`
  const evidence: MatchEvidence[] = [{ label: amounts, source: 'declared' }]
  if (delta <= 0) return { score: 100, detail: canReadFinance ? `${amounts} — marge disponible` : amounts, evidence }
  if (delta <= 0.05) return { score: 90, detail: amounts, evidence }
  if (delta <= 0.1) return { score: 75, detail: amounts, evidence }
  if (delta <= 0.2) return { score: 45, detail: amounts, evidence }
  return { score: 15, detail: amounts, evidence }
}

/* ------------------------------------------------------------------ */
/* Qualité de la preuve                                                */
/* ------------------------------------------------------------------ */

/**
 * La part des compétences retenues qui sont réellement PROUVÉES.
 *
 * C'est l'axe qui distingue un profil dont tout est démontré en mission d'un
 * profil dont tout est déclaré sur une fiche — deux profils qui peuvent avoir
 * exactement la même liste de compétences.
 */
export function axisEvidenceQuality(skills: MatchSkill[]): AxisOutcome {
  const matched = skills.filter(skill => skill.status === 'matched' && skill.source)
  if (matched.length === 0) return NOT_EVALUABLE('aucune compétence retenue à évaluer')
  const total = matched.reduce((sum, skill) => sum + (SOURCE_COVERAGE[skill.source ?? 'declared'] ?? 0.4), 0)
  const score = Math.round((total * 100) / matched.length)
  const proven = matched.filter(skill => skill.source === 'mission' || skill.source === 'interview')
  return {
    score,
    detail:
      proven.length === 0
        ? 'aucune compétence prouvée en mission ni validée en entretien'
        : `${proven.length}/${matched.length} compétences prouvées en mission ou en entretien`,
    evidence: proven.map(skill => ({ label: skill.proof ?? skill.label, source: skill.source ?? 'declared' })),
  }
}

/* ------------------------------------------------------------------ */
/* Contraintes client                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ce que ce client, précisément, interdit ou rend délicat.
 *
 * L'axe pèse peu (2 points) mais il est BLOQUANT sur drapeau rouge : le score ne
 * dit pas tout, et repousser un profil déjà refusé chez un client est la façon
 * la plus rapide de perdre un compte.
 */
/**
 * Les habilitations EXIGÉES que ce profil ne détient pas.
 *
 * ⚠️ Exportée, et c'est le point : `buildExclusions` cherchait auparavant
 * l'habilitation manquante DANS LA PHRASE de cet axe (`detail.includes(...)`).
 * La phrase porte aussi le motif du refus client — un client ayant refusé
 * quelqu'un « pour cause d'habilitation Secret » fabriquait donc un
 * `clearance_missing` sur un profil qui la DÉTIENT. Un motif d'exclusion ne se
 * relit pas dans du texte français : il se calcule là où il se décide, et une
 * seule fois.
 */
export function missingClearances(need: MatchNeed, candidate: MatchCandidate): string[] {
  return need.clearances.filter(
    required => !candidate.clearances.some(held => sameTerm(held, required) || mentions(held, required)),
  )
}

export function axisClientConstraints(need: MatchNeed, candidate: MatchCandidate): AxisOutcome {
  const problems: string[] = []
  const evidence: MatchEvidence[] = []
  if (candidate.consentState === 'expired') problems.push('consentement expiré')
  if (candidate.clientHistoryFlag === 'rejected') {
    const reason = candidate.clientHistoryReason ? ` (${candidate.clientHistoryReason})` : ''
    problems.push(`déjà refusé chez ce client${reason}`)
    evidence.push({ label: `refus antérieur${reason}`, source: 'derived' })
  }
  if (candidate.onMissionAtClient) {
    problems.push('déjà en mission chez ce client')
    evidence.push({ label: 'mission en cours chez ce compte', source: 'derived' })
  }
  const missing = missingClearances(need, candidate)
  if (missing.length > 0) problems.push(`habilitation manquante : ${missing.join(', ')}`)
  if (problems.length === 0) {
    return { score: 100, detail: 'aucune contrainte connue chez ce client', evidence }
  }
  return { score: 0, detail: problems.join(' · '), evidence }
}

/* ------------------------------------------------------------------ */
/* Risques — signaux gradués, distincts du binaire `client_constraints` */
/* ------------------------------------------------------------------ */

/**
 * #2176.21 — « ce profil porte-t-il, EN CE MOMENT, un signal qui fragilise une
 * proposition ? ». Distinct d'{@link axisClientConstraints}, qui répond à une
 * autre question, binaire : « CE client a-t-il déjà dit non ? ».
 *
 * Les quatre signaux ci-dessous existaient déjà comme DRAPEAUX (`collectFlags`
 * dans `engine.ts`, montrés sur `MatchCard`) sans jamais peser dans un score :
 * deux profils portant les mêmes drapeaux se classaient de façon identique.
 * Toujours ÉVALUABLE — ces signaux viennent du profil seul, jamais du besoin,
 * donc `null` ne s'y présente jamais.
 */
export function axisRisks(candidate: MatchCandidate, now: Date): AxisOutcome {
  const problems: string[] = []
  const evidence: MatchEvidence[] = []
  let score = 100

  if (candidate.consentState === 'expiring') {
    score -= 15
    problems.push('consentement bientôt échu')
    evidence.push({ label: 'consentement bientôt échu', source: 'derived' })
  }
  if (candidate.consentState === 'none') {
    score -= 25
    problems.push('aucun consentement recueilli')
    evidence.push({ label: 'aucun consentement recueilli', source: 'derived' })
  }
  if (availabilityIsStale(candidate.availabilityCheckedAt, now)) {
    score -= 15
    problems.push('disponibilité non revalidée depuis plus de 60 jours')
    evidence.push({ label: 'disponibilité non revalidée depuis plus de 60 jours', source: 'derived' })
  }
  if (candidate.activeSubmissionsElsewhere > 0) {
    const penalty = Math.min(30, candidate.activeSubmissionsElsewhere * 10)
    score -= penalty
    problems.push(`${candidate.activeSubmissionsElsewhere} positionnement(s) en cours ailleurs`)
    evidence.push({
      label: `${candidate.activeSubmissionsElsewhere} positionnement(s) en cours ailleurs`,
      source: 'derived',
    })
  }
  for (const warning of candidate.preferenceWarnings) {
    score -= 10
    problems.push(warning)
    evidence.push({ label: warning, source: 'declared' })
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    detail: problems.length === 0 ? 'aucun signal de risque en cours' : problems.join(' · '),
    evidence,
  }
}

/* ------------------------------------------------------------------ */
/* Historique chez ce client — #4072.6                                 */
/* ------------------------------------------------------------------ */

const CLIENT_FACT_KINDS: ReadonlySet<string> = new Set(['deal_won', 'deal_lost', 'mission', 'need'])
const CLIENT_HISTORY_MAX = 40

/**
 * #4072.6 — ce que le moteur retient des faits du compte (#4069) : les natures
 * qui disent « ce client nous a dit oui / non / a déjà demandé ». Le lecteur
 * rend les faits déjà triés par poids ; on garde cet ordre, borné.
 */
export function clientHistoryFactsFor(facts: readonly AccountFact[]): MatchClientFact[] {
  return facts
    .filter(f => CLIENT_FACT_KINDS.has(f.kind))
    .slice(0, CLIENT_HISTORY_MAX)
    .map(f => ({ kind: f.kind as MatchClientFact['kind'], date: f.date, label: f.label }))
}

/** Les termes qui font qu'un besoin passé est « le même » que celui-ci. */
function needTerms(need: MatchNeed): string[] {
  // Les compétences font le « même besoin » ; le titre ne sert que faute de compétence
  // (« senior » ou « consultant » ne rendent pas deux besoins identiques).
  const terms = need.skills.length > 0 ? need.skills.map(s => s.term) : words(need.role)
  return terms.filter(t => t.trim().length >= 3)
}

/**
 * #4072.6 — Historique chez ce client.
 *
 * Une affaire GAGNÉE chez ce compte relève le score, une affaire PERDUE
 * l'abaisse, un besoin déjà exprimé au moins deux fois sur les mêmes termes
 * (« besoin récurrent ») le relève : tout cela DÉCOTÉ par l'âge, jamais coupé
 * (décision Louis 12/10). Aucun fait pertinent ⇒ `null` : l'axe sort du
 * dénominateur, « non mesuré » n'est jamais « 0 ». La preuve dit la NATURE et
 * l'âge du fait, jamais d'où il vient.
 */
export function axisClientHistory(need: MatchNeed, now: Date): AxisOutcome {
  const facts = need.clientHistory ?? []
  const terms = needTerms(need)
  const evidence: MatchEvidence[] = []
  const problems: string[] = []
  let won = 0
  let lost = 0
  let mission = 0
  const sameNeeds: { date: string }[] = []
  const age = (date: string) => accountFactAgeDays(date, now)

  for (const fact of facts) {
    const decay = accountFactDecay(age(fact.date))
    if (fact.kind === 'deal_won') {
      won += decay
      const label = `affaire gagnée chez ce client (${accountFactAgePhrase(age(fact.date))})`
      problems.push(label)
      evidence.push({ label, source: 'derived' })
    } else if (fact.kind === 'deal_lost') {
      lost += decay
      const label = `affaire perdue chez ce client (${accountFactAgePhrase(age(fact.date))})`
      problems.push(label)
      evidence.push({ label, source: 'derived' })
    } else if (fact.kind === 'mission') {
      mission += decay
    } else if (terms.some(t => mentions(fact.label, t) || sameTerm(fact.label, t))) {
      sameNeeds.push({ date: fact.date })
    }
  }
  let recurrence = 0
  if (sameNeeds.length >= 2) {
    const distinctDays = new Set(sameNeeds.map(n => n.date.slice(0, 10)))
    if (distinctDays.size >= 2) {
      const latest = sameNeeds.map(n => age(n.date)).sort((a, b) => a - b)[0] ?? 0
      recurrence = accountFactDecay(latest)
      const label = `besoin récurrent chez ce client (${distinctDays.size} fois, dernier ${accountFactAgePhrase(latest)})`
      problems.push(label)
      evidence.push({ label, source: 'derived' })
    }
  }
  if (mission > 0) {
    const label = 'déjà en mission chez ce client par le passé'
    problems.push(label)
    evidence.push({ label, source: 'derived' })
  }
  if (won === 0 && lost === 0 && recurrence === 0 && mission === 0) {
    return NOT_EVALUABLE('aucun historique chez ce client')
  }
  const score = 50 + 30 * Math.min(1, won) - 30 * Math.min(1, lost) + 20 * recurrence + 10 * Math.min(1, mission)
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    detail: problems.join(' · '),
    evidence,
  }
}

/* ------------------------------------------------------------------ */
/* Expérience comparable — affichée, jamais pesée                      */
/* ------------------------------------------------------------------ */

/**
 * #2176.13 — « Ce profil a-t-il déjà fait, EN MISSION, ce que ce besoin
 * demande ? » : la part des compétences OBLIGATOIRES retenues dont la preuve
 * est une mission passée (`source: 'mission'`). Arbitrage Louis (31/10/2026) :
 * l'axe est VISIBLE mais à POIDS 0 (`MATCH_DISPLAY_ONLY_AXES`) — il ne déplace
 * ni un score ni un rang.
 *
 * Deux absences restent NOMMÉES, jamais un 0 : un besoin sans compétence
 * obligatoire (rien à comparer), un profil sans aucune mission renseignée
 * (on ne sait pas, ce n'est pas un non).
 */
export function axisComparableExperience(skills: MatchSkill[], candidate: MatchCandidate): AxisOutcome {
  const required = skills.filter(skill => skill.required)
  if (required.length === 0) return NOT_EVALUABLE('le besoin ne nomme aucune compétence obligatoire à comparer')
  if (!candidate.skills.some(skill => skill.source === 'mission'))
    return NOT_EVALUABLE("aucune mission passée n'est renseignée sur ce profil")
  const proven = required.filter(skill => skill.status === 'matched' && skill.source === 'mission')
  const score = Math.round((proven.length * 100) / required.length)
  return {
    score,
    detail:
      proven.length === 0
        ? 'aucune compétence obligatoire déjà tenue en mission'
        : `déjà tenu en mission : ${proven.map(skill => skill.label).join(', ')} (${proven.length}/${required.length} obligatoires)`,
    evidence: proven.map(skill => ({
      label: skill.proof ? `${skill.label} — ${skill.proof}` : skill.label,
      source: 'mission' as const,
    })),
  }
}

/** L'ordre dans lequel les axes s'affichent et se calculent — celui du §3. */
export const AXIS_ORDER: readonly MatchAxis[] = [
  'must_have',
  'nice_to_have',
  'seniority',
  'sector',
  'environment',
  'language',
  'location',
  'availability',
  'contract_status',
  'rate',
  'evidence_quality',
  'client_constraints',
  'risks',
  'client_history',
  // #2176.13 — affiché à poids 0, en dernier.
  'comparable_experience',
]
