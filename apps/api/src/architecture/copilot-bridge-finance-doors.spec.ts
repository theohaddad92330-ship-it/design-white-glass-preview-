import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-319 / GA-320 — TOUTE PORTE FINANCIÈRE DU PONT EST GARDÉE, ET LE DIT DE
 * LA MÊME FAÇON (LOT 15, arbitrage B).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────
 * Sur `copilot-bridge.controller.ts`, quatre routes voisines, deux régimes :
 * `finance/revenue` et `finance/capacity` refusaient sans `finance:read` ;
 * `invoicing/overdue` et `timesheets/month` n'avaient AUCUNE garde. Le
 * contrôleur entier vit derrière `InternalSecretGuard` — ce n'est donc pas une
 * route ouverte sur Internet — mais n'importe quel membre authentifié de
 * l'espace pouvait demander à Laura les impayés et les temps saisis de toute
 * l'équipe, pendant que le même membre, demandant le chiffre d'affaires,
 * recevait `finance_forbidden`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TEST PAR ENDPOINT NE SUFFIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `copilot-bridge.controller.spec.ts` teste maintenant `overduePayments` et
 * `timesheets` un par un — et un CINQUIÈME endroit financier ajouté demain
 * sans garde ne ferait tomber AUCUN de ces tests, puisqu'aucun ne le connaît
 * encore. Ce fichier compte les PORTES, pas les cas : toute route dont le
 * chemin contient `finance`, `invoic` ou `timesheet` doit prouver l'une des
 * deux formes de sécurité que ce pont connaît déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX FORMES LÉGITIMES — ET POURQUOI UNE TROISIÈME EST UN FAUX POSITIF
 * ─────────────────────────────────────────────────────────────────────────
 * `invoicing/blockers` contient bien « invoic » et n'appelle JAMAIS
 * `can(…, 'finance:read')` — et c'est CORRECT : elle passe `canReadFinance:
 * false` EN DUR à `InvoiceReadinessService.list`, qui rédige tout montant
 * quel que soit le rôle. C'est une sécurité PLUS stricte qu'un refus (elle ne
 * refuse jamais la liste, elle vide le champ financier), documentée par le
 * même motif dans `invoice-readiness.controller.ts`. Une garde qui exigerait
 * `finance:read` PARTOUT confondrait ce cas avec le défaut qu'on corrige —
 * la troisième preuve qu'une garde doit apporter : ne pas attraper ce qu'elle
 * ne vise pas.
 */

const CONTROLLER_PATH = join(__dirname, '..', 'modules', 'copilot-bridge', 'copilot-bridge.controller.ts')
const source = readFileSync(CONTROLLER_PATH, 'utf8')

const NEXT_ROUTE = /@(?:Get|Post|Patch|Put|Delete)\s*\(/
const ROUTE_RE = /@Post\('([^']+)'\)/g

/**
 * Retire les commentaires AVANT toute comparaison de texte.
 *
 * ⚠️ Sans ça, la découpe « jusqu'à la route suivante » avale le JSDoc du
 * PROCHAIN handler — et celui d'`invoiceBlockers` écrit littéralement
 * « `canReadFinance: false` EN DUR » en PROSE, dans sa phrase d'explication.
 * Une garde qui lirait ce commentaire croirait `timesheets/month` protégée
 * alors que son VRAI corps ne contient rien de tel — exactement le défaut nommé
 * dans le CLAUDE.md : « des listes découpées sans retirer les commentaires ».
 * Trouvé en écrivant CE test (le retrait manuel de la garde, plus bas, ne
 * faisait PAS rougir GA-319 avant ce correctif).
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** Le corps qui suit une déclaration de route, coupé AVANT la route suivante,
 *  et AVANT le commentaire qui l'annonce. */
function handlerAfter(source: string, marker: string): string {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const rest = source.slice(start + marker.length)
  const next = rest.search(NEXT_ROUTE)
  const raw = next < 0 ? rest : rest.slice(0, next)
  return stripComments(raw)
}

/** Chaque route déclarée, avec le corps — SANS COMMENTAIRE — de SON handler. */
function allRoutes(source: string): { path: string; handler: string }[] {
  const routes: { path: string; handler: string }[] = []
  for (const match of source.matchAll(ROUTE_RE)) {
    const path = match[1]
    routes.push({ path, handler: handlerAfter(source, match[0]) })
  }
  return routes
}

/** Un chemin qui parle d'argent, d'échéances ou de temps saisi. */
const FINANCE_SHAPED = /finance|invoic|timesheet/i

describe('le pont du copilote — chaque porte financière est gardée (GA-319 / GA-320)', () => {
  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — le contrôleur existe, et au moins cinq routes portent le nom de la famille', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une chaîne
    // vide, zéro faute trouvée, et un test vert pour toujours.
    expect(source.length).toBeGreaterThan(5000)
    expect(source).toContain('class CopilotBridgeController')
    const financeShapedRoutes = allRoutes(source).filter(route => FINANCE_SHAPED.test(route.path))
    expect(financeShapedRoutes.length).toBeGreaterThanOrEqual(5)
    expect(financeShapedRoutes.map(route => route.path).sort()).toEqual(
      [
        'finance/capacity',
        'finance/confirmed-revenue',
        'finance/forecast',
        'finance/revenue',
        'invoicing/blockers',
        'invoicing/overdue',
        'timesheets/month',
      ].sort(),
    )
  })

  /* ---------------------------------------------------------------------- */
  /*  GA-319 — le compteur de portes : toute route « finance-shaped » a une  */
  /*  des deux sécurités connues, quel que soit son nom                     */
  /* ---------------------------------------------------------------------- */

  it('GA-319 — toute route dont le CHEMIN parle d’argent, d’impayés ou de temps saisi se protège', () => {
    const financeShapedRoutes = allRoutes(source).filter(route => FINANCE_SHAPED.test(route.path))
    const unprotected = financeShapedRoutes.filter(
      route => !route.handler.includes("'finance:read'") && !route.handler.includes('canReadFinance: false'),
    )
    if (unprotected.length > 0) {
      throw new Error(
        [
          `Route(s) financière(s) sans garde : ${unprotected.map(route => route.path).join(', ')}.`,
          'Chaque route dont le chemin contient « finance », « invoic » ou « timesheet » doit soit demander',
          "can(role, extra, 'finance:read') et refuser par { error: 'finance_forbidden' }, soit passer",
          '{ canReadFinance: false } EN DUR à son service (la rédaction inconditionnelle, comme `invoicing/blockers`).',
          'Un nouvel endpoint financier arrivé sans l’un des deux fait échouer CE test — c’est le but.',
        ].join('\n'),
      )
    }
    expect(unprotected).toEqual([])
  })

  /**
   * La garde SAIT DIRE NON : retirer `if (!can(role, extra, 'finance:read'))
   * return { error: 'finance_forbidden' })` de `overduePayments` ou de
   * `timesheets` (ou remplacer `canReadFinance: false` par `true` sur
   * `invoiceBlockers`) fait échouer le test au-dessus — vérifié à la main
   * pendant l'écriture de ce lot (LOT 15), sortie rouge collée dans le rapport
   * de session plutôt que rejouée ici : une mutation du fichier protégé n'a
   * pas sa place dans une suite qui tourne en CI.
   */

  /* ---------------------------------------------------------------------- */
  /*  Elle N'ATTRAPE PAS ce qu'elle ne vise pas                              */
  /* ---------------------------------------------------------------------- */

  it('ne confond PAS la rédaction inconditionnelle avec une garde manquante — `invoicing/blockers`', () => {
    // Témoin de faux positif : cette route contient bien « invoic », n'appelle
    // JAMAIS `finance:read`, et c'est un choix DÉLIBÉRÉ (même motif que
    // `invoice-readiness.controller.ts` pour `GET /delivery/invoice-readiness`).
    const blockers = allRoutes(source).find(route => route.path === 'invoicing/blockers')
    expect(blockers?.handler).toBeTruthy()
    expect(blockers?.handler).not.toContain("'finance:read'")
    expect(blockers?.handler).toContain('canReadFinance: false')
  })

  it('ne mord pas sur une route SANS rapport — `talents/search` n’entre pas dans la famille financière', () => {
    // La route existe bien dans le corpus (le témoin serait creux sinon) ;
    // c'est son CHEMIN qui ne parle ni d'argent, ni d'impayés, ni de temps
    // saisi, donc elle n'a pas à porter `finance:read`.
    const talents = allRoutes(source).find(route => route.path === 'talents/search')
    expect(talents).toBeDefined()
    expect(FINANCE_SHAPED.test('talents/search')).toBe(false)
    const financeShapedPaths = allRoutes(source)
      .filter(route => FINANCE_SHAPED.test(route.path))
      .map(route => route.path)
    expect(financeShapedPaths).not.toContain('talents/search')
  })

  /* ---------------------------------------------------------------------- */
  /*  GA-320 — la même forme d'erreur PARTOUT                               */
  /* ---------------------------------------------------------------------- */

  /**
   * #2407.9 — LOT 15, ARBITRAGE B (tranché par Louis 22/09 soir, decisions §1) :
   * `POST missions/ending` n'est PAS finance-shaped (son chemin ne contient ni
   * « finance », ni « invoic », ni « timesheet » — c'est une liste de missions),
   * mais elle ENRICHIT une partie de sa réponse (`poValidUntil`) avec une donnée
   * `finance:read`. Refuser la route ENTIÈRE effacerait la liste des missions
   * pour qui n'a que le droit de lecture standard — elle DIT donc l'absence de
   * lecture (`poValidityReadable: false`) plutôt que de la refuser ou d'inventer
   * une valeur. Ni un refus (GA-320), ni la rédaction inconditionnelle
   * d'`invoicing/blockers` : un TROISIÈME régime, nommé ici pour ne pas être
   * confondu avec un oubli du premier.
   */
  it("GA-320 — toute route qui interroge `finance:read` refuse avec EXACTEMENT `{ error: 'finance_forbidden' }`, sauf le régime de dégradation nommé", () => {
    // Le vocabulaire de refus est celui que `chat_tools.py` sait déjà lire
    // (`get_revenue`, `get_capacity`) : une route qui inventerait sa propre
    // forme d'erreur laisserait Laura répondre une liste vide plutôt que
    // « je n'ai pas le droit de voir ça ». Pas de forme UNIQUE de condition —
    // `finance/revenue` a un repli `finance:read:own` que `capacity`,
    // `timesheets/month` et `invoicing/overdue` n'ont pas (D1 : ces trois
    // décrivent l'ÉQUIPE, pas un portefeuille par porteur) — seul le
    // VOCABULAIRE de refus doit rester le même partout.
    //
    // ⚠️ `missions/ending` (#2407.9, LOT 15 ARBITRAGE B, tranché par Louis
    // 22/09 soir) interroge `finance:read` mais N'EST PAS un refus : la liste
    // des missions reste visible sans le droit, seule `poValidUntil` se tait
    // (`poValidityReadable: false`) — une TROISIÈME forme légitime, la
    // rédaction PARTIELLE d'un sous-champ, cousine d'`invoicing/blockers`
    // (`canReadFinance: false` en dur) plutôt qu'un refus. La confondre avec
    // les quatre routes ci-dessous casserait ce que #2407.9 a délibérément
    // choisi. Testée par l'exception nommée juste après cette assertion.
    const gated = allRoutes(source).filter(
      route => route.handler.includes("'finance:read'") && route.path !== 'missions/ending',
    )
    expect(gated.length).toBeGreaterThanOrEqual(4)
    expect(gated.map(route => route.path).sort()).toEqual(
      [
        'finance/capacity',
        'finance/confirmed-revenue',
        'finance/forecast',
        'finance/revenue',
        'invoicing/overdue',
        'timesheets/month',
      ].sort(),
    )
    for (const route of gated) {
      expect(route.handler).toContain("return { error: 'finance_forbidden' }")
    }
  })

  it("GA-320 — l'exception nommée `missions/ending` interroge bien `finance:read`, sans refuser la route", () => {
    // Empêche l'exemption ci-dessus de devenir un angle mort silencieux :
    // si `missions/ending` cessait un jour d'interroger `finance:read`, ou se
    // mettait à refuser comme les quatre autres, ce test-ci le dirait —
    // l'exclusion par chemin, seule, ne suffit pas à prouver que le geste
    // qu'elle protège existe encore.
    const route = allRoutes(source).find(candidate => candidate.path === 'missions/ending')
    expect(route).toBeDefined()
    expect(route?.handler).toContain("'finance:read'")
    expect(route?.handler).not.toContain("return { error: 'finance_forbidden' }")
  })
})
