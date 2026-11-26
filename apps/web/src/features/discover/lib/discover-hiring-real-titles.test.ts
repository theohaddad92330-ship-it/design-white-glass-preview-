import { describe, expect, it } from 'vitest'
import { isOutOfTradeHiring } from './discover-hiring-domain'

/**
 * #4396 / #4398 (une seule famille, `CustomerPageContent.tsx:195`) — les cinq intitulés RÉELS relevés en production
 * le 25/10 sur l'onglet « Signaux & besoins » : aucun n'était marqué « hors de ton métier » pour une ESN IT.
 * La marque est le seul garde-fou côté écran (la cause racine est le tri de l'offre, côté moteur) : elle doit
 * dire NON à ces cinq-là, et OUI à une offre du métier.
 */
const hiring = (title: string) => ({ type: 'hiring', label: `Poste ouvert : ${title}` })
const esnIt = { placedRoles: ['développement', 'cloud', 'cybersécurité', 'data'], noGoSectors: [] }

describe('#4396 #4398 — offres hors métier relevées en production', () => {
  it.each([
    'Gérant de Magasin H/F',
    'Agent / Agente d’exploitation en mobilier urbain et publicitaire',
    'Welding / Structural QC Inspector H/F',
    'Technicien Planning Travaux F/H',
    'CONSEILLER COMMERCIAL VEFA H/F',
  ])('« %s » est marquée hors métier pour une ESN IT', title => {
    expect(isOutOfTradeHiring(hiring(title), esnIt as never)).toBe(true)
  })

  it('une offre du métier n’est pas marquée', () => {
    expect(isOutOfTradeHiring(hiring('Ingénieur DevOps cloud H/F'), esnIt as never)).toBe(false)
  })
})
