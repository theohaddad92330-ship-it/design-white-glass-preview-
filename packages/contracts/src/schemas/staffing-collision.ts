import { CLOSED_SUBMISSION_STAGES, type Submission } from './submission.js'

/**
 * #2325.34 — le sous-ensemble dont {@link detectStaffingCollisions} a
 * réellement besoin. Un appelant qui ne lit QUE les positionnements (jamais
 * les opportunités auxquelles ils se rattachent) n'a pas à reconstituer un
 * {@link Submission} complet — la fonction restait PURE, seule sa porte
 * s'élargit pour accueillir un second appelant sans dupliquer le calcul.
 */
export type StaffingCollisionCandidate = Pick<Submission, 'id' | 'needId' | 'consultantId' | 'consultantName' | 'stage'>

/**
 * #2107.17, #2108.18, #2108.30 — CE QU'EST UNE « COLLISION », ET CE QU'ELLE
 * N'EST PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉFINITION, TRANCHÉE LE 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Une collision, c'est **deux positionnements OUVERTS du MÊME consultant sur
 * deux besoins concurrents**. Elle est calculable aujourd'hui, à partir des
 * positionnements ouverts : rien à collecter, rien à deviner.
 *
 * Trois issues employaient le mot sans qu'il ait de définition dans le produit
 * (`git grep collision` ne rendait que des collisions de code), et un mot sans
 * définition ne se code ni ne se recette.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CE QUI EST ÉCARTÉ, ET POURQUOI — décision de Louis du 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * L'autre lecture possible était **la collision entre COMMERCIAUX** : deux
 * vendeurs qui travaillent le même compte. Elle est **écartée**, et la raison
 * n'est pas technique : la détecter demanderait un suivi d'activité PAR
 * PERSONNE, c'est-à-dire exactement ce que « l'analytique mesure le PRODUIT,
 * jamais la personne » interdit. « Cet écran est abandonné » se dit ; « Sarah
 * travaille le même compte que Marc » ne se dit pas — le premier pas vers un
 * argument commercial, puis vers un reproche.
 *
 * ⚠️ Ce fichier ne compare donc JAMAIS deux propriétaires (`ownerId`) : le
 * champ existe sur un positionnement, il ne sert pas ici, et lui donner un rôle
 * de détection rouvrirait la porte fermée ci-dessus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « CONCURRENTS » — LE MOT QUI FAIT LE TRAVAIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux besoins sont concurrents quand ils sont DISTINCTS et que la personne ne
 * peut pas honorer les deux. On ne modélise pas la charge ici : deux
 * positionnements ouverts du même consultant sur deux besoins différents
 * SUFFISENT à poser la question, et c'est une question qu'on POSE à un humain,
 * jamais une décision qu'on prend.
 *
 * ⚠️ Un besoin INCONNU (`needId: null`) ne collisionne avec rien. Deux
 * positionnements sans rôle nommé pourraient viser le même ; les compter comme
 * concurrents inventerait un conflit. « Non mesuré » n'est pas « en collision ».
 */

/** Une collision NOMMÉE : qui, et sur quels deux besoins. */
export type StaffingCollision = {
  consultantId: string
  consultantName: string | null
  /** Les positionnements ouverts qui se disputent la personne, au moins deux. */
  submissionIds: readonly string[]
  /** Les besoins distincts visés, au moins deux. */
  needIds: readonly string[]
}

/** Un positionnement est OUVERT tant qu'il n'est pas clos — la liste des étapes
 *  closes vit dans `submission.ts` et n'est pas retapée ici (une seconde liste
 *  divergerait à la première étape ajoutée). */
function isOpen(submission: StaffingCollisionCandidate): boolean {
  return !CLOSED_SUBMISSION_STAGES.includes(submission.stage)
}

/**
 * Les collisions de staffing d'un ensemble de positionnements.
 *
 * Déterministe, sans effet de bord, et vide quand il n'y a rien : une liste
 * vide veut dire « aucune collision parmi CE QU'ON A LU », jamais « aucune
 * collision dans l'espace ».
 */
export function detectStaffingCollisions(submissions: readonly StaffingCollisionCandidate[]): StaffingCollision[] {
  const byConsultant = new Map<string, StaffingCollisionCandidate[]>()
  for (const submission of submissions) {
    if (!isOpen(submission)) continue
    if (!submission.needId) continue
    const bucket = byConsultant.get(submission.consultantId)
    if (bucket) bucket.push(submission)
    else byConsultant.set(submission.consultantId, [submission])
  }

  const collisions: StaffingCollision[] = []
  for (const [consultantId, bucket] of byConsultant) {
    const needIds = [...new Set(bucket.map(submission => submission.needId as string))]
    // DEUX besoins DISTINCTS, pas deux lignes : deux positionnements sur le même
    // besoin sont un doublon de saisie, pas un conflit d'agenda.
    if (needIds.length < 2) continue
    collisions.push({
      consultantId,
      consultantName: bucket.find(submission => submission.consultantName)?.consultantName ?? null,
      submissionIds: bucket.map(submission => submission.id),
      needIds,
    })
  }
  return collisions
}
