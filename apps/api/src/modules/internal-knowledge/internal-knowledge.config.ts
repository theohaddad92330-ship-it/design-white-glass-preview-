type ServiceAccountKey = { client_email: string; private_key: string }

export type InternalKnowledgeConfig = {
  serviceAccount: ServiceAccountKey
  folderIds: string[]
  /** INTERNAL_KNOWLEDGE_KEEP_CONTACTS=true — désactive le masquage e-mails/téléphones (défaut : masqué). */
  keepContacts: boolean
}

/**
 * #3586.1 — sans `INTERNAL_KNOWLEDGE_DRIVE_SA_JSON` ET `INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS`
 * (ou avec une clé illisible) : `null` = no-op STRICT, zéro appel réseau. Aucune valeur n'est jamais
 * journalisée ni mise dans une erreur.
 */
export function readInternalKnowledgeConfig(
  env: Record<string, string | undefined> = process.env,
): InternalKnowledgeConfig | null {
  const raw = env.INTERNAL_KNOWLEDGE_DRIVE_SA_JSON?.trim()
  const folderIds = Array.from(
    new Set(
      (env.INTERNAL_KNOWLEDGE_DRIVE_FOLDER_IDS ?? '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean),
    ),
  )
  if (!raw || folderIds.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const key = parsed as Partial<ServiceAccountKey> | null
  if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') return null
  if (!key.client_email || !key.private_key) return null

  return {
    serviceAccount: { client_email: key.client_email, private_key: key.private_key },
    folderIds,
    keepContacts: env.INTERNAL_KNOWLEDGE_KEEP_CONTACTS?.trim().toLowerCase() === 'true',
  }
}
