import { describe, expect, it } from 'vitest'
import { outreachDuplicateGroups } from './outreach-batch-check.js'

describe('outreachDuplicateGroups — #2204.73, « identique pour cinquante personnes »', () => {
  it('ne signale rien quand chaque message est distinct', () => {
    const groups = outreachDuplicateGroups([
      { contactId: 'a', body: 'Bonjour Marie, vu votre migration Kubernetes annoncée en juin.' },
      { contactId: 'b', body: 'Bonjour Karim, vu votre levée de fonds série B ce trimestre.' },
    ])
    expect(groups).toEqual([])
  })

  it('signale un groupe quand le même corps part vers plusieurs contacts', () => {
    const body = 'Bonjour, comment gérez-vous la montée en charge ?'
    const groups = outreachDuplicateGroups([
      { contactId: 'a', body },
      { contactId: 'b', body },
      { contactId: 'c', body: 'Un message différent, spécifique à ce contact-ci.' },
    ])
    expect(groups).toEqual([{ contactIds: ['a', 'b'], body }])
  })

  it('normalise la casse, les accents et les espaces avant de comparer (une reformulation triviale reste le même message)', () => {
    const groups = outreachDuplicateGroups([
      { contactId: 'a', body: 'Bonjour,  comment gérez-vous  la montée en charge ?' },
      { contactId: 'b', body: 'bonjour, COMMENT GEREZ-VOUS la montee en charge ?' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.contactIds).toEqual(['a', 'b'])
  })

  it('ignore les corps vides — un brouillon non écrit n’est pas « le même message »', () => {
    const groups = outreachDuplicateGroups([
      { contactId: 'a', body: '' },
      { contactId: 'b', body: '   ' },
    ])
    expect(groups).toEqual([])
  })

  it('un batch vide ou solo ne signale rien', () => {
    expect(outreachDuplicateGroups([])).toEqual([])
    expect(outreachDuplicateGroups([{ contactId: 'a', body: 'seul' }])).toEqual([])
  })
})
