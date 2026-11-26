import { REGULAR_USAGE_ACTIVATIONS, suggestProfileUpdateFromUsage } from './profile-update-suggestion'

/**
 * #2455.6 — « Mise à jour du profil principal jamais automatique, diff affiché ».
 *
 * Cette fonction ne fait QUE calculer un diff À PROPOSER — elle n'écrit rien,
 * nulle part (`work-contexts.service.spec.ts` garde déjà « n'écrit jamais dans
 * profiles/esn_profiles »). Elle dit NON dès qu'une des deux conditions
 * manque : un usage pas encore régulier, ou un contexte qui ne diverge pas du
 * profil actuel — jamais une proposition sur un signal trop faible.
 */
describe('suggestProfileUpdateFromUsage (#2455.6)', () => {
  it('ne propose rien sous le seuil d’usage régulier', () => {
    expect(
      suggestProfileUpdateFromUsage({
        contextSectors: ['Aéronautique'],
        activationCount: REGULAR_USAGE_ACTIVATIONS - 1,
        currentTargetSectors: ['Banque'],
      }),
    ).toBeNull()
  })

  it('ne propose rien sans secteur sur le contexte (rien à diffuser)', () => {
    expect(
      suggestProfileUpdateFromUsage({
        contextSectors: [],
        activationCount: REGULAR_USAGE_ACTIVATIONS,
        currentTargetSectors: ['Banque'],
      }),
    ).toBeNull()
  })

  it('ne propose rien quand le contexte ne diverge pas du profil (même ensemble)', () => {
    expect(
      suggestProfileUpdateFromUsage({
        contextSectors: ['Banque', 'Assurance'],
        activationCount: REGULAR_USAGE_ACTIVATIONS,
        currentTargetSectors: ['Assurance', 'Banque'],
      }),
    ).toBeNull()
  })

  it('propose un diff au seuil, quand le contexte diverge', () => {
    expect(
      suggestProfileUpdateFromUsage({
        contextSectors: ['Aéronautique', 'Défense'],
        activationCount: REGULAR_USAGE_ACTIVATIONS,
        currentTargetSectors: ['Banque'],
      }),
    ).toEqual({
      field: 'target_sectors',
      current: ['Banque'],
      suggested: ['Aéronautique', 'Défense'],
    })
  })

  it('dédoublonne les secteurs suggérés', () => {
    expect(
      suggestProfileUpdateFromUsage({
        contextSectors: ['Aéronautique', 'Aéronautique'],
        activationCount: REGULAR_USAGE_ACTIVATIONS,
        currentTargetSectors: [],
      }),
    ).toEqual({
      field: 'target_sectors',
      current: [],
      suggested: ['Aéronautique'],
    })
  })
})
