import { DEMO_JOB_POSTING_RECRUITER_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, demoJobPostingRawData } from './demo-dataset'

/**
 * SIG-B (11/10/2026) — « et en démonstration, le recruteur nommé par une offre
 * montre quoi ? » SNCF porte un recruteur FICTIF, prouvé par une offre FICTIVE
 * (domaine `.example`, RFC 2606 — aucune vraie annonce, aucune vraie personne),
 * datée RELATIVEMENT au semis pour ne jamais vieillir à l'écran.
 */
const NOW = Date.parse('2026-10-11T12:00:00Z')
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
const recruiters = (sncf?.contacts ?? []).filter(contact => contact.job_posting)

describe('démo — un recruteur prouvé par une offre (SIG-B)', () => {
  it('est classé SEMÉ dans demo-coverage.ts', () => {
    expect(DEMO_JOB_POSTING_RECRUITER_COVERAGE.state).toBe('seede')
  })

  it('SNCF porte au moins un recruteur, fictif, dont la preuve ne pointe aucune vraie annonce', () => {
    expect(recruiters.length).toBeGreaterThanOrEqual(1)
    for (const contact of recruiters) {
      expect(new URL(contact.job_posting?.url ?? '').hostname.endsWith('.example')).toBe(true)
      // Personne SIMULÉE : profil au slug visiblement fictif, jamais un vrai.
      expect(contact.linkedin_url ?? '').toMatch(/^(https:\/\/www\.linkedin\.com\/in\/demo-bellum-|$)/)
    }
  })

  it('la preuve s’écrit dans raw_data.jobPosting, datée relativement au semis', () => {
    const proof = recruiters[0]?.job_posting
    expect(demoJobPostingRawData(proof, NOW)).toEqual({
      jobPosting: {
        title: proof?.title,
        url: proof?.url,
        postedAt: new Date(NOW - (proof?.posted_days_ago ?? 0) * 86_400_000).toISOString().slice(0, 10),
      },
    })
  })

  it('sait dire NON : un contact sans offre ne porte aucune preuve', () => {
    expect(demoJobPostingRawData(undefined, NOW)).toBeNull()
  })

  it('un recruteur ne passe pas devant les décideurs du dossier (rang le plus bas)', () => {
    for (const contact of recruiters) expect(contact.priority).toBe(5)
  })
})
