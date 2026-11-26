import { Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { GLASS_BUTTON, PRIMARY_BUTTON } from '@/lib/button-styles'

/**
 * La sortie de la page.
 *
 * Elle envoie vers la démonstration et vers le produit, pas vers un formulaire
 * de création de compte : une page qui vient d'expliquer qu'on ne pousse
 * personne ne peut pas se terminer par la pression la plus forte du site. Les
 * deux destinations sont vérifiables par le lecteur lui-même, ce qui est
 * exactement ce que la page revendique.
 */
export function SafeguardsCta() {
  const t = useTranslations('safeguards')
  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute left-1/2 top-[30px] h-[340px] w-[220px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.45),transparent_70%)] blur-[80px]" />

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <Text element="h2" weight="medium" color="text-white" leading="tight" className="text-2xl sm:text-4xl">
          {t('cta.title')}
        </Text>
        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 text-center leading-relaxed">
          {t('cta.paragraph')}
        </Text>

        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/demo" className={cn(PRIMARY_BUTTON, 'w-full sm:w-auto')}>
            {t('cta.primary')}
          </Link>
          <Link href="/product" className={cn(GLASS_BUTTON, 'w-full sm:w-auto')}>
            {t('cta.secondary')}
          </Link>
        </div>
      </div>
    </section>
  )
}
