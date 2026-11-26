import { buildTalentDeletionPreview } from './talent-deletion-preview'

/**
 * L'aperçu de suppression d'un talent (PDF 3 §7.3).
 *
 * Aujourd'hui `DELETE /consultants/:id` fait un vrai `DELETE`, sans
 * confirmation et sans dire ce qui part. Le §7.3 exige l'inverse : un bouton
 * qui LISTE avant d'exécuter. Le calcul est pur, donc testable sans base — et
 * il faut qu'il le soit, parce que c'est le dernier écran avant un geste
 * irréversible.
 */
describe('buildTalentDeletionPreview', () => {
  const EMPTY = {
    skills: 0,
    documents: 0,
    submissions: 0,
    cvRewrites: 0,
    pushFeedback: 0,
    assignments: 0,
    openAssignments: 0,
  }

  it('ne liste QUE ce qui existe — un compteur à zéro ne produit pas de ligne', () => {
    // Une liste qui annonce « 0 compétence, 0 document, 0 positionnement » se
    // lit comme un formulaire, pas comme un avertissement. Ce qui doit sauter
    // aux yeux, c'est ce qui va vraiment disparaître.
    const preview = buildTalentDeletionPreview(EMPTY)
    expect(preview.deleted).toEqual([])
    expect(preview.orphaned).toEqual([])
    expect(preview.blocking).toEqual([])
  })

  it('compte ce qui part en cascade', () => {
    const preview = buildTalentDeletionPreview({ ...EMPTY, skills: 12, documents: 2, submissions: 3 })
    expect(preview.deleted).toEqual([
      { key: 'skills', count: 12 },
      { key: 'documents', count: 2 },
      { key: 'submissions', count: 3 },
    ])
  })

  it('sépare ce qui devient ORPHELIN de ce qui est supprimé', () => {
    // `mission_assignments`, `consultant_cv_rewrites` et
    // `consultant_push_feedback` n'ont AUCUNE clé étrangère vers `consultants` :
    // la ligne survit et pointe dans le vide. Le taire ferait croire que la
    // suppression est propre, alors qu'elle fausse la charge d'une mission.
    const preview = buildTalentDeletionPreview({ ...EMPTY, assignments: 2, cvRewrites: 1, pushFeedback: 4 })
    expect(preview.orphaned).toEqual([
      { key: 'assignments', count: 2 },
      { key: 'cvRewrites', count: 1 },
      { key: 'pushFeedback', count: 4 },
    ])
    expect(preview.deleted).toEqual([])
  })

  it('BLOQUE quand une affectation est encore en cours', () => {
    // Un consultant en mission ne se supprime pas : la mission perdrait sa
    // charge sans que personne ne s'en aperçoive. Le §13.2 demande l'archivage
    // dans ce cas, pas l'effacement.
    const preview = buildTalentDeletionPreview({ ...EMPTY, assignments: 1, openAssignments: 1 })
    expect(preview.blocking).toEqual(['open_assignments'])
  })

  it('ne bloque PAS sur des affectations toutes terminées', () => {
    const preview = buildTalentDeletionPreview({ ...EMPTY, assignments: 3, openAssignments: 0 })
    expect(preview.blocking).toEqual([])
    expect(preview.orphaned).toContainEqual({ key: 'assignments', count: 3 })
  })

  it('dit ce qui est CONSERVÉ — le journal d’audit ne part pas avec la fiche', () => {
    // Savoir que quelqu'un a existé et a été effacé fait partie de la preuve
    // qu'on respecte une politique de rétention. L'effacer aussi rendrait la
    // conformité invérifiable.
    const preview = buildTalentDeletionPreview(EMPTY)
    expect(preview.kept).toEqual(['audit_trail'])
  })
})
