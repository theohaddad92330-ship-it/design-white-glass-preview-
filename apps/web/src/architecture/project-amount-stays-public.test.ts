import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-390 — LE MONTANT D'UNE OPPORTUNITÉ N'EST PAS SOUS DROIT FINANCIER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT PROPOSÉ, MOT POUR MOT (#2171.40, #2171.46)
 * ─────────────────────────────────────────────────────────────────────────
 * Un balayage du 16/09/2026 (`.claude/notes/registre-2026-09-16-projects.md`)
 * a lu `ProjectAmountControl.tsx` — le contrôle qui affiche/édite
 * `estimated_amount` sur une opportunité — et a conclu qu'il « n'appelle ni
 * `canReadFinance` ni `useFinanceAccess`, contrairement à
 * `OpenNeedsPage.tsx:118` », donc qu'un rôle sans droit financier verrait un
 * montant qu'il ne devrait pas voir. **C'est faux**, et c'est déjà tranché :
 * `c53_montant_du_pipe` (`packages/contracts/src/schemas/doctrine-registry.ts`)
 * dit noir sur blanc que LE PIPE DES PROJETS (celui-ci) reste INCHANGÉ — seul
 * le PIPE DES BESOINS (`NeedsKanban`/`OpenNeedsPage`, revirement du
 * 31/08/2026) est passé derrière `finance:read`. `estimated_amount` est un
 * montant VENDU espéré, pas la marge ni le coût chargé — ce que `finance:read`
 * protège — et `ProjectsController.list()`/`pipelineSummary()` le confirment
 * côté serveur : aucune permission financière ne les garde (voir leur propre
 * commentaire, « POURQUOI CETTE ROUTE N'EST PAS SOUS DROIT FINANCIER »).
 * Gater ce montant fermerait `/projects` au `sales` dont c'est le pipe — le
 * `sales` ne porte que `finance:read:own`.
 *
 * « Marge » et « conditions », les deux autres mots du point #2171.40,
 * n'existent même pas comme champs sur une opportunité (aucun `margin` dans
 * `packages/contracts/src/schemas/project.ts`) : rien n'y fuit non plus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Le CORPUS existe : les deux fichiers réels, non vides.
 *  2. `ProjectAmountControl.tsx` NE gate PAS `estimated_amount` derrière
 *     `useFinanceAccess`/`canReadFinance` — la prochaine relecture ne doit
 *     pas réintroduire un gate sans d'abord lire cette doctrine.
 *  3. `ProjectAmountControl.tsx` porte l'ancre `#2171.40`, pour qu'un futur
 *     balayage retrouve CETTE réponse plutôt que de re-proposer le défaut.
 *  4. `ProjectsController` (API) ne pose AUCUNE permission financière sur
 *     `list()` ni `pipelineSummary()` — le serveur ne filtre pas non plus,
 *     et ce n'est pas un oubli.
 */

const WEB_SRC = join(__dirname, '..')
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src')

const AMOUNT_CONTROL = join(WEB_SRC, 'features', 'projects', 'view', 'ProjectAmountControl.tsx')
const PROJECTS_CONTROLLER = join(API_SRC, 'modules', 'projects', 'projects.controller.ts')

const amountControl = readFileSync(AMOUNT_CONTROL, 'utf8')
const projectsController = readFileSync(PROJECTS_CONTROLLER, 'utf8')

const CORPUS = [
  ['ProjectAmountControl.tsx', amountControl],
  ['projects.controller.ts', projectsController],
] as const

/**
 * Le CODE seul, commentaires retirés — le doc-comment du fichier NOMME
 * `useFinanceAccess`/`canReadFinance` pour expliquer pourquoi ils ne sont PAS
 * appelés (cause racine « compter sans retirer les commentaires » : matcher le
 * texte brut ferait rougir la garde sur sa propre explication).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const amountControlCode = stripComments(amountControl)

describe('GA-390 — le montant d’une opportunité reste public (#2171.40, #2171.46 écartés)', () => {
  it('a un corpus — deux fichiers réels, non vides', () => {
    for (const [name, source] of CORPUS) {
      expect(source.length, `${name} est vide ou introuvable`).toBeGreaterThan(0)
    }
  })

  it('`ProjectAmountControl.tsx` ne gate pas le montant derrière un droit financier', () => {
    expect(amountControlCode).not.toMatch(/useFinanceAccess|canReadFinance/)
  })

  it('`ProjectAmountControl.tsx` porte l’ancre #2171.40 vers la doctrine c53', () => {
    expect(amountControl).toContain('#2171.40')
  })

  it('l’API ne pose aucune permission financière sur `list()` ni `pipelineSummary()`', () => {
    // Le corps de chaque méthode, coupé avant la méthode suivante — le même
    // motif que `cockpit-scope-is-owned.spec.ts` pour ne pas dépendre de
    // l'ordre des décorateurs.
    const listBody = projectsController.slice(
      projectsController.indexOf('async list('),
      projectsController.indexOf('@Get(', projectsController.indexOf('async list(')),
    )
    const pipelineBody = projectsController.slice(
      projectsController.indexOf('async pipelineSummary('),
      projectsController.indexOf('@Get(', projectsController.indexOf('async pipelineSummary(')),
    )
    expect(listBody).not.toMatch(/RequirePermission\(['"]finance/)
    expect(pipelineBody).not.toMatch(/RequirePermission\(['"]finance/)
  })
})
