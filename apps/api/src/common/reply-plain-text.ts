import { replyPlainText, type ReplyPlainTextLabels } from '@bellum/contracts'

/**
 * #1914 — LE TEXTE D'UNE RÉPONSE À CARTES, POUR CE QUE L'API RELAIE HORS ÉCRAN.
 *
 * Laura écrit ses cartes dans le texte de sa réponse, entre deux clôtures
 * `bellum-block`. L'écran `/chat` les rend ; deux sorties de l'API ne passent
 * pas par lui et recevraient sinon du JSON :
 *  - `ask_bellum` (`mcp-api.controller.ts`) — lu par un client MCP, donc un modèle ;
 *  - le résumé roulant du fil (`ia-proxy.controller.ts`) — qui repart dans le prompt.
 *
 * L'algorithme est celui du contrat (`replyPlainText`) — une implémentation pour
 * TypeScript. Les libellés, eux, restent ici : un contrat porte la forme, jamais
 * le texte. Français, parce que ces deux sorties le sont — le client MCP
 * n'envoie aucune langue, le service IA lui répond donc en français, et le
 * résumé repart dans un prompt français. `reply-plain-text.spec.ts` les tient,
 * mot pour mot, au jeu partagé du contrat.
 */
const MACHINE_REPLY_TEXT_LABELS: ReplyPlainTextLabels = {
  why: 'Pourquoi',
  limits: 'Ce qui manque',
  whyNow: 'Pourquoi maintenant :',
  action: 'Action :',
  nextAction: 'Prochaine action :',
  rankedBy: 'Classé selon :',
  notEvaluated: 'Non évalué :',
  source: 'Source :',
  missing: 'Ce qui manque encore',
  need: 'Besoin :',
  fit: 'Ce qui correspond',
  gaps: 'Écarts',
  availability: 'Disponibilité :',
  objective: 'Objectif :',
  when: 'Quand :',
  owner: 'Qui :',
  attendees: 'Participants',
  talkingPoints: 'Points à aborder',
  // #4424.4 — le pitch de réunion de la carte `meeting_brief`.
  pitch: 'Pitch :',
  questions: 'Questions à poser',
  risks: 'Risques',
  unknowns: 'Ce qu’on ne sait pas',
  // #3340 — le brief consultant provisoire.
  role: 'Rôle :',
  previousRoles: 'Rôles précédents',
  seniority: 'Niveau d’expérience :',
  techFocus: 'Dominante technique :',
  functionalFocus: 'Dominante fonctionnelle :',
  technologies: 'Technologies connues',
  sectors: 'Secteurs connus',
  contractType: 'Type de contrat :',
  mobility: 'Mobilité :',
  workMode: 'Remote ou présentiel :',
  rateTarget: 'TJM ou coût cible :',
  failed: 'Ce qui a échoué',
  howToGet: 'Comment l’obtenir :',
  stillPossible: 'Ce qui reste faisable',
  notMeasured: 'non mesuré',
  timelineEmpty: 'Aucun historique enregistré pour ce compte.',
  // #2429.13 — la carte d'approche.
  angle: 'Angle d’accroche :',
  useCase: 'Cas d’usage :',
  noUseCase: 'aucune preuve concrète dans le dossier',
  // #3392 / #3428 — le sprint 10 dont 3.
  fullListCount: 'Liste complète (observations du marché) :',
  sprint: 'Sprint exécutable :',
  focus: 'À travailler à fond :',
  entryPoint: 'Porte d’entrée :',
  firstMove: 'Premier mouvement :',
  // #213.2 (#3228) — le contrat de comptage.
  deduplicated: 'Après déduplication :',
  resolvedIdentity: 'Après résolution d’identité :',
  coverage: 'Couverture :',
  // #3758 (reste du lot J14) — le compte rendu enregistré.
  decisions: 'Décisions',
  actions: 'Actions',
  recordedAt: 'Enregistré le :',
  reminder: 'Relance :',
  // #2985 (lot E07 08/10) — la revue de compte manager.
  managerReviewVerdict: 'Verdict :',
  managerReviewChangeDigest: 'Ce qui a changé :',
  managerReviewActionsCompleted: 'Actions réalisées',
  managerReviewActionsStalled: 'Actions non avancées',
  managerReviewDecisionsRequested: 'Décisions en attente',
  managerReviewArbitrations: 'Arbitrages demandés',
  managerReviewImportantFacts: 'Faits importants',
  managerReviewStatusAttention: 'Attention',
  managerReviewStatusStable: 'Stable',
  managerReviewStatusNotEvaluable: 'Non évaluable',
  managerReviewReasonStalledActions: 'action(s) non avancée(s)',
  managerReviewReasonRisks: 'risque(s) signalé(s)',
  managerReviewReasonCoverageGaps: 'lacune(s) de couverture',
  managerReviewReasonDecisionsPending: 'décision(s) en attente',
  managerReviewReasonArbitrationsPending: 'arbitrage(s) en attente',
}

export function machineReplyText(reply: string): string {
  return replyPlainText(reply, MACHINE_REPLY_TEXT_LABELS)
}
