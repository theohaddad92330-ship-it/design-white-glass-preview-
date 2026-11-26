import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * #2148.4 (#2848) — « réutiliser avant de rechercher » (#2148, étape 3 de
 * l'ordre canonique de résolution : « analyses précédemment réalisées dans le
 * même workspace »). Laura ne devine pas si un compte est déjà connu — elle le
 * CHERCHE dans le portefeuille avant de proposer une nouvelle analyse payante.
 *
 * Bornée aux comptes déjà ANALYSÉS (`status: 'completed'`) — c'est le
 * répertoire d'`GET /accounts` et de `AccountsService.findAccountsByWorkspace`
 * (mêmes filtres `q`/`sector` que l'écran), jamais un second calcul.
 *
 * Au moins UN critère : sans critère, la liste rendrait les comptes les plus
 * RÉCEMMENT créés — une liste qui a l'air d'une réponse et n'en est pas une,
 * même garde-fou que `CopilotContactsSearchDto` (#2294).
 */
export class CopilotAccountsSearchDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Texte libre : le nom de l'entreprise (ILIKE, comme l'écran Comptes). */
      query: z.string().trim().min(1).max(120).optional(),
      /** Le secteur du compte (`accounts.sector`, ILIKE, comme l'écran). */
      sector: z.string().trim().min(1).max(120).optional(),
      limit: z.number().int().min(1).max(25).optional(),
      /** #4065 — le listing complet, EXPLICITE, paginé (`offset`) avec son total. */
      listAll: z.literal(true).optional(),
      offset: z.number().int().min(0).max(10_000).optional(),
    })
    .strict()
    .refine(v => Boolean(v.listAll || v.query || v.sector), { message: 'at_least_one_criterion' }),
) {}
