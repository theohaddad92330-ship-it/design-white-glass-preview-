import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { MissionsPage } from '@/features/missions/view/MissionsPage'

/**
 * `?accountId=` / `?consultantId=` — LE LIEN DE SOURCE d'un bloc propagé (§4.4).
 *
 * Un agrégat du back-office — « ce client vous a rapporté X € sur N missions »,
 * « placé 4 fois » — se LIT sur la fiche et se CALCULE dans les missions. Il
 * porte donc un lien vers l'écran où il se calcule, construit par
 * `missionsOfAccount` / `missionsOfConsultant` (`packages/contracts`).
 *
 * ⚠️ Sans ce `validateSearch`, TanStack Router jette la recherche avant que
 * l'écran la voie : `/missions?accountId=…` ouvrait la liste ENTIÈRE des
 * missions. Un lien qui ne montre pas la source MENT sur la source, et c'est
 * pire qu'un lien absent — l'utilisateur clique « d'où vient ce chiffre ? » et
 * repart avec un dénominateur faux.
 *
 * `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre la liste
 * entière plutôt qu'une page en erreur — le choix déjà fait pour le board
 * (« un filtre mal formé ouvre le board ENTIER plutôt que de refuser »). Ce qui
 * rend le repli honnête, c'est que l'écran n'affiche alors AUCUNE pastille : il
 * n'affirme un périmètre que quand il en tient un.
 */
export const missionsSearchSchema = z.object({
  accountId: z.string().guid().optional().catch(undefined),
  consultantId: z.string().guid().optional().catch(undefined),
  // #4351.1 — « En cours » n'est plus un onglet : la liste s'ouvre par ce choix,
  // posé par le bouton « Liste des missions » de Planning.
  vue: z.literal('liste').optional().catch(undefined),
})

export const Route = createFileRoute('/missions/')({
  validateSearch: missionsSearchSchema,
  // #4351.1 — l'adresse NUE ouvre Planning ; un lien de source (`?accountId=`,
  // `?consultantId=`) ou `?vue=liste` ouvre la liste, comme avant.
  beforeLoad: ({ search }) => {
    if (search.accountId === undefined && search.consultantId === undefined && search.vue === undefined) {
      throw redirect({ to: '/missions/planification' })
    }
  },
  component: MissionsPage,
})
