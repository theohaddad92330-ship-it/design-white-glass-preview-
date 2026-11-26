import { decisionRoleSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #2294 — Laura retrouve un contact à travers TOUS les comptes de l'espace
 * (« qui connaît-on chez X », « quel DSI a déjà échangé avec nous »).
 *
 * Au moins UN critère : sans critère, la liste de contacts rend les derniers
 * contacts CRÉÉS — une liste qui a l'air d'une réponse et n'en est pas une.
 * Plafond 25 (pas les 100 de l'écran) : ce qui part au modèle se paie à chaque
 * tour, et l'écran Contacts reste la porte pour parcourir plus.
 */
export class CopilotContactsSearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Texte libre : nom, fonction, e-mail ou nom d'entreprise (ILIKE, comme l'écran). */
      query: z.string().trim().min(1).max(120).optional(),
      /** Le nom (partiel) de l'entreprise suivie. */
      company: z.string().trim().min(1).max(120).optional(),
      /** Le rôle d'achat, dans le vocabulaire partagé. */
      role: decisionRoleSchema.optional(),
      /** #2294.2 — le secteur du compte (`accounts.sector`, ILIKE). */
      sector: z.string().trim().min(1).max(120).optional(),
      /** #2294.2 — groupe ou filiale (`accounts.group_role`, égalité). */
      groupRole: z.enum(['groupe', 'filiale']).optional(),
      /** #2294.2 — fraîcheur min de la collecte de contacts, en mois. */
      contactsFreshWithinMonths: z.number().int().min(1).max(60).optional(),
      /**
       * #2367 (LAU-FINAL-035, entrée « territoire ») — la ville/le pays où
       * travaille le contact, même champ que l'écran Contacts
       * (`contactListQuerySchema.location`, #2158.61, ILIKE).
       */
      location: z.string().trim().min(1).max(120).optional(),
      limit: z.number().int().min(1).max(25).optional(),
      /**
       * #4065 — le LISTING complet, demandé EXPLICITEMENT (« donne-moi tous mes contacts ») :
       * lu page par page (`offset`) avec le total, jamais une première page présentée comme
       * la liste. Sans lui, la garde « au moins un critère » ci-dessous tient toujours.
       */
      listAll: z.literal(true).optional(),
      offset: z.number().int().min(0).max(10_000).optional(),
      /**
       * #4287.11 — « les N derniers contacts » : les contacts classés par DATE de dernière interaction
       * (e-mail envoyé, geste du journal), du plus récent au plus ancien. Un critère à lui seul.
       */
      recentFirst: z.literal(true).optional(),
      /**
       * #4982.3 — « mes contacts triés par zone » : le MÊME tri que le bouton « Trier par zone » de l'écran Contacts
       * (`ContactListQuery.sort`), jamais un second référentiel. Un critère à lui seul (comme `recentFirst`).
       */
      sort: z.literal('zone').optional(),
      /**
       * #4982.3 — « répartis mes contacts par région/département » : des COMPTES par zone sur tout le portefeuille
       * (même population et même zone que le tri), lieux inconnus comptés à part. Un critère à lui seul.
       */
      byZone: z.literal(true).optional(),
    })
    .strict()
    // #2294.2 / #2367 — sector/groupRole/contactsFreshWithinMonths/location
    // sont des critères aussi légitimes que `company` : un territoire SEUL
    // borne la recherche tout autant, il ne doit pas être refusé par ce
    // garde-fou.
    .refine(
      v =>
        Boolean(
          v.listAll ||
          v.recentFirst ||
          v.sort ||
          v.byZone ||
          v.query ||
          v.company ||
          v.role ||
          v.sector ||
          v.groupRole ||
          v.contactsFreshWithinMonths ||
          v.location,
        ),
      { message: 'at_least_one_criterion' },
    ),
) {}
