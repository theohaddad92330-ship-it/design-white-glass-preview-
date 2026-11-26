import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { importSourceFrom } from '@/features/contacts-import/model/sources'
import { ImportAssistantPage } from '@/features/contacts-import/view/ImportAssistantPage'

/**
 * `/contacts/import` — l'assistant d'import de contacts (Théo B c4-assistant-import).
 * `source` voyage dans l'URL (bookmarkable) ; une valeur inconnue ouvre la source « Fichier », jamais un écran cassé.
 */
export const Route = createFileRoute('/contacts/import')({
  validateSearch: z.object({
    source: z
      .string()
      .optional()
      .catch(undefined)
      .transform(value => importSourceFrom(value)),
  }),
  component: ImportAssistantPage,
})
