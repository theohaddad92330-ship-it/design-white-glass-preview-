import { getTranslations } from 'next-intl/server'
import { Text } from '@bellum/ui'
import { SiteLayout } from '@/components/SiteLayout'
import { Link } from '@/i18n/navigation'
import { PRIMARY_BUTTON } from '@/lib/button-styles'

export default async function NotFound() {
  const t = await getTranslations('common')
  return (
    <SiteLayout>
      <section className="relative flex min-h-[70dvh] items-center justify-center overflow-hidden px-6 py-32 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[340px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.4),transparent_70%)] blur-[80px]" />
        <div className="relative z-10 mx-auto max-w-lg">
          <Text element="p" weight="bold" className="text-gradient-em text-6xl leading-none">
            404
          </Text>
          <Text
            element="h1"
            weight="medium"
            color="text-white"
            className="mt-6 text-[clamp(24px,3vw,34px)] leading-tight"
          >
            {t('notFound.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-md leading-relaxed">
            {t('notFound.description')}
          </Text>
          <div className="mt-8 flex justify-center">
            <Link href="/" className={PRIMARY_BUTTON}>
              {t('notFound.cta')}
            </Link>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
}
