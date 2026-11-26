import type { RecordImportEntityType, UniversalImportScope, UniversalImportType } from '@bellum/contracts'

/**
 * #4051 — quelles fiches d'un paquet reçoivent « Importé le <date> depuis <fichier> », par famille de fiche.
 *
 * Reçoivent la trace : les fiches CRÉÉES (la famille du type du lot, plus les comptes créés depuis un fichier
 * contacts) et les fiches existantes COMPLÉTÉES par leur référence. Ne la reçoivent pas : un contact PERSONNEL
 * (aucune fiche d'équipe, donc aucun historique) et les familles sans historique de fiche (besoins, missions).
 * Une fiche touchée deux fois dans le paquet n'a qu'une trace.
 */
const ENTITY_OF_TYPE: Partial<Record<UniversalImportType, RecordImportEntityType>> = {
  account: 'account',
  contact: 'contact',
  talent: 'consultant',
}

export function importMarkGroups(params: {
  jobType: UniversalImportType
  scope: UniversalImportScope
  written: Iterable<string>
  accountsWritten: Iterable<string>
  filled: ReadonlyArray<{ id: string; target: 'account' | 'contact' }>
}): Array<{ entityType: RecordImportEntityType; ids: string[] }> {
  const byType = new Map<RecordImportEntityType, Set<string>>()
  const add = (entityType: RecordImportEntityType | undefined, ids: Iterable<string>) => {
    if (!entityType) return
    const set = byType.get(entityType) ?? new Set<string>()
    for (const id of ids) set.add(id)
    if (set.size > 0) byType.set(entityType, set)
  }
  add('account', params.accountsWritten)
  if (!(params.scope === 'personal' && params.jobType === 'contact')) {
    add(ENTITY_OF_TYPE[params.jobType], params.written)
  }
  for (const fill of params.filled) add(fill.target, [fill.id])
  return [...byType.entries()].map(([entityType, ids]) => ({ entityType, ids: [...ids] }))
}
