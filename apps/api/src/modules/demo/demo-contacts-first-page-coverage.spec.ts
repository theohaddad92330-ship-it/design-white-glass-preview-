import { filterEligibleContacts } from '../contacts/contact-eligibility'
import { rankAccountContacts } from '../contacts/contact-ranking'
import { DEMO_DOSSIERS, DEMO_ANALYSIS_RUNS, DEMO_HISTORY_RUNS, DEMO_VERIFICATION_RUNS } from './demo-dataset'
import { DEMO_DO_NOT_CONTACT_LINKEDIN } from './demo-team-guardrails-seed'

/**
 * #4290.12 / #4295.11 (recette démo 31/10) — « a quitté » et « Ne pas contacter » existaient dans le semis mais
 * AUCUN ne tombait sur la page que `/contacts` ouvre : la portée par défaut est « recommandé » (chemin de ≤ 10
 * personnes par compte, comptes dans l'ordre de leur dernière analyse terminée). Un drapeau posé sur un contact
 * hors chemin, ou sur un compte rangé trop bas, est invisible. Cette garde rejoue ce même classement.
 */
const SNCF = 'SNCF'
const dossier = DEMO_DOSSIERS.find(entry => entry.account.company_name === SNCF)

const rankedPathOf = (): string[] => {
  const rows = (dossier?.contacts ?? []).map((contact, index) => ({
    id: String(index),
    full_name: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    decision_role: contact.decision_role,
    email: contact.email,
    email_verified: false,
    phone: contact.phone ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    source: null,
    user_status: null,
    email_sent_at: null,
    last_enrichment_at: null,
    priority: contact.priority,
    demo_seed_first_door: contact.demo_seed_first_door ?? false,
    hidden: false,
    excluded_at: contact.exclusion_reason ? new Date() : null,
    lifecycle_state: contact.lifecycle_state,
  }))
  const raw = (dossier?.account.raw_analysis ?? null) as Record<string, unknown> | null
  const { eligible } = filterEligibleContacts(rows as never, raw)
  const { ranked } = rankAccountContacts(eligible as never, raw, {})
  return ranked.map(item => (dossier?.contacts[Number(item.contact_id)] as { full_name: string }).full_name)
}

describe('#4290.12 / #4295.11 — les drapeaux de la salle tombent sur la première page de /contacts', () => {
  it('le contact « a quitté » de SNCF est dans le chemin recommandé du compte', () => {
    const left = (dossier?.contacts ?? []).filter(contact => contact.employment_check?.state === 'left')
    expect(left.length).toBeGreaterThan(0)
    for (const contact of left) expect(rankedPathOf()).toContain(contact.full_name)
  })

  it('le contact « Ne pas contacter » de SNCF est fictif et dans le chemin recommandé', () => {
    const target = (dossier?.contacts ?? []).find(contact => contact.linkedin_url === DEMO_DO_NOT_CONTACT_LINKEDIN)
    expect(target).toBeDefined()
    expect(target?.linkedin_url).toMatch(/\/in\/demo-bellum-/)
    expect(target?.email).toBeNull()
    expect(target?.phone ?? null).toBeNull()
    expect(rankedPathOf()).toContain(target?.full_name)
  })

  it('SNCF ouvre la liste : sa dernière analyse terminée est strictement la plus récente de la salle', () => {
    const latest = new Map<string, number>()
    const note = (company: string, daysAgo: number) =>
      latest.set(company, Math.min(latest.get(company) ?? Number.POSITIVE_INFINITY, daysAgo))
    for (const run of DEMO_ANALYSIS_RUNS) note(run.company, run.daysAgo)
    for (const run of DEMO_VERIFICATION_RUNS) note(run.company, run.daysAgo)
    for (const run of DEMO_HISTORY_RUNS) if (run.status === 'completed') note(run.company, run.daysAgo)
    const others = [...latest.entries()].filter(([company]) => company !== SNCF)
    for (const [company, daysAgo] of others) {
      expect({ company, newer: (latest.get(SNCF) ?? Infinity) < daysAgo }).toEqual({ company, newer: true })
    }
  })

  it('sait dire NON : un contact sans drapeau d’un autre compte n’est pas pris pour le contact listé', () => {
    const others = DEMO_DOSSIERS.filter(entry => entry.account.company_name !== SNCF).flatMap(entry => entry.contacts)
    expect(others.some(contact => contact.linkedin_url === DEMO_DO_NOT_CONTACT_LINKEDIN)).toBe(false)
  })
})
