import { angleThemeTokens } from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from './contact-ranking'

/**
 * Lot 758 (CONTACTS 4/6) — l'ordre suit la PERTINENCE :
 *  - sans offre CHOISIE, l'axe `offer` lit l'offre DÉCLARÉE de l'ESN : pour une ESN data, le
 *    Head of Data passe devant le chef de l'architecture, même quand l'architecte est le seul
 *    joignable (Julien — la porte d'entrée tombait sur l'architecte) ;
 *  - l'offre choisie gagne toujours sur l'offre déclarée ;
 *  - « les achats interviennent ensuite » nomme QUI (Loïc).
 */
let seq = 0
function row(patch: Partial<RankableContactRow>): RankableContactRow {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    title: 'Responsable',
    entity: 'Groupe',
    decision_role: 'technical',
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: '2026-10-01T00:00:00Z',
    priority: 3,
    demo_seed_first_door: false,
    ...patch,
  }
}

const RAW = { priority_perimeters: [{ name: 'Groupe', tier: 'P1' }], angles: [] }
const DATA_OFFER = angleThemeTokens([{ title: 'Data & IA' }])

describe('rankAccountContacts — l’offre déclarée de l’ESN (lot 758)', () => {
  const architect = () =>
    row({
      title: "Directeur de l'architecture",
      email: 'archi@example.com',
      email_verified: true,
      phone: '+33 1 00 00 00 00',
    })
  const headOfData = () => row({ title: 'Head of Data' })

  it('témoin : sans offre déclarée, la joignabilité départage et l’architecte passe devant', () => {
    const a = architect()
    const d = headOfData()
    const { ranked, context } = rankAccountContacts([d, a], RAW, {})
    expect(ranked[0].contact_id).toBe(a.id)
    expect(context.offer_source).toBe('none')
  })

  it('pour une ESN data, le Head of Data passe DEVANT l’architecte joignable', () => {
    const a = architect()
    const d = headOfData()
    const { ranked, context } = rankAccountContacts([a, d], RAW, { profileOfferTokens: DATA_OFFER })
    expect(ranked.map(r => r.contact_id)).toEqual([d.id, a.id])
    expect(context.offer_source).toBe('profile')
    // L'axe est NOMMÉ des deux côtés : offre rejointe, offre manquée.
    expect(ranked[0].axes.find(x => x.key === 'offer')?.reason).toBe('offer_match')
    expect(ranked[1].axes.find(x => x.key === 'offer')?.reason).toBe('offer_no_match')
  })

  it('l’offre CHOISIE gagne toujours sur l’offre déclarée', () => {
    const a = architect()
    const d = headOfData()
    const { ranked, context } = rankAccountContacts([d, a], RAW, {
      offer: 'Architecture',
      profileOfferTokens: DATA_OFFER,
    })
    expect(ranked[0].contact_id).toBe(a.id)
    expect(context.offer_source).toBe('chosen')
  })

  it('personne n’est retiré : l’offre change l’ORDRE, jamais le CONTENU (c76)', () => {
    const rows = [architect(), headOfData(), row({ title: 'Chef de projet' })]
    expect(rankAccountContacts(rows, RAW, { profileOfferTokens: DATA_OFFER }).ranked).toHaveLength(3)
  })
})

describe('rankAccountContacts — « étape achat » nomme l’acheteur (lot 758, Loïc)', () => {
  it('l’acheteur identifié est nommé par son identifiant', () => {
    const buyer = row({ title: 'Acheteur IT', decision_role: 'procurement' })
    const dsi = row({ title: 'DSI', decision_role: 'economic' })
    expect(rankAccountContacts([dsi, buyer], RAW, {}).procurement_contact_id).toBe(buyer.id)
  })

  it('aucun acheteur au dossier : `null`, jamais un nom deviné', () => {
    const dsi = row({ title: 'DSI', decision_role: 'economic' })
    expect(rankAccountContacts([dsi], RAW, {}).procurement_contact_id).toBeNull()
  })

  it('aucun contact : la clé est absente', () => {
    expect(rankAccountContacts([], RAW, {})).not.toHaveProperty('procurement_contact_id')
  })
})
