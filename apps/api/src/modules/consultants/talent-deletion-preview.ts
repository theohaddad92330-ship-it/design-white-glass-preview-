/**
 * Ce qui se passe VRAIMENT quand on supprime un talent (PDF 3 §7.3).
 *
 * La suppression d'une fiche est le seul geste irréversible du vivier, et il
 * s'exécutait sans un mot. Trois catégories, parce que la réalité en a trois :
 *
 *  - **supprimé** — les tables liées par une clé étrangère en cascade ;
 *  - **orphelin** — les tables qui portent un `consultant_id` SANS clé
 *    étrangère. Leurs lignes survivent et pointent dans le vide. C'est un fait
 *    du schéma, pas une opinion, et le taire ferait croire à une suppression
 *    propre alors qu'une affectation orpheline fausse la charge d'une mission ;
 *  - **conservé** — ce qui reste par décision, et qu'il faut dire pour que
 *    « tout est effacé » ne devienne pas une promesse fausse.
 *
 * Pur, sans accès base : c'est le dernier écran avant l'irréversible, il doit
 * se tester sans monter un service.
 */

/** Les compteurs relus AVANT la suppression, chacun sur sa table. */
type TalentDeletionCounts = {
  skills: number
  documents: number
  submissions: number
  cvRewrites: number
  pushFeedback: number
  assignments: number
  /** Parmi les affectations, celles qui courent encore aujourd'hui. */
  openAssignments: number
}

type DeletionLine = { key: string; count: number }

export type TalentDeletionPreview = {
  /** Effacé par la base elle-même (`ON DELETE CASCADE`). */
  deleted: DeletionLine[]
  /** Survivra sans son talent — le schéma ne les rattache à rien. */
  orphaned: DeletionLine[]
  /** Conservé par décision. */
  kept: string[]
  /** Ce qui EMPÊCHE la suppression. Vide = le geste est possible. */
  blocking: string[]
}

/** N'ajoute la ligne que si le compteur est non nul. */
function line(key: string, count: number): DeletionLine[] {
  return count > 0 ? [{ key, count }] : []
}

export function buildTalentDeletionPreview(counts: TalentDeletionCounts): TalentDeletionPreview {
  return {
    deleted: [
      ...line('skills', counts.skills),
      ...line('documents', counts.documents),
      ...line('submissions', counts.submissions),
    ],
    orphaned: [
      ...line('assignments', counts.assignments),
      ...line('cvRewrites', counts.cvRewrites),
      ...line('pushFeedback', counts.pushFeedback),
    ],
    // Le journal d'écriture survit à la fiche : savoir qu'une personne a existé
    // et a été effacée EST la preuve qu'une politique de rétention est tenue.
    kept: ['audit_trail'],
    // Un consultant encore en mission ne se supprime pas. Le §13.2 demande
    // l'archivage dans ce cas — les missions restent, le profil sort des
    // matchings.
    blocking: counts.openAssignments > 0 ? ['open_assignments'] : [],
  }
}
