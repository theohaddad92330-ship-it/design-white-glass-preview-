/**
 * GA-279 — une carte d'ENTÊTE ne se comprime pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉE, ET POURQUOI AUCUN TEST NE L'AVAIT VUE
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 09/09/2026, quinze minutes après un déploiement :
 * l'entête de la fiche talent rendait **32 px** pour un `scrollHeight` de
 * **335 px**. Le nom de la personne était coupé en deux par la barre
 * d'onglets, et la complétude entière — cinq axes, le score, la disponibilité
 * dérivée — avait disparu de l'écran.
 *
 * Le mécanisme n'est pas propre à cette carte. Une entête vit dans une colonne
 * `flex` dont les parents portent `min-h-0` (la coque de page, la zone
 * défilante). Un enfant de flex vaut `flex: 0 1 auto` : **il a le droit de
 * rétrécir**. Et `Card` porte `overflow-hidden`, donc rien ne déborde pour le
 * signaler — le contenu se coupe, en silence. Il suffit qu'un élément de plus
 * arrive dans l'entête (ici un bouton sous l'avatar) pour franchir le seuil.
 *
 * ⚠️ **Les 8 125 tests du web étaient verts.** jsdom ne met rien en page : il
 * ne calcule ni hauteur ni compression. Cette garde ne peut donc pas mesurer
 * le rendu — elle vérifie la CLASSE, ce qui est le seul levier qu'un test
 * unitaire ait ici. C'est une garde faible par nature, et elle le dit ; la
 * vraie vérification reste la recette, où la mesure se fait sur la page.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HEADERS = [
  'features/consultants/view/detail/TalentDetailHeader.tsx',
  // Les entêtes suivantes s'ajoutent ici au fur et à mesure. Une liste écrite
  // à la main ne voit jamais ce qui n'y est pas — c'est assumé : la garde
  // protège ce qui a déjà cassé, elle ne prétend pas inventorier l'app.
]

function source(relative: string): string {
  return readFileSync(join(__dirname, '..', relative), 'utf8')
}

describe('GA-279 — une carte d’entête ne se comprime pas', () => {
  it('LIT un corpus non vide', () => {
    expect(HEADERS.length).toBeGreaterThan(0)
    for (const path of HEADERS) expect(source(path).length).toBeGreaterThan(500)
  })

  it('chaque carte d’entête porte `shrink-0`', () => {
    for (const path of HEADERS) {
      const card = source(path).match(/<Card[^>]*className="([^"]*)"/)
      expect(card, `pas de <Card className=…> dans ${path}`).not.toBeNull()
      expect(card?.[1], `${path} : l'entête peut être écrasée par sa colonne flex`).toContain('shrink-0')
    }
  })

  it('sait dire NON — une entête sans `shrink-0` est attrapée', () => {
    const fautif = '<Card role="region" aria-label={talentName} className="p-4">'
    const classes = fautif.match(/<Card[^>]*className="([^"]*)"/)?.[1]
    expect(classes).toBe('p-4')
    expect(classes).not.toContain('shrink-0')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une carte ORDINAIRE reste libre', () => {
    // Une carte de contenu DANS la zone défilante n'a aucune raison de porter
    // `shrink-0` : elle défile avec le reste. La garde ne lit que les entêtes
    // nommées ci-dessus.
    expect(HEADERS.every(path => path.includes('Header'))).toBe(true)
  })
})
