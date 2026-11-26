import { describe, expect, it } from 'vitest'
import { analysisStatusSchema } from '@bellum/contracts'
import { buildDeliverableDescriptors, type DeliverableFormatKey } from './deliverableDescriptors'

const ctx = { companyName: 'Acme', brandName: 'BellumAI', status: 'completed', gated: false, hasGroupLinks: false }

describe('#2125.12-21 — buildDeliverableDescriptors', () => {
  it('rend les neuf champs, dans le même ordre, pour chaque format', () => {
    const keys = buildDeliverableDescriptors('pdf', ctx).map(entry => entry.key)
    expect(keys).toEqual(['content', 'version', 'scope', 'source', 'excluded', 'permissions', 'cost', 'state'])
  })

  it('le dossier (docx/pdf/pptx) partage le même contenu, périmètre et source — un seul modèle', () => {
    const formats: DeliverableFormatKey[] = ['docx', 'pdf', 'pptx']
    for (const format of formats) {
      const entries = buildDeliverableDescriptors(format, ctx)
      const byKey = Object.fromEntries(entries.map(e => [e.key, e]))
      expect(byKey.content.i18nKey).toBe('deliverables.descriptors.content.dossier')
      expect(byKey.content.params).toEqual({ brand: 'BellumAI' })
      expect(byKey.scope.i18nKey).toBe('deliverables.descriptors.scope.dossier')
      expect(byKey.source.i18nKey).toBe('deliverables.descriptors.source.dossier')
    }
  })

  it('le classeur de contacts (xlsx) porte son propre contenu, distinct du dossier', () => {
    const entries = buildDeliverableDescriptors('xlsx', ctx)
    const byKey = Object.fromEntries(entries.map(e => [e.key, e]))
    expect(byKey.content.i18nKey).toBe('deliverables.descriptors.content.contacts')
    expect(byKey.scope.i18nKey).toBe('deliverables.descriptors.scope.contacts')
    expect(byKey.source.i18nKey).toBe('deliverables.descriptors.source.contacts')
  })

  it('permissions : un format gated (xlsx sous la règle d’espace) porte un libellé distinct', () => {
    const free = buildDeliverableDescriptors('xlsx', { ...ctx, gated: false })
    const restricted = buildDeliverableDescriptors('xlsx', { ...ctx, gated: true })
    expect(free.find(e => e.key === 'permissions')?.i18nKey).toBe('deliverables.descriptors.permissions.team')
    expect(restricted.find(e => e.key === 'permissions')?.i18nKey).toBe(
      'deliverables.descriptors.permissions.exportRestricted',
    )
  })

  it('périmètre : un compte rattaché à un groupe le dit — le livrable ne couvre jamais les filiales', () => {
    const alone = buildDeliverableDescriptors('pdf', { ...ctx, hasGroupLinks: false })
    const grouped = buildDeliverableDescriptors('pdf', { ...ctx, hasGroupLinks: true })
    expect(alone.find(e => e.key === 'scope')?.i18nKey).toBe('deliverables.descriptors.scope.dossier')
    expect(grouped.find(e => e.key === 'scope')?.i18nKey).toBe('deliverables.descriptors.scope.dossierGrouped')
  })

  it('coût : jamais 0 nu — la clé dit "inclus", jamais un chiffre seul', () => {
    const entries = buildDeliverableDescriptors('pdf', ctx)
    expect(entries.find(e => e.key === 'cost')?.i18nKey).toBe('deliverables.descriptors.cost.included')
  })

  it('état : reprend TEL QUEL le statut du compte — jamais un second mot pour le même fait', () => {
    const entries = buildDeliverableDescriptors('pdf', { ...ctx, status: 'analyzing' })
    expect(entries.find(e => e.key === 'state')?.i18nKey).toBe('status.analyzing')
  })

  it('état : chaque valeur possible du statut d’analyse produit une clé — aucune n’est oubliée', () => {
    for (const status of analysisStatusSchema.options) {
      const entries = buildDeliverableDescriptors('pdf', { ...ctx, status })
      expect(entries.find(e => e.key === 'state')?.i18nKey).toBe(`status.${status}`)
    }
  })
})
