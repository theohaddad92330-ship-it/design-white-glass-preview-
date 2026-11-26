import type { Account, AnalysisStatus, CommercialLifecycle, DossierHeroState, PriorityGate } from '@bellum/contracts'
import { isNeverAnalyzed, parseAccountAnalysis } from '@bellum/contracts'
import { deriveImmediateAction } from '../tabs/useAccountOverviewData'

/**
 * #2117.6, .25-29 — QU'EST-CE QUE JE FAIS DE CE COMPTE, MAINTENANT ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le hero du dossier portait UN bouton, le même pour tout le monde :
 * « Actualiser l'analyse ». Un dossier jamais terminé, un dossier complet sans
 * plan et un dossier avec un rendez-vous jeudi recevaient le même conseil — et
 * aucun des trois n'était le bon. Le retour #2117 le dit en une ligne : « le
 * hero doit afficher l'action principale à effectuer ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UNE FONCTION PURE, ET PAS UN `useMemo` DANS LE HERO
 * ─────────────────────────────────────────────────────────────────────────
 * Parce qu'un état qu'aucun compte ne déclenche n'est pas livré. Écrite ici,
 * la décision se montre un état à la fois (`heroPrimaryAction.test.ts`) et se
 * relit sans monter un écran : les CINQ champs qui décident sont les cinq
 * paramètres, et rien d'autre n'entre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ORDRE DES QUESTIONS, ET POURQUOI IL EST CELUI-LÀ
 * ─────────────────────────────────────────────────────────────────────────
 *  1. L'analyse est-elle allée au bout ? Sinon, le reste du dossier n'existe
 *     pas : proposer « Préparer le plan » enverrait sur un onglet vide.
 *  2. Un rendez-vous est-il posé ? C'est la seule échéance DATÉE du dossier —
 *     elle passe devant tout ce qui peut attendre demain.
 *  3. La PORTE dit-elle « mis de côté » ? Là, quelqu'un a décidé de ne pas
 *     travailler ce compte : lui proposer de continuer un plan contredirait
 *     la décision qu'on vient de prendre.
 *  4. Y a-t-il une prochaine action ? Alors elle se continue, et elle se NOMME.
 *  5. Le statut commercial dit-il « En observation » ? Rien à continuer, mais
 *     il y a quelque chose à surveiller : « Voir ce qui a changé ».
 *  6. Sinon, il reste à décider quoi faire : « Préparer le plan ».
 *
 * ⚠ LES DEUX « VEILLES » NE SONT PAS AU MÊME RANG, et c'est le cœur de cet
 * ordre. `priority_gate: 'parked'` est une DÉCISION explicite (« on ne
 * travaille pas ce compte ») ; `commercial_status: 'watching'` est une ÉTAPE
 * du cycle commercial (« En observation », entre « À trier » et
 * « À potentiel »). Les confondre ferait disparaître « Continuer la prochaine
 * action » de tout un pan du portefeuille : dans le jeu de démonstration, les
 * CINQ comptes sont `watching`, et plusieurs portent une action immédiate. Le
 * schéma du compte prévient déjà de ne jamais fusionner ces deux axes — la
 * première version de cette fonction l'a fait quand même, et c'est la donnée
 * de démo qui l'a montré.
 */

/**
 * Les états d'analyse qui veulent dire « ce dossier n'est pas fini ».
 *
 * ⚠ `archived` et `deleted` n'y sont PAS : ce sont des états de CYCLE DE VIE,
 * pas d'avancement. Un dossier archivé a très bien pu être analysé jusqu'au
 * bout ; lui proposer « Terminer l'analyse » relancerait un run sur un compte
 * qu'on a rangé.
 */
// #4459.1 — `imported` (compte versé par un import du CRM, jamais analysé) en était absent : il tombait sur
// « Préparer le plan », un onglet vide. Il rejoint `prospect` — même geste, « Analyser le compte ».
const INCOMPLETE_ANALYSIS: readonly AnalysisStatus[] = ['prospect', 'imported', 'analyzing', 'error', 'canceled']

export type HeroPrimaryActionInput = {
  /** #2117.25 — le statut D'ANALYSE (`analysisStatusSchema`), pas le commercial. */
  status: AnalysisStatus
  /** #2117.29 — le statut COMMERCIAL ; `watching` = « on regarde ». */
  commercialStatus: CommercialLifecycle | undefined
  /** #2117.29 — la porte de priorisation ; `parked` = mis de côté, donc en veille. */
  priorityGate: PriorityGate | undefined
  /** #2117.27 — la prochaine action du plan, telle qu'elle s'écrit. `null` = aucune. */
  nextActionLabel: string | null
  /** #2117.28 — un rendez-vous est posé à l'agenda sur ce compte. */
  meetingBooked: boolean
}

type HeroPrimaryActionChoice = {
  state: DossierHeroState
  /** L'identifiant de contrat du bouton (`DOSSIER_CTA_CONTRACTS`). */
  cta: string
  /** #2117.27 — la prochaine action, NOMMÉE, quand l'état est `plan-active`. */
  nextActionLabel: string | null
  /**
   * #2117.80 — recette 23/09, prod 7e7105fb7 : sur un compte riche, la phrase
   * qui NOMME l'action se lit sans scroll (<5s). Sur un compte pauvre en
   * veille (`watching` SANS porte `parked`), rien ne le disait dans l'en-tête
   * — il fallait descendre ~700px jusqu'à la carte « Prochaine action » pour
   * apprendre qu'il n'y en a aucune. `'noAction'` porte cette moitié
   * manquante ; `'parked'` reste muet — une décision humaine de mettre le
   * compte de côté n'est pas une absence à annoncer (elle peut cacher une
   * action déjà posée, ignorée par choix). `null` hors de l'état `watching`.
   */
  watchingReason: 'parked' | 'noAction' | null
  /**
   * #4459.1 — dans l'état `analysis-incomplete`, le dossier n'a JAMAIS été analysé (`isNeverAnalyzed`, règle
   * unique du contrat) : le bouton dit « Analyser le compte », pas « Terminer l'analyse » — rien n'a commencé.
   */
  neverAnalyzed: boolean
}

/**
 * L'entrée de contrat de chaque état. Exportée pour que le test prouve que les
 * cinq états du registre ont chacun la leur — un état sans bouton est un
 * dossier à qui le produit n'a rien à dire.
 */
export const HERO_PRIMARY_ACTIONS: Record<DossierHeroState, string> = {
  'analysis-incomplete': 'dossier.hero.finishAnalysis',
  'meeting-booked': 'dossier.hero.prepareMeeting',
  watching: 'dossier.hero.seeChanges',
  'plan-active': 'dossier.hero.continueNextAction',
  'no-plan': 'dossier.hero.preparePlan',
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** #2117.6 — l'état du dossier, et le geste qui va avec. */
export function heroPrimaryAction(input: HeroPrimaryActionInput): HeroPrimaryActionChoice {
  const nextActionLabel = nonEmpty(input.nextActionLabel)
  const state = decideState(input, nextActionLabel)
  return {
    state,
    cta: HERO_PRIMARY_ACTIONS[state],
    nextActionLabel: state === 'plan-active' ? nextActionLabel : null,
    // Les DEUX seuls chemins qui mènent à `watching` (voir `decideState`) sont
    // `priorityGate === 'parked'` et « pas de prochaine action, compte en
    // observation » — jamais les deux en même temps, la porte passe devant.
    watchingReason: state !== 'watching' ? null : input.priorityGate === 'parked' ? 'parked' : 'noAction',
    neverAnalyzed: state === 'analysis-incomplete' && isNeverAnalyzed(input.status),
  }
}

function decideState(input: HeroPrimaryActionInput, nextActionLabel: string | null): DossierHeroState {
  if (INCOMPLETE_ANALYSIS.includes(input.status)) return 'analysis-incomplete'
  if (input.meetingBooked) return 'meeting-booked'
  // La porte passe devant le plan : c'est une décision prise sur CE compte.
  if (input.priorityGate === 'parked') return 'watching'
  if (nextActionLabel !== null) return 'plan-active'
  // L'étape de cycle ne passe pas devant : elle ne dit rien d'autre que
  // « la relation en est là », et elle ne contredit aucune action en cours.
  if (input.commercialStatus === 'watching') return 'watching'
  return 'no-plan'
}

/**
 * Les champs du compte qui décident, lus à UN seul endroit.
 *
 * La prochaine action vient de `deriveImmediateAction`, exactement celle que la
 * carte « Prochaine action » de l'onglet Synthèse affiche : deux dérivations
 * concurrentes diraient un jour deux choses différentes sur le même écran.
 */
export function heroPrimaryActionInput(account: Account, meetingBooked: boolean): HeroPrimaryActionInput {
  return {
    status: account.status,
    commercialStatus: account.commercial_status,
    priorityGate: account.priority_gate,
    nextActionLabel: deriveImmediateAction(parseAccountAnalysis(account.raw_analysis)),
    meetingBooked,
  }
}
