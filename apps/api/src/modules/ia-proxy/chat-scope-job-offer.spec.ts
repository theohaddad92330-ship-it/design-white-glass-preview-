import type { JobOfferHistoryRow } from '../signal-history/signal-history.projection'
import { jobOfferReadFrom, renderChatScopeObject } from './chat-scope-object'

/**
 * Théo L1 — sélecteur avancé — LA FICHE QUE LAURA LIT QUAND UN FIL EST CADRÉ
 * SUR UNE OFFRE D'EMPLOI (un signal de recrutement repéré chez un compte).
 *
 * La ligne d'historique (`signal_history`) donne l'identité et l'intitulé ; le
 * dossier du compte donne le reste (lieu, compétences, contrat). Ce qui suit
 * vérifie surtout ce qui n'entre PAS dans le prompt : le nom d'un de nos
 * fournisseurs, une offre de stage, un « 0 » pour une valeur absente.
 */

const row: JobOfferHistoryRow = {
  label: 'Data engineer — plateforme data voyageurs (H/F)',
  signal_key: 'data engineer — plateforme data voyageurs (h/f)',
  signal_date: '2026-10-06',
  status: 'active',
  resolved_at: null,
  company_name: 'SNCF Voyageurs',
  website: 'https://www.sncf-voyageurs.com',
  recent_signals: [
    {
      signal: 'Data engineer — plateforme data voyageurs (H/F)',
      source: 'Un fournisseur de veille emploi',
      type: 'recrutement',
      date: '2026-10-06',
      location: 'Lyon (69)',
      url: 'https://jobs.example.org/offre/123',
      source_kind: 'job',
    },
  ],
  job_signals: [
    {
      title: 'Data engineer — plateforme data voyageurs (H/F)',
      location: 'Lyon (69)',
      contract_type: 'CDI',
      skills: ['Spark', 'Kafka', 'Airflow'],
      source: 'Un fournisseur de veille emploi',
    },
  ],
}

function rendered(input: JobOfferHistoryRow): string {
  const read = jobOfferReadFrom(input)
  return read
    ? renderChatScopeObject({ kind: 'job_offer', status: 'found', jobOffer: read })
    : renderChatScopeObject({ kind: 'job_offer', status: 'not_found' })
}

describe('renderChatScopeObject — une offre d’emploi (Théo L1)', () => {
  it('nomme l’offre, son compte, sa date, son lieu, son contrat et ses compétences', () => {
    const text = rendered(row)
    expect(text).toContain('Data engineer — plateforme data voyageurs')
    expect(text).toContain('SNCF Voyageurs')
    expect(text).toContain('2026-10-06')
    expect(text).toContain('Lyon (69)')
    expect(text).toContain('CDI')
    expect(text).toContain('Spark, Kafka, Airflow')
  })

  it('#4977.1 — la fiche demande de citer le poste ET la ville quand la ville est connue, rien sinon', () => {
    expect(rendered(row)).toMatch(/cite le poste et la ville/i)
    const noCity = { ...row, recent_signals: [], job_signals: [{ title: row.label, contractType: 'CDI' }] }
    const text = rendered(noCity)
    expect(text).not.toMatch(/Lieu/)
    expect(text).not.toMatch(/cite le poste et la ville/i)
  })

  it('#4977.1 — lit la ville d’une offre collectée sous `city` (it_job_signals), le poste ET la ville se disent', () => {
    const collected = {
      ...row,
      recent_signals: [],
      job_signals: [
        { title: 'Data engineer — plateforme data voyageurs (H/F)', city: 'Paris (75)', contractType: 'CDI' },
      ],
    }
    const text = rendered(collected)
    expect(text).toContain('Lieu : Paris (75)')
    expect(text).toContain('CDI')
  })

  it('#4977.1 — sans ville connue, aucune ligne « Lieu » : jamais inventée', () => {
    const none = {
      ...row,
      recent_signals: [],
      job_signals: [{ title: 'Data engineer — plateforme data voyageurs (H/F)' }],
    }
    expect(rendered(none)).not.toContain('Lieu')
  })

  /** NOS fournisseurs ne se nomment jamais — ni à l'écran, ni dans un prompt. */
  it('ne nomme JAMAIS la source quand elle n’est pas le site du compte lui-même', () => {
    const text = rendered(row)
    expect(text).not.toMatch(/fournisseur/i)
    expect(text).not.toContain('jobs.example.org')
    expect(text).toMatch(/site d’emploi/)
  })

  it('dit que l’offre est publiée sur le site du compte quand c’est le cas — sans URL', () => {
    const own = {
      ...row,
      recent_signals: [
        { ...(row.recent_signals as Record<string, unknown>[])[0], url: 'https://www.sncf-voyageurs.com/carrieres/42' },
      ],
    }
    const text = rendered(own)
    expect(text).toMatch(/site du compte/)
    expect(text).not.toContain('carrieres/42')
  })

  /** Décision Louis 12/10 — une offre de STAGE ne devient jamais un signal, ni une portée. */
  it('une offre de STAGE ne se relit jamais — elle est introuvable', () => {
    const internship = {
      ...row,
      label: 'CS27 - Bac 5 - Stage Supply Chain H/F',
      signal_key: 'cs27 - bac 5 - stage supply chain h/f',
      recent_signals: [],
      job_signals: [],
    }
    expect(jobOfferReadFrom(internship)).toBeNull()
    expect(rendered(internship)).toContain('introuvable')
    expect(rendered(internship)).not.toContain('Supply')
  })

  it('un contrat de stage porté par le dossier suffit à l’écarter', () => {
    const internship = {
      ...row,
      job_signals: [{ ...(row.job_signals as Record<string, unknown>[])[0], contract_type: 'Stage' }],
    }
    expect(jobOfferReadFrom(internship)).toBeNull()
  })

  it('n’écrit pas une valeur absente — ni « 0 », ni « inconnu » de remplissage', () => {
    const bare: JobOfferHistoryRow = {
      label: 'Architecte cloud',
      signal_key: 'architecte cloud',
      signal_date: null,
      status: 'active',
      resolved_at: null,
      company_name: null,
      website: null,
      recent_signals: null,
      job_signals: null,
    }
    const text = rendered(bare)
    expect(text.split('\n')).toHaveLength(1)
    expect(text).not.toContain('0')
  })

  it('une offre qui a disparu de la dernière analyse le dit, datée — c’est un fait', () => {
    const text = rendered({ ...row, status: 'resolved', resolved_at: '2026-10-15T08:00:00.000Z' })
    expect(text).toMatch(/plus visible.*2026-10-15/)
  })

  it('une offre introuvable le dit, et ne répond pas sur une autre offre', () => {
    const text = renderChatScopeObject({ kind: 'job_offer', status: 'not_found' })
    expect(text).toContain('introuvable')
    expect(text).toContain('offre d’emploi')
  })
})
