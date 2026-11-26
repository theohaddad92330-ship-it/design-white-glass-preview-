import { ExternalDirectoryProvider, ExternalDirectoryUnreachableError } from './external-sourcing-provider'
import recorded from './__fixtures__/directory-people-search.json'

const criteria = {
  workspaceId: 'ws-1',
  needId: 'need-1',
  needSkillTerms: ['Kubernetes', 'Terraform'],
  maxPerSource: 20,
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as unknown as Response
}

describe('ExternalDirectoryProvider (#2190.5 / #2190.7)', () => {
  it('sans clé : non branché et AUCUN appel réseau, jamais', async () => {
    const fetchFn = jest.fn()
    const provider = new ExternalDirectoryProvider('', fetchFn)

    expect(provider.configured).toBe(false)
    expect(await provider.search(criteria)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('une clé faite d’espaces vaut « pas de clé »', () => {
    expect(new ExternalDirectoryProvider('   ', jest.fn()).configured).toBe(false)
  })

  it('avec clé : interroge le contrat vérifié (POST, x-api-key, mots-clés = compétences du besoin, per_page borné)', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(recorded))
    const provider = new ExternalDirectoryProvider('k-test', fetchFn)

    await provider.search({ ...criteria, maxPerSource: 12 })

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.apollo.io/api/v1/mixed_people/api_search')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k-test')
    expect(JSON.parse(init.body as string)).toEqual({ q_keywords: 'Kubernetes Terraform', page: 1, per_page: 12 })
  })

  it('profils : nom, poste, compétences PARTAGÉES lues dans le poste — jamais devinées', async () => {
    const provider = new ExternalDirectoryProvider('k', jest.fn().mockResolvedValue(jsonResponse(recorded)))

    const candidates = await provider.search(criteria)

    // La ligne sans identifiant est écartée : on ne fabrique pas d'identité.
    expect(candidates.map(candidate => candidate.id)).toEqual([
      'external_directory:66a1f0c2b3d4e5001a2b3c01',
      'external_directory:66a1f0c2b3d4e5001a2b3c02',
      'external_directory:66a1f0c2b3d4e5001a2b3c03',
    ])
    expect(candidates[0]).toMatchObject({
      // Nom de famille masqué par la source : l'initiale publiée, jamais un nom deviné.
      fullName: 'Camille D.',
      title: 'Kubernetes Platform Engineer',
      sourceKind: 'external_directory',
      sharedSkills: ['Kubernetes'],
    })
    expect(candidates[1]).toMatchObject({ fullName: 'Yanis Morel', sharedSkills: ['Kubernetes', 'Terraform'] })
    // « Java » ne se lit pas dans un poste sans les termes du besoin : rien de partagé.
    expect(candidates[2]?.sharedSkills).toEqual([])
  })

  it('NOMME ce qui manque : la source ne fournit ni compétences structurées ni relecture', async () => {
    const provider = new ExternalDirectoryProvider('k', jest.fn().mockResolvedValue(jsonResponse(recorded)))

    const [first] = await provider.search(criteria)

    expect(first?.limits).toEqual(['not_yet_qualified', 'skills_not_provided'])
  })

  it('ne nomme JAMAIS le fournisseur dans ce qui sort vers l’écran', async () => {
    const provider = new ExternalDirectoryProvider('k', jest.fn().mockResolvedValue(jsonResponse(recorded)))

    const candidates = await provider.search(criteria)

    expect(JSON.stringify(candidates).toLowerCase()).not.toContain('apollo')
  })

  it('res.ok faux : erreur claire, pas une liste vide inventée', async () => {
    const provider = new ExternalDirectoryProvider(
      'k',
      jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 403 })),
    )

    await expect(provider.search(criteria)).rejects.toThrow(ExternalDirectoryUnreachableError)
    await expect(provider.search(criteria)).rejects.toThrow(/403/)
  })

  it('timeout : « unknown », le message porte « timeout » (le lot asynchrone l’y reconnaît)', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const provider = new ExternalDirectoryProvider('k', jest.fn().mockRejectedValue(abort))

    await expect(provider.search(criteria)).rejects.toThrow(/timeout/i)
  })

  it('réponse illisible (pas de liste « people ») : erreur, jamais un zéro', async () => {
    const provider = new ExternalDirectoryProvider('k', jest.fn().mockResolvedValue(jsonResponse({ error: 'x' })))

    await expect(provider.search(criteria)).rejects.toThrow(ExternalDirectoryUnreachableError)
  })
})
