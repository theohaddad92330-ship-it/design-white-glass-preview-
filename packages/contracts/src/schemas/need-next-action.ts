import { z } from 'zod'
import type { OpenNeedRow } from './open-needs.js'

/**
 * La PROCHAINE ACTION d'un besoin ouvert (I-35).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE MANQUAIT, ET POURQUOI ELLE COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne « prochaine action » existe sur six écrans du produit — comptes,
 * veille, dossier, plan, tableau de bord, contact. Sur les BESOINS, c'est-à-dire
 * l'écran d'entrée du recruteur, elle était absente : la liste disait l'état de
 * chaque besoin, jamais ce qu'il fallait en faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉTERMINISTE, ET DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ordre n'est pas cosmétique : il va du plus BLOQUANT au plus avancé, parce
 * qu'une seule action s'affiche. Un besoin sans compétence typée ne peut pas
 * être matché ; le dire avant « aucun profil présenté » évite d'envoyer
 * quelqu'un chercher dans un vivier qui ne sera de toute façon pas interrogé.
 *
 * ⚠️ Aucune de ces réponses n'est une DEVINETTE. Chacune se lit sur un champ que
 * la ligne porte déjà. Quand rien ne se lit — un besoin en veille, ou clos —, on
 * rend `null` plutôt qu'un conseil générique : « relancer le client » affiché
 * sur tout ce qu'on ne sait pas classer est exactement le bruit qui fait cesser
 * de lire une colonne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SIXIÈME BRANCHE — « SAISIR LE TARIF », ET POURQUOI ELLE VIENT APRÈS `run_matching`
 * ─────────────────────────────────────────────────────────────────────────────
 * `target_tjm_cents == null` ne bloque PAS le matching : `axisRate`
 * (`apps/api/src/modules/consultants/matching/axes.ts`) rend cet axe
 * `NOT_EVALUABLE` quand le besoin ne fixe pas de TJM cible — il sort du
 * dénominateur (« non mesuré n'est pas mesuré à zéro »), il ne fait pas
 * échouer le rapprochement. Lancer le matching reste donc prioritaire sur la
 * saisie du tarif : obtenir des profils sur la table fait avancer le besoin
 * plus que remplir un champ que le moteur sait déjà contourner.
 *
 * En revanche, PRÉSENTER une shortlist sans tarif cible laisse le recruteur
 * négocier à l'aveugle — c'est la raison même de `c54_tarif_cible`
 * (`doctrine-registry.ts`) : « un recruteur qui positionne un profil a besoin
 * du prix de vente pour négocier ». La branche se place donc juste AVANT
 * `send_shortlist`, une fois qu'une shortlist existe : c'est le dernier moment
 * honnête pour la demander avant qu'elle ne parte chez le client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS BRANCHES DEMANDÉES, ET REFUSÉES — LA DONNÉE NE PERMET PAS DE LES DIRE HONNÊTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Une source en réclamait quatre de plus que les cinq d'origine. Une seule est
 * livrée (ci-dessus). Les trois autres ne le sont PAS, et pour la MÊME raison à
 * chaque fois : chacune suppose un fait qui vit dans `submissions` (le
 * POSITIONNEMENT — `apps/api/src/database/entities/submission.entity.ts`,
 * colonnes `submitted_at`, `stage`, `outcome_reason`), une table que cette
 * ligne ne porte pas et que `OpenNeedRow` (`open-needs.ts`) ne joint pas.
 *
 *  · **« Relancer le client »** — une shortlist ENVOYÉE, aucun retour depuis
 *    3 jours. Il faudrait la date d'envoi la plus RÉCENTE
 *    (`MAX(submissions.submitted_at)`) sur la ligne du besoin ; `shortlist_count`
 *    ne compte que des positionnements, sans dire QUAND ni s'ils ont eu un
 *    retour (`first_feedback_at`). La donnée EXISTE en base (migration
 *    `1789382641057-Submissions`), mais l'exposer exige d'ajouter un champ à
 *    `openNeedRowSchema` — un fichier hors du périmètre de ce lot.
 *  · **« Relancer le rapprochement »** — après un retour NÉGATIF du client. Il
 *    faudrait savoir qu'un positionnement est passé à `stage = 'rejected'`
 *    (ou son `outcome_reason`). Rien sur `OpenNeedRow` ne le dit : `status`
 *    revenant à `matching` ne distingue pas un refus client d'un poste
 *    supplémentaire à pourvoir sur le même besoin — le déduire de
 *    `shortlist_count > 0` serait la devinette que ce fichier refuse déjà en
 *    toutes lettres plus haut.
 *  · **« Créer la mission »** — quand un POSITIONNEMENT (pas le besoin) passe à
 *    `stage = 'accepted'`. `status === 'won'` n'est PAS le même fait : un
 *    besoin peut passer « gagné » sans qu'aucune ligne de ce fichier ne sache
 *    quel candidat a été accepté, et la création de mission existe déjà
 *    ailleurs, câblée sur le PROJET (`ProjectsController.applyStageActions`,
 *    effet `create_mission` sur le passage du projet à `won`) — un DEUXIÈME
 *    chemin câblé sur le besoin dupliquerait ce déclencheur sans l'information
 *    qui le justifie.
 *
 * Trois branches vraies valent mieux que quatre dont une devine.
 */
// #2175.37 — les LIBELLÉS de `set_target_rate` et `send_shortlist`
// (`openNeeds.nextAction.*`, `projects.json`) reprennent le vocabulaire de la
// demande (« Qualifier le budget », « Préparer le push ») — les CLÉS et le
// comportement ci-dessous sont inchangés (GA-26, une seule dérivation).
export const NEED_NEXT_ACTIONS = [
  /** Aucune compétence typée : le matching ne peut pas partir. */
  'type_skills',
  /** L'échéance de réponse est passée. On tranche, on ne prépare plus. */
  'decide_expired',
  /** #3348 (LAU-FINAL-258, recette prod 30/09) — la date de DÉMARRAGE est
   *  passée. Distinct de `decide_expired` (l'échéance de RÉPONSE) : un besoin
   *  peut n'avoir aucune échéance déclarée et être quand même caduc parce que
   *  le client voulait quelqu'un en poste avant une date qui n'existe plus. */
  'decide_stale_start',
  /** Déclaré NON staffable : c'est une décision à assumer, pas une file. */
  'answer_unstaffable',
  /** Rien n'a encore été présenté. */
  'run_matching',
  /** Une shortlist existe, mais aucun TJM cible pour la négocier. */
  'set_target_rate',
  /** Une shortlist existe : il reste à l'envoyer. */
  'send_shortlist',
] as const
export const needNextActionSchema = z.enum(NEED_NEXT_ACTIONS)
export type NeedNextAction = (typeof NEED_NEXT_ACTIONS)[number]

/** Les états qui ne demandent plus rien : le besoin ne circule pas. */
const SETTLED: readonly string[] = ['won', 'lost', 'cancelled', 'staffed', 'on_hold']

/**
 * Ce qu'il reste à faire sur ce besoin — ou `null` quand il n'y a rien à dire.
 *
 * `now` est un PARAMÈTRE : une échéance dépassée se teste sans horloge, et un
 * test qui dépend de l'heure de la machine finit rouge tout seul un matin (la
 * leçon du départage RAG, 27/08/2026).
 */
export function needNextAction(need: OpenNeedRow, now: Date): NeedNextAction | null {
  if (SETTLED.includes(need.status)) return null

  if (need.skills.length === 0) return 'type_skills'

  if (need.deadline_at) {
    const deadline = Date.parse(need.deadline_at)
    // Une échéance ILLISIBLE ne déclenche rien : mieux vaut ne rien dire que
    // pousser à trancher sur une date qu'on n'a pas su lire.
    if (!Number.isNaN(deadline) && deadline < now.getTime()) return 'decide_expired'
  }

  // #3348 — MÊME RÈGLE, sur la date de DÉMARRAGE plutôt que l'échéance de
  // réponse. Avant ce lot, seul `deadline_at` était regardé ici : un besoin
  // sans échéance déclarée mais dont le démarrage attendu était déjà passé
  // tombait tout droit sur `run_matching` — « Lancer le matching » — alors
  // que Laura (`laura_need_freshness.py`, côté chat) le disait déjà périmé
  // à partir du même champ. Deux lectures d'une même date ne peuvent pas
  // rendre deux verdicts : celle-ci est désormais la SEULE, et le pont
  // (`find_needs`) comme l'écran la lisent toutes les deux ici.
  if (need.start_on) {
    const startsOn = Date.parse(need.start_on)
    if (!Number.isNaN(startsOn) && startsOn < now.getTime()) return 'decide_stale_start'
  }

  if (need.staffable === 'no') return 'answer_unstaffable'
  if (need.shortlist_count === 0) return 'run_matching'
  // Le tarif se demande une fois qu'il y a quelqu'un à qui le négocier — pas
  // avant, puisque le matching tourne très bien sans lui (voir plus haut).
  if (need.target_tjm_cents === null) return 'set_target_rate'
  return 'send_shortlist'
}
