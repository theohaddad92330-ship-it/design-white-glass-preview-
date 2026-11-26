import { describe, expect, it } from 'vitest'
import { memoryItemSchema } from './memory-item.js'
import { memoryLedgerEntrySchema } from './memory-ledger.js'

/**
 * Q1 (décision de Louis du 13/09) — une « Note de Laura — à vérifier » dont une
 * personne réécrit le texte devient « Confirmée par <prénom> ». L'origine reste
 * `copilot` ; la confirmation voyage à côté.
 */
describe('une note de Laura confirmée par une personne', () => {
  const item = {
    id: 'f-1',
    fact: 'ALTEN n’est plus sur le compte',
    accountId: null,
    kind: 'fact',
    origin: 'copilot',
    scope: 'workspace',
    ownedByMe: false,
    canForget: false,
    expiresAt: null,
    createdAt: '2026-09-01T09:00:00.000Z',
  } as const

  it('l’élément porte la date de confirmation — et garde son origine', () => {
    const parsed = memoryItemSchema.parse({ ...item, confirmedAt: '2026-09-13T08:00:00.000Z' })
    expect(parsed).toMatchObject({ origin: 'copilot', confirmedAt: '2026-09-13T08:00:00.000Z' })
  })

  it('une API plus ancienne ne sert pas le champ : l’élément reste lisible, non confirmé', () => {
    expect(memoryItemSchema.parse(item).confirmedAt).toBeUndefined()
    expect(memoryItemSchema.parse({ ...item, confirmedAt: null }).confirmedAt).toBeNull()
  })

  it('la ligne du registre nomme le confirmateur en prénom + avatar — jamais un identifiant', () => {
    const base = {
      id: 'f-1',
      layer: 'facts',
      text: 'x',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: 'confirmedNote',
      expiresAt: null,
    }
    expect(
      memoryLedgerEntrySchema.parse({ ...base, confirmedBy: { firstName: 'Julie', avatarUrl: null, userId: 'u-9' } })
        .confirmedBy,
    ).toEqual({ firstName: 'Julie', avatarUrl: null })
    expect(memoryLedgerEntrySchema.parse({ ...base, confirmedBy: null }).confirmedBy).toBeNull()
  })
})
