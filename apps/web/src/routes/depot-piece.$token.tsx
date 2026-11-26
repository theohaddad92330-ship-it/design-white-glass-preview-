import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { i18n } from '@/i18n'
import { fetchContractUploadLinkStatus } from '@/features/contract-upload/api'
import {
  PublicContractUploadLoading,
  PublicContractUploadNotFound,
  PublicContractUploadPage,
} from '@/features/contract-upload/view/PublicContractUploadPage'

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — `/depot-piece/:token`, la porte
 * PUBLIQUE qu'un contact externe (client, partenaire) ouvre pour déposer une
 * pièce de contrat. Même patron que `/share/:slug` (route anonyme, pas de
 * shell applicatif) : aucune session, aucune sidebar.
 */
export const Route = createFileRoute('/depot-piece/$token')({
  component: ContractUploadRoute,
  head: () => ({
    meta: [{ title: i18n.t('contractUpload:loading') }],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
})

function ContractUploadRoute() {
  const { token } = useParams({ from: '/depot-piece/$token' })
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-contract-upload-link', token],
    queryFn: () => fetchContractUploadLinkStatus(token),
    retry: false,
    staleTime: 0,
  })

  if (isLoading) return <PublicContractUploadLoading />
  if (isError || !data || data.status !== 'valid') return <PublicContractUploadNotFound />
  return <PublicContractUploadPage token={token} status={data} />
}
