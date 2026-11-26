import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CrmRoutinesService } from './crm-routines.service'

/**
 * GA-196 — un calcul de routine CRM en échec ne se rend JAMAIS comme une
 * liste vide (D715, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `CrmRoutinesService.rows()` attrapait toute erreur SQL et rendait `[]` —
 * l'EXACTE même valeur qu'un vrai zéro. Les routines produisent des
 * affirmations lues comme des faits (« aucun projet immobile », « aucun
 * compte écarté ») : quand la requête échouait, l'utilisateur recevait la
 * MÊME phrase que quand tout allait bien. Une panne devenait un rapport
 * rassurant — le défaut nommé « cassé et non mesurable se ressemblent ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux niveaux, volontairement : un niveau STRUCTUREL, qui relit le fichier
 * SOURCE et casse si le `catch` de `rows()` redevient un tableau nu (même si
 * personne ne pense à retoucher les tests de comportement en même temps) ; un
 * niveau COMPORTEMENTAL, qui exécute la VRAIE classe contre un `manager.query`
 * qui échoue et vérifie ce qu'elle rend. Les deux relisent le fichier réel à
 * chaque exécution — reverser `rows()` à sa forme d'avant ce chantier fait
 * échouer les deux, sans qu'il soit besoin de maintenir une copie « cassée »
 * à côté.
 *
 * La couverture EXHAUSTIVE des sept lectures (les six succès/échecs, plus la
 * résilience des lectures à deux requêtes) vit dans
 * `crm-routines.service.spec.ts` — cette garde-ci vérifie que le MÉCANISME
 * qui les rend toutes possibles n'a pas été détricoté, pas qu'elles marchent
 * une à une.
 */

const SOURCE_PATH = join(__dirname, 'crm-routines.service.ts')

/** Le corps de la méthode privée `rows()`, isolé pour ne pas confondre son
 *  `catch` avec celui — voisin et volontairement inchangé — d'`openDoorFromMove`. */
function rowsMethodBody(source: string): string {
  const match = /private async rows<T>\([^)]*\)[^{]*\{([\s\S]*?)\n {2}\}\n\}/.exec(source)
  return match?.[1] ?? ''
}

describe('GA-196 — structurel : le fichier source ne réintroduit pas le catch avalant', () => {
  const source = readFileSync(SOURCE_PATH, 'utf8')
  const body = rowsMethodBody(source)

  it('LIT quelque chose : le corps de `rows()` n’est pas vide — sinon la garde ne prouve rien', () => {
    // Une garde qui ne trouve pas sa cible passe pour la mauvaise raison. Si ce
    // test casse, c'est que `rows()` a été renommée ou déplacée : c'est ELLE
    // qu'il faut retrouver, pas cette assertion qu'il faut assouplir.
    expect(body.length).toBeGreaterThan(50)
    expect(body).toContain('this.accounts.manager.query')
  })

  it('le succès et l’échec rendent tous les deux `{ measured, rows }` — jamais un tableau nu', () => {
    expect(body).toContain('measured: true')
    expect(body).toContain('measured: false')
    // La signature de retour ne promet plus `Promise<T[]>` mais `RoutineRead<T>`.
    expect(source).toMatch(/private async rows<T>\([^)]*\): Promise<RoutineRead<T>>/)
  })

  it('l’échec est JOURNALISÉ via `logger.error` — convention du dépôt, jamais Sentry direct', () => {
    expect(body).toContain('this.logger.error(')
    expect(body).not.toContain('this.logger.warn(')
    expect(source).not.toMatch(/Sentry\.captureException|sentry_sdk\.capture_exception/)
  })

  it('les SEPT lectures publiques exposent `RoutineRead`, pas un tableau nu', () => {
    // Chaque méthode qui LIT (pas `openDoorFromMove`, qui ÉCRIT) doit annoncer
    // la forme qualifiée dans sa signature.
    const readers = [
      'stalledProjects',
      'staleAccountPlans',
      'needsWithoutShortlist',
      'accountsDueForReexamination',
      'parkedAccountsWithSignal',
      'contactsWhoMayHaveMoved',
      'esnContactsWhoMayHaveMoved',
    ]
    for (const name of readers) {
      // Non-gourmand jusqu'à `): Promise<RoutineRead<` : certaines signatures
      // portent une parenthèse INTERNE (`now = new Date()`), qu'une classe de
      // caractères `[^)]*` couperait au mauvais endroit.
      const signature = new RegExp(`async ${name}\\([\\s\\S]*?\\): Promise<RoutineRead<`)
      expect(source).toMatch(signature)
    }
  })
})

describe('GA-196 — comportemental : la VRAIE classe, contre une VRAIE erreur', () => {
  it('sait dire NON : une lecture qui casse ne rend pas `measured: true`', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection terminated'))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const result = await service.stalledProjects('ws-1')
    expect(result.measured).toBe(false)
    expect(result.rows).toEqual([])
    // La preuve que ce n'est pas un pur hasard de valeurs par défaut : la
    // requête a RÉELLEMENT été tentée.
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('une lecture qui RÉUSSIT reste `measured: true`, vide ou pas — le cas sain ne change pas', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    const result = await service.needsWithoutShortlist('ws-1')
    expect(result.measured).toBe(true)
    expect(result.rows).toEqual([])
  })

  it('la RÉSILIENCE du §13 n’a pas reculé : une jointure casse, l’autre mesure — les deux comptent', async () => {
    const query = jest.fn().mockImplementation((sql: string) =>
      String(sql).includes('esn_directory')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([
            {
              full_name: 'Camille Roux',
              company_name: 'Ancien Client SA',
              new_employer: 'Nouvel Employeur SAS',
              known_since: null,
              new_account_id: null,
            },
          ]),
    )
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const { measured, rows } = await service.contactsWhoMayHaveMoved('ws-1')
    // L'image est INCOMPLÈTE ...
    expect(measured).toBe(false)
    // ... mais ce que l'autre moitié a trouvé n'est pas jeté au nom de la
    // prudence : c'est le point d'équilibre du lot.
    expect(rows).toHaveLength(1)
  })
})
