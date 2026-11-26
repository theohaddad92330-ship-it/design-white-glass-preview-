import { createClient } from '@supabase/supabase-js'

/**
 * fix/roles-app-metadata — BASCULE DES RÔLES VERS `app_metadata`.
 *
 *   pnpm --filter @bellum/api roles:app-metadata             # dry-run : liste, n'écrit rien
 *   pnpm --filter @bellum/api roles:app-metadata -- --apply  # écrit
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `SessionService.mapToSessionUser` lisait les rôles dans `user_metadata`, que
 * l'utilisateur modifie LUI-MÊME (PUT /auth/v1/user avec son jeton + clé anon) :
 * n'importe quel client pouvait s'attribuer `backoffice`. Les rôles se lisent
 * désormais dans `app_metadata`, que seule la clé de service écrit.
 *
 * Un opérateur dont le rôle n'était posé QUE dans `user_metadata` perdrait son
 * accès au déploiement : ce script le recopie. À lancer AVANT (ou juste après)
 * le déploiement du correctif — c'est un geste humain, jamais automatique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Parcourt TOUS les comptes (`auth.admin.listUsers`, paginé). Est concerné un
 * compte dont `user_metadata.roles` porte au moins un rôle autre que
 * `customer`. Pour chacun : id, e-mail en clair, rôles. Avec `--apply`, FUSIONNE
 * ces rôles dans `app_metadata.roles` (sans en retirer aucun) puis retire
 * `roles` de `user_metadata` (GoTrue fusionne les métadonnées clé par clé et
 * supprime une clé passée à `null`). Idempotent : un compte basculé n'a plus de
 * `user_metadata.roles`, il ne ressort pas au passage suivant.
 *
 * Une LECTURE en échec arrête tout (un silence n'est pas « aucun opérateur ») ;
 * une ÉCRITURE en échec se nomme et n'arrête pas les autres.
 */

export interface RolesUser {
  readonly id: string
  readonly email?: string | null
  readonly user_metadata?: Record<string, unknown> | null
  readonly app_metadata?: Record<string, unknown> | null
}

/** Le sous-ensemble de `supabase.auth.admin` dont le script a besoin. */
export interface RolesAdminClient {
  listUsers(params: {
    page: number
    perPage: number
  }): Promise<{ data: { users: readonly RolesUser[] }; error: { message: string } | null }>
  updateUserById(
    id: string,
    attributes: { app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> },
  ): Promise<{ error: { message: string } | null }>
}

export interface RolesCandidate {
  readonly id: string
  readonly email: string
  /** Les rôles lus dans `user_metadata`. */
  readonly roles: string[]
  /** Ce que `app_metadata.roles` vaudra après bascule. */
  readonly merged: string[]
}

export interface RolesMigrationReport {
  readonly scanned: number
  readonly candidates: RolesCandidate[]
  readonly applied: number
  readonly failed: string[]
}

const PER_PAGE = 1000

function stringRoles(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((r): r is string => typeof r === 'string') : []
}

/** Union ordonnée, sans doublon : on n'enlève JAMAIS un rôle déjà posé côté serveur. */
export function mergeRoles(existing: unknown, incoming: unknown): string[] {
  return [...new Set([...stringRoles(existing), ...stringRoles(incoming)])]
}

function candidateOf(user: RolesUser): RolesCandidate | null {
  const roles = stringRoles(user.user_metadata?.['roles'])
  if (!roles.some(role => role !== 'customer')) return null
  return {
    id: user.id,
    email: user.email ?? '',
    roles,
    merged: mergeRoles(user.app_metadata?.['roles'], roles),
  }
}

export async function runRolesMigration(
  admin: RolesAdminClient,
  options: { apply: boolean; log: (line: string) => void; perPage?: number },
): Promise<RolesMigrationReport> {
  const perPage = options.perPage ?? PER_PAGE
  const candidates: RolesCandidate[] = []
  let scanned = 0
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers page ${page} : ${error.message}`)
    const users = data?.users ?? []
    scanned += users.length
    for (const user of users) {
      const candidate = candidateOf(user)
      if (candidate) candidates.push(candidate)
    }
    if (users.length < perPage) break
  }

  const mode = options.apply ? 'APPLY' : 'DRY-RUN (rien n’est écrit ; --apply pour écrire)'
  options.log(`${mode} — ${scanned} compte(s) lu(s), ${candidates.length} à basculer.`)
  let applied = 0
  const failed: string[] = []
  for (const candidate of candidates) {
    options.log(
      `${candidate.id}  ${candidate.email}  user_metadata.roles=${JSON.stringify(candidate.roles)}  → app_metadata.roles=${JSON.stringify(candidate.merged)}`,
    )
    if (!options.apply) continue
    const { error } = await admin.updateUserById(candidate.id, {
      app_metadata: { roles: candidate.merged },
      user_metadata: { roles: null },
    })
    if (error) {
      failed.push(candidate.id)
      options.log(`  ÉCHEC ${candidate.id} ${candidate.email} : ${error.message}`)
    } else {
      applied += 1
    }
  }
  if (options.apply) options.log(`${applied} basculé(s), ${failed.length} échec(s).`)
  return { scanned, candidates, applied, failed }
}

async function main(): Promise<void> {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const report = await runRolesMigration(client.auth.admin as unknown as RolesAdminClient, {
    apply: process.argv.includes('--apply'),
    log: line => console.log(line),
  })
  if (report.failed.length > 0) process.exitCode = 1
}

// Sans cette garde, un simple `import` depuis un test ouvrirait un client Supabase.
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
