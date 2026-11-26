import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { accountDetailSearchSchema } from '@/features/accounts/view/account-detail/accountDetailSearch'
import { AccountDetailPage } from '@/features/accounts/view/account-detail/view/AccountDetailPage'

function AccountDetailRoute() {
  const search = Route.useSearch()
  return <AccountDetailPage initialTab={search.tab} />
}

/**
 * #4602 — un identifiant de compte porte toujours un chiffre (UUID). `/accounts/duplicates` n'est pas un compte : le
 * segment était avalé par ce paramètre et l'écran disait « Compte introuvable », nommant le mauvais problème. Une
 * adresse que rien ne génère est « Page introuvable » (#4359) ; le tri des doublons vit dans `/contacts`.
 */
const ACCOUNT_ID = /\d/

/** #4658 — `/accounts/analyze` (et `/analyse`) : le nom du verbe principal, pas un compte. Il mène à `/search`. */
const ANALYZE_ALIAS = /^analy[sz]e$/i

export const Route = createFileRoute('/accounts/$id')({
  beforeLoad: ({ params }) => {
    if (ANALYZE_ALIAS.test(params.id)) throw redirect({ to: '/search', replace: true })
    if (!ACCOUNT_ID.test(params.id)) throw notFound()
  },
  validateSearch: accountDetailSearchSchema,
  component: AccountDetailRoute,
})
