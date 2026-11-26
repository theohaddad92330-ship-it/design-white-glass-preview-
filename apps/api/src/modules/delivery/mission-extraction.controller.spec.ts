import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { can, workspaceRoleValues } from '@bellum/contracts'

/**
 * LE DROIT SUR LA LECTURE AUTOMATIQUE DE MISSION (#2560).
 *
 * Même méthode que `expense-extraction.controller.spec.ts` : on lit la SOURCE
 * du contrôleur, seule façon de voir un décorateur qu'aucun test de
 * comportement n'exerce.
 */
const CONTROLLER = join(__dirname, 'mission-extraction.controller.ts')

describe('la lecture automatique d’un document de mission déclare son droit', () => {
  const source = readFileSync(CONTROLLER, 'utf8')

  it('lit bien le contrôleur — un fichier vide passerait au vert', () => {
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain("@Controller('delivery/missions')")
  })

  it('monte la garde qui LIT les permissions', () => {
    expect(source).toContain('@UseGuards(JwtGuard, WorkspacePermissionGuard)')
  })

  it('porte le MÊME droit que créer une mission — records:write', () => {
    const at = source.indexOf("@Post('extract')")
    expect(at).toBeGreaterThan(-1)
    expect(source.slice(at, at + 200)).toContain("@RequirePermission('records:write')")
  })

  it('n’expose qu’UNE seule route — proposer, jamais écrire', () => {
    const writes = [...source.matchAll(/@(Post|Patch|Put|Delete)\(/g)]
    expect(writes).toHaveLength(1)
  })

  it('la garde sait dire NON — une route inventée n’est pas dans le fichier', () => {
    expect(source.indexOf("@Post('commit')")).toBe(-1)
  })
})

describe('le droit choisi ferme les bons sièges — même témoin que le dépôt', () => {
  it('au moins un siège porte records:write', () => {
    const organisers = workspaceRoleValues.filter(role => can(role, [], 'records:write'))
    expect(organisers.length).toBeGreaterThan(0)
  })
})
