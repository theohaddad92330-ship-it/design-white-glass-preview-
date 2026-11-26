import { createFileRoute, useParams } from '@tanstack/react-router'
import { i18n } from '@/i18n'
import { usePublicShare } from '@/features/share/hooks/usePublicShare'
import { PublicShareLoading, PublicShareNotFound, PublicSharePage } from '@/features/share/view/PublicSharePage'

export const Route = createFileRoute('/share/$slug')({
  component: SharePage,

  head: () => ({
    meta: [
      {
        name: 'description',
        content: i18n.t('routes:share.description'),
      },
      {
        title: i18n.t('routes:share.title'),
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
    ],
    styles: [
      {
        media: 'all and (max-width: 500px)',
        children: `p {
                  color: blue;
                  background-color: yellow;
                }`,
      },
    ],
  }),
})

function SharePage() {
  const { slug } = useParams({ from: '/share/$slug' })
  const { data, isLoading, isError } = usePublicShare(slug)

  if (isLoading) return <PublicShareLoading />
  if (isError || !data) return <PublicShareNotFound />

  return <PublicSharePage payload={data} />
}
