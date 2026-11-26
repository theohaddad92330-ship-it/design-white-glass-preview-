import { REFERENCE_ARCHIVE_KEY, WORKING_COPY_OF_KEY } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'

/** Ce qui distingue la copie de son archive dans une liste de comptes. */
export const WORKING_COPY_SUFFIX = ' — copie de travail'

/** Colonnes d'identité : un seul compte ACTIF par registre (index uniques), l'archive les garde. */
const IDENTITY_COLUMNS = ['siren', 'registry_id', 'registry_country'] as const

/**
 * Théo A comptes-fiche-reference.A2 — les champs d'une COPIE DE TRAVAIL.
 *
 * L'archive reste intacte à côté ; la copie en reprend le contenu (`raw_analysis`
 * sans la portée figée, qui n'a plus de sens : la copie est actualisable) et
 * nomme son origine. Les verrous de rafraîchissement ne se copient pas, ni
 * l'identité de registre (index unique par espace).
 */
export function buildWorkingCopyFields(archive: AccountEntity): Partial<AccountEntity> {
  const { id: _id, created_at: _created, updated_at: _updated, ...rest } = archive
  const fields: Record<string, unknown> = { ...rest }
  for (const column of IDENTITY_COLUMNS) fields[column] = null
  for (const key of Object.keys(fields)) {
    if (key.endsWith('_refresh_lock_at')) fields[key] = null
  }
  const { [REFERENCE_ARCHIVE_KEY]: _scope, ...content } = (archive.raw_analysis ?? {}) as Record<string, unknown>
  return {
    ...fields,
    company_name: `${archive.company_name}${WORKING_COPY_SUFFIX}`,
    commercial_status: 'inbox',
    raw_analysis: { ...content, [WORKING_COPY_OF_KEY]: archive.id },
  } as unknown as Partial<AccountEntity>
}
