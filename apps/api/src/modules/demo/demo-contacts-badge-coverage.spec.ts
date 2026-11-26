import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contactBadgeCountersSchema } from '@bellum/contracts'
import { DEMO_CONTACTS_BADGE_COUNTERS } from './demo-coverage'

/**
 * « ET EN DÉMONSTRATION, LE BADGE DE NAV « CONTACTS » MONTRE QUOI ? »
 * (#2155.24/.25).
 *
 * La garde par TABLE ne pose pas la question : le badge n'ajoute aucune
 * table, il lit `contacts`, `accounts` et `tasks`, déjà classés ailleurs.
 * Cette garde prouve, comme `demo-portfolio-counters-coverage.spec.ts` pour
 * les compteurs de tête du portefeuille :
 *  - elle LIT un corpus non vide — la clé vient du CONTRAT, pas d'une copie ;
 *  - elle classe CHAQUE clé du contrat, seedée ou vide à dessein ;
 *  - elle SAIT DIRE NON : si le jeu de démonstration se met un jour à marquer
 *    un contact `email_verified = true` sans que la classification bouge,
 *    la raison écrite devient FAUSSE, et ce test doit rougir pour le dire.
 */
const COUNTER_KEYS = Object.keys(contactBadgeCountersSchema.shape)

function readDemoFile(name: string): string {
  return readFileSync(join(__dirname, name), 'utf8')
}

describe('couverture démo — le badge de navigation « Contacts »', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(COUNTER_KEYS.length).toBeGreaterThan(0)
    expect(Object.keys(DEMO_CONTACTS_BADGE_COUNTERS).length).toBeGreaterThan(0)
  })

  it('classe CHAQUE clé du contrat : seedée, ou vide à dessein avec sa raison', () => {
    expect(Object.keys(DEMO_CONTACTS_BADGE_COUNTERS).sort()).toEqual([...COUNTER_KEYS].sort())
  })

  it('exige une raison SUBSTANTIELLE pour la clé laissée vide', () => {
    const tooShort = Object.entries(DEMO_CONTACTS_BADGE_COUNTERS)
      .filter(([, entry]) => entry.state !== 'seede' && entry.reason.length <= 200)
      .map(([key]) => key)
    expect(tooShort).toEqual([])
  })

  it('la raison NOMME la définition — email_verified, le portefeuille, l’action ouverte', () => {
    const reason = DEMO_CONTACTS_BADGE_COUNTERS['readyToProcess']?.reason ?? ''
    expect(reason).toMatch(/email_verified/)
    expect(reason).toMatch(/followedAccounts/)
  })

  it('SAIT DIRE NON : UN SEUL contact semé porte `email_verified` (#4107.4) — relu sur le DISQUE', () => {
    // #4107.4 — le semis ne pose plus `false` partout : UN contact simulé a son e-mail deviné puis vérifié SMTP.
    // Si un lot futur en marque un second sans repasser ici, la deuxième assertion rougit : c'est le signal qu'il
    // faut revoir la raison de `readyToProcess`, pas relâcher ce test.
    const seed = readDemoFile('demo-seed.service.ts')
    expect(seed).toContain('email_verified: contact.email_verified === true')
    const density = readDemoFile('demo-contact-density.ts')
    expect(density.match(/smtpVerifiedEmail: true,/g)).toHaveLength(1)
    expect(DEMO_CONTACTS_BADGE_COUNTERS['readyToProcess']?.state).toBe('seede')
  })
})
