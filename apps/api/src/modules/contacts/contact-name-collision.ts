import type { Repository } from 'typeorm'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { normalizeFullName } from './contact-identity'

/**
 * #4479 — la clé `idx_contacts_account_normalized_name` : UN nom normalisé par
 * compte (`bellum_normalize_name(full_name)`, que `normalizeFullName` reflète à
 * l'octet près). Une écriture qui l'ignore déclenche un 23505 — 284 en 1 h 30.
 *
 * Doctrine : on ne FUSIONNE jamais ici. Une écriture qui rencontre le nom d'une
 * fiche déjà là la REPÉRE (et la rend), elle ne la modifie pas : fusionner
 * reste une proposition que l'utilisateur accepte.
 */
export const CONTACT_NAME_INDEX = 'idx_contacts_account_normalized_name'

/** Le 23505 de CETTE clé — pas une autre contrainte d'unicité, qui doit continuer de remonter. */
export function isContactNameCollision(cause: unknown): boolean {
  const err = cause as {
    code?: string
    constraint?: string
    message?: string
    driverError?: { code?: string; constraint?: string; message?: string }
  }
  const code = err?.code ?? err?.driverError?.code
  if (code !== '23505') return false
  const constraint = err?.constraint ?? err?.driverError?.constraint
  if (constraint) return constraint === CONTACT_NAME_INDEX
  return `${err?.message ?? ''} ${err?.driverError?.message ?? ''}`.includes(CONTACT_NAME_INDEX)
}

/** Les noms déjà portés sur un compte : nom normalisé → identifiant de la fiche. Une lecture, pas une écriture. */
export async function nameHoldersOfAccount(
  repo: Pick<Repository<ContactEntity>, 'find'>,
  accountId: string,
): Promise<Map<string, string>> {
  const rows = await repo.find({
    // Fiches écartées COMPRISES : l'index n'a pas de prédicat `deleted_at`, une fiche supprimée tient sa clé.
    where: { account_id: accountId },
    select: ['id', 'full_name'],
  })
  const holders = new Map<string, string>()
  for (const row of rows) {
    const key = normalizeFullName(row.full_name)
    if (key && !holders.has(key)) holders.set(key, row.id)
  }
  return holders
}

/** La fiche qui porte déjà ce nom sur ce compte (lecture exacte, sous l'index), ou `null`. */
export async function findNameHolder(
  repo: Pick<Repository<ContactEntity>, 'find'>,
  accountId: string,
  fullName: string,
): Promise<{ id: string } | null> {
  const key = normalizeFullName(fullName)
  if (!key) return null
  const id = (await nameHoldersOfAccount(repo, accountId)).get(key)
  return id ? { id } : null
}
