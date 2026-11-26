import { describe, expect, it } from 'vitest'
import { CONNECTORS, type ConnectorId } from '../../lib/connectors'
import { CONNECTOR_ICONS, CONNECTORS_WITHOUT_ICON } from './connector-icons'
import { CONNECTORS_WITHOUT_LOGO, connectorLogo } from './connector-logos'

/**
 * #1447 — deux connecteurs ne partagent jamais leur icône.
 *
 * Le défaut mesuré : Odoo et Attio portaient `Boxes`, dans la MÊME section de la
 * grille ; Discord et Mattermost portaient `MessageCircle`, dans la section
 * suivante. Une grille se parcourt du regard, et l'icône est ce qui distingue
 * deux lignes avant qu'on ait lu leur nom : deux dessins identiques la rendent
 * inutile.
 *
 * La cause n'était pas l'inattention — c'est que l'unicité était RÉPARTIE sur
 * trois fichiers, donc invérifiable par quiconque. La table la rend vérifiable ;
 * ce test la vérifie.
 */
describe('#1447 — une icône par connecteur', () => {
  it('lit une table qui n’est pas vide', () => {
    // Une garde doit prouver qu'elle LIT quelque chose : sans cette ligne, un
    // import cassé rendrait un objet vide et tout ce qui suit serait vert sur
    // du néant.
    expect(Object.keys(CONNECTOR_ICONS).length).toBeGreaterThan(10)
    expect(CONNECTORS.length).toBeGreaterThan(10)
  })

  it('n’attribue jamais deux fois le même dessin', () => {
    const icons = Object.values(CONNECTOR_ICONS)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('couvre TOUS les connecteurs de l’écran — avec ou sans icône', () => {
    // Un connecteur neuf qui n'entre dans aucune des deux listes est le chemin
    // par lequel le doublon est arrivé : personne ne s'aperçoit d'une absence.
    const declared = new Set<string>([...Object.keys(CONNECTOR_ICONS), ...CONNECTORS_WITHOUT_ICON])
    const onScreen = CONNECTORS.map(connector => connector.id)

    expect(onScreen.filter(id => !declared.has(id))).toEqual([])
  })

  it('ne déclare aucun connecteur qui n’existe plus à l’écran', () => {
    const onScreen = new Set<string>(CONNECTORS.map(connector => connector.id))
    const declared = [...Object.keys(CONNECTOR_ICONS), ...CONNECTORS_WITHOUT_ICON]

    expect(declared.filter(id => !onScreen.has(id))).toEqual([])
  })

  it('sait dire NON — une table qui répète un dessin échoue', () => {
    const même = () => null
    const fautive = { odoo: même, attio: même }
    const icons = Object.values(fautive)

    expect(new Set(icons).size).not.toBe(icons.length)
  })

  it('sait dire NON — un connecteur non déclaré est vu', () => {
    const declared = new Set<string>(['hubspot'])
    expect(['hubspot', 'attio'].filter(id => !declared.has(id))).toEqual(['attio'])
  })
})

/**
 * #3973.7 (Louis 16/10/2026) — Réglages › Intégrations montre les MÊMES logos que le sélecteur de Laura.
 *
 * Un seul registre (garde GA-26) : `chat/view/brand-logos.ts`. Le relais `/logo?domain=` de #1614 et sa table de
 * domaines sont retirés — deux sources pour un même logo finissaient par diverger. Un connecteur sans fichier
 * sous licence garde son icône ; il est nommé dans `CONNECTORS_WITHOUT_LOGO` avec sa raison, jamais tu.
 */
describe('#3973.7 — un logo du registre unique par connecteur, ou une raison', () => {
  const withoutLogo = new Set<string>(CONNECTORS_WITHOUT_LOGO)
  const onScreen = CONNECTORS.map(connector => connector.id)

  it('lit un écran qui n’est pas vide, et des logos réellement résolus', () => {
    expect(onScreen.length).toBeGreaterThan(10)
    expect(onScreen.filter(id => connectorLogo(id) !== null).length).toBeGreaterThanOrEqual(10)
  })

  it('chaque connecteur de l’écran a un logo du registre, OU est déclaré sans logo', () => {
    expect(onScreen.filter(id => connectorLogo(id) === null && !withoutLogo.has(id))).toEqual([])
  })

  it('un connecteur déclaré sans logo n’en a pas (la liste ne ment pas)', () => {
    expect([...withoutLogo].filter(id => connectorLogo(id as ConnectorId) !== null)).toEqual([])
  })

  it('ne déclare aucun connecteur qui n’existe plus à l’écran', () => {
    expect([...withoutLogo].filter(id => !onScreen.includes(id as ConnectorId))).toEqual([])
  })

  it('Attio attend le fichier de Louis : sans fichier, l’icône ; le connecteur est nommé', () => {
    expect(connectorLogo('attio')).toBeNull()
    expect(withoutLogo.has('attio')).toBe(true)
  })

  it('webhook et MCP (protocoles) n’ont pas de marque : jamais de logo', () => {
    expect(connectorLogo('webhook')).toBeNull()
    expect(connectorLogo('mcp')).toBeNull()
  })

  it('sait dire NON — un connecteur non déclaré est vu', () => {
    const declared = new Set<string>(['hubspot'])
    expect(['hubspot', 'mattermost'].filter(id => !declared.has(id))).toEqual(['mattermost'])
  })
})
