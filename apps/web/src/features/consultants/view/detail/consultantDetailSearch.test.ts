import { describe, expect, it } from 'vitest'
import { consultantDetailSearchSchema } from './consultantDetailSearch'

/**
 * #2185.22/.24/.25 — un ancien `?tab=` de la fiche talent continue de tomber
 * sur SA clé fine (`TalentDetailPage` sait déjà la rattacher au bon bouton) ;
 * seuls les DEUX alias de libellé (« Opportunités », jamais construit —
 * #2185.22 l'a refermé sur ce regroupement) tombent ailleurs.
 */
describe('consultantDetailSearchSchema — les anciens ?tab= de la fiche talent', () => {
  it('laisse passer une clé canonique telle quelle', () => {
    expect(consultantDetailSearchSchema.parse({ tab: 'rates' })).toEqual({ tab: 'rates' })
    expect(consultantDetailSearchSchema.parse({ tab: 'submissions' })).toEqual({ tab: 'submissions' })
    expect(consultantDetailSearchSchema.parse({ tab: 'identity' })).toEqual({ tab: 'identity' })
  })

  it('résout les alias de libellé vers leur clé canonique', () => {
    expect(consultantDetailSearchSchema.parse({ tab: 'opportunities' })).toEqual({ tab: 'submissions' })
    expect(consultantDetailSearchSchema.parse({ tab: 'activity' })).toEqual({ tab: 'notes' })
    expect(consultantDetailSearchSchema.parse({ tab: 'compliance' })).toEqual({ tab: 'consent' })
  })

  it('ignore la casse', () => {
    expect(consultantDetailSearchSchema.parse({ tab: 'RATES' })).toEqual({ tab: 'rates' })
  })

  it('une clé inconnue retombe sur l’onglet par défaut — jamais un onglet fantôme', () => {
    expect(consultantDetailSearchSchema.parse({ tab: 'n-importe-quoi' })).toEqual({ tab: undefined })
  })

  it('sans clé du tout, ne pose rien — l’onglet se déduit ailleurs', () => {
    expect(consultantDetailSearchSchema.parse({})).toEqual({ tab: undefined })
  })
})
