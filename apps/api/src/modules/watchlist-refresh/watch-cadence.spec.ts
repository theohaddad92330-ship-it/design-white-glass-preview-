import { watchCadenceFor } from './watchlist-refresh.queue'

/** #3682.5 — la fréquence affichée est la configuration RÉELLE, jamais une hypothèse. */
describe('watchCadenceFor', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  // #4267.1 — la veille suit le SUIVI EXPLICITE, plus le statut commercial.
  it('un compte suivi explicitement : veille quotidienne quand la boucle est active', () => {
    expect(watchCadenceFor(true)).toBe('daily')
  })

  it('un compte non suivi n’a aucune veille automatique — quel que soit son statut commercial', () => {
    expect(watchCadenceFor(false)).toBeNull()
  })

  it('le kill switch coupe la fréquence affichée', () => {
    process.env['WATCHLIST_REFRESH_DISABLED'] = 'true'
    expect(watchCadenceFor(true)).toBeNull()
  })

  it('un plafond à 0 coupe la fréquence affichée', () => {
    process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'] = '0'
    expect(watchCadenceFor(true)).toBeNull()
  })
})
