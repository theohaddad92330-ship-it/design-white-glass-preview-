import { describe, expect, it } from 'vitest'
import {
  LEMLIST_LEAD_STATUSES,
  lemlistCredentialsSchema,
  lemlistLeadStatusesFromActivities,
  lemlistPushInputSchema,
} from './lemlist.js'

describe('#4427 — contrat Lemlist', () => {
  it('#4427.1 — la clé est obligatoire, rognée, et rien d’autre ne passe', () => {
    expect(lemlistCredentialsSchema.safeParse({ apiKey: '   ' }).success).toBe(false)
    expect(lemlistCredentialsSchema.parse({ apiKey: '  abcd1234  ' })).toEqual({ apiKey: 'abcd1234' })
    expect(lemlistCredentialsSchema.safeParse({ apiKey: 'abcd1234', extra: 1 }).success).toBe(false)
  })

  it('#4427.2 — pousser demande un contact ET une campagne choisie', () => {
    expect(lemlistPushInputSchema.safeParse({ contactId: 'c1' }).success).toBe(false)
    expect(lemlistPushInputSchema.safeParse({ campaignId: 'cam_1' }).success).toBe(false)
    expect(lemlistPushInputSchema.parse({ contactId: 'c1', campaignId: 'cam_1' })).toEqual({
      contactId: 'c1',
      campaignId: 'cam_1',
    })
  })

  it('#4427.3 — les types d’activité documentés deviennent des statuts, le plus récent gagne', () => {
    const statuses = lemlistLeadStatusesFromActivities([
      { type: 'emailsSent', createdAt: '2026-10-01T09:00:00.000Z' },
      { type: 'emailsOpened', createdAt: '2026-10-02T09:00:00.000Z' },
      { type: 'emailsOpened', createdAt: '2026-10-03T09:00:00.000Z' },
      { type: 'emailsReplied', createdAt: '2026-10-04T09:00:00.000Z' },
      { type: 'manualUnsubscribed', createdAt: '2026-10-05T09:00:00.000Z' },
    ])
    expect(statuses).toEqual([
      { status: 'sent', at: '2026-10-01T09:00:00.000Z' },
      { status: 'opened', at: '2026-10-03T09:00:00.000Z' },
      { status: 'replied', at: '2026-10-04T09:00:00.000Z' },
      { status: 'unsubscribed', at: '2026-10-05T09:00:00.000Z' },
    ])
  })

  it('#4427.3 — une activité que la doc ne rattache à aucun statut ne fabrique AUCUNE ligne', () => {
    expect(
      lemlistLeadStatusesFromActivities([
        { type: 'emailsClicked', createdAt: '2026-10-01T09:00:00.000Z' },
        { type: 'linkedinInviteDone', createdAt: '2026-10-01T09:00:00.000Z' },
      ]),
    ).toEqual([])
    // Un rebond sans date reste un rebond : la date est nommée inconnue (`null`), jamais inventée.
    expect(lemlistLeadStatusesFromActivities([{ type: 'emailsBounced', createdAt: null }])).toEqual([
      { status: 'bounced', at: null },
    ])
    expect(LEMLIST_LEAD_STATUSES).toEqual(['sent', 'opened', 'replied', 'bounced', 'unsubscribed'])
  })
})
