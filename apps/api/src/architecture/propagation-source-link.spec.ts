import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PROPAGATION_FILTER_KEYS,
  missionsOfAccount,
  missionsOfConsultant,
  propagatedBlockSchema,
} from '@bellum/contracts'

/**
 * §4.4 — UN BLOC PROPAGÉ PORTE UN LIEN VERS SA SOURCE ET NE S'ÉDITE JAMAIS SUR
 * PLACE (PDF 2 du dossier du 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 *     « Le CA cumulé d'un compte se lit sur la fiche compte. Il se calcule dans
 *      les missions. On ne le corrige pas depuis le compte. »
 *
 * Sans elle, le même chiffre devient corrigible à deux endroits — la fiche
 * compte et la mission — et les deux divergent le jour où quelqu'un s'en sert.
 * C'est la SECONDE VÉRITÉ, et la propagation du contexte la fabrique
 * mécaniquement : elle multiplie les endroits où un chiffre s'affiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois verrous, dont deux sont de l'ABSENCE de code — comme les outils de
 * proposition du copilote, qui n'ont aucun chemin d'écriture parce qu'on ne
 * l'a pas écrit, et non parce qu'une convention le déconseille :
 *
 *  1. **La source est obligatoire** — le schéma la refuse absente, et
 *     `propagated(…)` est le seul constructeur, donc le seul endroit où elle se
 *     pose. Un agrégat construit à la main tomberait au parse.
 *  2. **`editable` ne peut valoir que `false`** — `z.literal(false)`. Écrire
 *     `true` ne compile pas et ne parse pas.
 *  3. **Aucun chemin d'écriture n'existe** — le service ne contient ni `INSERT`,
 *     ni `UPDATE`, ni `DELETE`, ni `.save(`, et aucune route `@Post`/`@Patch`/
 *     `@Put`/`@Delete` ne porte `propagation`. C'est ce test-ci qui empêche le
 *     jour où quelqu'un ajoutera « corriger le CA depuis la fiche ».
 *
 * ⚠️ Et le lien doit MENER quelque part : il utilise un filtre que
 * `delivery.controller.ts` sait lire. Un paramètre que l'API ignore renverrait
 * sur la liste ENTIÈRE des missions — un lien qui ne montre pas la source ment
 * sur la source, ce qui est pire que pas de lien du tout.
 */

const DELIVERY = join(__dirname, '..', 'modules', 'delivery')
const SERVICE = join(DELIVERY, 'propagation.service.ts')
const CONTROLLER = join(DELIVERY, 'delivery.controller.ts')
const FINANCE_CONTROLLER = join(DELIVERY, 'finance.controller.ts')
const DELIVERY_SERVICE = join(DELIVERY, 'delivery.service.ts')

const service = readFileSync(SERVICE, 'utf8')
const controller = readFileSync(CONTROLLER, 'utf8')
const financeController = readFileSync(FINANCE_CONTROLLER, 'utf8')
const deliveryService = readFileSync(DELIVERY_SERVICE, 'utf8')

/**
 * Le corps qui suit un marqueur, coupé AVANT le membre suivant.
 *
 * Sans cette découpe, chercher `@Query(` « dans le contrôleur » rendrait VRAI
 * grâce à une AUTRE route — exactement la façon dont cette garde s'est trompée
 * une première fois (voir le test « la route que le lien OUVRE »). Un marqueur
 * absent rend la chaîne VIDE, jamais le fichier entier : le faux zéro inverse
 * ferait passer n'importe quelle assertion.
 */
const NEXT_ROUTE = /@(?:Get|Post|Patch|Put|Delete)\s*\(/
const NEXT_METHOD = /\n {2}(?:private|public|protected|async|[a-zA-Z]\w*\s*\()/

function bodyAfter(source: string, marker: string, stopAt: RegExp): string {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const rest = source.slice(start + marker.length)
  const next = rest.search(stopAt)
  return next < 0 ? rest : rest.slice(0, next)
}

/**
 * Ce qui ÉCRIT, sous les formes que ce dépôt emploie réellement.
 *
 * Écrites contre le code du module — `manager.query('INSERT INTO …')`,
 * `repository.save(…)`, `.update(…)` — et pas contre une syntaxe imaginée : une
 * garde qui surveille une forme que personne n'écrit est borgne par construction.
 */
const WRITE_FORMS: { name: string; pattern: RegExp }[] = [
  { name: 'INSERT SQL', pattern: /\bINSERT\s+INTO\b/i },
  { name: 'UPDATE SQL', pattern: /\bUPDATE\s+\w+\s+SET\b/i },
  { name: 'DELETE SQL', pattern: /\bDELETE\s+FROM\b/i },
  { name: 'écriture par le dépôt TypeORM', pattern: /\.(?:save|insert|update|delete|upsert|remove)\s*\(/ },
]

/** Les verbes HTTP qui ÉCRIVENT, tels qu'ils s'écrivent en NestJS. */
const WRITE_VERBS = /@(?:Post|Patch|Put|Delete)\s*\(\s*'([^']*)'/g

describe('§4.4 — un bloc propagé porte sa source et ne s’édite jamais sur place', () => {
  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — trois fichiers réels, non vides', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une chaîne
    // vide, zéro faute, et un test vert pour toujours.
    expect(service.length).toBeGreaterThan(2000)
    expect(controller.length).toBeGreaterThan(2000)
    expect(financeController.length).toBeGreaterThan(2000)
    // Et il lit bien le BON fichier : le service nomme les cinq agrégats.
    expect(service).toContain('class PropagationService')
  })

  /* ---------------------------------------------------------------------- */
  /*  1 et 2 — la source est obligatoire, le verrou est un type             */
  /* ---------------------------------------------------------------------- */

  it('un bloc sans source est REFUSÉ, et `editable: true` aussi', () => {
    const source = missionsOfAccount('a-1')
    expect(propagatedBlockSchema.safeParse({ editable: false }).success).toBe(false)
    expect(propagatedBlockSchema.safeParse({ source, editable: false }).success).toBe(true)
    expect(propagatedBlockSchema.safeParse({ source, editable: true }).success).toBe(false)
  })

  it('le service ne pose JAMAIS `editable` à la main — `propagated` est le seul chemin', () => {
    // Cinq agrégats, cinq passages par le constructeur. Un sixième écrit à la
    // main pourrait oublier la source, ou poser un verrou différent.
    const constructed = service.match(/\bpropagated\(/g) ?? []
    expect(constructed.length).toBeGreaterThanOrEqual(5)
    // `editable` n'apparaît nulle part ailleurs que dans la prose : le poser à
    // la main court-circuiterait le constructeur.
    expect(/^\s*editable\s*:/m.test(service)).toBe(false)
  })

  /* ---------------------------------------------------------------------- */
  /*  3 — l'absence de chemin d'écriture                                    */
  /* ---------------------------------------------------------------------- */

  it('le service n’a AUCUN chemin d’écriture — ce n’est pas une convention, c’est l’absence de code', () => {
    const found = WRITE_FORMS.filter(form => form.pattern.test(service)).map(form => form.name)
    if (found.length > 0) {
      throw new Error(
        [
          '`propagation.service.ts` a acquis un chemin d’écriture : ' + found.join(', '),
          'Un bloc propagé se CALCULE dans les missions et se CORRIGE là-bas (§4.4).',
          'Le corriger depuis la fiche compte créerait une seconde vérité sur le même chiffre.',
        ].join('\n'),
      )
    }
    expect(found).toEqual([])
  })

  it('aucune route d’écriture ne porte « propagation »', () => {
    for (const [name, source] of [
      ['delivery.controller.ts', controller],
      ['finance.controller.ts', financeController],
    ] as const) {
      // ⚠️ Une regex avec le drapeau `g` est STATEFUL entre deux `.test()` :
      // on la RECRÉE à chaque tour plutôt que de la partager. Défaut déjà commis
      // dans ce dossier.
      const verbs = new RegExp(WRITE_VERBS.source, 'g')
      const writes: string[] = []
      for (const match of source.matchAll(verbs)) {
        if (match[1]?.includes('propagation')) writes.push(`${name} → ${match[0]}`)
      }
      expect(writes).toEqual([])
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  La garde sait dire NON                                                */
  /* ---------------------------------------------------------------------- */

  it('reconnaît un chemin d’écriture sur du code écrit exprès', () => {
    // Preuve que les motifs mordent. Sans ce test, la garde pourrait surveiller
    // une syntaxe que personne n'écrit et rester verte pour toujours.
    const fautifs = [
      `await this.missions.manager.query('INSERT INTO account_revenue (account_id) VALUES ($1)', [id])`,
      `await this.missions.manager.query('UPDATE accounts SET cached_revenue_cents = $2 WHERE id = $1')`,
      `await this.missions.manager.query('DELETE FROM account_revenue WHERE account_id = $1')`,
      `await this.accounts.save({ id, cached_revenue_cents: total })`,
    ]
    const manqués = fautifs.filter(line => !WRITE_FORMS.some(form => form.pattern.test(line)))
    expect(manqués).toEqual([])
  })

  it('ne mord PAS sur une lecture — une garde qui refuse tout ne protège rien', () => {
    const légitimes = [
      `SELECT m.account_id, SUM(r.invoiced_amount_cents)::text AS invoiced_cents`,
      `const rows = await this.missions.manager.query(sql, [workspaceId])`,
      `GROUP BY s.contact_id, c.account_id`,
      // ⚠️ Le mot « update » dans une prose ou un nom de colonne ne fait pas une
      // écriture : le motif exige la parenthèse d'appel ou le `SET` du SQL.
      `/** Le chiffre se met à jour à chaque lecture — updated_at ne le porte pas. */`,
    ]
    const fauxPositifs = légitimes.filter(line => WRITE_FORMS.some(form => form.pattern.test(line)))
    expect(fauxPositifs).toEqual([])
  })

  it('reconnaît une route d’écriture qu’on aurait ajoutée sur la propagation', () => {
    const faux = `@Patch('propagation/accounts/:id')`
    const verbs = new RegExp(WRITE_VERBS.source, 'g')
    const found = [...faux.matchAll(verbs)].filter(match => match[1]?.includes('propagation'))
    expect(found).toHaveLength(1)
  })

  /* ---------------------------------------------------------------------- */
  /*  Le lien MÈNE quelque part                                             */
  /* ---------------------------------------------------------------------- */

  it('les liens de source n’utilisent que des filtres que `readFilters` sait lire', () => {
    // La garde LIT le contrôleur : la liste de `readFilters` est la vérité, pas
    // la liste recopiée dans le contrat. Une clé recopiée à la main dérive.
    const declared = controller.slice(controller.indexOf('function readFilters'))
    expect(declared.length).toBeGreaterThan(100)
    expect(PROPAGATION_FILTER_KEYS.length).toBeGreaterThan(0)
    for (const key of PROPAGATION_FILTER_KEYS) {
      expect(declared).toContain(`'${key}'`)
    }
    // Et les deux constructeurs de lien utilisent bien ces clés-là.
    for (const href of [missionsOfAccount('a-1').href, missionsOfConsultant('c-1').href]) {
      const key = href.slice(href.indexOf('?') + 1).split('=')[0] ?? ''
      expect(PROPAGATION_FILTER_KEYS).toContain(key as (typeof PROPAGATION_FILTER_KEYS)[number])
    }
  })

  it('chaque lien nomme ce qu’il montre — un lien nu ne se clique pas', () => {
    for (const source of [missionsOfAccount('a-1'), missionsOfConsultant('c-1')]) {
      expect(source.label.length).toBeGreaterThan(10)
      expect(source.href.startsWith('/')).toBe(true)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Le lien mène à la route que L'UTILISATEUR ouvre, pas à une voisine     */
  /* ---------------------------------------------------------------------- */

  /**
   * ⚠️ LE DÉFAUT DE CETTE GARDE ELLE-MÊME, trouvé le 28/08/2026.
   *
   * Le test juste au-dessus prouve que `readFilters` connaît `accountId`. Il
   * est juste, et il ne prouvait pas ce qu'on croyait : `readFilters` n'a QU'UN
   * appelant, `@Get('board')`. La route que `/missions?accountId=…` ouvre
   * réellement est `GET /delivery/missions`, et elle ne prenait AUCUN paramètre
   * de requête — `async list(@CurrentUser() user)`, rien d'autre.
   *
   * Une garde protège une règle, elle ne l'invente pas : celle-ci vérifiait la
   * bonne règle sur le mauvais gestionnaire.
   */
  it('la route que le lien OUVRE lit les filtres — `readFilters` sert le BOARD, pas la liste', () => {
    const handler = bodyAfter(controller, "@Get('missions')", NEXT_ROUTE)
    expect(handler.length).toBeGreaterThan(100)
    // Elle prend une requête…
    expect(handler).toContain('@Query(')
    // …et elle passe des filtres au service, plutôt que de les lire pour rien.
    expect(handler).toContain('filters')
  })

  it('les clés viennent du CONTRAT, jamais recopiées dans le contrôleur', () => {
    // Une liste recopiée dérive : c'est `PROPAGATION_FILTER_KEYS` qui décide de
    // ce qu'un lien de source a le droit de porter, et le contrôleur la lit.
    expect(controller).toContain('PROPAGATION_FILTER_KEYS')
    expect(PROPAGATION_FILTER_KEYS).toEqual(['accountId', 'consultantId'])
  })

  it('le service APPLIQUE les filtres — un paramètre déclaré et jamais passé ne filtre rien', () => {
    // Cause racine « paramètre déclaré, jamais passé » : le correctif fait sur
    // un seul chemin. Le service doit nommer les deux clés dans sa lecture.
    expect(deliveryService.length).toBeGreaterThan(2000)
    const list = bodyAfter(deliveryService, 'async list(', NEXT_METHOD)
    expect(list.length).toBeGreaterThan(200)
    for (const key of PROPAGATION_FILTER_KEYS) {
      expect(list).toContain(key)
    }
  })

  it('reconnaît un gestionnaire qui ignore la requête — la découpe sait dire NON', () => {
    // Preuve que `handlerAfter` isole bien UN gestionnaire : sur un contrôleur
    // où c'est la route VOISINE qui lit la requête, la liste reste fautive.
    const faux = `
      @Get('missions')
      async list(@CurrentUser() user: CurrentUserPayload) { return this.delivery.list(user.userId) }

      @Get('board')
      async board(@Query() query: Record<string, string | undefined>) { return this.board.board(query) }
    `
    const handler = bodyAfter(faux, "@Get('missions')", NEXT_ROUTE)
    expect(handler).not.toContain('@Query(')
    expect(handler).toContain('async list(')
  })

  it('rend une chaîne VIDE quand le décorateur n’existe pas — jamais tout le fichier', () => {
    // Le faux zéro inverse : une découpe qui rendrait le fichier entier ferait
    // passer n'importe quelle assertion.
    expect(bodyAfter(controller, "@Get('route-qui-n-existe-pas')", NEXT_ROUTE)).toBe('')
  })
})
