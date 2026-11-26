import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCheckoutReturn } from '@bellum/contracts'

/**
 * #2003.23 — toute URL de retour que le serveur CONSTRUIT doit être une URL que
 * le front sait LIRE.
 *
 * Le défaut mesuré le 15/09/2026 : `credits.service.ts` posait six URLs de
 * retour (`?success=true`, `?canceled=true`, `?setup=success|canceled`,
 * `?topup=success|canceled`) et pas une ligne du front ne les lisait — le schéma
 * de recherche de `/billing` n'acceptait que `{ offers, topup }` en booléens et
 * jetait le reste. Un client revenu d'un paiement réussi voyait l'écran qu'il
 * venait de quitter, inchangé.
 *
 * Cette garde tient l'accord entre les deux bouts. Elle ne réécrit pas les URLs
 * (le chemin de paiement ne se touche pas pour une garde) : elle relit le texte
 * du service et demande à `resolveCheckoutReturn` — LE lecteur, celui que le
 * front utilise — de nommer chacune. Une URL qu'il ne sait pas nommer est une
 * URL qui arrivera muette chez le client.
 *
 * Les trois preuves qu'une garde doit fournir sont dans les trois derniers
 * tests : elle LIT quelque chose, elle sait dire NON, et elle n'attrape pas ce
 * qu'elle ne vise pas.
 */
const SERVICE_PATH = join(__dirname, 'credits.service.ts')

/**
 * Les URLs de retour construites par le service, réduites à leur chaîne de
 * requête.
 *
 * On capture `${this.frontendUrl}/<chemin>?<requête>` — donc uniquement les
 * URLs qui PORTENT une requête. Celles qui n'en ont pas (le `return_url` du
 * portail) ne disent rien au retour et n'ont rien à faire nommer : les inclure
 * ferait rougir la garde sur un cas parfaitement légitime.
 */
function returnQueryStrings(source: string): string[] {
  const pattern = /\$\{this\.frontendUrl\}\/[^`?\s]*\?([^`\s]+)`/g
  const found: string[] = []
  for (const match of source.matchAll(pattern)) {
    const query = match[1]
    if (query) found.push(query)
  }
  return found
}

describe('GA — les URLs de retour de paiement sont toutes lisibles par le front (#2003.23)', () => {
  const source = readFileSync(SERVICE_PATH, 'utf8')
  const queries = returnQueryStrings(source)

  it('LIT vraiment le service : le corpus n’est pas vide', () => {
    // Un corpus vide rendrait la garde verte pour toujours, y compris le jour
    // où le fichier est renommé et où plus aucune URL n'est vérifiée.
    expect(source.length).toBeGreaterThan(1000)
    expect(queries.length).toBeGreaterThanOrEqual(6)
  })

  it('nomme chaque URL de retour construite par le serveur', () => {
    const unreadable = queries.filter(query => resolveCheckoutReturn(query) === 'none')
    expect(unreadable).toEqual([])
  })

  it('couvre les trois caisses — abonnement, recharge, carte', () => {
    const named = new Set(queries.map(query => resolveCheckoutReturn(query)))
    expect(named).toContain('subscription_paid')
    expect(named).toContain('subscription_abandoned')
    expect(named).toContain('topup_paid')
    expect(named).toContain('topup_abandoned')
    expect(named).toContain('card_saved')
    expect(named).toContain('card_abandoned')
  })

  it('sait dire NON : une URL de retour inventée serait refusée', () => {
    // Le témoin est passé par le MÊME extracteur puis la MÊME assertion que le
    // vrai corpus — sinon on prouverait seulement que la fonction de test
    // fonctionne, pas que la garde attraperait le cas.
    const forged = 'const u = `${this.frontendUrl}/billing?paiement=ok`'
    const forgedQueries = returnQueryStrings(forged)
    expect(forgedQueries).toEqual(['paiement=ok'])
    expect(forgedQueries.filter(query => resolveCheckoutReturn(query) === 'none')).toEqual(['paiement=ok'])
  })

  it("n'attrape pas ce qu'elle ne vise pas : une URL SANS requête reste hors corpus", () => {
    // `returnUrl: ${this.frontendUrl}/billing` (le portail) est un voisin
    // parfaitement légitime : il ne porte aucune information de retour, donc il
    // n'y a rien à nommer. La garde doit l'ignorer, pas le déclarer illisible.
    const neighbour = 'returnUrl: `${this.frontendUrl}/billing`,'
    expect(returnQueryStrings(neighbour)).toEqual([])
    expect(source).toContain('`${this.frontendUrl}/billing`')
  })
})
