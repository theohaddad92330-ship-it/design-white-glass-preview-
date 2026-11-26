import { describe, expect, it } from 'vitest'
import type { OutreachSequence } from '@bellum/contracts'
import { campaignLabelFor, campaignOptions, filterByCampaign } from './campaign-label'

const sequence = (id: string, campaign_label: string | null): OutreachSequence =>
  ({
    id,
    contact_id: `c-${id}`,
    contact_name: null,
    contact_role: null,
    account_id: null,
    account_name: null,
    name: 'Prospection',
    campaign_label,
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-09-16T08:00:00.000Z',
    steps: [],
    next_step: null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
  }) as OutreachSequence

describe('campaignLabelFor — une campagne se forme à plusieurs, jamais à un', () => {
  const at = new Date('2026-09-16T08:30:00.000Z')

  it('ne nomme AUCUNE campagne pour une séquence lancée seule', () => {
    expect(campaignLabelFor({ contactCount: 1, name: 'DSI', templateLabel: 'Prospection', at })).toBeNull()
    // Zéro non plus : rien n'a été lancé.
    expect(campaignLabelFor({ contactCount: 0, name: 'DSI', templateLabel: 'Prospection', at })).toBeNull()
  })

  it('prend le nom SAISI quand il y en a un', () => {
    expect(campaignLabelFor({ contactCount: 12, name: '  DSI grands comptes  ', templateLabel: 'P', at })).toBe(
      'DSI grands comptes',
    )
  })

  it('à défaut, l’objectif de la campagne préparée par Laura', () => {
    expect(
      campaignLabelFor({ contactCount: 12, name: '   ', objective: 'Décrocher 3 RDV DSI', templateLabel: 'P', at }),
    ).toBe('Décrocher 3 RDV DSI')
  })

  it('en dernier recours, le gabarit ET l’heure — deux campagnes du même jour restent deux', () => {
    const matin = campaignLabelFor({ contactCount: 3, name: '', templateLabel: 'Prospection 3 touches', at })
    const apresMidi = campaignLabelFor({
      contactCount: 3,
      name: '',
      templateLabel: 'Prospection 3 touches',
      at: new Date('2026-09-16T14:05:00.000Z'),
    })
    expect(matin).toContain('Prospection 3 touches')
    expect(matin).not.toBe(apresMidi)
  })
})

describe('campaignOptions / filterByCampaign — le tableau d’audience', () => {
  const rows = [
    sequence('1', 'DSI grands comptes'),
    sequence('2', 'DSI grands comptes'),
    sequence('3', 'Relance été'),
    sequence('4', null),
    sequence('5', '   '),
  ]

  it('LIT les étiquettes présentes, la plus fournie en tête', () => {
    expect(campaignOptions(rows)).toEqual([
      { label: 'DSI grands comptes', count: 2 },
      { label: 'Relance été', count: 1 },
    ])
  })

  it('ne fabrique AUCUN groupe « sans nom » — une séquence seule n’est pas une campagne', () => {
    expect(campaignOptions(rows).map(option => option.label)).not.toContain('')
    expect(campaignOptions([sequence('4', null)])).toEqual([])
  })

  it('filtre sur l’étiquette, et « aucun filtre » n’est pas « étiquette vide »', () => {
    expect(filterByCampaign(rows, 'DSI grands comptes').map(row => row.id)).toEqual(['1', '2'])
    // Sans filtre, TOUT est rendu — y compris les séquences sans campagne.
    expect(filterByCampaign(rows, null)).toHaveLength(5)
  })
})
