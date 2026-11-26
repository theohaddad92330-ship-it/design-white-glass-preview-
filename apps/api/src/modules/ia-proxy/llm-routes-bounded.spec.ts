import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute route qui appelle un MODÈLE porte une borne (BEL-FIX-006, dossier du 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE (deuxième round, 12/09)
 * ─────────────────────────────────────────────────────────────────────────────
 * `credit-weights.ts` promet, en toutes lettres, que les actions « incluses »
 * sont « bornées autrement — plafond quotidien du copilote, garde-fou de débit
 * sur les messages ». Le premier existait (`CHAT_DAILY_MESSAGE_LIMIT`). Le
 * second manquait sur `icebreaker`/`message`/`weekly-briefing`/`battlecard`/
 * `compare` — corrigé le 26/08, avec cette garde.
 *
 * Le 12/09 : `POST /ia/discover` — un appel Brave + un appel Claude FACTURÉ à
 * chaque run — n'avait AUCUN `@Throttle`, alors que ses deux frères
 * `discover/registry` et `discover/signals` en portent un. Cette garde-CI
 * était aveugle au trou : `MODEL_ROUTES` était une liste écrite À LA MAIN —
 * `['icebreaker', 'message', 'weekly-briefing', 'battlecard', 'compare']` —
 * où `discover` n'a jamais figuré. Elle passait au vert en vérifiant
 * scrupuleusement cinq routes pendant qu'une sixième, tout aussi coûteuse,
 * n'était vérifiée par personne.
 *
 * La correction ne rajoute pas `discover` à la liste : elle SUPPRIME la
 * liste. Les routes de modèle sont maintenant DÉRIVÉES du contrôleur — tout
 * appel `this.ia.<methode>(` trouvé dans le corps d'une route en fait une
 * route de modèle, sans qu'un humain doive s'en souvenir le jour où une
 * septième (ou une dixième) route apparaît.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE LIT LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un décorateur NestJS ne se voit pas depuis un test unitaire du contrôleur :
 * il est appliqué par le conteneur, pas par la classe. Lire le fichier est donc
 * le seul moyen de répondre à « cette route est-elle bornée ? » — et à
 * « est-ce encore une route de modèle ? ».
 *
 * ⚠️ Elle vérifie aussi le NOM du limiteur. `@Throttle` accepte n'importe
 * quelle clé et ignore silencieusement celles qui ne correspondent à aucun
 * throttler déclaré dans `app.module.ts` : une faute de frappe rendrait la
 * route non bornée tout en donnant l'apparence contraire — exactement le
 * défaut trouvé le même jour dans `oauth.controller.ts` (`default` au lieu de
 * `default-1m`).
 */

const CONTROLLER = join(__dirname, 'ia-proxy.controller.ts')

/** Le nom déclaré dans `app.module.ts`. Une autre clé est ignorée en silence. */
const DECLARED_THROTTLER = 'default-1m'

function source(): string {
  return readFileSync(CONTROLLER, 'utf8')
}

interface RouteBlock {
  method: 'Post' | 'Get'
  route: string
  block: string
}

/**
 * Découpe le contrôleur en un bloc de texte par route HTTP : du décorateur
 * `@Post('...')`/`@Get('...')` jusqu'à la ligne qui précède le décorateur de
 * route SUIVANT (ou la fin du fichier). Un décorateur non lié à une route
 * (`@RequireFeature`, `@RequirePermission`…) qui précède la route suivante
 * peut traîner en fin de bloc — sans conséquence : aucun de ces décorateurs
 * ne contient `@Throttle(`, `this.ia.` ni `assertChatQuota`, et dans ce
 * fichier `@Throttle` suit toujours immédiatement le `@Post`/`@Get` de SA
 * PROPRE route, jamais celui de la suivante.
 */
function extractRouteBlocks(text: string): RouteBlock[] {
  const lines = text.split('\n')
  const routeDecorator = /^\s*@(Post|Get)\('([^']*)'\)\s*$/
  const starts: { index: number; method: 'Post' | 'Get'; route: string }[] = []
  lines.forEach((line, index) => {
    const match = line.match(routeDecorator)
    if (match) starts.push({ index, method: match[1] as 'Post' | 'Get', route: match[2] })
  })
  return starts.map((start, i) => {
    const next = starts[i + 1]
    const end = next ? next.index : lines.length
    return { method: start.method, route: start.route, block: lines.slice(start.index, end).join('\n') }
  })
}

/**
 * Les routes qui déclenchent au moins un appel de modèle — DÉRIVÉES du
 * contrôleur, jamais écrites à la main. C'est précisément ce qui manquait :
 * une liste manuelle est ce qui a laissé passer `discover` (voir le docblock
 * ci-dessus).
 */
function modelRoutes(text: string): RouteBlock[] {
  return extractRouteBlocks(text).filter(({ block }) => /this\.ia\.\w+\(/.test(block))
}

/**
 * Une route est bornée si elle porte un `@Throttle(` explicite, OU le garde-
 * fou équivalent documenté : `assertChatQuota`, le plafond QUOTIDIEN de
 * `chat` — plus strict qu'un débit par minute, donc un substitut légitime,
 * pas une exception muette.
 */
function isGuarded({ block }: RouteBlock): boolean {
  return block.includes('@Throttle(') || block.includes('assertChatQuota')
}

describe('les routes de modèle sont bornées', () => {
  it('lit vraiment le contrôleur — sans ça, la garde serait verte sur du vide', () => {
    const text = source()
    expect(text.length).toBeGreaterThan(1000)
    expect(text).toContain('@Controller')
    const routes = modelRoutes(text).map(r => r.route)
    // Sanity : preuve que l'extracteur trouve vraiment les routes attendues,
    // discover comprise — pas une liste manuelle qui remplacerait la
    // dérivation, juste une vérification qu'elle n'a rien manqué.
    expect(routes).toEqual(
      expect.arrayContaining([
        'discover',
        'discover/registry',
        'discover/signals',
        'chat',
        'icebreaker',
        'search/extract-entity',
        'message',
        'weekly-briefing',
        'battlecard',
        'compare',
      ]),
    )
    expect(routes.length).toBe(10)
  })

  it.each(modelRoutes(source()).map(r => [`${r.method} /ia/${r.route}`, r] as const))(
    '%s porte un garde-fou de débit (throttle ou quota quotidien)',
    (_label: string, route: RouteBlock) => {
      expect(isGuarded(route)).toBe(true)
    },
  )

  it('la borne cite un throttler DÉCLARÉ — une clé inconnue est ignorée en silence', () => {
    const text = source()
    // La constante elle-même, pas seulement son usage : c'est là que la faute
    // de frappe se loge, et elle ne produirait aucune erreur au démarrage.
    expect(text).toContain(`const LLM_DRAFT_RATE_LIMIT = { '${DECLARED_THROTTLER}':`)
    expect(text).toContain(`const DISCOVER_RATE_LIMIT = { '${DECLARED_THROTTLER}':`)
  })

  it('sait dire NON — retirer le @Throttle de discover est détecté', () => {
    // On casse volontairement le code que la garde protège : sans cette
    // preuve, le test précédent pourrait passer au vert pour toujours sur un
    // détecteur en panne (leçon n°3 des gardes borgnes du socle). C'est aussi
    // la reproduction EXACTE du défaut trouvé le 12/09 : `discover` sans
    // `@Throttle`, à côté de frères qui en ont un.
    const broken = source().replace(
      / {2}@Post\('discover'\)\n {2}@Throttle\(DISCOVER_RATE_LIMIT\)\n/,
      "  @Post('discover')\n",
    )
    expect(broken).not.toEqual(source())
    const brokenDiscover = modelRoutes(broken).find(r => r.route === 'discover')
    if (!brokenDiscover) throw new Error("la route 'discover' a disparu de l'extraction — le test ne prouve plus rien")
    expect(isGuarded(brokenDiscover)).toBe(false)
  })

  it("n'attrape pas ce qu'elle ne vise pas — les routes de lecture ne sont pas des routes de modèle", () => {
    // Témoin de cas légitimes voisins : `chat/messages`, `chat/history` et
    // `chat/commands` sont juste à côté des vraies routes de modèle, dans le
    // même contrôleur, et ne coûtent rien à produire — la garde ne doit pas
    // les réclamer.
    const routes = modelRoutes(source()).map(r => r.route)
    expect(routes).not.toEqual(expect.arrayContaining(['chat/messages', 'chat/history', 'chat/commands']))
  })

  it('le plafond quotidien du copilote reste, lui, un plafond quotidien', () => {
    // Les deux bornes ne sont pas interchangeables : un débit par minute ne
    // protège pas d'un usage soutenu toute la journée, et un plafond quotidien
    // ne protège pas d'une boucle. Le copilote a le second parce que c'est un
    // usage long ; les brouillons ont le premier parce que c'est un geste
    // qu'on répète en ajustant.
    const text = source()
    expect(text).toContain('assertChatQuota')
    expect(text).toContain('chatDailyMessageLimit')
  })
})
