import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4733.6 (craft rule n°9) — l'écran montre le recrutement d'un dirigeant comme un fait fort ; la démo doit donc
 * porter le drapeau `executive_role` sur CHAQUE offre de dirigeant du dossier SNCF, sinon l'écran de démo la
 * badge « hors de ton métier » et la replie (mesuré le 03/11/2026).
 */
describe('#4733.6 — le dossier SNCF de la démo pose executive_role sur les offres de dirigeant', () => {
  const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
  const signals = (sncf?.account.recent_signals ?? []) as Array<{ signal: string; executive_role?: boolean }>
  const directorOffers = signals.filter(
    s => /Directeur des Opérations/i.test(s.signal) && /Offre publiée/.test(s.signal),
  )

  it('inspecte au moins une offre de directeur des opérations (le compte compte)', () => {
    expect(directorOffers.length).toBeGreaterThan(0)
  })

  it('chacune porte executive_role: true', () => {
    expect(directorOffers.filter(s => s.executive_role !== true)).toEqual([])
  })
})
