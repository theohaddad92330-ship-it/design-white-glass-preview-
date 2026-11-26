import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1318.1 — « Je recommande de ne pas supprimer le moteur d'allocation d'effort,
 * mais de supprimer cette page telle quelle et d'intégrer cette logique
 * directement dans Comptes, comme une vue supplémentaire de priorisation. »
 *
 * Décision de Louis le 02/09 : **vue de `/accounts`, route redirigée.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LENTILLE, ET PAS UNE PAGE
 * ─────────────────────────────────────────────────────────────────────────
 * `/accounts` porte déjà ce mécanisme, et sa propre doc dit pourquoi : « une
 * lentille et non un écran neuf : ce sont les MÊMES comptes, les mêmes filtres,
 * la même URL. Un second écran aurait dupliqué les filtres, la pagination et la
 * recherche, et les deux auraient divergé au premier ajout. »
 *
 * L'effort devient donc `?lens=effort`, à côté de `?lens=delivery`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA ROUTE REDIRIGE AU LIEU DE DISPARAÎTRE
 * ─────────────────────────────────────────────────────────────────────────
 * `/accounts/sprints` a des liens entrants et des favoris navigateur. La faire
 * rendre 404 casserait les uns et les autres pour un gain nul. Elle redirige —
 * et c'est ce que Louis a choisi entre les trois formes proposées.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lire = (...p: string[]) => readFileSync(join(racineWeb, 'src', ...p), 'utf8')

describe('l’allocation d’effort est une VUE de Comptes', () => {
  it('la lentille existe dans le contrat de recherche de /accounts', () => {
    // #2627.1 (21/09/2026) — le schéma de recherche a quitté le fichier de
    // ROUTE pour `features/accounts/model/accountsSearch.ts` : importer la
    // route tirait tout l'écran des comptes derrière elle, et aucune garde ne
    // pouvait le PARSER pour de vrai. La lentille n'a pas bougé, son adresse
    // si — cette garde suit, elle ne se contente pas de rougir.
    const schema = lire('features', 'accounts', 'model', 'accountsSearch.ts')
    const route = lire('routes', 'accounts', 'index.tsx')

    // La garde LIT quelque chose, des deux côtés.
    expect(schema).toContain('accountsSearchSchema')
    expect(schema).toMatch(/lens: z\.enum\(\[[^\]]*'effort'/)
    // Et le schéma est bien CELUI que la route valide — sans ce second contrôle,
    // la lentille pourrait vivre dans un fichier que personne ne monte.
    expect(route).toContain('validateSearch: accountsSearchSchema')
  })

  it('l’écran des comptes rend le board sous cette lentille', () => {
    const page = lire('features', 'accounts', 'view', 'AccountsPage.tsx')

    expect(page).toContain('SprintBoard')
    expect(page).toContain("lens === 'effort'")
  })

  it('l’ancienne route n’existe plus — #4359, aucune route ne rend le board', () => {
    expect(() => lire('routes', 'accounts', 'sprints.tsx')).toThrow()
  })

  it('sait dire NON — une route qui rendrait encore le board serait attrapée', () => {
    const avant = 'component: SprintsPage\nfunction SprintsPage() { return <SprintBoard /> }'

    expect(avant).toContain('<SprintBoard')
    expect(avant).not.toContain('redirect')
  })
})
