import { proposeUniversalMapping } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { readBlob } from './file-parts'
import { sampleFileFor } from './sample-file'

describe('fichier d’exemple de l’import universel', () => {
  it.each(['contact', 'account'] as const)(
    '%s : ses en-têtes se reconnaissent, sauf UNE colonne gardée en extra',
    async type => {
      const file = sampleFileFor(type)
      expect(file).not.toBeNull()
      const text = file ? new TextDecoder().decode(await readBlob(file)) : ''
      const headers = text.split('\n')[0]?.split(';') ?? []
      const mapping = proposeUniversalMapping(headers, type)
      expect(Object.values(mapping).filter(field => field === null)).toHaveLength(1)
    },
  )

  it('#4053 — l’exemple de contacts porte les références CRM et la société : il crée ses comptes en salle', async () => {
    const file = sampleFileFor('contact')
    const text = file ? new TextDecoder().decode(await readBlob(file)) : ''
    const mapping = proposeUniversalMapping(text.split('\n')[0]?.split(';') ?? [], 'contact')
    expect(Object.values(mapping)).toEqual(
      expect.arrayContaining(['source_ref', 'company_ref', 'company', 'company_status']),
    )
  })

  it('ne fabrique pas d’exemple pour un type qui n’en a pas', () => {
    expect(sampleFileFor('mission')).toBeNull()
  })
})
