import {
  computeQualificationVerdict,
  mergeQualificationEvaluations,
  type AccountQualificationSnapshot,
  type QualificationCriterion,
  type QualificationCriterionEvaluation,
} from '@bellum/contracts'

/**
 * #3755.9 — PARITÉ DÉMO : la grille de qualification de l'espace de démonstration
 * et UN compte qualifié axe par axe.
 *
 * La grille est celle de l'ESN FICTIVE de la salle (cinq filtres éliminatoires,
 * neuf critères pondérés, total 100) — sa forme reprend la matrice d'une ESN
 * cliente, sans la recopier. Le compte qualifié est Société Générale, le premier
 * dossier de la salle ; chaque preuve cite un fait DÉJÀ semé dans son dossier
 * (siège, NAF, chiffre d'affaires publié, filiales, ESN présentes, pari en cours).
 *
 * Ce que la carte montre en salle, et pourquoi c'est l'état honnête :
 *  - trois filtres PASS sur preuve, deux non évaluables (modèle contractuel et
 *    nature du besoin : rien dans un dossier public ne les établit) ;
 *  - le tier et le niveau décideur NON ÉVALUABLES — leurs imports (#3753/#3754)
 *    ne sont pas encore branchés (#3755.8) ;
 *  - staffing et effort d'avant-vente NON ÉVALUABLES — critères internes ;
 *  - UNE saisie du commercial (sponsor identifié), qui prime sur l'analyse.
 */
export const DEMO_QUALIFICATION_ACCOUNT = 'Société Générale'

const criterion = (
  position: number,
  code: string,
  label: string,
  weight: number | null,
  category: string,
  description_max: string,
  description_zero: string,
): QualificationCriterion => ({
  code,
  label,
  kind: weight === null ? 'eliminatory' : 'weighted',
  weight,
  category,
  description_max,
  description_zero,
  position,
})

export const DEMO_QUALIFICATION_GRID: readonly QualificationCriterion[] = [
  criterion(
    0,
    'F1',
    'Présence géographique',
    null,
    'Filtres',
    'Siège ou établissement en France',
    'Aucune présence en France',
  ),
  criterion(1, 'F2', 'Profil client cible (ICP)', null, 'Filtres', 'Secteur et taille dans notre cible', 'Hors cible'),
  criterion(
    2,
    'F3',
    'Modèle contractuel compatible',
    null,
    'Filtres',
    'Régie ou forfait accepté',
    'Achat centralisé exclusif',
  ),
  criterion(3, 'F4', 'Nature du besoin', null, 'Filtres', 'Prestation intellectuelle', 'Fourniture de matériel'),
  criterion(4, 'F5', 'Solvabilité', null, 'Filtres', 'Comptes publiés sains', 'Procédure collective'),
  criterion(5, 'S1', 'Tier du compte', 10, 'Stratégique', 'Tier 1', 'Hors liste cible'),
  criterion(6, 'S2', 'Niveau du décideur atteint', 10, 'Accès', 'Direction générale ou DSI', 'Aucun contact'),
  criterion(7, 'S3', 'Sponsor identifié', 10, 'Accès', 'Sponsor rencontré', 'Aucun sponsor'),
  criterion(8, 'S4', 'Fit avec nos références', 15, 'Offre', 'Références dans le même métier', 'Aucune référence'),
  criterion(9, 'S5', 'Ouverture du SI aux prestataires', 10, 'Offre', 'Référencement ouvert', 'Liste fermée'),
  criterion(10, 'S6', 'Pression concurrentielle', 10, 'Marché', 'Peu d’ESN installées', 'ESN dominante en place'),
  criterion(11, 'S7', 'Douleur exprimée', 15, 'Besoin', 'Programme annoncé et financé', 'Aucun signal'),
  criterion(12, 'S8', 'Staffing disponible', 10, 'Interne', 'Équipe prête', 'Personne de disponible'),
  criterion(13, 'S9', 'Effort avant-vente', 10, 'Interne', 'Effort léger', 'Réponse lourde à monter'),
]

const analysis = (
  code: string,
  status: QualificationCriterionEvaluation['status'],
  points: number | null,
  evidence: string | null,
): QualificationCriterionEvaluation => ({ code, status, points, evidence, source: 'analysis' })

/** Ce que l'analyse a évalué — chaque preuve cite un fait du dossier semé. */
export const DEMO_QUALIFICATION_ANALYSIS: readonly QualificationCriterionEvaluation[] = [
  analysis('F1', 'pass', null, 'Siège social 17 cours Valmy, 92800 Puteaux (registre).'),
  analysis('F2', 'pass', null, 'Banque, NAF 64.19Z, 10 000 salariés et plus : grand compte du secteur cible.'),
  analysis('F3', 'not_evaluable', null, null),
  analysis('F4', 'not_evaluable', null, null),
  analysis('F5', 'pass', null, '26,8 Md€ de chiffre d’affaires au dernier exercice publié (2024).'),
  analysis('S1', 'not_evaluable', null, null),
  analysis('S2', 'not_evaluable', null, null),
  analysis('S3', 'not_evaluable', null, null),
  analysis(
    'S4',
    'scored',
    10,
    'Banque de détail et filiales numériques (BoursoBank, Treezor) : métiers déjà servis par l’équipe.',
  ),
  analysis('S5', 'not_evaluable', null, null),
  analysis('S6', 'scored', 5, 'Plusieurs ESN déjà présentes sur le compte (onglet Partenaires).'),
  analysis('S7', 'scored', 12, 'Besoin d’architecte cloud identifié sur le compte (pari en cours).'),
  analysis('S8', 'not_evaluable', null, null),
  analysis('S9', 'not_evaluable', null, null),
]

/** La saisie du commercial — elle gagne sur l'analyse (#3755.5). */
export const DEMO_QUALIFICATION_MANUAL: readonly QualificationCriterionEvaluation[] = [
  {
    code: 'S3',
    status: 'scored',
    points: 8,
    evidence: 'Sponsor rencontré en rendez-vous de découverte (saisie du commercial).',
    source: 'manual',
  },
]

/** Placeholder remplacé au semis par l'identifiant réel de la grille insérée. */
export const DEMO_QUALIFICATION_GRID_PLACEHOLDER_ID = 'demo-qualification-grid'

/** L'instantané porté par le dossier (`raw_analysis.qualification`), calculé — jamais écrit à la main. */
export function demoQualificationSnapshot(gridId: string, evaluatedAt: string): AccountQualificationSnapshot {
  const result = computeQualificationVerdict(
    DEMO_QUALIFICATION_GRID,
    mergeQualificationEvaluations(DEMO_QUALIFICATION_ANALYSIS, DEMO_QUALIFICATION_MANUAL),
  )
  return {
    grid_id: gridId,
    grid_version: 1,
    verdict: result.verdict,
    eliminated_by: result.eliminated_by,
    points: result.points,
    max: result.max,
    not_evaluable: result.not_evaluable,
    evaluated_at: evaluatedAt,
  }
}
