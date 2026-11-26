import { DEMO_DOSSIERS } from './demo-dataset'
import { societeGeneraleOrgGraph, sncfOrgGraph } from './demo-org-graphs'
import { DEMO_SEAT_TITLES, seatName, seatNameOrNull } from './demo-seat-names'

// Décision Louis 01/11/2026 (« affiche-les », renverse l'anonymat des sièges) : les sièges de cadres de la démo
// portent un NOM FICTIF. Ni « Rôle à identifier » (nom = intitulé), ni un vrai dirigeant.

/** Dirigeants RÉELS connus de SG, SNCF, Keolis : aucun nom de démo ne peut en reprendre un. */
const REAL_EXECUTIVES = [
  'krupa',
  'palmieri',
  'bini smaghi',
  'dumas',
  'aymerich',
  'lebot',
  'heim',
  'farandou',
  'fanichet',
  'castex',
  'debon',
  'trévisani',
  'chabanel',
]

describe('noms fictifs des sièges de démo', () => {
  it('chaque nom est un prénom + un nom (2 mots au moins), distinct de son intitulé', () => {
    for (const title of DEMO_SEAT_TITLES) {
      const name = seatName(title)
      expect(name.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
      expect(name.toLowerCase()).not.toBe(title.toLowerCase())
    }
  })

  it('aucun nom ne reprend un dirigeant réel connu', () => {
    for (const title of DEMO_SEAT_TITLES) {
      const name = seatName(title).toLowerCase()
      for (const real of REAL_EXECUTIVES) expect([name, name.includes(real)]).toEqual([name, false])
    }
  })

  it('deux sièges ne partagent pas un même nom', () => {
    const names = DEMO_SEAT_TITLES.map(seatName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('un intitulé sans nom (siège agrégé) renvoie null, jamais un nom deviné', () => {
    expect(seatNameOrNull('Développement logiciel — fonction identifiée')).toBeNull()
  })

  it('tout siège du jeu de démo dont l’intitulé est connu porte son nom fictif, sans coordonnée', () => {
    // (Un contact densifié peut partager l'intitulé d'un siège : on isole les sièges par leur résumé.)
    const seats = DEMO_DOSSIERS.flatMap(d => d.contacts).filter(c =>
      (c.profile_summary ?? '').startsWith('Interlocuteur FICTIF'),
    )
    expect(seats.length).toBeGreaterThanOrEqual(16)
    for (const seat of seats) {
      expect(seat.full_name).not.toBe(seat.title)
      expect(seat.full_name.startsWith(seatNameOrNull(seat.title) ?? '?')).toBe(true)
      expect(seat.email ?? null).toBeNull()
      expect(seat.linkedin_url ?? null).toBeNull()
    }
  })

  it('aucun siège du dossier SG ou SNCF ne reste « nom = intitulé » parmi les cadres nommables', () => {
    for (const name of ['Société Générale', 'SNCF']) {
      const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === name)
      const leftovers = (dossier?.contacts ?? []).filter(
        c => c.full_name === c.title && seatNameOrNull(c.title) !== null,
      )
      expect(leftovers).toEqual([])
    }
  })

  it('l’organigramme nomme les mêmes personnes que les fiches (chaque nom de graphe a sa fiche)', () => {
    for (const [company, graph] of [
      ['Société Générale', societeGeneraleOrgGraph],
      ['SNCF', sncfOrgGraph],
    ] as const) {
      const contactNames = new Set(
        (DEMO_DOSSIERS.find(d => d.account.company_name === company)?.contacts ?? []).map(c => c.full_name),
      )
      const seatsInGraph = graph.people.filter(p => seatNameOrNull(p.title ?? '') !== null)
      expect(seatsInGraph.length).toBeGreaterThan(0)
      for (const person of seatsInGraph) {
        expect([person.fullName, contactNames.has(person.fullName)]).toEqual([person.fullName, true])
      }
    }
  })

  it('l’acheteur de l’étape achats (SG et SNCF) est nommé, pas un siège', () => {
    for (const title of ['Responsable achats informatiques', 'Responsable des achats de prestations informatiques']) {
      const buyer = DEMO_DOSSIERS.flatMap(d => d.contacts).find(c => c.title === title)
      expect(buyer?.full_name).toBe(seatNameOrNull(title))
    }
  })
})
