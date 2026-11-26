import {
  objectColumnFor,
  objectColumnsFor,
  objectLinkKey,
  objectLinkOf,
  resolveMemoryObjectNames,
  withResolvedName,
} from './memory-object-links'

/**
 * #2260.7 — la brique structurelle de l'objet visé : quelle colonne porte quel
 * type, comment la lire, comment résoudre son nom.
 */
describe('memory-object-links (#2260.7)', () => {
  it('objectColumnFor — une colonne par type, jamais devinée', () => {
    expect(objectColumnFor('contact')).toBe('contact_id')
    expect(objectColumnFor('need')).toBe('need_id')
    expect(objectColumnFor('consultant')).toBe('consultant_id')
    expect(objectColumnFor('mission')).toBe('mission_id')
  })

  it('objectColumnsFor — désigne UNE colonne, les trois autres à null', () => {
    expect(objectColumnsFor({ type: 'need', id: 'n-1' })).toEqual({
      contact_id: null,
      need_id: 'n-1',
      consultant_id: null,
      mission_id: null,
    })
  })

  it('objectColumnsFor — absent ou null : les quatre à null, le comportement historique', () => {
    const empty = { contact_id: null, need_id: null, consultant_id: null, mission_id: null }
    expect(objectColumnsFor(null)).toEqual(empty)
    expect(objectColumnsFor(undefined)).toEqual(empty)
  })

  it('objectLinkOf — lit le lien depuis les quatre colonnes de la ligne', () => {
    expect(objectLinkOf({ contact_id: 'c-1', need_id: null, consultant_id: null, mission_id: null })).toEqual({
      type: 'contact',
      id: 'c-1',
    })
    expect(objectLinkOf({ contact_id: null, need_id: null, consultant_id: null, mission_id: null })).toBeNull()
  })

  it('resolveMemoryObjectNames — batché PAR TYPE, jamais une requête par ligne', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'c-1', name: 'Ferdinand Aumont' }])
      .mockResolvedValueOnce([{ id: 'm-1', name: 'Fiabilisation plateforme' }])
    const names = await resolveMemoryObjectNames({ query }, 'ws-1', [
      { type: 'contact', id: 'c-1' },
      { type: 'mission', id: 'm-1' },
    ])
    expect(query).toHaveBeenCalledTimes(2)
    expect(names.get(objectLinkKey({ type: 'contact', id: 'c-1' }))).toBe('Ferdinand Aumont')
    expect(names.get(objectLinkKey({ type: 'mission', id: 'm-1' }))).toBe('Fiabilisation plateforme')
  })

  it('resolveMemoryObjectNames — un id absent de la réponse (hors espace, disparu) reste `null`, jamais deviné', async () => {
    const query = jest.fn().mockResolvedValueOnce([])
    const names = await resolveMemoryObjectNames({ query }, 'ws-1', [{ type: 'need', id: 'n-1' }])
    expect(names.get(objectLinkKey({ type: 'need', id: 'n-1' }))).toBeNull()
  })

  it('resolveMemoryObjectNames — un nom blanc (consultant sans nom encore saisi) est `null`, pas une chaîne vide', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'cs-1', name: '  ' }])
    const names = await resolveMemoryObjectNames({ query }, 'ws-1', [{ type: 'consultant', id: 'cs-1' }])
    expect(names.get(objectLinkKey({ type: 'consultant', id: 'cs-1' }))).toBeNull()
  })

  it('resolveMemoryObjectNames — une lecture en échec rend une carte VIDE, jamais une exception', async () => {
    const query = jest.fn().mockRejectedValueOnce(new Error('boom'))
    const names = await resolveMemoryObjectNames({ query }, 'ws-1', [{ type: 'mission', id: 'm-1' }])
    expect(names.get(objectLinkKey({ type: 'mission', id: 'm-1' }))).toBeNull()
  })

  it('resolveMemoryObjectNames — aucun lien : aucune requête', async () => {
    const query = jest.fn()
    const names = await resolveMemoryObjectNames({ query }, 'ws-1', [null, undefined])
    expect(query).not.toHaveBeenCalled()
    expect(names.size).toBe(0)
  })

  it('withResolvedName — assemble le lien et son nom résolu', () => {
    const names = new Map([[objectLinkKey({ type: 'contact', id: 'c-1' }), 'Ferdinand Aumont']])
    expect(withResolvedName({ type: 'contact', id: 'c-1' }, names)).toEqual({
      type: 'contact',
      id: 'c-1',
      name: 'Ferdinand Aumont',
    })
  })

  it('withResolvedName — aucun lien : `null`', () => {
    expect(withResolvedName(null, new Map())).toBeNull()
  })
})
