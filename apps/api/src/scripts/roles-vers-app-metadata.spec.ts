import { mergeRoles, runRolesMigration, type RolesAdminClient, type RolesUser } from './roles-vers-app-metadata'

/**
 * fix/roles-app-metadata — la BASCULE des opérateurs existants. Les rôles ne
 * sont plus lus dans `user_metadata` : sans ce script, un opérateur dont le rôle
 * n'est posé que là perdrait son accès au déploiement. Dry-run par défaut,
 * `--apply` fusionne dans `app_metadata` et retire de `user_metadata`.
 */
function fakeAdmin(initial: RolesUser[]) {
  const users = initial.map(u => ({
    ...u,
    user_metadata: { ...u.user_metadata },
    app_metadata: { ...u.app_metadata },
  }))
  const updateUserById = jest.fn(
    async (
      id: string,
      attrs: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> },
    ): Promise<{ error: null }> => {
      const user = users.find(u => u.id === id)
      if (!user) throw new Error('unknown user')
      // Même fusion que GoTrue : clés de premier niveau fusionnées, `null` retire la clé.
      for (const [target, patch] of [
        [user.app_metadata, attrs.app_metadata],
        [user.user_metadata, attrs.user_metadata],
      ] as const) {
        for (const [key, value] of Object.entries(patch ?? {})) {
          if (value === null) delete target[key]
          else target[key] = value
        }
      }
      return { error: null }
    },
  )
  const listUsers = jest.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }))
  const admin: RolesAdminClient = { listUsers, updateUserById }
  return { admin, users, listUsers, updateUserById }
}

const OPERATOR: RolesUser = {
  id: 'op-1',
  email: 'operateur@bellum-ai.com',
  user_metadata: { first_name: 'Ana', roles: ['customer', 'backoffice'] },
  app_metadata: { provider: 'email', roles: ['partner'] },
}
const CUSTOMER: RolesUser = {
  id: 'cu-1',
  email: 'client@esn.fr',
  user_metadata: { roles: ['customer'] },
  app_metadata: { provider: 'email' },
}
const PLAIN: RolesUser = { id: 'pl-1', email: 'x@esn.fr', user_metadata: {}, app_metadata: {} }

describe('mergeRoles', () => {
  it('fusionne sans retirer, sans doublon, ordre conservé', () => {
    expect(mergeRoles(['partner', 'customer'], ['customer', 'backoffice'])).toEqual([
      'partner',
      'customer',
      'backoffice',
    ])
  })

  it('ignore ce qui n’est pas un tableau de chaînes', () => {
    expect(mergeRoles('backoffice', [1, 'backoffice'])).toEqual(['backoffice'])
  })
})

describe('runRolesMigration', () => {
  it('dry-run (défaut) : liste les opérateurs, n’écrit RIEN', async () => {
    const { admin, updateUserById } = fakeAdmin([CUSTOMER, OPERATOR, PLAIN])
    const lines: string[] = []
    const report = await runRolesMigration(admin, { apply: false, log: line => lines.push(line) })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(report.candidates).toEqual([
      {
        id: 'op-1',
        email: 'operateur@bellum-ai.com',
        roles: ['customer', 'backoffice'],
        merged: ['partner', 'customer', 'backoffice'],
      },
    ])
    expect(report.scanned).toBe(3)
    // E-mail en clair : l'opérateur doit savoir QUI bascule.
    expect(lines.join('\n')).toContain('operateur@bellum-ai.com')
  })

  it('pagine jusqu’à une page incomplète', async () => {
    const { admin, listUsers } = fakeAdmin([CUSTOMER, PLAIN, OPERATOR])
    await runRolesMigration(admin, { apply: false, log: () => undefined, perPage: 2 })
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('--apply : copie dans app_metadata (fusion) et retire roles de user_metadata', async () => {
    const { admin, users } = fakeAdmin([CUSTOMER, OPERATOR])
    const report = await runRolesMigration(admin, { apply: true, log: () => undefined })
    expect(report.applied).toBe(1)
    const op = users.find(u => u.id === 'op-1')
    expect(op?.app_metadata).toEqual({ provider: 'email', roles: ['partner', 'customer', 'backoffice'] })
    expect(op?.user_metadata).toEqual({ first_name: 'Ana' })
    // Un client sans rôle d'opérateur n'est pas touché.
    expect(users.find(u => u.id === 'cu-1')?.user_metadata).toEqual({ roles: ['customer'] })
  })

  it('idempotent : un second --apply n’écrit plus rien', async () => {
    const { admin, updateUserById } = fakeAdmin([CUSTOMER, OPERATOR])
    await runRolesMigration(admin, { apply: true, log: () => undefined })
    const second = await runRolesMigration(admin, { apply: true, log: () => undefined })
    expect(second.candidates).toEqual([])
    expect(updateUserById).toHaveBeenCalledTimes(1)
  })

  it('une écriture en échec se compte et se nomme, sans arrêter les autres', async () => {
    const { admin, updateUserById } = fakeAdmin([OPERATOR, { ...OPERATOR, id: 'op-2', email: 'b@bellum-ai.com' }])
    updateUserById.mockResolvedValueOnce({ error: { message: 'boom' } } as never)
    const lines: string[] = []
    const report = await runRolesMigration(admin, { apply: true, log: line => lines.push(line) })
    expect(report.applied).toBe(1)
    expect(report.failed).toEqual(['op-1'])
    expect(lines.join('\n')).toContain('ÉCHEC')
  })

  it('une lecture en échec ARRÊTE (jamais un silence pris pour « aucun opérateur »)', async () => {
    const { admin, listUsers } = fakeAdmin([OPERATOR])
    listUsers.mockResolvedValueOnce({ data: { users: [] }, error: { message: 'down' } } as never)
    await expect(runRolesMigration(admin, { apply: false, log: () => undefined })).rejects.toThrow('down')
  })
})
