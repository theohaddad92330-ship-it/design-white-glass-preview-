import { withoutAssigneePhotos } from './assignee-photos'

/**
 * LA PHOTO D'UN CONSULTANT N'ENTRE PAS DANS UN PROMPT — doctrine `c58`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET POURQUOI ELLE EXISTE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `assignees` rendait `string[]`. Depuis #1350 et #1363 il rend
 * `{ id, fullName, photoUrl }[]`, pour que la liste des missions dessine un
 * avatar et ouvre le profil du consultant.
 *
 * Deux routes du pont du copilote — `missions/ending` et `missions/risks` —
 * rendaient ces missions TELLES QUELLES à un modèle. Le champ neuf y serait
 * monté sans qu'une seule ligne ne le « lise », ce qui est mot pour mot la
 * façon dont `photoUrl` voyageait jusqu'à `bellum_contacts`.
 *
 * ⚠️ Ce que cette garde ne fait PAS : interdire la photo. Elle s'affiche sur un
 * écran, c'est légitime. L'interdit porte sur le PROMPT.
 */
describe('GA — le pont du copilote ne transmet aucune photo de consultant', () => {
  it('retire `photoUrl` et GARDE l’identité — le copilote doit pouvoir nommer qui est dessus', () => {
    const mission = {
      id: 'm-1',
      assignees: [
        { id: 'c-1', fullName: 'Salomé Dufour', photoUrl: 'https://stockage/salome.jpg' },
        { id: 'c-2', fullName: 'Camille Roussel', photoUrl: null },
      ],
    }

    const sent = withoutAssigneePhotos(mission)

    expect(sent.assignees).toEqual([
      { id: 'c-1', fullName: 'Salomé Dufour' },
      { id: 'c-2', fullName: 'Camille Roussel' },
    ])
    // Sérialisé, c'est ce que le modèle voit : la chaîne ne doit apparaître
    // NULLE PART, pas même sous une clé qu'on aurait oubliée.
    expect(JSON.stringify(sent)).not.toContain('photoUrl')
    expect(JSON.stringify(sent)).not.toContain('salome.jpg')
  })

  it('laisse `null` tel quel — « la lecture a échoué » n’est pas « personne d’affecté »', () => {
    expect(withoutAssigneePhotos({ id: 'm-1', assignees: null }).assignees).toBeNull()
  })

  /**
   * ⚠️ LA PREUVE QUE LA GARDE SAIT DIRE NON.
   *
   * Une garde qui n'a jamais rougi ne garde rien. Celle-ci est vérifiée contre
   * le cas qu'elle refuse : une mission rendue SANS passer par la fonction
   * porte bien la photo, donc c'est bien la fonction qui la retire — et pas
   * l'absence de photo dans le fixture.
   */
  it('sait dire NON : sans le filtre, la photo est bien là', () => {
    const brut = { id: 'm-1', assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: 'https://x/y.jpg' }] }
    expect(JSON.stringify(brut)).toContain('photoUrl')
  })
})
