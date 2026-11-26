import { normalizeCompanyNameKey } from '@bellum/contracts'
import { DEMO_DISCOVER_RESULT_TYPES } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #2545 / #3819 (démo Ludovic 08/10) — « et en démonstration, la liste
 * d'appels de Découvrir montre quoi ? » Craft rule n°9 : la route
 * `POST /contacts/call-list` rapproche les candidats des comptes SEMÉS (SIREN,
 * id, nom) et rend leurs contacts. Ce fichier lit la VRAIE réponse scriptée et
 * le VRAI jeu de données : la vue par défaut de la salle doit contenir au
 * moins une entreprise À SIGNAL commercial qui retombe sur un compte semé dont
 * des personnes ont une coordonnée — sinon la liste d'appels de la démo serait
 * vide de personnes, ce que la recette du 07/10 a vu en prod.
 */
describe('#3819 — liste d’appels de Découvrir, en démonstration', () => {
  it('est classée seedée, et sa raison dit la source unique', () => {
    expect(DEMO_DISCOVER_RESULT_TYPES.calls.state).toBe('seede')
    expect(DEMO_DISCOVER_RESULT_TYPES.calls.reason).toContain('#3819')
  })

  it('la vue par défaut porte une entreprise à signal commercial rapprochée d’un compte semé joignable', () => {
    const byDefault = demoDiscoverResponse({}) as {
      candidates: { name: string; signals: { type: string }[] }[]
    }
    const seeded = new Map(DEMO_DOSSIERS.map(d => [normalizeCompanyNameKey(d.account.company_name), d]))
    const callable = byDefault.candidates.filter(candidate => {
      const dossier = seeded.get(normalizeCompanyNameKey(candidate.name))
      if (!dossier) return false
      const reachable = dossier.contacts.some(contact => Boolean(contact.email) || Boolean(contact.phone))
      const commercial = candidate.signals.some(signal => signal.type !== 'legal')
      return reachable && commercial
    })
    expect(callable.map(c => c.name)).toContain('Naval Group')
  })
})
