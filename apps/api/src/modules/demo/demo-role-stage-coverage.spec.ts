import { PLAYBOOK_STADES, ROLE_STAGE_PLAYBOOK, resolveRoleStageCell } from '@bellum/contracts'
import { DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * #3386 (décision Louis 11/10, « fais tout ») — LA SALLE DÉMO MONTRE LA COMBINAISON
 * RÔLE × STADE (craft rule n°9).
 *
 * Le tableau des 28 combinaisons (`ROLE_STAGE_PLAYBOOK`, @bellum/contracts) ordonne
 * /briefing quand le rôle déclaré ET la taille de l'ESN sont connus. Un profil démo
 * sans l'un des deux retomberait sur l'ordre du rôle seul : l'effet livré serait
 * invisible en réunion. Cette garde dit NON à ce cas, et vérifie que la combinaison
 * de la démo ouvre bien sur AUTRE CHOSE qu'au moins un autre stade du même rôle —
 * sinon la démonstration ne prouverait rien.
 */
describe('#3386 — la démo a une combinaison rôle × stade qui montre l’effet', () => {
  const combination = resolveRoleStageCell(DEMO_ESN_PROFILE.user_role, DEMO_ESN_PROFILE.consultant_size)

  it('le profil démo résout une combinaison (rôle ET stade déclarés)', () => {
    expect(combination).not.toBeNull()
    expect(combination?.role).toBe('fondateur')
    expect(combination?.stade).toBe('petite')
  })

  it('son ouverture de /briefing diffère d’au moins un autre stade du même rôle', () => {
    if (!combination) throw new Error('combinaison démo absente')
    const others = PLAYBOOK_STADES.filter(stade => stade !== combination.stade).map(stade =>
      ROLE_STAGE_PLAYBOOK[combination.role][stade].briefingLeads.join('>'),
    )
    expect(others.some(other => other !== combination.cell.briefingLeads.join('>'))).toBe(true)
  })
})
