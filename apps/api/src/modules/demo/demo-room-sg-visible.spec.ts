import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2927 / #3532 (lot X80, recette Y23) — « le jeu semé n'a pas Société Générale (8 comptes) ».
 * Le semis l'écrit en PREMIER ; ce garde prouve qu'aucun filtre par défaut de `/accounts` ne peut
 * le masquer (ni retiré du pipe, ni archivé) et qu'il porte de quoi rendre jouables l'import
 * « Moi seul » (contacts à qui rattacher l'import) et l'historique.
 */
describe('Société Générale dans la salle de démonstration', () => {
  const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')

  it('est le premier dossier semé', () => {
    expect(DEMO_DOSSIERS[0]?.account.company_name).toBe('Société Générale')
  })

  it('n’est ni archivé ni écarté du pipe (sinon le filtre par défaut le masquerait)', () => {
    expect(sg?.account.commercial_status).toBe('watching')
    expect(sg?.account.commercial_status).not.toBe('archived')
  })

  it('porte des contacts pour l’import « Moi seul » (la salle les montre dans Personnes)', () => {
    expect((sg?.contacts.length ?? 0) > 0).toBe(true)
  })
})
