import { describe, expect, it } from 'vitest'
import {
  PRODUCT_SCREENS,
  findProductScreen,
  normalizeScreenRoute,
  resolveProductScreen,
  routeContractFor,
} from './product-screens-catalog.js'
import { resolveRouteAccess } from './route-access.js'

describe('#1683 — le catalogue des écrans du produit', () => {
  it('n’est pas vide, et il l’est assez pour qu’une absence se voie', () => {
    // Le témoin qui prouve que ce test LIT quelque chose : un catalogue vide
    // rendrait toutes les assertions ci-dessous vraies par vacuité.
    expect(PRODUCT_SCREENS.length).toBeGreaterThan(50)
  })

  it('chaque route est NORMALISÉE — commence par « / », jamais de barre finale', () => {
    for (const screen of PRODUCT_SCREENS) {
      expect(`${screen.route} → commence par /`).toBe(`${screen.route} → commence par /`)
      expect(screen.route.startsWith('/')).toBe(true)
      // La racine est la seule route dont la barre finale EST la route.
      expect(screen.route === '/' || !screen.route.endsWith('/')).toBe(true)
      expect(screen.route).not.toContain('?')
    }
  })

  it('aucune route en double — deux entrées pour un écran en feraient deux lignes de tableau', () => {
    const routes = PRODUCT_SCREENS.map(screen => screen.route)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('chaque écran porte ses DEUX libellés, FR et EN', () => {
    for (const screen of PRODUCT_SCREENS) {
      expect(`${screen.route} fr → ${screen.label.fr.trim().length > 0}`).toBe(`${screen.route} fr → true`)
      expect(`${screen.route} en → ${screen.label.en.trim().length > 0}`).toBe(`${screen.route} en → true`)
    }
  })

  it('aucun libellé ne recopie la route — un tableau qui affiche « /accounts/$id » n’a pas de catalogue', () => {
    for (const screen of PRODUCT_SCREENS) {
      expect(screen.label.fr).not.toBe(screen.route)
      expect(screen.label.en).not.toBe(screen.route)
    }
  })

  it('le produit client est la MAJORITÉ du catalogue — sinon la nature « technique » sert de fourre-tout', () => {
    const produit = PRODUCT_SCREENS.filter(screen => screen.nature === 'produit')
    expect(produit.length).toBeGreaterThan(PRODUCT_SCREENS.length / 2)
  })

  it('une redirection n’est jamais un écran du PRODUIT — sinon elle sortirait « jamais ouvert »', () => {
    // Ces quatre routes ne rendent aucun écran : elles renvoient ailleurs
    // (`beforeLoad: () => { throw redirect(...) }`). Les compter comme des
    // écrans produirait un verdict faux — « jamais ouvert » sur une page qui
    // n'existe pas.
    // #4359 : ces adresses ont quitté le routeur (table `legacy-addresses.ts`) — elles ne sont plus au catalogue
    // du tout, donc jamais un écran du produit.
    for (const route of ['/needs', '/knowledge', '/accounts/sprints']) {
      expect(`${route} → ${findProductScreen(route)?.nature === 'produit'}`).toBe(`${route} → false`)
    }
  })
})

describe('normalizeScreenRoute — ce qui arrive du navigateur', () => {
  it('retire la barre finale, jamais celle de la racine', () => {
    expect(normalizeScreenRoute('/accounts/')).toBe('/accounts')
    expect(normalizeScreenRoute('/')).toBe('/')
    expect(normalizeScreenRoute('')).toBe('/')
  })

  it('retire la chaîne de requête et le fragment — un filtre ne voyage pas dans une route', () => {
    // #1682 interdit la VALEUR d'un filtre. Le traceur envoie déjà le seul
    // `pathname`, mais ce module est la dernière ligne : une route qui
    // arriverait avec sa requête ne doit pas devenir une clé d'agrégation.
    expect(normalizeScreenRoute('/accounts?secteur=banque')).toBe('/accounts')
    expect(normalizeScreenRoute('/accounts#bloc')).toBe('/accounts')
  })

  it('une valeur qui n’est pas une chaîne rend la racine plutôt qu’une exception', () => {
    expect(normalizeScreenRoute(null as unknown as string)).toBe('/')
  })
})

describe('resolveProductScreen — d’un chemin RÉEL vers un écran', () => {
  it('reconnaît un chemin littéral', () => {
    expect(resolveProductScreen('/accounts')?.route).toBe('/accounts')
    expect(resolveProductScreen('/settings/security')?.route).toBe('/settings/security')
  })

  it('reconnaît un chemin PARAMÉTRÉ, et l’identifiant ne ressort JAMAIS', () => {
    // Le traceur envoie `toLocation.pathname` : un identifiant de compte VOYAGE
    // donc dans la route. Sans cette résolution, chaque compte deviendrait son
    // propre « écran » — un tableau de mille lignes, et un identifiant de
    // client dans le back-office opérateur.
    const screen = resolveProductScreen('/accounts/3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33')
    expect(screen?.route).toBe('/accounts/$id')
    expect(JSON.stringify(screen)).not.toContain('3f1c2a90')
  })

  it('le LITTÉRAL gagne sur le paramètre — comme le routeur lui-même', () => {
    // `/accounts/partners` et `/accounts/$id` ont le même nombre de segments.
    // Si le paramètre gagnait, l'écran Partenaires serait compté comme une
    // fiche de compte, et n'apparaîtrait jamais dans le tableau.
    expect(resolveProductScreen('/accounts/partners')?.route).toBe('/accounts/partners')
    // #4359 : la mémoire collective n'a plus d'adresse propre — le littéral/paramètre se prouve sur `/accounts/partners`.
    expect(resolveProductScreen('/accounts/abc')?.route).toBe('/accounts/$id')
  })

  it('résout un chemin à DEUX paramètres imbriqués', () => {
    expect(resolveProductScreen('/onboarding/abc/etape-2')?.route).toBe('/onboarding/$id/$stage')
    expect(resolveProductScreen('/onboarding/abc/etape-2/une-question')?.route).toBe('/onboarding/$id/$stage/$slug')
  })

  it('sait dire NON — une route inconnue rend `null`, jamais un écran approchant', () => {
    // Une route qui n'existe pas est une DONNÉE inconnue : la nommer « écran le
    // plus proche » fabriquerait une mesure sur un écran qui n'a rien fait.
    expect(resolveProductScreen('/ceci-nexiste-pas')).toBeNull()
    expect(resolveProductScreen('/accounts/partners/trop/de/segments')).toBeNull()
    expect(resolveProductScreen('/accounts/$id/inconnu')).toBeNull()
  })

  it('n’attrape pas ce qu’elle ne vise pas — un chemin plus COURT ne tombe pas sur un motif plus long', () => {
    // Le témoin du cas légitime voisin : `/accounts` ne doit pas se résoudre en
    // `/accounts/$id` sous prétexte que le second commence pareil.
    expect(resolveProductScreen('/accounts')?.route).toBe('/accounts')
    expect(resolveProductScreen('/settings/profile')?.route).toBe('/settings/profile')
    expect(resolveProductScreen('/settings/profile/context')?.route).toBe('/settings/profile/context')
  })

  it('accepte la barre finale que le routeur peut poser', () => {
    expect(resolveProductScreen('/accounts/')?.route).toBe('/accounts')
  })
})

describe('findProductScreen — la recherche par MOTIF', () => {
  it('rend l’entrée d’un motif connu', () => {
    expect(findProductScreen('/accounts/$id')?.label.fr.length).toBeGreaterThan(0)
  })

  it('sait dire NON sur un motif inconnu', () => {
    expect(findProductScreen('/accounts/$inconnu')).toBeNull()
  })
})

// #2957 (#2179.1) — « afficher la page uniquement aux plans qui l'incluent ».
// #4359 — `/rfp` a quitté le routeur : l'espace Appels d'offres est la lentille `?lens=rfp` du Pipe. Plus de contrat
// de route à /rfp, donc plus de palier porté PAR la route ; la lentille ne se verrouille pas au niveau du routeur.
describe('/rfp — plus une route (#4359)', () => {
  it('n’est plus au catalogue ni gatée comme une route', () => {
    expect(findProductScreen('/rfp') ?? null).toBeNull()
    expect(routeContractFor('/rfp')).toBeNull()
  })
})

describe('#4256 — Pilotage › Pipe porte la section Parcours, ouverte à tous (#4163.2)', () => {
  it('l’écran n’exige NI permission NI palier : le droit se règle par SECTION dans PipeScreen', () => {
    const contract = routeContractFor('/pilotage/pipe')
    expect(contract).not.toBeNull()
    expect(contract?.requiredPermission).toBeUndefined()
    expect(contract?.requiredPlanFeature).toBeUndefined()
  })

  it('SAIT DIRE NON — Staffing et Finance restent réservés', () => {
    expect(routeContractFor('/pilotage/staffing')?.requiredPermission).toBe('team:manage')
    expect(routeContractFor('/pilotage/finance')?.requiredPermission).toBeDefined()
  })
})
