import { InternalKnowledgeDigestService, knowledgeFingerprint } from './internal-knowledge-digest.service'
import type { DigestStore, KnowledgeDigest, KnowledgeFileRow, KnowledgeStore } from './internal-knowledge.types'

function file(fileId: string, modifiedTime: string, status: KnowledgeFileRow['status'] = 'indexed'): KnowledgeFileRow {
  return {
    fileId,
    name: `${fileId}.md`,
    mimeType: 'text/markdown',
    path: `Bellum / ${fileId}.md`,
    modifiedTime,
    status,
    errorMessage: null,
    chunkCount: 1,
    syncedAt: new Date(),
  }
}

function setup(opts: {
  files: KnowledgeFileRow[]
  current?: KnowledgeDigest | null
  generated?: string | null
  fail?: boolean
}) {
  const store = { listFiles: jest.fn(async () => opts.files) } as unknown as KnowledgeStore
  const saved: Array<{ content: string; fingerprint: string }> = []
  const digests: DigestStore = {
    getCurrentDigest: jest.fn(async () => opts.current ?? null),
    saveDigest: jest.fn(async (d: { content: string; fingerprint: string }) => {
      saved.push(d)
    }),
  }
  const generate = jest.fn(async () => {
    if (opts.fail) throw new Error('IA injoignable')
    return opts.generated === undefined ? 'Méthode ESN : qualifier le besoin.' : opts.generated
  })
  const service = new InternalKnowledgeDigestService(store, digests, { generate })
  return { service, saved, generate }
}

describe('#3586 W2 — digest du Drive interne, régénéré quand le contenu change', () => {
  it("l'empreinte ne dépend ni de l'ordre ni des fichiers non indexés", () => {
    const a = knowledgeFingerprint([file('a', 't1'), file('b', 't2'), file('c', 't3', 'archived')])
    const b = knowledgeFingerprint([file('b', 't2'), file('a', 't1'), file('d', 't9', 'ignored')])
    expect(a).toBe(b)
    expect(knowledgeFingerprint([file('a', 't1-bis'), file('b', 't2')])).not.toBe(a)
  })

  it('premier passage : génère UNE fois et stocke avec son empreinte', async () => {
    const { service, saved, generate } = setup({ files: [file('a', 't1')] })
    const report = await service.refreshIfChanged()
    expect(generate).toHaveBeenCalledTimes(1)
    expect(saved).toEqual([
      { content: 'Méthode ESN : qualifier le besoin.', fingerprint: knowledgeFingerprint([file('a', 't1')]) },
    ])
    expect(report).toEqual({ status: 'regenerated', sizeChars: 'Méthode ESN : qualifier le besoin.'.length })
  })

  it("contenu inchangé : aucun appel modèle, rien d'écrit", async () => {
    const files = [file('a', 't1')]
    const current: KnowledgeDigest = {
      content: 'x',
      fingerprint: knowledgeFingerprint(files),
      createdAt: new Date(),
      sizeChars: 1,
    }
    const { service, saved, generate } = setup({ files, current })
    expect(await service.refreshIfChanged()).toEqual({ status: 'unchanged' })
    expect(generate).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('un fichier modifié change l’empreinte : régénère', async () => {
    const current: KnowledgeDigest = {
      content: 'x',
      fingerprint: knowledgeFingerprint([file('a', 't1')]),
      createdAt: new Date(),
      sizeChars: 1,
    }
    const { service, generate } = setup({ files: [file('a', 't2')], current })
    expect((await service.refreshIfChanged()).status).toBe('regenerated')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('aucun fichier indexé : aucun appel modèle (pas de Drive = pas de digest)', async () => {
    const { service, generate } = setup({ files: [file('a', 't1', 'ignored')] })
    expect(await service.refreshIfChanged()).toEqual({ status: 'empty' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('génération vide ou en panne : le digest courant reste, rien n’est écrit, jamais d’exception', async () => {
    const vide = setup({ files: [file('a', 't1')], generated: null })
    expect((await vide.service.refreshIfChanged()).status).toBe('error')
    expect(vide.saved).toEqual([])

    const panne = setup({ files: [file('a', 't1')], fail: true })
    expect(await panne.service.refreshIfChanged()).toEqual({ status: 'error', message: 'IA injoignable' })
    expect(panne.saved).toEqual([])
  })
})
