import { describe, expect, it } from 'vitest'
import { resolveMyDataTab, myDataSearchSchema } from './mes-donnees'

/** #4533.1 — l'onglet vit dans l'adresse ; une valeur abîmée ouvre Exports, jamais une page en erreur. */
describe('/settings/mes-donnees — ?tab=', () => {
  it('exports | imports, défaut Exports', () => {
    expect(myDataSearchSchema.parse({}).tab).toBeUndefined()
    expect(myDataSearchSchema.parse({ tab: 'imports' }).tab).toBe('imports')
    expect(myDataSearchSchema.parse({ tab: 'exports' }).tab).toBe('exports')
    expect(myDataSearchSchema.parse({ tab: 'zzz' }).tab).toBeUndefined()
    expect(resolveMyDataTab(undefined)).toBe('exports')
    expect(resolveMyDataTab('imports')).toBe('imports')
  })
})
