import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ContactDetailPage } from '@/features/contacts/view/contact-detail/ContactDetailPage'

/**
 * #2150.62 — L'OBJET D'ORIGINE, dans l'URL (`contactOrigin.ts`).
 *
 * Tout optionnel, et `catch` sur une valeur périmée : un lien partagé ou ancien
 * ouvre la fiche avec son fil d'Ariane d'avant, jamais un écran en erreur.
 */
const contactSearchObject = z.object({
  from: z.enum(['account']).optional().catch(undefined),
  fromId: z.string().min(1).optional().catch(undefined),
  fromTab: z.enum(['contacts', 'organigramme', 'overview']).optional().catch(undefined),
  // #3674.R1 — les filtres actifs de l'onglet Contacts au moment du clic sur la
  // fiche, pour que le fil d'Ariane les restaure (pas seulement le compte/onglet).
  fromQ: z.string().optional().catch(undefined),
  fromRole: z.string().optional().catch(undefined),
  fromEntity: z.string().optional().catch(undefined),
  fromLevel: z.string().optional().catch(undefined),
  fromPlace: z.string().optional().catch(undefined),
  // #3720.2 — onglet de la fiche ; les anciennes clés sont absorbées par `resolveContactTab`.
  tab: z.string().optional().catch(undefined),
})
type ContactSearch = z.output<typeof contactSearchObject>

/**
 * zod 3 typait l'ENTRÉE d'un `.catch()` en `unknown` ; zod 4 la resserre au type
 * du champ, ce qui refuserait les origines que `contactOrigin.ts` construit
 * (`from: 'list'`). On rend à l'entrée sa largeur d'avant — le comportement à
 * l'exécution, lui, ne change pas.
 */
const contactSearchSchema: z.ZodType<ContactSearch, { [K in keyof ContactSearch]?: unknown }> = contactSearchObject

export const Route = createFileRoute('/contacts/$id')({
  validateSearch: contactSearchSchema,
  component: ContactDetailPage,
})
