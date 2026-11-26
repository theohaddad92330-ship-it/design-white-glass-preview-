import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1442 — TOUTE carte qui montre ses bénéfices les passe par le REPLI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE AURAIT ÉVITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le premier passage n'a câblé que deux cartes sur quatre — celle des
 * fournisseurs OAuth et celle d'Odoo. Les six canaux d'équipe (Slack, Teams,
 * Google Chat, Discord, Mattermost, Webhook) et la carte de l'assistant ont
 * gardé leurs bénéfices dépliés. Mesuré EN PRODUCTION : 368 px par canal non
 * branché, sur des outils que personne n'avait demandés.
 *
 * Aucun test ne pouvait le voir : chaque carte a le sien, et chacun passait.
 * C'est une propriété de la FAMILLE, pas d'un composant — donc elle se vérifie
 * sur le dossier, comme l'unicité des icônes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle LIT un corpus réel (des fichiers existent, et plusieurs rendent bien
 *    `<ConnectorBenefits`) ;
 *  · elle sait dire NON (rendre `<ConnectorBenefits />` en enfant direct d'une
 *    carte, sans `details`, la fait rougir) ;
 *  · le NOM du fichier fautif est dans la valeur comparée — sinon l'échec dirait
 *    « 1 n'est pas 0 » et il faudrait le déboguer.
 */
const CARDS_DIR = join(__dirname)

/** Les cartes de l'écran — jamais un fichier nommé à la main : il a été oublié une fois. */
function cardSources(): { name: string; source: string }[] {
  return readdirSync(CARDS_DIR)
    .filter(name => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .map(name => ({ name, source: readFileSync(join(CARDS_DIR, name), 'utf8') }))
}

/** Celles qui MONTENT le bloc des bénéfices — pas celles qui le définissent. */
function cardsRenderingBenefits(): { name: string; source: string }[] {
  return cardSources().filter(
    file => file.name !== 'ConnectorBenefits.tsx' && file.source.includes('<ConnectorBenefits'),
  )
}

describe('#1442 — une carte non branchée reste compacte', () => {
  it('lit un corpus réel : plusieurs cartes montent les bénéfices', () => {
    // Sans cette ligne, tout ce qui suit serait vert sur une liste vide.
    expect(cardSources().length).toBeGreaterThan(4)
    expect(cardsRenderingBenefits().length).toBeGreaterThanOrEqual(3)
  })

  it('chacune passe ses bénéfices par `details`, jamais en enfant direct', () => {
    const fautives = cardsRenderingBenefits()
      .filter(file => !file.source.includes('details={'))
      .map(file => file.name)
    expect(fautives).toEqual([])
  })

  it('chacune dit QUAND se déplier — sinon elle reste repliée une fois branchée', () => {
    // `details` sans `expanded` produirait le défaut symétrique : un connecteur
    // branché dont il faudrait cliquer pour savoir s'il marche.
    const fautives = cardsRenderingBenefits()
      .filter(file => !file.source.includes('expanded={'))
      .map(file => file.name)
    expect(fautives).toEqual([])
  })

  it('chacune se tait quand il n’y a RIEN à déplier', () => {
    // Un élément React est toujours vrai, même quand le composant rend `null` :
    // sans ce garde-fou, un bouton « Voir le détail » n'ouvrirait rien.
    const fautives = cardsRenderingBenefits()
      .filter(file => !file.source.includes('hasConnectorDetails('))
      .map(file => file.name)
    expect(fautives).toEqual([])
  })
})
