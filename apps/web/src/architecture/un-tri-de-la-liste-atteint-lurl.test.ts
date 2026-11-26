import { accountSortKeySchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { accountsSearchSchema } from '@/features/accounts/model/accountsSearch'

/**
 * #2627.1 — UN TRI QUI N'ATTEINT PAS L'URL N'EXISTE PAS.
 *
 * Mesuré en production le 21/09/2026, avec témoin : cliquer « Dernière
 * analyse » faisait bien passer l'URL à `?sort=date_asc`, changeait l'ordre des
 * lignes et posait la flèche ; cliquer « Score /10 » ne faisait RIEN — même
 * URL, même ordre, aucune flèche. Le témoin réussissait, donc ce n'était pas
 * l'outil de mesure : c'était le produit.
 *
 * La cause n'était ni l'en-tête ni l'API. `AccountsTableHeaderRow.tsx` câblait
 * bien `<SortableTableHead field="score">` et le contrat portait
 * `score_asc`/`score_desc` depuis le début. C'est le schéma de recherche de la
 * ROUTE qui recopiait sa propre liste de clés de tri, restée à quatre valeurs,
 * et son `.catch(undefined)` jetait la cinquième **en silence** — le pire des
 * deux mondes : aucune erreur, aucun tri.
 *
 * Le fichier de route disait déjà la leçon, deux déclarations plus bas, à
 * propos du TYPE d'entité : « une liste écrite à la main ici resterait en
 * arrière le jour où le vocabulaire gagne un type, et le filtre le refuserait
 * en silence ». C'est exactement ce qui est arrivé au tri.
 *
 * Cette garde n'autorise donc pas une liste « à jour » : elle refuse qu'il y en
 * ait une. Toute clé de tri du contrat doit traverser la route.
 */
describe("#2627.1 — le tri de la liste de comptes traverse l'URL", () => {
  it('accepte CHAQUE clé de tri du contrat, sans en jeter une seule', () => {
    const cles = accountSortKeySchema.options
    // Le contrat en porte six ; si un jour il en porte sept, cette garde les
    // veut toutes, sans être réécrite.
    expect(cles.length).toBeGreaterThanOrEqual(6)

    const jetees = cles.filter(cle => accountsSearchSchema.parse({ sort: cle }).sort !== cle)
    expect(jetees).toEqual([])
  })

  it('le tri par SCORE, celui qui manquait, arrive intact dans les deux sens', () => {
    expect(accountsSearchSchema.parse({ sort: 'score_asc' }).sort).toBe('score_asc')
    expect(accountsSearchSchema.parse({ sort: 'score_desc' }).sort).toBe('score_desc')
  })

  it("une clé INCONNUE retombe sur « aucun tri », elle ne casse pas l'écran", () => {
    // Le `.catch(undefined)` garde sa raison d'être : un lien partagé qui
    // porterait une valeur périmée ouvre la liste, il ne rend pas une page en
    // erreur. Ce qu'on refuse, c'est qu'il avale une clé LÉGITIME.
    expect(accountsSearchSchema.parse({ sort: 'verdict_asc' }).sort).toBeUndefined()
  })
})
