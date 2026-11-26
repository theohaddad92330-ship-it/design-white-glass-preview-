import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_NEED_WITHOUT_PROJECT_COVERAGE } from './demo-coverage'

/**
 * #2558.1 — la salle de démonstration montre un besoin SANS PROJET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_needs` est classée SEEDÉE depuis longtemps : la garde PAR TABLE ne
 * pose aucune question sur ce lot. Le chantier n'ajoute pas une table, il
 * ajoute une FORME — une ligne dont `project_id` est `NULL`, rendue possible
 * par la migration `1795711263408-NeedWithoutProject` (vague J, 18/09/2026).
 * Sans semis, la capacité est juste, calculée, testée côté API
 * (`open-needs-without-project.spec.ts`, `need-account-never-via-project.spec.ts`)
 * et personne ne pouvait jamais la voir en démonstration.
 *
 * Elle RECOMPTE sur le jeu de données et le semis, elle ne croit pas un
 * commentaire : un audit documentaire n'est pas le code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (jouée à l'écriture)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Retiré l'appel `this.seedNeedWithoutProject(...)` de `demo-seed.service.ts`
 *   → ROUGE sur « le semis APPELLE réellement l'écriture ».
 * · Remplacé `SELECT $1::uuid, NULL,` par `SELECT $1::uuid, $2::uuid,` (un
 *   projet réintroduit) → ROUGE sur « project_id part en NULL littéral ».
 * · Vidé `DEMO_DELIVERY_CLIENT.needWithoutProject.title` → ROUGE sur « la
 *   garde LIT un jeu non vide », avant toute autre assertion.
 */

const SEED_SERVICE = join(__dirname, 'demo-seed.service.ts')

describe('#2558.1 — parité démo du besoin sans projet', () => {
  const seedSource = readFileSync(SEED_SERVICE, 'utf8')
  const need = DEMO_DELIVERY_CLIENT.needWithoutProject

  // Une garde qui ne lit rien est verte sur du vide. Ce test-ci passe AVANT.
  it('LIT un jeu de données non vide et un semis non vide', () => {
    expect(seedSource.length).toBeGreaterThan(1000)
    expect(need.title.trim().length).toBeGreaterThan(0)
  })

  it('le besoin est identifiable et NE porte ni tarif ni budget chiffré', () => {
    expect(need.title.trim().length).toBeGreaterThan(0)
    expect(need.context.trim().length).toBeGreaterThan(30)
    // Rien n'a encore été chiffré avec le client : jamais 0, qui se lirait
    // comme un prix connu — voir le docblock du champ dans demo-dataset.ts.
    expect(need.target_tjm_cents).toBeNull()
    expect(need.budget_cents).toBeNull()
  })

  it('le semis APPELLE réellement l’écriture — pas seulement une méthode qui existe', () => {
    expect(seedSource).toContain('await this.seedNeedWithoutProject(workspaceId, ownerUserId, account.id, iso)')
    expect(seedSource).toContain('private async seedNeedWithoutProject(')
  })

  // Le point qui casse en silence : un `project_id` lié à un paramètre (même
  // à `null`) redeviendrait un besoin qu'on aurait « oublié » de rattacher,
  // pas la valeur PLEINE que #2558.1 exige — voir NeedWithoutProject1795711263408.
  it('`project_id` part en NULL LITTÉRAL dans le SQL, jamais en paramètre lié', () => {
    const body = seedSource.slice(
      seedSource.indexOf('private async seedNeedWithoutProject('),
      seedSource.indexOf('private async seedOpenNeeds('),
    )
    expect(body.length).toBeGreaterThan(200)
    expect(body).toContain('INSERT INTO project_needs')
    expect(body).toMatch(/SELECT\s+\$1::uuid,\s*NULL,\s*\$2::uuid,/)
    // Et la ligne existe seulement une fois par (compte, titre) — une salle
    // remise à neuf ne doit pas doubler la ligne.
    expect(body).toContain('WHERE NOT EXISTS')
    expect(body).toContain('project_id IS NULL')
  })

  // Ce qu'on affirme est une décision, pas un oubli — et elle est écrite, et
  // recomptée ici plutôt que crue sur parole.
  it('la couverture NOMME le cas comme SEEDÉ, et sa raison cite la migration', () => {
    expect(DEMO_NEED_WITHOUT_PROJECT_COVERAGE.state).toBe('seede')
    for (const mention of ['NeedWithoutProject', 'project_needs.project_id', 'needWithoutProject']) {
      expect(DEMO_NEED_WITHOUT_PROJECT_COVERAGE.reason).toContain(mention)
    }
  })
})
