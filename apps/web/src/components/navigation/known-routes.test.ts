import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '../sidebar/items.settings'
import { appRouteTarget, LINKABLE_DETAIL_PREFIXES, LINKABLE_DETAIL_SUBSCREENS, linkableRoutes } from './known-routes'

/**
 * GA-277 — UNE ROUTE QUE LE COPILOTE PROPOSE DOIT EXISTER.
 *
 * #1778 : Laura ne peut pas montrer le chemin, donc elle le décrit — et le
 * 09/09 elle a décrit un bouton qui n'existait pas (#1768). Lui rendre le
 * chemin cliquable n'a de valeur que si le chemin MÈNE quelque part : ce dépôt
 * a déjà servi `/messagerie` au lieu de `/mailbox`, et le lien a rendu un 404
 * en production.
 *
 * La garde lit les chemins RÉELLEMENT déclarés par le routeur (le fichier
 * généré `routeTree.gen.ts`), jamais une liste écrite à la main : « une garde
 * qui compare à une liste ne voit jamais ce qui n'y est pas ».
 *
 * Elle prouve trois choses, comme toute garde de ce dépôt :
 *  - elle sait dire NON (une route inventée n'est pas linkable) ;
 *  - elle LIT quelque chose (le corpus de routes n'est pas vide) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (une route qui EXISTE sans être
 *    autorisée reste refusée, et ce n'est pas une erreur).
 */

/** Les chemins que le routeur connaît vraiment, lus dans le fichier généré. */
function declaredRoutes(): Set<string> {
  const source = readFileSync(resolve(__dirname, '../../routeTree.gen.ts'), 'utf8')
  const start = source.indexOf('export interface FileRoutesByFullPath {')
  const end = source.indexOf('}', start)
  expect(start, 'FileRoutesByFullPath introuvable dans routeTree.gen.ts').toBeGreaterThan(-1)
  const block = source.slice(start, end)
  const paths = [...block.matchAll(/^\s*'([^']+)':/gm)].map(match => normalise(match[1]))
  return new Set(paths)
}

/** `/accounts/` et `/accounts` sont le même écran ; le routeur écrit les deux. */
function normalise(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

describe('les routes vers lesquelles le copilote peut renvoyer', () => {
  it('LIT un corpus non vide — sinon la garde ne garde rien', () => {
    const declared = declaredRoutes()
    expect(declared.size).toBeGreaterThan(40)
    expect(linkableRoutes().length).toBeGreaterThan(5)
  })

  it('n’autorise que des écrans qui EXISTENT', () => {
    const declared = declaredRoutes()
    for (const route of linkableRoutes()) {
      expect(declared.has(normalise(route)), `route autorisée mais absente du routeur : ${route}`).toBe(true)
    }
  })

  it('n’autorise un détail que si le routeur porte bien un segment d’identifiant', () => {
    const declared = declaredRoutes()
    for (const prefix of LINKABLE_DETAIL_PREFIXES) {
      const hasDetail = [...declared].some(route => route.startsWith(`${prefix}/$`))
      expect(hasDetail, `préfixe de détail sans route à identifiant : ${prefix}`).toBe(true)
    }
  })

  it('dit OUI à un écran de la navigation', () => {
    expect(appRouteTarget('/discover')).toBe('/discover')
    expect(appRouteTarget('  /accounts  ')).toBe('/accounts')
  })

  it('dit OUI à une fiche, avec son identifiant', () => {
    expect(appRouteTarget('/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab')).toBe(
      '/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab',
    )
    expect(appRouteTarget('/consultants/a800466a-4194-4394-bd74-8d15a52df24f?tab=cv')).toBe(
      '/consultants/a800466a-4194-4394-bd74-8d15a52df24f?tab=cv',
    )
  })

  /**
   * #3267 (retour bêta 28/09/2026, recette du 30/09) — LA FICHE D'UN BESOIN
   * (SON ONGLET MATCHING) ÉTAIT UN ÉCRAN SANS ROUTE OUVRABLE PAR LAURA.
   *
   * `NeedMatchTab.tsx` rend la shortlist depuis `/projects/needs/<needId>` —
   * codé, testé, atteint par un clic dans `/projects/needs` (#3267.25-.30). Mais
   * `/projects/needs` n'était pas dans `LINKABLE_DETAIL_PREFIXES` : Laura
   * pouvait DÉCRIRE le classement (`run_matching`) sans jamais pouvoir y
   * renvoyer — le lien mourait à la dernière porte (même défaut documenté en
   * tête de ce module), et la recette du 30/09 n'a donc trouvé aucune route qui
   * montre le matching.
   */
  it('#3267 — dit OUI à la fiche d’un besoin, sur son onglet matching', () => {
    expect(LINKABLE_DETAIL_PREFIXES).toContain('/projects/needs')
    const id = 'acb96868-d191-40b2-9c70-e2adc42c69ab'
    expect(appRouteTarget(`/projects/needs/${id}?tab=matching`)).toBe(`/projects/needs/${id}?tab=matching`)
  })

  it('dit NON à une route inventée — le défaut que la garde existe pour empêcher', () => {
    // `/decouvrir` n'existe pas : l'écran est `/discover`. C'est la forme exacte
    // du 404 déjà servi en production (`/messagerie` contre `/mailbox`).
    expect(appRouteTarget('/decouvrir')).toBeNull()
    expect(appRouteTarget('/messagerie')).toBeNull()
  })

  /**
   * #1903.15 / #1933 — LA LISTE BLANCHE AVALAIT QUINZE ÉCRANS DE RÉGLAGES SUR VINGT ET UN.
   *
   * Laura connaît et propose TOUS les écrans de la barre des Réglages
   * (`chat_tools.SETTINGS_SCREENS`, synchronisé avec `items.settings.ts`) ; le
   * web n'en ouvrait que cinq. « Ouvrir Lexique » s'affichait, et le clic
   * passait la carte en échec sans dire pourquoi. Deux gardes : la liste
   * DÉRIVÉE de la barre (elle suit sa source), et des écrans NOMMÉS (elle ne
   * peut pas se vider en silence avec sa source).
   */
  it('ouvre CHAQUE écran de la barre des Réglages — ceux que Laura sait proposer', () => {
    const settings = SETTINGS_SECTIONS.flatMap(section =>
      section.items.flatMap(item => (typeof item.to === 'string' ? [item.to] : [])),
    )
    expect(settings.length).toBeGreaterThan(18)
    for (const route of settings) {
      expect(appRouteTarget(route), `écran de réglages proposé mais refusé au clic : ${route}`).toBe(route)
    }
  })

  it('dit OUI à des écrans de réglages NOMMÉS — la liste suit sa source, elle n’est plus recopiée', () => {
    for (const route of [
      '/settings',
      '/settings/notifications',
      '/settings/security',
      '/settings/mes-donnees',
      '/settings/memory',
      '/settings/team',
      '/settings/branding',
      '/settings/lexicon',
      '/integrations',
      '/billing',
    ]) {
      expect(appRouteTarget(route), route).toBe(route)
    }
  })

  /**
   * #2151.1 / #2151.26 (16/09/2026) — UN ÉCRAN QUI QUITTE LA NAVIGATION RESTE OUVRABLE.
   *
   * Le lot navigation a sorti « Veille » et « Partenaires » des onglets de
   * Comptes : les DEUX écrans restent servis par le routeur, et le catalogue de
   * Laura (`DEEP_LINK_SCREENS`, `chat_tools.py`) continue de les nommer. Mais la
   * liste blanche DÉRIVE de `allNavRoutes()` — retirer l'onglet a donc retiré
   * l'autorisation, et « ouvre la veille » mourait à la dernière porte,
   * exactement le défaut n°2 que ce module documente.
   *
   * Mesuré à l'intégration de la vague 5 : `appRouteTarget('/watchlist')` rendait
   * `null` alors que `/watchlist` était déclaré au routeur (#4359 : la Veille a depuis
   * quitté le catalogue de Laura, `/search` prend sa place de témoin).
   *
   * ⚠️ `/accounts/partners` passait, lui — mais par ACCIDENT : `partners` a la
   * forme d'un segment d'identifiant, donc la règle des fiches l'acceptait comme
   * s'il s'agissait du compte d'identifiant « partners ». Une autorisation qui
   * tient à une homonymie n'est pas une autorisation ; elle est NOMMÉE ici.
   */
  it('#2151.1 — un écran sorti de la navigation mais toujours servi reste ouvrable par Laura', () => {
    const declared = declaredRoutes()
    for (const route of ['/search', '/accounts/partners']) {
      expect(declared.has(route), `${route} n’est plus servi par le routeur`).toBe(true)
      expect(appRouteTarget(route), `écran servi et nommé par Laura, mais refusé au clic : ${route}`).toBe(route)
    }
  })

  it('#2151.1 — sait dire NON : un écran hors navigation qui n’existe pas au routeur reste refusé', () => {
    expect(declaredRoutes().has('/veille-des-marches')).toBe(false)
    expect(appRouteTarget('/veille-des-marches')).toBeNull()
  })

  it('n’autorise un sous-écran de fiche que si le routeur le porte', () => {
    const declared = declaredRoutes()
    expect(LINKABLE_DETAIL_SUBSCREENS.length).toBeGreaterThan(0)
    for (const pattern of LINKABLE_DETAIL_SUBSCREENS) {
      expect(declared.has(pattern), `sous-écran autorisé mais absent du routeur : ${pattern}`).toBe(true)
    }
  })

  it('#1903 / #1933.5 — dit OUI au marché inverse d’un consultant, la page que Laura ne pouvait pas ouvrir', () => {
    const id = 'a800466a-4194-4394-bd74-8d15a52df24f'
    expect(appRouteTarget(`/consultants/${id}/reverse-market`)).toBe(`/consultants/${id}/reverse-market`)
  })

  it('#1903 / #1933.5 — sait dire NON : un sous-écran inconnu, le bon sous-écran sous le mauvais préfixe, trop profond', () => {
    const id = 'a800466a-4194-4394-bd74-8d15a52df24f'
    expect(appRouteTarget(`/consultants/${id}/autre-chose`)).toBeNull()
    expect(appRouteTarget(`/accounts/${id}/reverse-market`)).toBeNull()
    expect(appRouteTarget(`/consultants/${id}/reverse-market/plus`)).toBeNull()
  })

  it('dit NON à ce qui sort de l’application', () => {
    expect(appRouteTarget('//ailleurs.example')).toBeNull()
    expect(appRouteTarget('/\\ailleurs.example')).toBeNull()
    expect(appRouteTarget('https://ailleurs.example')).toBeNull()
    expect(appRouteTarget('javascript:alert(1)')).toBeNull()
    expect(appRouteTarget('/accounts/../../etc')).toBeNull()
  })

  it('dit NON à une profondeur que le routeur ne porte pas', () => {
    expect(appRouteTarget('/accounts/un-id/sous/trop/loin')).toBeNull()
  })

  it('n’attrape pas ce qu’elle ne vise pas : une route qui existe sans être ouverte au copilote', () => {
    // Le back-office existe au routeur et n'est PAS un écran client. Le refus
    // est le comportement attendu, pas un trou de la liste.
    const declared = declaredRoutes()
    expect(declared.has('/bak/home')).toBe(true)
    expect(appRouteTarget('/bak/home')).toBeNull()
  })
})
