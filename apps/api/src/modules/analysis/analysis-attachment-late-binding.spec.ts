import { RagService } from '../rag/rag.service'
import { AnalysisAttachmentBinderService } from './analysis-attachment-binder.service'

/**
 * #4294.2 (suite de #3623.9) — une pièce qui finit son envoi APRÈS le lancement de l'analyse.
 *
 * Le web borne l'attente à 10 s puis lance sans elle ; la pièce, restée `personal` (lisible par son auteur, donc
 * par son analyse), est rattachée au compte DÉJÀ ouvert par `PATCH /rag-documents/:id/scope`
 * (`RagService.updateScopeForUser`). Ce spec fige le côté SERVEUR de ce chemin sur un dépôt qui APPLIQUE les
 * `where` : même compte, même ligne, aucun doublon, aucune perte silencieuse.
 */

type Row = Record<string, unknown>
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const AUTHOR = 'author'

function fakeRepo(rows: Row[]) {
  const update = jest.fn(async (where: Row, patch: Row) => {
    let affected = 0
    for (const row of rows) {
      const matches = Object.entries(where).every(([column, value]) => {
        const actual = row[column]
        // `In([...])` du binder : un FindOperator dont `value` est la liste.
        const list = (value as { value?: unknown })?.value
        return Array.isArray(list) ? list.includes(actual) : actual === value
      })
      if (matches) {
        Object.assign(row, patch)
        affected += 1
      }
    }
    return { affected }
  })
  return { update, insert: jest.fn(), save: jest.fn(), rows }
}

function setup() {
  const rows: Row[] = [
    { id: 'early', user_id: AUTHOR, workspace_id: 'ws-1', scope: 'personal', account_id: null },
    { id: 'late', user_id: AUTHOR, workspace_id: 'ws-1', scope: 'personal', account_id: null },
    { id: 'colleague', user_id: 'colleague', workspace_id: 'ws-1', scope: 'personal', account_id: null },
  ]
  const repo = fakeRepo(rows)
  const accounts = { count: jest.fn().mockResolvedValue(1) }
  return {
    rows,
    repo,
    accounts,
    binder: new AnalysisAttachmentBinderService(repo as never),
    rag: new RagService(repo as never, accounts as never),
  }
}

describe('Rattachement tardif d’une pièce (#4294.2)', () => {
  it('la pièce arrivée après le lancement rejoint LE MÊME compte, sur la MÊME ligne (ni second dossier, ni doublon)', async () => {
    const { binder, rag, repo, rows } = setup()
    // Au lancement : seule la pièce déjà envoyée est connue du serveur.
    expect(await binder.bindToAccount(['early'], ACCOUNT, AUTHOR)).toBe(1)
    expect(rows.find(r => r.id === 'late')?.scope).toBe('personal') // pas perdue : lisible par son auteur

    // Plus tard : le web rattache la pièce tardive au compte déjà ouvert.
    const result = await rag.updateScopeForUser('late', AUTHOR, 'ws-1', 'account', null, ACCOUNT)

    expect(result.type).toBe('success')
    expect(rows.find(r => r.id === 'late')).toMatchObject({ scope: 'account', account_id: ACCOUNT })
    expect(rows.filter(r => r.account_id === ACCOUNT).map(r => r.id)).toEqual(['early', 'late'])
    expect(rows).toHaveLength(3) // aucune ligne créée
    expect(repo.insert).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  it('le compte doit être de l’ESPACE : un compte étranger est refusé, la pièce reste `personal` (rien d’avalé)', async () => {
    const { rag, accounts, rows } = setup()
    accounts.count.mockResolvedValue(0)
    const result = await rag.updateScopeForUser('late', AUTHOR, 'ws-1', 'account', null, ACCOUNT)
    expect(result).toEqual({
      type: 'failure',
      problem: { code: 'account_not_in_workspace', message: expect.any(String) as string },
    })
    expect(rows.find(r => r.id === 'late')?.scope).toBe('personal')
  })

  it('la pièce d’un collègue ne se rattache jamais, et le refus est NOMMÉ (not_found), pas silencieux', async () => {
    const { rag, rows } = setup()
    const result = await rag.updateScopeForUser('colleague', AUTHOR, 'ws-1', 'account', null, ACCOUNT)
    expect(result).toEqual({ type: 'failure', problem: { code: 'not_found', message: 'Document introuvable' } })
    expect(rows.find(r => r.id === 'colleague')?.scope).toBe('personal')
  })

  it('un échec d’écriture se NOMME (update_failed) : la pièce reste `personal`, le web le lit sur la pièce', async () => {
    const { rag, repo } = setup()
    repo.update.mockRejectedValueOnce(new Error('db down'))
    const result = await rag.updateScopeForUser('late', AUTHOR, 'ws-1', 'account', null, ACCOUNT)
    expect(result.type === 'failure' && result.problem.code).toBe('update_failed')
  })

  it('rejouer le rattachement est sans effet de bord : même état, et le lancement ne ré-attrape pas une pièce déjà rangée', async () => {
    const { binder, rag, rows } = setup()
    await rag.updateScopeForUser('late', AUTHOR, 'ws-1', 'account', null, ACCOUNT)
    await rag.updateScopeForUser('late', AUTHOR, 'ws-1', 'account', null, ACCOUNT)
    // Le binder de lancement ne bouge que `personal` : une pièce déjà rangée garde son compte.
    expect(await binder.bindToAccount(['late'], 'autre-compte', AUTHOR)).toBe(0)
    expect(rows.find(r => r.id === 'late')).toMatchObject({ scope: 'account', account_id: ACCOUNT })
  })
})
