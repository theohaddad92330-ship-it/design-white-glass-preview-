import { DEMO_SIGNAL_CLOSE_CONTACT_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4182.6 — « et en démonstration, une offre d'emploi montre-t-elle un contact proche du sujet ? » (craft rule n°9).
 *
 * Le rapprochement est calculé à la lecture (web, `proposeContactsForSignal`) : ce fichier prouve que la DONNÉE
 * semée le permet — une offre et un contact du même compte dont les mots de métier se recoupent, sans que
 * l'offre nomme la personne (nommée, elle serait « liée », pas « proche »).
 */
const GENERIC = new Set(['des', 'les', 'pour', 'and', 'the', 'sur', 'aux', 'une', 'avec', 'chez', 'dans'])
const words = (value: string): Set<string> =>
  new Set(
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3 && !GENERIC.has(word)),
  )

describe('#4182.6 — un contact proche d’une offre, en démonstration', () => {
  const closePairs = DEMO_DOSSIERS.flatMap(({ account, contacts }) =>
    (account.recent_signals ?? [])
      .filter(signal => signal.type === 'recrutement')
      .flatMap(signal =>
        (contacts ?? [])
          .filter(contact => {
            const text = signal.signal ?? ''
            const offer = words(text)
            const shared = [...words(contact.title ?? '')].filter(word => offer.has(word))
            const named = text.toLowerCase().includes((contact.full_name ?? '').toLowerCase())
            return shared.length > 0 && !named
          })
          .map(contact => ({ company: account.company_name, offer: signal.signal, contact: contact.full_name })),
      ),
  )

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SIGNAL_CLOSE_CONTACT_COVERAGE.state).toBe('seede')
    expect(DEMO_SIGNAL_CLOSE_CONTACT_COVERAGE.reason).toContain('#4182.6')
  })

  it('au moins une offre a un contact proche non nommé sur un compte de démo existant', () => {
    expect(closePairs).toContainEqual({
      company: 'SNCF',
      offer: 'Data engineer — plateforme data voyageurs (H/F)',
      contact: 'Younes Berrada',
    })
  })
})
