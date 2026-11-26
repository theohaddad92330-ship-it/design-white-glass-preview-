import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { marketHeatRank } from '@bellum/contracts'

/**
 * ⚠️⚠️ #4016.L10.c revient sur GA-262, délibérément — Louis 11/10 (« un signal
 * isolé suffit pour « chaud » »), codé le 13/10 (lot E6). Une observation
 * marché SEULE rend désormais un compte « chaud » : dans les deux tris du
 * cockpit, la PREMIÈRE clé est `marketHeatRank` (contrat `market-heat.ts` :
 * un signal récent OU une présence marché), et la clé d'urgence propre à chaque
 * bloc (`ANOMALY_RANK`, `new_signal`) ne fait plus que départager à chaleur
 * égale. Ce qui reste tenu, et que la garde vérifie toujours : le rang est une
 * PRÉSENCE, jamais un volume ; `new_signals_7d` ne lit rien du marché ; une
 * fonction `*MarketRank` locale de l'API ne mène jamais un tri (la chaleur ne
 * passe QUE par le contrat). Le bloc « #4016.L10.c » ci-dessous DIT NON à
 * l'ancienne règle (marché en simple départage) et à un rang en volume.
 *
 * ── Texte d'origine (avant le renversement) ──
 *
 * GA-262 — #1573.5 / #1573.7 / #1574.1 — LA MÉMOIRE MARCHÉ N'INVENTE PAS D'URGENCE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET LES TROIS RETOURS QUI L'ONT ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois retours du 06/09/2026 la posent, chacun depuis son écran, dans les mêmes
 * termes — ce qui n'est pas un écho mais une convergence :
 *
 * · #1573 : « la mémoire marché peut augmenter le POTENTIEL d'un compte, jamais
 *   fabriquer une URGENCE » et « ne jamais transformer une observation marché
 *   seule en "Nouveau signal" — `newSignals` reste exclusivement un signal
 *   récent » ;
 * · #1574 : « ne jamais transformer cette mémoire en prétexte automatique pour
 *   contacter le client » ;
 * · #1581 : « la mémoire marché seule ne doit jamais devenir "à contacter
 *   aujourd'hui" ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE, ET POURQUOI CE N'EST PAS UN LIBELLÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle est tenue par une PLACE DANS UN TRI, et une place ne se voit pas à la
 * relecture : les deux blocs du cockpit classent leurs lignes avec un
 * comparateur à trois ou quatre clés, et il suffit d'échanger deux lignes pour
 * qu'un compte massivement observé passe devant un compte porteur d'un signal
 * récent. Rien n'échouerait — le tri resterait déterministe, tous les autres
 * tests resteraient verts, et l'écran se lirait parfaitement bien. C'est
 * exactement le genre de changement conforme en apparence que seule une garde
 * attrape.
 *
 * Elle vérifie donc trois choses, et un témoin :
 *  1. dans CHAQUE comparateur qui lit la mémoire marché, la clé de marché arrive
 *     APRÈS la clé qui porte l'urgence (le rang d'anomalie, ou la présence d'un
 *     signal neuf) ;
 *  2. le compteur `new_signals_7d` ne lit RIEN de la mémoire marché — sinon une
 *     observation deviendrait un « nouveau signal », ce que #1573 refuse
 *     nommément ;
 *  3. le rang de marché est une PRÉSENCE et non un volume : trier sur le nombre
 *     de parcours ferait remonter les grandes entreprises, le corpus en portant
 *     mécaniquement plus — c'est-à-dire ferait de ce tri une mesure de TAILLE,
 *     le refus déjà inscrit contre `externalization_score` (#1640.6, GA-257) ;
 *  4. le TÉMOIN : les deux comparateurs sont bien TROUVÉS. Une garde qui ne
 *     trouve rien passe au vert sans avoir rien lu — six gardes borgnes en deux
 *     jours dans ce dépôt, et c'est le défaut le plus cher d'une garde.
 *
 * ⚠️ Elle lit du SOURCE, ce qui est le dernier recours et non le premier : un
 * invariant d'ORDRE entre deux clés d'un même comparateur ne s'exprime pas
 * autrement sans découper le comparateur en fonctions nommées — ce qui rendrait
 * le tri moins lisible que la règle qu'il tient. Les commentaires sont donc
 * retirés avant lecture (`sans commentaire` ci-dessous) : ce fichier PARLE de la
 * règle, et une garde qui lit sa propre justification compare du bruit à du
 * bruit.
 */

const SERVICE = join(__dirname, '..', 'modules', 'dashboard', 'cockpit-perspective.service.ts')

/** Le code débarrassé de ce qui n'est pas du code — la prose de ce service CITE
 *  les deux noms qu'on cherche, et abondamment. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ')
}

/**
 * Le corps d'un comparateur `.sort(…)`, isolé par comptage de parenthèses.
 *
 * ⚠️ Pas une expression régulière : un comparateur contient ses propres
 * parenthèses (`Number(Boolean(…))`, `Date.parse(…)`), et un `\)` non compté
 * coupait le corps à la première — c'est la famille de défaut d'un extracteur
 * de balise arrêté à la flèche de `onClick={() => …}`.
 */
function sortBodies(code: string): string[] {
  const bodies: string[] = []
  let from = 0
  for (;;) {
    const start = code.indexOf('.sort(', from)
    if (start === -1) return bodies
    let depth = 0
    let index = start + '.sort('.length - 1
    for (; index < code.length; index += 1) {
      if (code[index] === '(') depth += 1
      else if (code[index] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    bodies.push(code.slice(start, index + 1))
    from = index + 1
  }
}

/** #4016.L10.c — les deux tris du cockpit : la chaleur d'abord, puis la clé
 *  d'URGENCE propre au bloc, qui ne fait plus que départager. */
const ORDERINGS = [
  { what: 'les anomalies de couverture (#1573.5)', urgency: 'ANOMALY_RANK' },
  { what: 'les opportunités à réveiller (#1574.1)', urgency: 'new_signal' },
] as const

/** Le contrat qui dit « chaud » — la SEULE source de la chaleur (GA-26). */
const HEAT_CONTRACT = 'marketHeatRank('

/**
 * Les fonctions locales de chaleur du service : toute `function xxxHeat(…)`
 * dont le corps appelle le CONTRAT. Une fonction « Heat » qui recalculerait la
 * chaleur elle-même n'entre pas dans la liste — et le tri qui la lirait serait
 * refusé (« chaleur absente »).
 */
function heatFunctions(code: string): string[] {
  const out: string[] = []
  for (const match of code.matchAll(/function\s+(\w*Heat)\s*\([^)]*\)[^{]*\{([^}]*)\}/g)) {
    if ((match[2] ?? '').includes(HEAT_CONTRACT)) out.push(match[1] as string)
  }
  return out
}

/**
 * #4016.L10.c — le prédicat : ce comparateur tient-il la NOUVELLE règle ?
 * La chaleur (une fonction qui lit `marketHeatRank`, contrat) est son PREMIER
 * terme, avant la clé d'urgence. Rend les fautes NOMMÉES — vide si conforme.
 */
function heatOrderingFaults(body: string, urgency: string, heatNames: readonly string[]): string[] {
  const arrowAt = body.indexOf('=>')
  const expr = arrowAt === -1 ? body : body.slice(arrowAt + 2)
  const positions = [HEAT_CONTRACT, ...heatNames.map(name => `${name}(`)]
    .map(token => expr.indexOf(token))
    .filter(at => at !== -1)
  if (positions.length === 0) return ['la chaleur (`marketHeatRank`) est absente du tri']
  const heatAt = Math.min(...positions)
  const faults: string[] = []
  const firstOr = expr.indexOf('||')
  if (firstOr !== -1 && firstOr < heatAt) faults.push('la chaleur n’est pas le premier terme du tri')
  const urgencyAt = expr.indexOf(urgency)
  if (urgencyAt === -1) faults.push(`la clé d’urgence \`${urgency}\` a disparu du départage`)
  else if (urgencyAt < heatAt) faults.push(`la clé d’urgence \`${urgency}\` passe avant la chaleur`)
  return faults
}

/**
 * #1637 — LE MÊME MÉCANISME, RÉUTILISÉ SUR `/briefing` — ET LA GARDE ÉTENDUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA GARDE NE GAGNE PAS UN SECOND CHEMIN CODÉ EN DUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `/briefing` réutilise exactement le rang du cockpit (une PRÉSENCE, jamais un
 * volume) dans `rankAccountsToWatchByMarket` (`briefing/accounts-to-watch-
 * market-rank.ts`). La première tentation est d'ajouter un second `SERVICE`
 * en dur, à côté de celui du cockpit — exactement le défaut que ce dépôt
 * connaît par cœur : une garde qui ne voit que ce qu'on lui a nommé ne voit
 * jamais le TROISIÈME fichier. Le bloc ci-dessous DÉCOUVRE les surfaces de tri
 * plutôt que de les lister : toute fonction dont le nom contient « Market » et
 * finit par « Rank » — la convention déjà posée par `marketPotentialRank` et
 * `dormantMarketRank` — entre dans le corpus, où qu'elle vive dans l'API.
 *
 * Elle vérifie, pour CHAQUE fonction découverte :
 *  1. son rang est une PRÉSENCE, jamais un volume (même test que ci-dessus,
 *     généralisé) ;
 *  2. dans CHAQUE `.sort(…)` qui l'appelle, elle n'est jamais le premier terme
 *     du comparateur — un `||` doit la précéder. C'est la version générique de
 *     « la clé de marché arrive après la clé d'urgence » : elle ne nomme plus
 *     la clé d'urgence (elle diffère par surface — `ANOMALY_RANK`, `new_signal`,
 *     l'exactitude d'une détection…), elle vérifie seulement qu'UNE clé la
 *     précède, ce qui est la forme du refus commun aux trois retours du
 *     06/09/2026 cités plus haut.
 *
 * Elle ne remplace PAS les tests nommés ci-dessus : ils continuent de vérifier
 * la clé PRÉCISE (`ANOMALY_RANK`, `new_signal`) pour les deux orderings déjà
 * connus, ce que la version générique ne peut pas faire sans deviner un nom.
 * Les deux se complètent : le nommé protège ce qui est déjà écrit, le
 * découvert protège ce qui arrivera.
 */
const MODULES_DIR = join(__dirname, '..', 'modules')

/** Tous les fichiers source de l'API — contrôleurs et modules INCLUS,
 *  contrairement à GA-07 : un tri influencé par le marché peut vivre n'importe
 *  où, et c'est justement ce que cette garde ne veut pas avoir à deviner. */
function apiSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...apiSourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

/** Le nom d'une fonction de rang marché — la convention posée par
 *  `marketPotentialRank` et `dormantMarketRank` : contient « Market », finit
 *  par « Rank », est une déclaration `function`. */
const MARKET_RANK_FN_PATTERN = /function\s+([A-Za-z0-9_]*[Mm]arket[A-Za-z0-9_]*Rank)\s*\(/g

type DiscoveredMarketRankFn = { name: string; file: string }

/** Découvre TOUTES les fonctions de rang marché du dépôt API, une fois par
 *  nom ET par fichier — un nom réutilisé dans deux fichiers compte deux fois,
 *  parce que chaque déclaration a sa PROPRE garde de présence à vérifier. */
function discoverMarketRankFunctions(): DiscoveredMarketRankFn[] {
  const out: DiscoveredMarketRankFn[] = []
  for (const file of apiSourceFiles(MODULES_DIR)) {
    const code = withoutComments(readFileSync(file, 'utf8'))
    const seenInFile = new Set<string>()
    for (const match of code.matchAll(MARKET_RANK_FN_PATTERN)) {
      const name = match[1] as string
      if (seenInFile.has(name)) continue
      seenInFile.add(name)
      out.push({ name, file })
    }
  }
  return out
}

describe('GA-262 (#1637) — DÉCOUVERTE : toute fonction de rang marché du dépôt, où qu’elle vive', () => {
  const discovered = discoverMarketRankFunctions()

  it('TÉMOIN — la découverte trouve au moins une fonction de rang marché', () => {
    // Sans ce test, renommer TOUTES les fonctions `*MarketRank` viderait le
    // corpus et les deux tests suivants passeraient au vert sans avoir rien lu
    // — exactement le défaut le plus cher d'une garde dans ce dépôt.
    expect(discovered.length).toBeGreaterThan(0)
  })

  it.each(discovered.length ? discovered : [{ name: '(aucune découverte)', file: '' }])(
    '$name — le rang est une PRÉSENCE, jamais un volume',
    ({ name, file }) => {
      if (!file) return // le témoin ci-dessus a déjà fait échouer la suite
      const code = withoutComments(readFileSync(file, 'utf8'))
      const declaration = code.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([^}]*)\\}`))
      expect({ name, declared: declaration?.[1] !== undefined }).toEqual({ name, declared: true })
      expect(declaration?.[1]).toContain('!= null ? 1 : 0')
    },
  )

  it.each(discovered.length ? discovered : [{ name: '(aucune découverte)', file: '' }])(
    '$name — n’est JAMAIS le premier terme d’un comparateur qui l’appelle',
    ({ name, file }) => {
      if (!file) return
      let callSites = 0
      for (const sourceFile of apiSourceFiles(MODULES_DIR)) {
        const code = withoutComments(readFileSync(sourceFile, 'utf8'))
        for (const body of sortBodies(code)) {
          if (!body.includes(`${name}(`)) continue
          callSites += 1
          const arrowAt = body.indexOf('=>')
          const expr = arrowAt === -1 ? body : body.slice(arrowAt + 2)
          const orIndex = expr.indexOf('||')
          const marketIndex = expr.indexOf(`${name}(`)
          // Si ce test tombe : la fonction de rang marché est devenue le
          // PREMIER critère d'un tri — c'est-à-dire qu'elle peut désormais
          // FABRIQUER un ordre, plutôt que départager un ordre déjà décidé.
          expect({ name, file: sourceFile, precededByATerm: orIndex !== -1 && orIndex < marketIndex }).toEqual({
            name,
            file: sourceFile,
            precededByATerm: true,
          })
        }
      }
      // TÉMOIN local : la fonction doit avoir AU MOINS un site d'appel dans un
      // `.sort(…)` — sinon elle ne participe à aucun tri, et ce test-ci ne
      // vérifierait rien du tout.
      expect(callSites).toBeGreaterThan(0)
    },
  )
})

describe('GA-262 (#4016.L10.c, Louis 11/10) — un signal isolé suffit pour « chaud »', () => {
  const code = withoutComments(readFileSync(SERVICE, 'utf8'))
  const bodies = sortBodies(code)
  const heatNames = heatFunctions(code)
  const readsHeat = (body: string) => heatNames.some(name => body.includes(`${name}(`)) || body.includes(HEAT_CONTRACT)

  it('TÉMOIN — le service a ses fonctions de chaleur, et chacune lit le CONTRAT', () => {
    expect(heatNames.length).toBeGreaterThanOrEqual(2)
  })

  it('TÉMOIN — les deux comparateurs qui lisent la chaleur existent, un par bloc', () => {
    // Sans ce test, renommer les fonctions de chaleur rendrait la garde muette.
    for (const ordering of ORDERINGS) {
      const found = bodies.filter(body => readsHeat(body) && body.includes(ordering.urgency))
      expect({ what: ordering.what, comparators: found.length > 0 }).toEqual({
        what: ordering.what,
        comparators: true,
      })
    }
  })

  it.each(ORDERINGS)('la chaleur arrive EN PREMIER, la clé d’urgence départage — $what', ordering => {
    const comparators = bodies.filter(body => readsHeat(body) && body.includes(ordering.urgency))
    expect(comparators.length).toBeGreaterThan(0)
    for (const body of comparators) {
      expect({ what: ordering.what, faults: heatOrderingFaults(body, ordering.urgency, heatNames) }).toEqual({
        what: ordering.what,
        faults: [],
      })
    }
  })

  it('SAIT DIRE NON — l’ANCIENNE règle (le marché en simple départage) est refusée, et nommée', () => {
    const ancien =
      '.sort((left, right) => ANOMALY_RANK[left.kind] - ANOMALY_RANK[right.kind] || marketPotentialRank(right) - marketPotentialRank(left))'
    expect(heatOrderingFaults(ancien, 'ANOMALY_RANK', heatNames)).toEqual([
      'la chaleur (`marketHeatRank`) est absente du tri',
    ])
    const chaleurEnSecond =
      '.sort((left, right) => ANOMALY_RANK[left.kind] - ANOMALY_RANK[right.kind] || anomalyHeat(r) - anomalyHeat(l))'
    expect(heatOrderingFaults(chaleurEnSecond, 'ANOMALY_RANK', ['anomalyHeat'])).toEqual([
      'la chaleur n’est pas le premier terme du tri',
      'la clé d’urgence `ANOMALY_RANK` passe avant la chaleur',
    ])
  })

  it('SAIT DIRE NON — une fonction « Heat » qui ne lit pas le contrat n’est pas une chaleur', () => {
    const local = 'function fakeHeat(item) { return item.market_paths > 10 ? 1 : 0 }'
    expect(heatFunctions(local)).toEqual([])
  })

  it('SAIT DIRE NON — un tri qui perdrait sa clé d’urgence est refusé', () => {
    const sansUrgence = '.sort((left, right) => dormantHeat(r) - dormantHeat(l) || compareSince(a, b))'
    expect(heatOrderingFaults(sansUrgence, 'new_signal', ['dormantHeat'])).toEqual([
      'la clé d’urgence `new_signal` a disparu du départage',
    ])
  })

  it('UN signal isolé suffit — et la chaleur est une PRÉSENCE, jamais un volume', () => {
    expect(marketHeatRank({ recentSignal: false, marketPaths: 3 })).toBe(1)
    expect(marketHeatRank({ recentSignal: true, marketPaths: null })).toBe(1)
    expect(marketHeatRank({ recentSignal: false, marketPaths: 300 })).toBe(
      marketHeatRank({ recentSignal: false, marketPaths: 3 }),
    )
    // SAIT DIRE NON : sans aucun signal, froid.
    expect(marketHeatRank({ recentSignal: false, marketPaths: null })).toBe(0)
  })

  it('la chaleur se lit sur `market_paths` en PRÉSENCE — jamais un nombre de parcours comparé', () => {
    for (const name of heatNames) {
      const body = code.match(new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([^}]*)\\}`))?.[1] ?? ''
      expect({ name, readsPaths: body.includes('market_paths') }).toEqual({ name, readsPaths: true })
      expect(body).not.toMatch(/market_paths\s*[-><]/)
    }
  })

  it('le compteur `new_signals_7d` ne lit RIEN de la mémoire marché — #1573.7', () => {
    // « Ne jamais transformer une observation marché seule en Nouveau signal. »
    // Le compteur est nourri par `signal_history` et par rien d'autre ; ce test
    // vérifie qu'aucune lecture de marché n'entre dans son voisinage immédiat.
    const assignment = code.indexOf('new_signals_7d')
    expect(assignment).toBeGreaterThan(0)
    const neighbourhood = code.slice(Math.max(0, assignment - 400), assignment + 400)
    expect(neighbourhood).not.toContain('market_paths')
    expect(neighbourhood).not.toContain('marketMemory')
  })
})
