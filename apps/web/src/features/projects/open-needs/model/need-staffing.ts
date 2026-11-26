import { submissionFunnel, type OpenNeedRow, type Submission } from '@bellum/contracts'

/**
 * Le bandeau « Staffing » d'une fiche besoin (dossier du 26/08, image 02) :
 * candidats suggérés, entretiens planifiés, propositions envoyées, missions
 * attribuées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE DÉRIVATION PURE, QUI EN RÉUTILISE UNE AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois premiers compteurs sont un histogramme des `SUBMISSION_STAGES`
 * (`packages/contracts/src/schemas/submission.ts`) sur les positionnements de
 * CE besoin — exactement ce que `submissionFunnel().byStage` calcule déjà. Ce
 * fichier ne le refait pas : « une dérivation vit à un seul endroit » (loi 1
 * du tome 7, garde GA-26) vaut aussi pour une agrégation par étape, pas
 * seulement pour un taux.
 *
 *  - **candidats suggérés** = `shortlisted` : retenus en interne, rien envoyé
 *    au client (docblock de `SUBMISSION_STAGES`).
 *  - **entretiens planifiés** = `interview` : le client a demandé à
 *    rencontrer la personne. Ce n'est pas une jointure sur la table
 *    `interviews` (qui porte la DATE et le MODE d'un entretien) — cette
 *    jointure existe pour le module Positionnements, pas pour un bandeau de
 *    résumé, et l'ajouter ici dupliquerait un second chemin de lecture sur la
 *    même information. Le STADE du positionnement suffit à répondre à la
 *    question du bandeau : combien de profils en sont là.
 *  - **propositions envoyées** = `submitted` : le CV est PARTI chez le
 *    client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « MISSIONS ATTRIBUÉES » — LE REVIREMENT DU 31/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'à cette date, ce quatrième chiffre était rendu « non mesuré », et la
 * raison écrite ici était JUSTE : une `MissionEntity` ne portait que
 * `opportunity_id`, l'identité du PROJET, et un projet porte souvent plusieurs
 * besoins. Compter les missions du projet et les afficher sous CE besoin aurait
 * attribué à un rôle précis un chiffre qui appartient à l'affaire entière — la
 * même faute que `NeedPositioningsTab` refuse déjà pour les positionnements.
 *
 * Louis a tranché : plutôt que garder un « non mesuré » définitif, on POSE le
 * lien manquant. `missions.need_id` existe (migration `1791001000001`), le
 * geste `create_mission` le remplit quand l'affaire ne porte qu'un seul rôle,
 * et `OpenNeedsService.list` sert le compte.
 *
 * ⚠️ ET LE ZÉRO RESTE INTERDIT SUR LA MOITIÉ DE LA POPULATION. Les missions
 * créées AVANT ce lien ne le portent pas, et rien ne peut le deviner pour
 * elles. C'est pour cela que la ligne porte DEUX comptes :
 *
 *  · `missions_assigned` — les missions qui disent venir de ce rôle ;
 *  · `project_missions_unlinked` — les missions de l'affaire qui ne disent pas
 *    de quel rôle elles viennent.
 *
 * Trois situations, trois phrases DIFFÉRENTES, et c'est tout l'objet de
 * {@link missionsAssignedOf} :
 *
 *  1. aucune mission nulle part ⇒ **`0`**, et ce zéro est VRAI : la requête a
 *     compté, elle n'a rien trouvé ;
 *  2. des missions sans rôle sur l'affaire, aucune sur ce besoin ⇒ **non
 *     mesuré**. « 0 » affirmerait « aucune mission n'est née d'ici » alors
 *     qu'on ne peut pas le savoir ;
 *  3. au moins une mission liée, plus des missions sans rôle ⇒ le compte, et
 *     il est annoncé comme un **plancher** — c'est la même honnêteté que le
 *     cumul du kanban, qui compte à part les besoins sans TJM.
 *
 * Le cas 4 — le serveur ne dit rien du tout (`undefined`, API antérieure au
 * lot pendant la minute où le web est déployé et pas encore elle) — est un non
 * mesuré lui aussi, mais pour une raison DIFFÉRENTE, et l'écran le dit
 * autrement : « la lecture n'a pas rendu ce compte ».
 */
interface NeedStaffingBand {
  /** Tous les positionnements du besoin — la source du rail « profils retenus » (chain-projectors). */
  retainedProfiles: number
  interviewsScheduled: number
  proposalsSent: number
}

export function deriveNeedStaffingBand(submissions: readonly Submission[], needId: string): NeedStaffingBand {
  const scoped = submissions.filter(item => item.needId === needId)
  const funnel = submissionFunnel(
    scoped.map(item => ({
      stage: item.stage,
      submittedAt: item.submittedAt,
      firstFeedbackAt: item.firstFeedbackAt,
      outcomeReason: item.outcomeReason,
    })),
  )
  return {
    retainedProfiles: scoped.length,
    interviewsScheduled: funnel.byStage.interview ?? 0,
    proposalsSent: funnel.byStage.submitted ?? 0,
  }
}

/**
 * Ce que la case « mission attribuée » a le droit d'afficher.
 *
 * Union DISCRIMINÉE et non un `number | null` : l'écran doit choisir entre
 * trois phrases, et un `null` nu l'obligerait à re-deviser laquelle — c'est-à-dire
 * à refaire la dérivation dans du JSX, là où plus personne ne la teste.
 */
type NeedMissionsAssigned =
  /** Le compte est mesuré. `unlinked > 0` = des missions de l'affaire ne disent
   *  pas leur rôle, donc ce compte est un MINORANT et l'écran doit le dire. */
  | { measured: true; count: number; unlinked: number }
  /** `unlinked` : des missions existent sur l'affaire, aucune ne porte de rôle.
   *  `unserved` : le serveur n'a pas rendu les comptes (déploiement en cours). */
  | { measured: false; reason: 'unlinked' | 'unserved'; unlinked: number }

export function missionsAssignedOf(
  need: Pick<OpenNeedRow, 'missions_assigned' | 'project_missions_unlinked'>,
): NeedMissionsAssigned {
  const assigned = need.missions_assigned
  const unlinked = need.project_missions_unlinked
  // ⚠️ `== null` couvre `undefined` ET `null` : les deux veulent dire « le
  // serveur ne l'a pas dit », et aucun ne veut dire « zéro ». Les DEUX comptes
  // sont exigés — sans le second, on ne peut pas savoir si le premier est un
  // fait ou un plancher, et un `?? 0` posé ici transformerait précisément cette
  // ignorance en affirmation.
  if (assigned == null || unlinked == null) return { measured: false, reason: 'unserved', unlinked: 0 }
  if (assigned === 0 && unlinked > 0) return { measured: false, reason: 'unlinked', unlinked }
  return { measured: true, count: assigned, unlinked }
}
