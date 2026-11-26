import { z } from 'zod'

/**
 * Knowledge library wire schemas — the reusable **templates** (email/call/pitch
 * copy), tactical **playbooks** (sales strategies) and curated **method
 * playbooks** (the ESN plan-de-compte method: multi-threading, thread achats,
 * champion→sponsor, approche C-level) shown in the Connaissances screen.
 * A workspace-scoped, team-shared resource (like `rag_documents`): every member
 * sees and edits the same library. New workspaces are lazily seeded with a
 * built-in starter set on first read. See `agent_docs/multi-user-workspaces.md`
 * and `agent_docs/knowledge-pack-v2.md` (method content anchors).
 */
export const libraryItemKindValues = ['template', 'playbook', 'method_playbook'] as const
export const libraryItemKindSchema = z.enum(libraryItemKindValues)
export type LibraryItemKind = z.infer<typeof libraryItemKindSchema>

export const libraryItemSchema = z.object({
  id: z.string().guid(),
  kind: libraryItemKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  /** Templates carry a category (Email/Appel/…); playbooks & method playbooks leave it null. */
  category: z.string().nullable(),
  /** Copy-ready content; `{{placeholders}}` are filled by the rep. */
  body: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type LibraryItem = z.infer<typeof libraryItemSchema>

/** Body of `POST /library-items`. */
export const createLibraryItemSchema = z.object({
  kind: libraryItemKindSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullish(),
  category: z.string().trim().max(100).nullish(),
  body: z.string().min(1).max(20000),
})
export type CreateLibraryItem = z.infer<typeof createLibraryItemSchema>

/** Body of `PATCH /library-items/:id`. `kind` is immutable. */
export const updateLibraryItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullable(),
    category: z.string().trim().max(100).nullable(),
    body: z.string().min(1).max(20000),
  })
  .partial()
  .refine(patch => Object.keys(patch).length > 0, { message: 'Aucun champ à mettre à jour' })
export type UpdateLibraryItem = z.infer<typeof updateLibraryItemSchema>
