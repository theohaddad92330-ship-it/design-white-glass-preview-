import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_EMPLOYMENT_LEFT_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, demoEmploymentCheckRawData } from './demo-dataset'

/**
 * #4055.8 — « et en démonstration, un contact "a quitté l'entreprise" ? » Un interlocuteur FICTIF de SNCF porte une
 * relecture datée qui a observé un AUTRE employeur : la fiche dit « A quitté l'entreprise », avec sa preuve.
 */
const NOW = Date.parse('2026-10-17T12:00:00Z')
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
const departed = (sncf?.contacts ?? []).filter(contact => contact.employment_check?.state === 'left')

/** V4-CORRECTIFS 4290.12 — au moins un contact parti sur un compte RÉEL des briefs, et deux comptes en tout. */
const departedAccounts = DEMO_DOSSIERS.filter(d => d.contacts.some(contact => contact.employment_check)).map(
  d => d.account.company_name,
)

describe('V4-CORRECTIFS 4290.12 — le semis « a quitté » est visible sur /contacts', () => {
  it('sème un contact parti sur un compte de brief nommé (SNCF, Société Générale)', () => {
    expect(departedAccounts).toEqual(expect.arrayContaining(['SNCF', 'Société Générale']))
  })

  it('le semis remonte les partis en tête de la liste (tri created_at décroissant)', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toMatch(/seedDepartedContactsFirst\(workspaceId, account\.id\)/)
    expect(source).toMatch(/SET created_at = now\(\) \+ interval[^`]*'employmentCheck' ->> 'state' = 'left'/)
  })
})

describe('démo — un contact « a quitté l’entreprise » (#4055.8)', () => {
  it('est classé SEMÉ dans demo-coverage.ts', () => {
    expect(DEMO_EMPLOYMENT_LEFT_COVERAGE.state).toBe('seede')
  })

  it('SNCF porte un contact parti, FICTIF, avec un autre employeur observé', () => {
    expect(departed.length).toBeGreaterThanOrEqual(1)
    for (const contact of departed) {
      expect(contact.linkedin_url ?? '').toMatch(/^https:\/\/www\.linkedin\.com\/in\/demo-bellum-/)
      expect(contact.employment_check?.state).toBe('left')
      expect(contact.employment_check?.state === 'left' && contact.employment_check.organization).not.toBe('SNCF')
    }
  })

  it('écrit raw_data.employmentCheck à la forme de la relecture réelle, datée relativement au semis', () => {
    const proof = departed[0]?.employment_check
    if (proof?.state !== 'left') throw new Error('contact parti attendu')
    expect(demoEmploymentCheckRawData(proof, NOW)).toEqual({
      employmentCheck: {
        state: 'left',
        at: new Date(NOW - proof.checked_days_ago * 86_400_000).toISOString(),
        organization: proof.organization,
      },
    })
  })

  it('sait dire NON : un contact sans relecture ne porte aucune preuve', () => {
    expect(demoEmploymentCheckRawData(undefined, NOW)).toBeNull()
  })

  it('« a quitté » ne se sème jamais sans employeur observé', () => {
    expect(demoEmploymentCheckRawData({ state: 'left', checked_days_ago: 3 }, NOW)).toBeNull()
  })
})
