import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { can, workspaceRoleValues } from '@bellum/contracts'

/**
 * LE DROIT SUR LA LECTURE AUTOMATIQUE (#1827.2).
 *
 * Même méthode que `expense-reports.permissions.spec.ts` : on lit la SOURCE du
 * contrôleur, seule façon de voir un décorateur qu'aucun test de comportement
 * n'exerce. Voir le commentaire de tête du contrôleur pour la raison du droit
 * choisi (le même que le dépôt, sans le second verrou de propriété — cette
 * route n'écrit rien).
 */
const CONTROLLER = join(__dirname, 'expense-extraction.controller.ts')

describe('la lecture automatique d’un justificatif déclare son droit', () => {
  const source = readFileSync(CONTROLLER, 'utf8')

  it('lit bien le contrôleur — un fichier vide passerait au vert', () => {
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain("@Controller('expenses/receipts')")
  })

  it('monte la garde qui LIT les permissions', () => {
    expect(source).toContain('@UseGuards(JwtGuard, WorkspacePermissionGuard)')
  })

  it('porte le MÊME droit que déposer une note — records:write OU finance:write', () => {
    const at = source.indexOf("@Post('extract')")
    expect(at).toBeGreaterThan(-1)
    expect(source.slice(at, at + 200)).toContain("@RequirePermission('records:write', 'finance:write')")
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
  it('au moins un siège porte records:write sans finance:write', () => {
    const organisers = workspaceRoleValues.filter(
      role => can(role, [], 'records:write') && !can(role, [], 'finance:write'),
    )
    expect(organisers.length).toBeGreaterThan(0)
  })
})
