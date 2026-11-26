import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4757 (HIST-D, craft rule n°9) — L'HISTORIQUE DES BESOINS, EN DÉMONSTRATION.
 *
 * La fiche compte sépare les besoins récents des besoins historiques (au-delà de six mois, comme la fenêtre de
 * fraîcheur « recrutement » de l'IA, 180 jours) et pagine l'historique par dix. Un prospect doit voir : un compte à
 * historique LONG (plus d'une page) et un compte SANS historique (le bloc disparaît).
 */
// Le jour de la livraison ; une offre datée AVANT cette borne est historique quelle que soit la date de la salle.
const SEED_FLOOR = Date.parse('2026-04-28')

type Offer = { title?: string; date?: string | null }

const offersOf = (dossier: (typeof DEMO_DOSSIERS)[number]): Offer[] => {
  const list = dossier.account.raw_analysis['it_job_signals']
  return Array.isArray(list) ? (list as Offer[]) : []
}
const isHistorical = (offer: Offer) => {
  const at = Date.parse(offer.date ?? '')
  return Number.isFinite(at) && at < SEED_FLOOR
}

describe('l’historique des besoins en démonstration (#4757)', () => {
  it('un compte porte un historique LONG : plus d’une page de dix, datées, aux intitulés distincts', () => {
    const longest = DEMO_DOSSIERS.map(offersOf).reduce<Offer[]>(
      (best, list) => (list.filter(isHistorical).length > best.filter(isHistorical).length ? list : best),
      [],
    )
    const history = longest.filter(isHistorical)
    expect(history.length).toBeGreaterThan(10)
    expect(new Set(history.map(offer => offer.title)).size).toBe(history.length)
    // Une date réelle, jamais devinée : chaque offre passée porte un jour ISO complet.
    for (const offer of history) expect(offer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Et le même compte garde de quoi remplir le bloc « récents » à côté.
    expect(longest.length - history.length).toBeGreaterThan(0)
  })

  it('au moins un compte SANS historique : le bloc entier disparaît, rien n’est semé pour le remplir', () => {
    const without = DEMO_DOSSIERS.filter(dossier => !offersOf(dossier).some(isHistorical))
    expect(without.length).toBeGreaterThan(0)
  })
})
