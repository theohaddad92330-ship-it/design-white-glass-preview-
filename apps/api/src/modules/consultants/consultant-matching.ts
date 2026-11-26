import {
  markClientHistory,
  matchScoreIsMeasured,
  preferenceWarnings,
  type ClientHistoryEntry,
  type PreferenceWarning,
} from '@bellum/contracts'
import { canonicalSkill, sameSkill } from './skill-referential'
import {
  CONSULTANT_PUSH_MAX,
  CONSULTANT_TOP_MAX,
  type Consultant,
  type ConsultantMatch,
  type ConsultantMatchCriterion,
  type ConsultantMatchVerdict,
  type SkillEvidence,
} from '@bellum/contracts'

/**
 * Matching besoin ↔ profil (annexe méthodo p22).
 *
 * La page est explicite sur ce qu'il ne faut PAS faire : « besoin explicite +
 * contraintes ; **pas de CV catalogue** ». Envoyer cinq profils vaguement
 * pertinents est le comportement qu'elle interdit — d'où un push borné à
 * {@link CONSULTANT_PUSH_MAX} (« 1-2 profils »).
 *
 * Elle est tout aussi explicite sur le contenu du push : « recommandation
 * personnalisée, raisons ET RISQUES ». Un push sans risque énoncé se retourne en
 * soutenance, quand le client découvre lui-même que le consultant n'a jamais fait
 * ce secteur ou qu'il n'est libre que dans six semaines. Les risques sont donc un
 * livrable de premier rang ici, pas un commentaire.
 *
 * Discipline, identique à celle du /100 contact :
 *   - chaque point est adossé à une PREUVE lisible ;
 *   - un critère qu'on ne peut pas évaluer sort du dénominateur au lieu de coûter
 *     des points au consultant (l'ignorance n'est pas un défaut du profil) ;
 *   - une donnée décisive manquante (dispo inconnue, stack vide) marque le profil
 *     `blocked` : il reste visible, il ne peut pas être poussé ;
 *   - JAMAIS de donnée inventée : une compétence non déclarée n'est pas déduite
 *     du titre.
 *
 * Volontairement sans NestJS ni TypeORM : le classement est la partie risquée,
 * elle se teste sans base.
 */

/**
 * Les DIX étapes nommées du pipeline (#2330.2, LAU-FINAL-071) — documentées
 * ET EXÉCUTÉES dans cet ordre par {@link runMatchPipeline}, pas juste
 * paraphrasées à côté du code : `runMatchPipelineTrace` (le test associé)
 * casse si l'ordre réel dérive de cette liste.
 *
 * Deux étapes n'ont rien à CALCULER ici : le besoin (1) est lu tel quel — un
 * besoin sans terme exploitable ne fait échouer personne, ses critères sortent
 * du dénominateur plus loin (GA-18/19) — et le vivier REÇU (2) est déjà le
 * périmètre chargé par l'appelant (`ConsultantsService.listForWorkspace`,
 * scopé workspace). Elles restent nommées pour que la séquence DOCUMENTÉE
 * soit la séquence RÉELLEMENT parcourue.
 *
 * `consent_history` (8) ne bloque QUE sur l'historique client — le
 * consentement déclaré sur la fiche (`consultant.consent`) n'est un filtre
 * nulle part ailleurs dans le produit (aucun appelant trouvé sur
 * `packages/contracts/src/schemas/talent-consent.ts`) ; lui inventer ici un
 * rôle qu'aucun autre écran ne lui donne serait une décision produit qui ne
 * m'appartient pas (decisions-louis-22-09-soir.md §12 : version conservatrice).
 */
export const MATCH_PIPELINE_STEPS = [
  { id: 'need_quality', label: 'Vérifier la qualité du besoin' },
  { id: 'load_eligible', label: 'Charger les talents éligibles' },
  { id: 'hard_exclusions', label: 'Appliquer les exclusions fortes' },
  { id: 'must_have', label: 'Comparer les must-have' },
  { id: 'nice_to_have', label: 'Évaluer les nice-to-have' },
  { id: 'evidence', label: 'Vérifier les preuves' },
  { id: 'availability_conditions', label: 'Vérifier disponibilité et conditions' },
  { id: 'consent_history', label: 'Vérifier consentement et historique' },
  { id: 'rank', label: 'Classer' },
  { id: 'verdicts_actions', label: 'Produire verdicts et actions' },
] as const
type MatchPipelineStepId = (typeof MATCH_PIPELINE_STEPS)[number]['id']

/** Le besoin contre lequel on matche — la forme minimale, pas l'entité. */
export type MatchTarget = {
  /** Le besoin en une ligne (`opportunities.label`). */
  label: string
  detail?: string | null
  /** L'offre ESN rattachée, quand elle l'est. */
  offer?: string | null
  /** Secteur du compte porteur du besoin. */
  sector?: string | null
  /** Zone géographique du compte, quand elle est connue. */
  zone?: string | null
  /**
   * Les termes ÉLIMINATOIRES des besoins (`project_needs.skills[].required`)
   * rattachés à cette opportunité (#2330.3). `[]` ou absent — l'opportunité ne
   * porte aucun besoin détaillé — laisse le matching inchangé : rien n'est
   * jamais déduit d'un must-have qui n'a pas été SAISI.
   */
  mustHaveSkills?: readonly string[]
}

/** Poids des critères. Σ(max) = 100. La disponibilité pèse lourd parce que c'est
 *  la première question du client et la première cause d'échec d'un push. */
const CRITERIA: { key: string; label: string; max: number }[] = [
  { key: 'stack', label: 'Compétences vs besoin', max: 35 },
  { key: 'availability', label: 'Disponibilité', max: 25 },
  { key: 'sector', label: 'Expérience du secteur', max: 15 },
  { key: 'zone', label: 'Zone géographique', max: 10 },
  { key: 'references', label: 'Références citables', max: 10 },
  { key: 'contract', label: 'Cadre contractuel', max: 5 },
]

const CRITERION_MAX = new Map(CRITERIA.map(c => [c.key, c.max]))

/** Mots qui ne discriminent rien dans un libellé de besoin (mirror de la liste
 *  d'`project-similarity`, resserrée au vocabulaire staffing). */
const STOPWORDS = new Set([
  'accompagnement',
  'application',
  'besoin',
  'chez',
  'client',
  'des',
  'equipe',
  'gestion',
  'informatique',
  'les',
  'mise',
  'mission',
  'nouveau',
  'nouvelle',
  'outil',
  'place',
  'plateforme',
  'pour',
  'profil',
  'projet',
  'renfort',
  'solution',
  'sur',
  'systeme',
  'une',
])

/** Minuscules, sans accent, sans ponctuation — pour comparer « Sécurité » et
 *  « securite » sans prétendre faire de la sémantique. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim()
}

export function terms(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter(word => word.length >= 3 && !STOPWORDS.has(word)),
  )
}

/** Les termes significatifs du besoin : son libellé, son détail et l'offre. */
export function targetTerms(target: MatchTarget): Set<string> {
  return terms([target.label, target.detail ?? '', target.offer ?? ''].join(' '))
}

/**
 * Disponibilité → points. Une dispo `inconnu` n'est PAS traitée comme
 * indisponible (on n'invente pas) : le critère sort du dénominateur et le profil
 * est marqué bloqué, parce qu'on ne peut pas pousser quelqu'un dont on ignore
 * s'il est libre.
 */
const AVAILABILITY_POINTS: Record<string, { points: number; proof: string } | null> = {
  immediate: { points: 25, proof: 'disponible immédiatement' },
  sous_1_mois: { points: 20, proof: 'disponible sous 1 mois' },
  sous_3_mois: { points: 11, proof: 'disponible sous 3 mois' },
  indisponible: { points: 0, proof: 'en mission, non mobilisable' },
  inconnu: null,
}

type Scored = { points: number; proof: string } | null

function scoreStack(consultant: Consultant, wanted: Set<string>): Scored {
  const stack = consultant.stack.filter(Boolean)
  if (stack.length === 0 || wanted.size === 0) return null
  const hits = stack.filter(skill => {
    // D'abord la comparaison LITTÉRALE (le comportement d'origine), ensuite le
    // référentiel : « K8s » sur la fiche et « Kubernetes » dans le besoin
    // désignent la même compétence et ne se rencontraient jamais. C'était un
    // faux négatif silencieux — le pire défaut pour un vivier, parce que
    // personne ne peut le voir.
    const skillTerms = terms(skill)
    for (const term of skillTerms) if (wanted.has(term)) return true
    const canonical = canonicalSkill(skill)
    if (!canonical) return false
    for (const term of wanted) if (sameSkill(term, canonical)) return true
    return false
  })
  if (hits.length === 0) return { points: 0, proof: 'aucune compétence déclarée ne recoupe le besoin' }
  // Deux compétences qui recoupent le besoin valent le plafond : au-delà, on
  // mesurerait la longueur de la fiche, pas l'adéquation.
  const points = Math.min(35, 20 + (hits.length - 1) * 15)
  return { points, proof: `compétences en commun : ${hits.join(', ')}` }
}

function scoreSector(consultant: Consultant, target: MatchTarget): Scored {
  const sector = (target.sector ?? '').trim()
  if (!sector || consultant.sectors.length === 0) return null
  const wanted = terms(sector)
  const hit = consultant.sectors.find(known => {
    for (const term of terms(known)) if (wanted.has(term)) return true
    return false
  })
  return hit
    ? { points: 15, proof: `a déjà travaillé dans ce secteur (${hit})` }
    : { points: 0, proof: `aucune expérience déclarée dans « ${sector} »` }
}

function scoreZone(consultant: Consultant, target: MatchTarget): Scored {
  const zone = (target.zone ?? '').trim()
  if (!zone || consultant.zones.length === 0) return null
  const wanted = terms(zone)
  const remote = consultant.zones.some(z => normalize(z).includes('remote') || normalize(z).includes('distance'))
  const hit = consultant.zones.find(z => {
    for (const term of terms(z)) if (wanted.has(term)) return true
    return false
  })
  if (hit) return { points: 10, proof: `couvre la zone (${hit})` }
  if (remote) return { points: 6, proof: 'accepte le distanciel' }
  return { points: 0, proof: `zones déclarées hors « ${zone} »` }
}

function scoreReferences(consultant: Consultant): Scored {
  if (consultant.references.length === 0) return null
  return {
    points: 10,
    proof: `${consultant.references.length} référence(s) citable(s) : ${consultant.references.slice(0, 2).join(', ')}`,
  }
}

/**
 * Les termes ÉLIMINATOIRES du besoin que ce profil NE COUVRE PAS (#2330.3).
 *
 * Même heuristique de rapprochement que {@link scoreStack} (littéral puis
 * référentiel), appliquée terme par terme : un must-have absent ici n'est
 * JAMAIS compensé ailleurs, c'est tout le sens de le calculer à part plutôt
 * que de le fondre dans le score global des compétences.
 */
export function missingMustHaveSkills(consultant: Consultant, mustHave: readonly string[]): string[] {
  const stack = consultant.stack.filter(Boolean)
  return mustHave.filter(required => {
    const wanted = terms(required)
    const covered = stack.some(skill => {
      const skillTerms = terms(skill)
      for (const term of skillTerms) if (wanted.has(term)) return true
      const canonical = canonicalSkill(skill)
      if (!canonical) return false
      for (const term of wanted) if (sameSkill(term, canonical)) return true
      return false
    })
    return !covered
  })
}

function scoreContract(consultant: Consultant): Scored {
  if (consultant.contract_type === 'inconnu') return null
  return { points: 5, proof: `cadre contractuel connu (${consultant.contract_type})` }
}

/**
 * Les RISQUES du push (p22). Chacun est une phrase que le commercial peut dire
 * au client avant qu'il ne la découvre seul. On ne liste que ce qui est ÉTABLI
 * par les données — l'absence de risque détecté n'est pas « aucun risque ».
 */
function collectRisks(consultant: Consultant, target: MatchTarget, breakdown: ConsultantMatchCriterion[]): string[] {
  const risks: string[] = []
  const at = (key: string) => breakdown.find(item => item.criterion === key)

  // Les préférences déclarées (§8.3) entrent comme des AVERTISSEMENTS, jamais
  // comme des filtres : « un profil qui refuse le secteur bancaire reste
  // proposable pour une mission bancaire — c'est le recruteur qui parle au
  // consultant, pas l'algorithme ». Un champ non renseigné ne produit rien :
  // on ne reproche pas une réponse qu'on n'a jamais demandée.
  for (const warning of preferenceWarnings(consultant.mobility, consultant.preferences, {
    sector: target.sector,
    zone: target.zone,
    technologies: [...targetTerms(target)],
  })) {
    risks.push(PREFERENCE_RISK_LABEL[warning.kind](warning.detail))
  }

  if (consultant.availability === 'inconnu') {
    risks.push('disponibilité non renseignée — à confirmer avant toute proposition')
  } else if (consultant.availability === 'indisponible') {
    risks.push('actuellement en mission : ne peut pas être proposé sur un démarrage court')
  } else if (consultant.availability === 'sous_3_mois') {
    risks.push('libre seulement sous 3 mois — incompatible avec un besoin urgent')
  }

  if (consultant.available_from) {
    risks.push(`disponibilité annoncée au ${consultant.available_from} — à revérifier avec le consultant`)
  }

  const sector = at('sector')
  if (sector && sector.points === 0) {
    risks.push(`aucune expérience du secteur « ${target.sector} » : la preuve devra venir d'ailleurs`)
  }

  const stack = at('stack')
  if (stack && stack.points > 0 && stack.points < 35) {
    risks.push('recoupement partiel avec le besoin : une seule compétence déclarée correspond')
  }

  if (consultant.references.length === 0) {
    risks.push('aucune référence citable enregistrée — le push reposera sur le seul CV')
  }

  if (consultant.tjm == null) {
    risks.push('TJM non renseigné : la marge ne peut pas être vérifiée avant de proposer')
  }

  if (!consultant.wants) {
    risks.push('envie du consultant non renseignée — un profil poussé contre son gré part et démissionne')
  }

  return risks
}

/** Les raisons du push — les preuves des critères qui ont réellement marqué. */
function collectReasons(breakdown: ConsultantMatchCriterion[]): string[] {
  return breakdown.filter(item => item.points > 0).map(item => item.proof)
}

/**
 * Le verdict NOMMÉ (#2330.1/.5) — jamais un pourcentage seul.
 *
 * `blocked` est une donnée DÉCISIVE manquante (dispo inconnue/indisponible,
 * ou stack vide) — cela ne dit rien du RESTE du profil. Un profil dont le
 * score global reste élevé malgré le blocage est un COMPROMIS identifiable
 * (`alternative`, p22 « utile si le client accepte un compromis identifié »),
 * pas un profil à écarter d'office (`non_defendable`). Les seuils reprennent
 * ceux déjà lus sur cet écran (`match.score` en /100) : 80 sépare un profil
 * qui « se propose » d'un profil qui « se qualifie encore ».
 */
export function consultantMatchVerdict(input: { score: number | null; blocked: boolean }): ConsultantMatchVerdict {
  if (input.score === null) return 'non_evaluable'
  if (input.blocked) return input.score >= 50 ? 'alternative' : 'non_defendable'
  if (input.score >= 80) return 'fortement_defendable'
  if (input.score >= 50) return 'a_qualifier'
  return 'non_defendable'
}

/**
 * Ce qui MANQUE, en une phrase par manque (#2330.6).
 *
 * Reprend la même distinction que {@link skillEvidence} : une compétence
 * ADJACENTE n'est pas un manque au sens strict (le contexte s'en approche),
 * mais elle reste à confirmer — elle se dit différemment d'une compétence
 * ABSENTE, jamais fondue avec elle.
 */
export function collectSkillGaps(skills: readonly SkillEvidence[]): string[] {
  return skills
    .filter(skill => skill.level === 'absent' || skill.level === 'adjacent')
    .map(skill =>
      skill.level === 'absent'
        ? `${skill.skill} — non prouvé`
        : `${skill.skill} — contexte proche seulement (${skill.proof})`,
    )
}

/**
 * La prochaine étape, DÉDUITE du verdict et du premier risque réel (#2330.6).
 *
 * Jamais une phrase générique déconnectée du profil : quand un risque existe,
 * il devient l'action. `null` sur `non_defendable` — il n'y a rien à FAIRE
 * avec CE profil sur CE besoin, chercher ailleurs n'est pas une action sur lui.
 */
export function recommendedStepFor(verdict: ConsultantMatchVerdict, risks: readonly string[]): string | null {
  switch (verdict) {
    case 'non_evaluable':
      return "compléter la fiche (disponibilité ou compétences) avant de pouvoir l'évaluer"
    case 'non_defendable':
      return null
    case 'alternative':
      return risks[0]
        ? `vérifier avec le client : ${risks[0]}`
        : 'vérifier le compromis avec le client avant de proposer'
    case 'a_qualifier':
      return risks[0] ? `lever le doute : ${risks[0]}` : 'confirmer les zones d’ombre avant de proposer'
    case 'fortement_defendable':
      return 'proposer ce profil au client'
  }
}

/**
 * Le matching d'UN consultant sur UN besoin.
 *
 * Le score est lu sur les seuls critères ÉVALUABLES : un besoin sans secteur
 * connu ne doit pas faire perdre des points à un consultant. C'est la même règle
 * que la couverture du /100 contact, pour la même raison — sinon le score mesure
 * la complétude de nos données, pas l'adéquation de la personne.
 */

/**
 * Compétence par compétence : ce qui est PROUVÉ, ce qui est seulement déclaré,
 * ce qui est proche, et ce qui manque (addendum final p63).
 *
 * Le score global disait « 78 % » sans dire ce que ces 78 % recouvraient. Or la
 * distinction décide de ce qu'on écrit au client : une compétence démontrée se
 * cite, une compétence déclarée se fait valider en entretien, une compétence
 * adjacente s'annonce comme une montée en charge, une compétence absente se dit.
 * Les fondre est exactement ce qui produit le push qui se retourne en
 * soutenance.
 *
 * Hiérarchie des sources, du plus au moins probant :
 *   - références de mission et texte du CV → DÉMONTRÉE (la compétence a servi) ;
 *   - liste de compétences déclarées → DÉCLARÉE (elle est revendiquée) ;
 *   - secteurs, souhaits, intitulé de poste → ADJACENTE (le contexte s'en approche) ;
 *   - nulle part → ABSENTE.
 *
 * Aucun niveau n'est deviné : une compétence absente de toutes les sources est
 * rendue `absent` avec une preuve vide, jamais « probablement acquise ».
 */
export function skillEvidence(consultant: Consultant, target: MatchTarget): SkillEvidence[] {
  const wanted = [...targetTerms(target)]
  if (wanted.length === 0) return []

  // Une preuve vaut aussi quand l'écriture diffère : une mission « migration
  // K8s » prouve la compétence Kubernetes. Sans cela, la distinction
  // démontrée/déclarée dépendrait de l'orthographe du rédacteur du CV.
  const inText = (haystack: string, term: string) => {
    if (terms(haystack).has(term)) return true
    const canonical = canonicalSkill(term)
    if (!canonical) return false
    return [...terms(haystack)].some(word => sameSkill(word, canonical))
  }
  const references = consultant.references.filter(Boolean)
  const cv = consultant.cv_text ?? ''

  return wanted.map(skill => {
    const reference = references.find(ref => inText(ref, skill))
    if (reference) {
      return { skill, level: 'demonstrated' as const, proof: `mission citée : ${reference}` }
    }
    if (cv && inText(cv, skill)) {
      return { skill, level: 'demonstrated' as const, proof: 'présente dans le CV du consultant' }
    }
    const declared = consultant.stack.find(entry => inText(entry, skill))
    if (declared) {
      return { skill, level: 'declared' as const, proof: `compétence déclarée : ${declared}` }
    }
    const nearby = [...consultant.sectors, consultant.title ?? '', consultant.wants ?? ''].find(
      entry => entry && inText(entry, skill),
    )
    if (nearby) {
      return { skill, level: 'adjacent' as const, proof: `contexte proche : ${nearby}` }
    }
    // Preuve VIDE : on ne fabrique pas une justification pour une absence.
    return { skill, level: 'absent' as const, proof: '' }
  })
}

/** Le résultat d'UN profil AVANT verdict et prochaine action (#2330.2 étapes
 *  4 à 8) — {@link finalizeMatch} y ajoute les étapes 9 et 10. Interne : ce
 *  qui sort de ce fichier reste `ConsultantMatch`, jamais ce type de travail. */
type MatchDraft = Omit<ConsultantMatch, 'verdict' | 'recommendedStep'> & {
  /** Porté jusqu'à {@link finalizeMatch} : un verdict `non_defendable` forcé
   *  par un must-have absent ne se recalcule pas depuis `gaps` (fragile, une
   *  chaîne à parser) ni depuis `blocked` (un autre signal). */
  missingMustHaveCount: number
}

/**
 * Le brouillon d'UN consultant sur UN besoin — étapes 4 à 8 du pipeline
 * (#2330.2), dans cet ordre : must-have, nice-to-have, preuves, disponibilité
 * et conditions, consentement et historique. Pas de verdict ici : {@link
 * finalizeMatch} le produit APRÈS le classement (étape 9 avant l'étape 10).
 */
function buildMatchDraft(
  consultant: Consultant,
  target: MatchTarget,
  clientHistory: readonly ClientHistoryEntry[],
): MatchDraft {
  // 4. must-have — ÉLIMINATOIRE, jamais compensé par des souhaitables cumulés
  //    (#2330.3). `[]` sans besoin détaillé attaché — comportement inchangé.
  const missingMustHave = missingMustHaveSkills(consultant, target.mustHaveSkills ?? [])

  // 5. nice-to-have — le score pondéré des six critères souhaitables.
  const wanted = targetTerms(target)
  const scored: Record<string, Scored> = {
    stack: scoreStack(consultant, wanted),
    availability: AVAILABILITY_POINTS[consultant.availability] ?? null,
    sector: scoreSector(consultant, target),
    zone: scoreZone(consultant, target),
    references: scoreReferences(consultant),
    contract: scoreContract(consultant),
  }
  const breakdown: ConsultantMatchCriterion[] = []
  // Les critères que la donnée ne permet pas d'évaluer — NOMMÉS, jamais
  // silencieux : « un score n'est jamais nu », et ce qui n'a pas pu être noté
  // se dit autant que ce qui l'a été.
  const unevaluated: string[] = []
  let points = 0
  let denominator = 0
  for (const { key, label, max } of CRITERIA) {
    const entry = scored[key]
    if (!entry) {
      unevaluated.push(label) // non évaluable → hors dénominateur, jamais une pénalité
      continue
    }
    const capped = Math.max(0, Math.min(max, entry.points))
    breakdown.push({ criterion: key, label, points: capped, max, proof: entry.proof })
    points += capped
    denominator += max
  }
  // « Sous trois axes, il n'y a pas de score » (GA-18/GA-19) — le seuil est
  // RÉUTILISÉ depuis le contrat (`MIN_AXES_FOR_SCORE`, via
  // `matchScoreIsMeasured`), pas réécrit ici (GA-26 : un réglage vit à un seul
  // endroit).
  //
  // Le calcul divisait par `denominator` et repliait sur `0` quand aucun
  // critère n'était évaluable — juste au calcul (`0/0` n'existe pas), faux à
  // l'affichage : ce `0` se lit comme la pire note, pas comme une absence de
  // note. Et le cas qui se produit vraiment est pire qu'un dénominateur nul :
  // un profil NON bloqué (dispo connue, stack non vide) peut n'avoir qu'UN
  // SEUL critère évaluable — la disponibilité — dès que le besoin n'exprime
  // aucun terme exploitable. L'ancien calcul rendait alors 100/100 sur ce seul
  // axe, un score tout aussi mensonger qu'un 0.
  const measured = matchScoreIsMeasured(breakdown.map(item => ({ score: item.points })))
  const score = measured ? Math.round((points * 100) / denominator) : null

  // 6. preuves — compétence par compétence.
  const skills = skillEvidence(consultant, target)

  // 7. disponibilité et conditions — deux données DÉCISIVES bloquent, quel
  //    que soit le score. On ne les remplace pas par une hypothèse ; les
  //    risques (dispo, secteur, TJM, envie…) sont assemblés à la même étape.
  const blocked =
    consultant.availability === 'inconnu' || consultant.availability === 'indisponible' || consultant.stack.length === 0
  const risks = collectRisks(consultant, target, breakdown)
  if (missingMustHave.length > 0) {
    risks.push(`indispensable non prouvé : ${missingMustHave.join(', ')} — non compensable par les autres critères`)
  }

  // 8. consentement et historique — seul l'historique client FILTRE ici (cf.
  //    docblock de {@link MATCH_PIPELINE_STEPS} pour le consentement).
  const clientHistoryFlag = markClientHistory(consultant.id, clientHistory)

  return {
    consultant_id: consultant.id,
    full_name: consultant.full_name,
    score,
    breakdown,
    unevaluated,
    skills,
    gaps: [...missingMustHave.map(term => `${term} (indispensable) — non prouvé`), ...collectSkillGaps(skills)],
    reasons: collectReasons(breakdown),
    risks,
    blocked,
    clientHistory: clientHistoryFlag,
    missingMustHaveCount: missingMustHave.length,
  }
}

/** Étapes 9 (déjà faite par l'appelant — {@link runMatchPipeline} trie AVANT
 *  d'appeler cette fonction) puis 10 : le verdict NOMMÉ et la prochaine
 *  action, déduits du brouillon. */
function finalizeMatch(draft: MatchDraft): ConsultantMatch {
  const { missingMustHaveCount, ...rest } = draft
  const verdict =
    missingMustHaveCount > 0 ? 'non_defendable' : consultantMatchVerdict({ score: rest.score, blocked: rest.blocked })
  return { ...rest, verdict, recommendedStep: recommendedStepFor(verdict, rest.risks) }
}

/**
 * Le matching d'UN consultant sur UN besoin — les dix étapes du pipeline
 * (#2330.2) SAUF « classer » (9), qui n'a de sens que sur un vivier : un
 * appel isolé enchaîne directement 8 puis 10.
 *
 * Le score est lu sur les seuls critères ÉVALUABLES : un besoin sans secteur
 * connu ne doit pas faire perdre des points à un consultant. C'est la même
 * règle que la couverture du /100 contact, pour la même raison — sinon le
 * score mesure la complétude de nos données, pas l'adéquation de la personne.
 */
export function matchConsultant(
  consultant: Consultant,
  target: MatchTarget,
  /**
   * Les passages antérieurs de TOUT le vivier chez ce client (§7.2).
   *
   * Passé en paramètre plutôt que lu ici : la fonction reste pure, et l'appelant
   * charge l'historique une fois pour tout le classement au lieu d'une requête
   * par profil.
   */
  clientHistory: readonly ClientHistoryEntry[] = [],
): ConsultantMatch {
  return finalizeMatch(buildMatchDraft(consultant, target, clientHistory))
}

const compareMatchNames = (a: string | null, b: string | null): number => {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b)
}
// Une fiche SANS SCORE (moins de trois critères évaluables, GA-18/GA-19)
// n'a rien à comparer non plus : elle passe DERRIÈRE tout profil noté,
// plutôt que de se ranger sous un `0` qui la classerait comme la pire note
// — ce qu'elle n'est pas, elle est seulement non mesurée. Même raisonnement
// que pour une fiche SANS NOM (D366), juste en dessous.
const compareMatchScores = (a: number | null, b: number | null): number => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

/**
 * Le pipeline complet (#2330.2), les DIX étapes de {@link MATCH_PIPELINE_STEPS}
 * dans l'ordre — `trace` le PROUVE : chaque id y est poussé au moment RÉEL de
 * son exécution, jamais recopié à l'avance.
 */
export function runMatchPipeline(
  consultants: readonly Consultant[],
  target: MatchTarget,
  /** Les passages antérieurs de tout le vivier chez CE client (§7.2). */
  clientHistory: readonly ClientHistoryEntry[] = [],
): { trace: MatchPipelineStepId[]; ranked: ConsultantMatch[] } {
  const trace: MatchPipelineStepId[] = []

  // 1. Le besoin est lu tel quel — rien à calculer, cf. docblock de
  //    {@link MATCH_PIPELINE_STEPS}.
  trace.push('need_quality')

  // 2. Le vivier REÇU est déjà le périmètre éligible chargé par l'appelant.
  trace.push('load_eligible')

  // 3. Exclusion FORTE : un profil ARCHIVÉ ne peut plus être proposé, quel
  //    que soit son score — une porte qui ferme AVANT le calcul, pas un
  //    critère qui pèserait dedans (tranché sans toi, decisions-louis-22-09-
  //    soir.md §12 : la seule exclusion dure déjà présente sur `Consultant`
  //    et pas encore appliquée en amont du matching).
  const eligible = consultants.filter(consultant => !consultant.archived_at)
  trace.push('hard_exclusions')

  // 4 à 8, par profil.
  const drafts = eligible.map(consultant => buildMatchDraft(consultant, target, clientHistory))
  trace.push('must_have', 'nice_to_have', 'evidence', 'availability_conditions', 'consent_history')

  // 9. Classer AVANT de produire les verdicts (10) — l'ordre documenté est
  //    l'ordre exécuté : trier ne dépend que de `score`/`full_name`, jamais
  //    du verdict, donc le classement n'a besoin d'attendre personne.
  const sorted = drafts.sort(
    (a, b) => compareMatchScores(a.score, b.score) || compareMatchNames(a.full_name, b.full_name),
  )
  trace.push('rank')

  // 10. Verdict NOMMÉ + prochaine action, sur le vivier déjà classé.
  const ranked = sorted.map(finalizeMatch)
  trace.push('verdicts_actions')

  return { trace, ranked }
}

/**
 * Le classement complet du vivier sur un besoin, meilleur d'abord.
 *
 * Rend TOUT le vivier classé (le commercial doit pouvoir regarder au-delà des
 * deux premiers), mais {@link selectPush} est ce qui borne le push lui-même.
 * À score égal, l'ordre est stable sur le nom : deux exécutions donnent la même
 * liste, sinon « pourquoi ce profil ? » n'a pas de réponse reproductible.
 *
 * Fine couche sur {@link runMatchPipeline} (#2330.2) — le classement EST le
 * pipeline, ce n'est plus une fonction à côté qui le réimplémente.
 */
export function rankConsultants(
  consultants: Consultant[],
  target: MatchTarget,
  /** Les passages antérieurs de tout le vivier chez CE client (§7.2). */
  clientHistory: readonly ClientHistoryEntry[] = [],
): ConsultantMatch[] {
  return runMatchPipeline(consultants, target, clientHistory).ranked
}

/**
 * Les profils réellement POUSSABLES : au plus {@link CONSULTANT_PUSH_MAX}
 * (p22 « 1-2 profils »), jamais un profil bloqué, jamais un profil à zéro —
 * et jamais un profil dont le score n'a pas pu être mesuré (GA-18/GA-19) :
 * pousser quelqu'un sur un score qu'on n'a pas pu noter n'est pas une
 * recommandation, c'est un pari.
 *
 * C'est ici que « pas de CV catalogue » devient une règle du code plutôt qu'une
 * intention : même avec quarante consultants au vivier, il n'en sort jamais plus
 * de deux.
 */
export function selectPush(ranked: ConsultantMatch[]): ConsultantMatch[] {
  return ranked.filter(match => !match.blocked && match.score !== null && match.score > 0).slice(0, CONSULTANT_PUSH_MAX)
}

/**
 * Le TOP des profils défendables (#2330.7/.9), distinct du push.
 *
 * Borné à {@link CONSULTANT_TOP_MAX} mais jamais REMPLI jusque-là : un
 * `.slice()` sur un vivier de deux profils défendables rend deux profils, pas
 * cinq — la NO-GO du §9 (« ne jamais classer un profil faible dans le top
 * pour atteindre le nombre demandé ») est une conséquence directe du filtre,
 * pas une règle ajoutée après coup. `non_defendable` et `non_evaluable` en
 * sortent : le top sert à CONSULTER ce qui tient debout, pas à afficher tout
 * le vivier classé (ça, c'est déjà `ranked`).
 */
export function selectDefendableTop(ranked: readonly ConsultantMatch[]): ConsultantMatch[] {
  return ranked
    .filter(match => match.verdict !== 'non_defendable' && match.verdict !== 'non_evaluable')
    .slice(0, CONSULTANT_TOP_MAX)
}

/**
 * Comment chaque avertissement de préférence se DIT à un commercial.
 *
 * Les phrases restent des constats, jamais des interdictions : « a déclaré
 * refuser » n'est pas « ne peut pas être proposé ». La nuance est tout le §8.3.
 */
const PREFERENCE_RISK_LABEL: Record<PreferenceWarning['kind'], (detail: string) => string> = {
  refused_sector: detail => `a déclaré refuser le secteur « ${detail} » — à évoquer avant de le proposer`,
  refused_technology: detail => `a déclaré refuser « ${detail} » — à évoquer avant de le proposer`,
  remote_mismatch: detail =>
    detail === 'full_remote'
      ? 'souhaite du télétravail complet, la mission est sur site — à confirmer'
      : 'souhaite travailler sur site, la mission est à distance — à confirmer',
  zone_mismatch: detail => `la mission est à ${detail}, hors des zones qu'il a déclarées`,
  travel_mismatch: detail => `refuse les déplacements et la mission est à ${detail}`,
  // #2336.13 — cette voie de matching (push, `MatchTarget`) ne porte pas
  // encore de type de contrat par besoin : le drapeau ne s'y lève jamais,
  // mais l'entrée reste obligatoire (`Record` exhaustif sur `PreferenceWarning['kind']`).
  contract_kind_mismatch: detail => `la mission est en ${detail}, hors des types de contrat qu'il a déclaré vouloir`,
}
