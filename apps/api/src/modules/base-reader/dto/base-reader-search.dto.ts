import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { BASE_READER_MAX_LIMIT, BASE_READER_MAX_OFFSET } from '../base-reader.limits'

/**
 * #4792 — ce qu'un appelant interne peut demander au lecteur commun de la base.
 *
 * ⚠️ `.strict()`, et ce n'est pas décoratif : « un paramètre d'API inconnu est avalé par Zod sans
 * erreur, et la liste revient entière ». Une faute de frappe sur un critère doit faire ÉCHOUER
 * l'appel, pas rendre la base entière sous un libellé qui promet un filtre.
 *
 * ⚠️ AUCUN critère n'est obligatoire, et c'est délibéré — contrairement à `CopilotAccountsSearchDto`,
 * qui l'exige. Ici, « sans critère » a un sens exact et utile : les lignes les plus récemment
 * collectées de l'espace, paginées, avec leur `total`. C'est la réponse à « qu'y a-t-il dans notre
 * base ? », pas une liste qui a l'air d'une réponse sans en être une.
 */
export class BaseReaderSearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Métier ou compétence, tels que la personne les nomme. Au plus dix : au-delà, ce n'est plus un critère. */
      terms: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
      city: z.string().trim().min(1).max(120).optional(),
      /** Départements — code (« 59 », « 2A ») ou nom (« Nord »). */
      departments: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
      regions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
      /** La période, sur la date de COLLECTE. Absente des deux côtés = aucune fenêtre. */
      from: z.string().trim().min(4).max(40).optional(),
      to: z.string().trim().min(4).max(40).optional(),
      families: z
        .array(z.enum(['accounts', 'needs', 'consultants']))
        .max(3)
        .optional(),
      /** Restreindre à des comptes déjà résolus (l'analyse d'UN compte, par exemple). */
      accountIds: z.array(z.string().guid()).max(50).optional(),
      /** #4794 — « comptes qui prennent des développeurs » : écarte les ESN franches. */
      excludeEsn: z.boolean().optional(),
      limit: z.number().int().min(1).max(BASE_READER_MAX_LIMIT).optional(),
      offset: z.number().int().min(0).max(BASE_READER_MAX_OFFSET).optional(),
    })
    .strict(),
) {}
