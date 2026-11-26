import type {
  CommercialEffortLevel,
  CommercialMethodAction,
  CommercialMethodChoice,
  CommercialMethodCondition,
  CommercialMethodProof,
  CommercialMethodTrajectory,
  CommercialOpeningRoute,
  CommercialUsefulPerson,
} from './commercial-method-engine.js'

/**
 * #3390.10/.11 — LA MÉTHODE RETENUE, DITE À LAURA.
 *
 * `chooseCommercialMethod` choisit la méthode côté serveur (`NeedVerdictService`)
 * et l'écran `/projects/needs` l'affiche ; le prompt du chat, lui, ne la
 * connaissait pas — Laura pouvait donc recommander AUTRE CHOSE que ce que
 * l'écran montre. Ce fichier est l'UNE dérivation texte de ce même objet
 * (GA-26) : l'API le rend, `apps/ia` le pose dans le prompt, la méthode n'est
 * jamais recalculée côté Python.
 *
 * #3390.9b (TRANCHÉ SANS LOUIS) — aucun seuil de saturation n'existe. La charge
 * mesurée (heures déclarées par semaine, actions en retard) est NOMMÉE comme
 * information à côté de la méthode ; elle ne la modifie pas et Laura n'en
 * déduit aucune « saturation ». Absente, ou nulle, la ligne n'existe pas :
 * jamais « 0 h », jamais « 0 retard ».
 *
 * Les libellés reprennent mot pour mot ceux de l'écran (`projects.json`,
 * `needs.method.*`) : un test exige qu'aucune valeur d'énumération n'en soit
 * dépourvue, pour que le modèle ne reçoive jamais un code brut.
 */

export const LAURA_COMMERCIAL_METHOD_LABELS_FR = {
  effortLevel: {
    focus: 'Focus',
    sprint_court: 'Sprint court',
    qualification_volume: 'Qualification au volume',
    partenaire_rang2: 'Partenaire / rang 2',
    veille: 'Veille',
    pause_sortie: 'Pause ou sortie',
  } satisfies Record<CommercialEffortLevel, string>,
  openingRoute: {
    reactivation_chaude: 'Réactivation chaude',
    approche_directe_ciblee: 'Approche directe ciblée',
    partenaire_rang2: 'Partenaire ou rang 2',
  } satisfies Record<CommercialOpeningRoute, string>,
  trajectory: {
    par_le_haut: 'Par le haut',
    par_le_terrain: 'Par le terrain',
    manager_intermediaire: 'Par un manager intermédiaire',
    parallele_relais_sponsor: 'En parallèle par relais et sponsor',
  } satisfies Record<CommercialMethodTrajectory, string>,
  usefulPeople: {
    decision_maker: 'le décideur',
    current_contact: 'l’interlocuteur déjà connu',
  } satisfies Record<CommercialUsefulPerson, string>,
  proof: {
    qualification: 'les axes manquants du verdict',
    shortlist: 'une shortlist présentable',
    client_agreement: 'l’accord du client sur la suite',
  } satisfies Record<CommercialMethodProof, string>,
  nextStep: {
    qualify: 'Qualifier ce qui manque avant tout message',
    build_shortlist: 'Constituer la shortlist',
    widen_sourcing: 'Élargir la recherche de profils',
    reconsider: 'Ne rien engager — dossier en pause',
  } satisfies Record<CommercialMethodAction, string>,
  switchCondition: {
    on_qualification_complete: 'Bascule quand la qualification est complète',
    on_shortlist_ready: 'Bascule quand la shortlist est prête',
    on_verdict_no_go: 'Bascule si le verdict devient NON',
    on_client_silence: 'Bascule si le client reste silencieux',
    on_human_reopens: 'Ne reprend que sur une réouverture humaine',
    already_met: 'Déjà atteinte',
  } satisfies Record<CommercialMethodCondition, string>,
  stopCondition: {
    on_qualification_complete: 'S’arrête quand la qualification est complète',
    on_shortlist_ready: 'S’arrête quand la shortlist est prête',
    on_verdict_no_go: 'S’arrête si le verdict devient NON',
    on_client_silence: 'S’arrête si le client reste silencieux',
    on_human_reopens: 'Ne reprend que sur une réouverture humaine',
    already_met: 'Déjà arrêté',
  } satisfies Record<CommercialMethodCondition, string>,
} as const

/** La charge MESURÉE ou déclarée du lecteur — `NeedCommercialContext` de la réponse verdict. */
export interface LauraMethodLoad {
  readonly weeklyAvailableHours?: number | null
  readonly overdueActions?: number | null
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function renderLauraCommercialMethodContext(input: {
  readonly method: CommercialMethodChoice
  readonly commercialContext?: LauraMethodLoad | null
  /** `account` : aucun besoin ouvert — le verdict n'est pas évaluable, relation et accès NON mesurés. */
  readonly scope?: 'need' | 'account'
}): string {
  const l = LAURA_COMMERCIAL_METHOD_LABELS_FR
  const { method } = input
  const lines: string[] = [`- Niveau d'effort : ${l.effortLevel[method.effortLevel]}`]
  if (method.openingRoute) lines.push(`- Route d'ouverture : ${l.openingRoute[method.openingRoute]}`)
  if (method.trajectory) lines.push(`- Trajectoire : ${l.trajectory[method.trajectory]}`)
  if (method.usefulPeople.length > 0) {
    lines.push(`- Personnes utiles : ${method.usefulPeople.map(person => l.usefulPeople[person]).join(', ')}`)
  }
  if (method.requiredProof) lines.push(`- Preuve nécessaire : ${l.proof[method.requiredProof]}`)
  lines.push(`- Action suivante : ${l.nextStep[method.nextStep]}`)
  lines.push(`- Condition de bascule : ${l.switchCondition[method.switchCondition]}`)
  lines.push(`- Condition d'arrêt : ${l.stopCondition[method.stopCondition]}`)

  const load = input.commercialContext
  const loadLines: string[] = []
  if (positive(load?.weeklyAvailableHours)) {
    loadLines.push(`- Sa capacité déclarée : ${load.weeklyAvailableHours} h par semaine`)
  }
  if (positive(load?.overdueActions)) loadLines.push(`- Ses actions en retard : ${load.overdueActions}`)

  return [
    input.scope === 'account'
      ? "MÉTHODE COMMERCIALE RETENUE POUR CE COMPTE (aucun besoin ouvert : verdict non évaluable, relation et accès NON mesurés — dis-le, ne les devine pas ; choisie par Bellum avant tout message : recommande celle-ci, n'en propose pas une autre) :"
      : "MÉTHODE COMMERCIALE RETENUE POUR SON BESOIN OUVERT (choisie par Bellum à partir du verdict, avant tout message — c'est la MÊME que celle affichée sur l'écran des besoins : recommande celle-ci, n'en propose pas une autre) :",
    ...lines,
    ...(loadLines.length > 0
      ? [
          'Sa charge, à NOMMER à côté de la méthode comme une information (mesurée ou déclarée par lui) :',
          ...loadLines,
          "Aucun seuil de saturation n'existe : ne conclus pas à une saturation et ne change pas la méthode à cause de ces chiffres.",
        ]
      : []),
  ].join('\n')
}
