/**
 * #2123.61-.68 — LES PARAMÈTRES DU MESSAGE, CHOISIS DANS LE COMPOSER.
 *
 * Objectif, relation, persona et appel à l'action étaient DÉRIVÉS par le moteur
 * (`apps/ia/app/services/message_brief.py`) ; signal, offre et preuve n'avaient
 * pas de champ. Un paramètre choisi GAGNE sur la dérivation — côté moteur, sa
 * provenance vaut `formulaire`. Laissé vide, il ne part pas : le moteur reprend
 * la main, et le corps envoyé est celui d'avant.
 *
 * ⚠️ Les codes sont ceux du moteur, qui les revalide (422 sur un inconnu).
 * `apps/ia/tests/test_message.py` LIT ce fichier : un code ajouté d'un seul côté
 * fait rougir la CI.
 */
export const MESSAGE_OBJECTIVE_CODES = [
  'ouverture_compte',
  'relance',
  'reprise_relation',
  'demande_information',
  'recommandation',
  'positionnement_expertise',
  'nurturing',
  'suivi_rendez_vous',
  'renouvellement',
  // #2374.6 — un document (dossier, étude de cas, proposition) a déjà été
  // envoyé ; ce message en fait le suivi.
  'suivi_document',
  // #2947/#2204.22 — demander une introduction vers un tiers déjà nommé.
  'introduction',
  // #2947/#2204.27 — explorer un partenariat entre organisations.
  'partenariat',
  // #2371.3 (reste) — pousser un consultant identifié pour un besoin ou une
  // opportunité (scénario D de #2386, « push profil »).
  'proposer_profil',
  // #2204.21 (épopée #2947) — valider un contexte déjà entrevu (une hypothèse
  // à faire confirmer), distinct d'« obtenir une information précise ».
  'valider_contexte',
  // #4060 — approche directe, choisie : aucun signal ni accroche imposés.
  'approche_directe',
] as const
export const MESSAGE_RELATIONSHIP_CODES = [
  'froid',
  'connu',
  'linkedin',
  'dormant',
  'refere',
  'ancien_client',
  'rang2',
  'client_actif',
  'besoin_ouvert',
  // #2371.4 (#2887) — 10e stade : ESN partenaire avec des placements en cours.
  'partenaire_actif',
] as const
export const MESSAGE_CTA_CODES = [
  'question_facile',
  'sortie_elegante',
  'ce_qui_a_change',
  'echange_court',
  'vers_qui',
  'aucune_demande',
  'prochaine_etape',
  // #2947/#2204.22
  'demander_intro',
  // #2947/#2204.27
  'explorer_partenariat',
] as const

/** Les bornes du moteur (`MessageParameters`) — un texte plus long y serait refusé. */
export const MESSAGE_TEXT_PARAMETER_MAX = {
  signal: 300,
  offer: 160,
  proof: 300,
  scope: 160,
  problem: 300,
  constraints: 300,
  // #3892.6 — champs facultatifs repliés.
  service: 160,
  period: 160,
  experience: 300,
} as const

export type MessageParameterKey =
  | 'objective'
  | 'relationship'
  | 'persona'
  | 'signal'
  | 'offer'
  | 'proof'
  | 'cta'
  // #2204.7 — le périmètre visé ; #2204.15 — les contraintes de forme.
  | 'scope'
  // #3418.8 — le problème à adresser.
  | 'problem'
  | 'constraints'
  // #3892.6 (Louis 15/10) — type de prestation, période, expérience passée.
  | 'service'
  | 'period'
  | 'experience'
export type MessageParameters = Partial<Record<MessageParameterKey, string>>

/** Les seuls paramètres renseignés, rognés ; `undefined` quand rien n'est choisi. */
export function chosenParameters(parameters: MessageParameters): MessageParameters | undefined {
  const chosen: MessageParameters = {}
  for (const [key, value] of Object.entries(parameters) as [MessageParameterKey, string | undefined][]) {
    const trimmed = value?.trim()
    if (trimmed) chosen[key] = trimmed
  }
  return Object.keys(chosen).length > 0 ? chosen : undefined
}
