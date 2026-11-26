import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TalentRoutinesService } from './talent-routines.service'

/**
 * GA-199 — un calcul de routine vivier en échec ne se rend JAMAIS comme une
 * liste vide (D733, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le MÊME défaut que celui corrigé sur `CrmRoutinesService.rows()` (D715 /
 * GA-196, voir `crm-routines-read-failures.spec.ts`) : `TalentRoutinesService.
 * rows()` attrapait toute erreur SQL et rendait `[]` — l'EXACTE même valeur
 * qu'un vrai zéro. « Aucune disponibilité à reconfirmer » devenait la phrase
 * d'une requête qui vient de casser autant que celle d'un vivier réellement à
 * jour. Le correctif REPREND, à l'identique, la forme introduite côté CRM :
 * `RoutineRead<T> = { measured: boolean; rows: T[] }`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux niveaux, comme côté CRM : un niveau STRUCTUREL, qui relit le fichier
 * SOURCE et casse si le `catch` de `rows()` redevient un tableau nu ; un
 * niveau COMPORTEMENTAL, qui exécute la VRAIE classe contre un `manager.query`
 * qui échoue et vérifie ce qu'elle rend. Les deux relisent le fichier réel à
 * chaque exécution — reverser `rows()` à sa forme d'avant ce lot fait échouer
 * les deux.
 *
 * `TalentRoutinesService` n'expose qu'UNE seule lecture publique
 * (`availabilityToReconfirm`) — pas de résilience à deux requêtes à prouver
 * ici, contrairement à `contactsWhoMayHaveMoved` côté CRM.
 */

const SOURCE_PATH = join(__dirname, 'talent-routines.service.ts')

/** Le corps de la méthode privée `rows()`. */
function rowsMethodBody(source: string): string {
  const match = /private async rows<T>\([^)]*\)[^{]*\{([\s\S]*?)\n {2}\}\n\}/.exec(source)
  return match?.[1] ?? ''
}

describe('GA-199 — structurel : le fichier source ne réintroduit pas le catch avalant', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8')
  const body = rowsMethodBody(source)

  it('LIT quelque chose : le corps de `rows()` n’est pas vide — sinon la garde ne prouve rien', () => {
    // Une garde qui ne trouve pas sa cible passe pour la mauvaise raison. Si ce
    // test casse, c'est que `rows()` a été renommée ou déplacée : c'est ELLE
    // qu'il faut retrouver, pas cette assertion qu'il faut assouplir.
    expect(body.length).toBeGreaterThan(50)
    expect(body).toContain('this.consultants.manager.query')
  })

  it('le succès et l’échec rendent tous les deux `{ measured, rows }` — jamais un tableau nu', () => {
    expect(body).toContain('measured: true')
    expect(body).toContain('measured: false')
    expect(source).toMatch(/private async rows<T>\([^)]*\): Promise<RoutineRead<T>>/)
  })

  it('l’échec est JOURNALISÉ via `logger.error` — convention du dépôt, jamais Sentry direct', () => {
    expect(body).toContain('this.logger.error(')
    expect(body).not.toContain('this.logger.warn(')
    expect(source).not.toMatch(/Sentry\.captureException|sentry_sdk\.capture_exception/)
  })

  it('la lecture publique expose `RoutineRead`, pas un tableau nu', () => {
    const signature = /async availabilityToReconfirm\([\s\S]*?\): Promise<RoutineRead</
    expect(source).toMatch(signature)
  })
})

describe('GA-199 — comportemental : la VRAIE classe, contre une VRAIE erreur', () => {
  it('sait dire NON : une lecture qui casse ne rend pas `measured: true`', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection terminated'))
    const service = new TalentRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const result = await service.availabilityToReconfirm('ws-1')
    expect(result.measured).toBe(false)
    expect(result.rows).toEqual([])
    // La preuve que ce n'est pas un pur hasard de valeurs par défaut : la
    // requête a RÉELLEMENT été tentée.
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('une lecture qui RÉUSSIT reste `measured: true`, vide ou pas — le cas sain ne change pas', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new TalentRoutinesService({ manager: { query } } as never)

    const result = await service.availabilityToReconfirm('ws-1')
    expect(result.measured).toBe(true)
    expect(result.rows).toEqual([])
  })
})
