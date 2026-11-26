import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { can } from '@bellum/contracts'

/**
 * Les écritures du Delivery OS demandent un droit d'écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `POST /delivery/missions` et `POST /delivery/missions/:id/timesheets` n'ont
 * porté AUCUNE permission pendant des mois. Une mission est l'objet qui engage
 * le chiffre d'affaires signé, la marge et la préparation de facturation ; un
 * relevé d'activité décide de ce qui devient facturable. Les deux s'écrivaient
 * depuis un siège `viewer` — et depuis le siège `finance`, dont le contrat dit
 * en toutes lettres « AUCUN droit d'écriture sur les fiches ».
 *
 * GA-05 comptait bien ces routes parmi les routes nues, mais elle COMPTE : son
 * cliquet ne dit pas LESQUELLES manquent, et un compteur qui baisse ne protège
 * pas la route qu'on vient de couvrir. C'est la même leçon que « une garde qui
 * compte "au moins un" ne dit rien de ce qui manque ».
 *
 * Ce test lit la SOURCE du contrôleur : c'est la seule façon de voir un
 * décorateur, qu'aucun test de comportement n'exerce.
 */

const CONTROLLER = join(__dirname, 'delivery.controller.ts')

/** Les routes d'écriture et le droit qu'elles doivent exiger. */
const GUARDED_WRITES: { route: string; permission: 'records:write' }[] = [
  { route: "@Post('missions')", permission: 'records:write' },
  { route: "@Post('missions/:id/timesheets')", permission: 'records:write' },
  { route: "@Post('missions/:id/move')", permission: 'records:write' },
]

describe('les écritures du Delivery OS sont gardées', () => {
  const source = readFileSync(CONTROLLER, 'utf8')

  it('lit bien le contrôleur — un fichier vide passerait au vert', () => {
    expect(source.length).toBeGreaterThan(2000)
    expect(source).toContain("@Controller('delivery')")
  })

  it.each(GUARDED_WRITES)('$route exige $permission', ({ route, permission }) => {
    const at = source.indexOf(route)
    expect(at).toBeGreaterThan(-1)
    // Le décorateur de permission est posé JUSTE sous la route. On regarde la
    // fenêtre qui suit, pas le fichier entier : sinon un `@RequirePermission`
    // posé sur une AUTRE route ferait passer celle-ci.
    const window = source.slice(at, at + 200)
    expect(window).toContain(`@RequirePermission('${permission}')`)
  })

  it('la garde sait dire NON — une route inventée n’est pas dans le fichier', () => {
    expect(source.indexOf("@Post('missions/:id/route-qui-nexiste-pas')")).toBe(-1)
  })

  it('le droit choisi ferme bien les sièges qui n’écrivent pas de fiche', () => {
    // La raison d'être du correctif : ce sont EXACTEMENT ces trois sièges qu'on
    // voulait exclure, et aucun autre.
    expect(can('viewer', [], 'records:write')).toBe(false)
    expect(can('finance', [], 'records:write')).toBe(false)
    expect(can('tech_admin', [], 'records:write')).toBe(false)
    // …et le commercial, le recruteur et le responsable continuent de travailler.
    for (const role of ['owner', 'admin', 'sales', 'sales_ops', 'member', 'recruiter'] as const) {
      expect(can(role, [], 'records:write')).toBe(true)
    }
  })
})
