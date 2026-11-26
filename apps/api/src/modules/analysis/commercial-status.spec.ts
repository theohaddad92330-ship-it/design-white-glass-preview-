import { relationStatusForRun } from './commercial-status'

describe('relationStatusForRun', () => {
  it('forwards the columns that say something about the relationship', () => {
    expect(relationStatusForRun('customer')).toBe('customer')
    expect(relationStatusForRun('opportunity')).toBe('opportunity')
    expect(relationStatusForRun('watching')).toBe('watching')
    expect(relationStatusForRun('archived')).toBe('archived')
  })

  it('omits the untriaged default so the run stays byte-identical', () => {
    // `inbox` = jamais trié = exactement ce que l'absence de valeur signifie.
    expect(relationStatusForRun('inbox')).toBeUndefined()
    expect(relationStatusForRun('')).toBeUndefined()
    expect(relationStatusForRun('   ')).toBeUndefined()
    expect(relationStatusForRun(null)).toBeUndefined()
    expect(relationStatusForRun(undefined)).toBeUndefined()
  })
})
