import { DEMO_RFP, DEMO_SG_COMPLETE_LEAD, DEMO_SUBMISSIONS_MIN_TOTAL } from './demo-dataset'

/**
 * #4197 (épopée #4191, lot L6) — PARITÉ DÉMO des écrans que la navigation
 * Affaires · Talents · Missions met en avant (craft rule n°9).
 *
 * Le lot ne crée AUCUNE donnée : il déplace et renomme des écrans. Ce qui doit
 * se lire en salle y est DÉJÀ semé, et ce fichier nomme, écran par écran, la
 * semence qui le remplit — pour que `demo-crm-nav.spec.ts` échoue le jour où
 * l'une d'elles disparaît, avant qu'un prospect ne tombe sur un écran vide.
 *
 *  · `/projects/pistes` (ex-lentille `?lens=portfolio`) — les pistes détectées
 *    d'`DEMO_SG_COMPLETE_LEAD` et ses voisines (intake `potential`/`detected`) ;
 *  · `/rfp` (onglet d'Affaires, maintenant TOUJOURS visible, plus de
 *    `hiddenUnless`) — le dossier `DEMO_RFP` semé par `seedRfp` ;
 *  · `/projects/presentations` (Affaires › Présentations ; ex-onglet de Talents
 *    `/consultants/submissions`, #4528) — les positionnements, au-delà d'une
 *    page (`DEMO_SUBMISSIONS_MIN_TOTAL`) ;
 *  · `/pilotage/pipe` (CA probable, ex-panneau de `/projects`) — les affaires
 *    du pipe, `DEMO_DELIVERY_CLIENT.pipelineProjects`, déjà lues par
 *    `useProbableQuarter`.
 *
 * ⚠️ Aucun titre ne porte « (test) » : ce suffixe est celui des dossiers de
 * recette en production, jamais d'une salle de démonstration — un prospect y
 * lirait un environnement de test. Le suffixe de la salle est « (démo) ».
 */
// #4340 / #4341 / #4349 (Louis 19/10/2026) — les onglets Pistes, Appels d'offres et Positionnements sont
// retirés ; leur contenu (et sa semence, inchangée) vit à ces adresses (#4528 : les présentations, Affaires › Présentations).
// #4545 (Louis 25/10/2026, revient sur #4340) — les pistes ont quitté Signaux (`/mes-cibles#pistes`) : le panneau
// des pistes du Pipe les porte, MÊME semence, aucune table ni clé de `raw_analysis` de plus (demo-coverage inchangé).
export const DEMO_CRM_NAV_SCREENS = [
  { route: '/projects?pistes=1', shows: 'pistes détectées', seededBy: DEMO_SG_COMPLETE_LEAD.label },
  { route: '/projects?lens=rfp', shows: 'appel d’offres', seededBy: DEMO_RFP.title },
  { route: '/projects/presentations', shows: 'présentations', seededBy: `${DEMO_SUBMISSIONS_MIN_TOTAL} lignes` },
] as const
