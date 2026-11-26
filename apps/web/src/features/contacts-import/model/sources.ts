/**
 * Théo B c3-imports-sources.R2 — les sources d'import de contacts. Une carte = une façon de FOURNIR le tableau ;
 * toutes mènent à la même vérification avant import (`/contacts/import`). La clé voyage dans l'URL (`?source=`).
 *
 * « Messagerie & contacts » (choisir des personnes dans l'annuaire Gmail / Outlook) n'a pas de carte ici : la
 * lecture de l'annuaire du fournisseur n'existe pas côté serveur, et on n'affiche pas ce qu'on n'a pas.
 */
export const IMPORT_SOURCE_KEYS = ['file', 'paste', 'address-book', 'crm', 'laura'] as const
export type ImportSourceKey = (typeof IMPORT_SOURCE_KEYS)[number]

/** Les sources qui mènent à l'assistant (Laura, elle, ouvre une conversation). */
export const ASSISTANT_SOURCE_KEYS = [
  'file',
  'paste',
  'address-book',
  'crm',
] as const satisfies readonly ImportSourceKey[]

export function importSourceFrom(value: unknown): ImportSourceKey {
  return IMPORT_SOURCE_KEYS.find(key => key === value) ?? 'file'
}

/** Clé i18n de chaque source (`contactsImport.sources.<clé>`). */
export const SOURCE_I18N_KEY: Record<ImportSourceKey, 'file' | 'paste' | 'addressBook' | 'crm' | 'laura'> = {
  file: 'file',
  paste: 'paste',
  'address-book': 'addressBook',
  crm: 'crm',
  laura: 'laura',
}
