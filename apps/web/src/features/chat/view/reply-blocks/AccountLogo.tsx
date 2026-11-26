import { useQuery } from '@tanstack/react-query'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { accountKeys, accountsApi } from '@/features/accounts/api'

/**
 * #1914.13 — LE LOGO D'UN COMPTE DANS UNE CARTE : SEULEMENT CELUI DE SA FICHE.
 *
 * Une carte est écrite par le modèle. Un domaine qu'il écrirait — inventé, mal
 * recopié, celui d'un homonyme — afficherait le logo d'une AUTRE société, avec
 * l'autorité d'une image. Le logo ne vient donc que du compte ENREGISTRÉ : la
 * carte doit mener à une vraie fiche `/accounts/<uuid>`, et c'est cette fiche
 * (`GET /accounts/:id`, la même clé de cache que l'écran du compte) qui fournit
 * le logo persisté et le site. Sans fiche, fiche introuvable ou en cours de
 * lecture : l'initiale.
 *
 * ⚠️ Le hook réseau vit dans un composant À PART, monté seulement quand la fiche
 * existe : une carte sans lien (la démonstration, un compte que Laura ne relie à
 * rien) ne demande aucun client de requêtes et ne lit rien.
 */
const ACCOUNT_FICHE = /^\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function AccountLogo({ name, href, twoLetters }: { name: string; href?: string | null; twoLetters?: boolean }) {
  const accountId = href?.trim().match(ACCOUNT_FICHE)?.[1] ?? null
  if (!accountId) return <CompanyAvatar name={name} size="sm" twoLetters={twoLetters} />
  return <RegisteredAccountLogo accountId={accountId} name={name} twoLetters={twoLetters} />
}

function RegisteredAccountLogo({
  accountId,
  name,
  twoLetters,
}: {
  accountId: string
  name: string
  twoLetters?: boolean
}) {
  const { data } = useQuery({
    queryKey: accountKeys.detail(accountId),
    queryFn: () => accountsApi.getOne(accountId),
    // Une fiche que le modèle aurait inventée rend un 404 : on n'insiste pas.
    retry: false,
    staleTime: 5 * 60_000,
  })
  return (
    <CompanyAvatar name={name} size="sm" logoUrl={data?.logo_url} website={data?.website} twoLetters={twoLetters} />
  )
}
