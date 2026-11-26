import type { Repository } from 'typeorm'
import { findPersonalConnection } from './personal-connection'

/**
 * Le défaut de confidentialité du PDF 7 (BEL-INT-604).
 *
 * `google_connections` et `microsoft_connections` portent un index UNIQUE sur
 * `(user_id, provider)` — donc une ligne par membre — et toutes les lectures se
 * faisaient par `workspace_id` avec un `findOne` SANS ordre. Dans un espace où
 * deux commerciaux avaient connecté leur compte, « Ma journée » de l'un pouvait
 * lire le Gmail de l'autre, et `getValidAccessToken` rendait le jeton DÉCHIFFRÉ
 * d'un collègue.
 */

// `created_at` est exigé par `ConnectionRow` depuis #4546 (plusieurs boîtes mail par
// commercial : c'est la date qui départage deux connexions du même fournisseur).
// Il ne change rien à ce que ce fichier prouve — l'isolement entre collègues.
type Row = {
  id: string
  user_id: string
  workspace_id: string | null
  provider: string
  created_at: Date
}

function repoOf(rows: Row[]): Repository<Row> {
  return {
    findOne: async ({ where }: { where: Partial<Row> }) =>
      rows.find(row => Object.entries(where).every(([key, value]) => row[key as keyof Row] === value)) ?? null,
  } as unknown as Repository<Row>
}

const MINE: Row = {
  id: 'mine',
  user_id: 'u-moi',
  workspace_id: 'ws',
  provider: 'google',
  created_at: new Date('2026-10-25T10:00:00Z'),
}
const COLLEAGUE: Row = {
  id: 'sien',
  user_id: 'u-collegue',
  workspace_id: 'ws',
  provider: 'google',
  created_at: new Date('2026-10-25T09:00:00Z'),
}

describe('une boîte mail est personnelle', () => {
  it('rend MA connexion, pas celle de mon collègue', async () => {
    // L'ordre des lignes est celui d'insertion : celle du collègue vient en
    // premier, et c'est exactement ce qu'un `findOne` par espace renvoyait.
    const found = await findPersonalConnection(repoOf([COLLEAGUE, MINE]), {
      userId: 'u-moi',
      workspaceId: 'ws',
      provider: 'google',
    })
    expect(found?.id).toBe('mine')
  })

  it('ne retombe PLUS sur la connexion de l’espace — #3087, une boîte mail est personnelle', async () => {
    // Décision Louis 26/09/2026 : le repli « connexion de l'espace » est retiré.
    // Un membre sans connexion propre ne voit AUCUN e-mail d'un collègue, même
    // au sein du même espace — il est invité à connecter la sienne.
    const found = await findPersonalConnection(repoOf([COLLEAGUE]), {
      userId: 'u-moi',
      workspaceId: 'ws',
      provider: 'google',
    })
    expect(found).toBeNull()
  })

  it('ne va pas chercher chez un AUTRE espace', async () => {
    const ailleurs: Row = { ...COLLEAGUE, workspace_id: 'ws-autre' }
    const found = await findPersonalConnection(repoOf([ailleurs]), {
      userId: 'u-moi',
      workspaceId: 'ws',
      provider: 'google',
    })
    expect(found).toBeNull()
  })

  it('rend null plutôt que n’importe quoi quand l’espace est inconnu', async () => {
    const found = await findPersonalConnection(repoOf([COLLEAGUE]), {
      userId: 'u-moi',
      workspaceId: null,
      provider: 'google',
    })
    expect(found).toBeNull()
  })

  it('ne confond pas deux fournisseurs', async () => {
    const microsoft: Row = { ...MINE, id: 'ms', provider: 'microsoft' }
    const found = await findPersonalConnection(repoOf([microsoft]), {
      userId: 'u-moi',
      workspaceId: 'ws',
      provider: 'google',
    })
    expect(found).toBeNull()
  })
})
