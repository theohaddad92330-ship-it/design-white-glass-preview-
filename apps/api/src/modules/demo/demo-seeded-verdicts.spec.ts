import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FEEDBACK_VERDICTS } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * GA-60 — CE QUE LE SEMIS DE DÉMONSTRATION ÉCRIT, LA BASE L'ACCEPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PANNE QUI A FAIT ÉCRIRE CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 28/08/2026, la salle de démonstration publique servait « Aucune mission »
 * à tous les visiteurs. Le jeu écrivait des verdicts « strong / good / weak /
 * acceptable » dans `submission_feedback`, dont la contrainte
 * `submission_feedback_verdicts_check` n'admet que `unknown | below | meets |
 * above`. Postgres rendait une **23514**, le semis levait, et
 * `DemoPoolService.tidy()` — qui attrape à dessein, parce qu'une salle tronquée
 * vaut mieux qu'une porte fermée — servait la salle TELLE QUELLE.
 *
 * Le prix n'était pas la ligne perdue : c'est que **tout ce qui vient APRÈS
 * dans le semis ne s'exécutait jamais**. Missions, affectations, relevés
 * d'activité, préparation de facturation, et les six blocs propagés qui les
 * lisent. Sept missions semées, zéro à l'écran.
 *
 * Et rien ne pouvait le voir : les 7 000 tests d'API rejouent sur des doubles,
 * pas sur une base contrainte ; le champ était typé `string`, donc `tsc` non
 * plus ; et la garde de parité démo comptait des CLÉS, pas des valeurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PEUT PAS PROUVER
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle relie TROIS endroits qui doivent dire la même chose : la contrainte
 * écrite dans la migration, le vocabulaire du contrat, et les valeurs semées.
 *
 * ⚠️ Elle lit les MIGRATIONS, pas la base. Une contrainte modifiée à la main en
 * production lui échapperait — c'est une limite connue de cette famille de
 * gardes, et elle est écrite ici pour que personne ne la prenne pour une preuve
 * de l'état réel du serveur.
 */
const MIGRATIONS = join(__dirname, '..', '..', 'migrations')

/** Les valeurs admises par la DERNIÈRE migration qui définit la contrainte. */
function allowedBySql(column: string): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()
  let allowed: string[] | null = null
  for (const name of files) {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8')
    if (!sql.includes('submission_feedback_verdicts_check')) continue
    // `IN ('a', 'b')` — on prend la dernière occurrence du fichier, parce qu'une
    // migration qui élargit commence par DROP puis redéfinit.
    const matches = [...sql.matchAll(new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, 'g'))]
    const last = matches.at(-1)
    if (last?.[1]) allowed = [...last[1].matchAll(/'([^']+)'/g)].map(m => m[1]!)
  }
  return allowed ?? []
}

const COLUMNS = ['technical', 'experience', 'communication', 'price'] as const

describe('GA-60 — les verdicts semés en démonstration passent la contrainte SQL', () => {
  it('GA-60 — la garde a un corpus, et il n’est pas vide', () => {
    // Sans ces trois-là, tout ce qui suit passerait au vert sur du vide.
    expect(readdirSync(MIGRATIONS).filter(n => n.endsWith('.ts')).length).toBeGreaterThan(50)
    expect(allowedBySql('technical').length).toBeGreaterThan(1)
    expect(DEMO_DELIVERY_CLIENT.submissions.filter(s => s.feedback).length).toBeGreaterThan(0)
  })

  it.each(COLUMNS)('la contrainte SQL de « %s » dit la même chose que le contrat', column => {
    expect([...allowedBySql(column)].sort()).toEqual([...FEEDBACK_VERDICTS].sort())
  })

  it('chaque verdict semé est admis par la contrainte', () => {
    const allowed = new Set(allowedBySql('technical'))
    for (const submission of DEMO_DELIVERY_CLIENT.submissions) {
      const feedback = submission.feedback
      if (!feedback) continue
      for (const column of COLUMNS) {
        // Le consultant et la colonne voyagent DANS l'assertion : un échec doit
        // nommer la ligne fautive, sinon il faut relire six mille lignes de jeu.
        expect({
          qui: submission.consultant,
          [column]: feedback[column],
          admis: allowed.has(feedback[column]),
        }).toEqual({
          qui: submission.consultant,
          [column]: feedback[column],
          admis: true,
        })
      }
    }
  })

  it('GA-60 — la garde sait dire NON', () => {
    const allowed = new Set(allowedBySql('technical'))
    // Les quatre synonymes exacts qui ont mis la salle à genoux.
    for (const synonyme of ['strong', 'good', 'weak', 'acceptable']) {
      expect(allowed.has(synonyme)).toBe(false)
    }
  })
})
