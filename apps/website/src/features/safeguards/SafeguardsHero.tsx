import { Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'

/**
 * L'entrée de la page « Garde-fous ».
 *
 * Le titre ne reprend PAS la formulation d'origine du pack (« pourquoi nous
 * n'enverrons jamais un message à votre place ») : elle est fausse dans ce
 * dépôt, et la raison est écrite dans `holders.ts`. Une page qui reproche aux
 * autres d'écrire des promesses invérifiables ne peut pas s'ouvrir sur une
 * promesse que son propre code dément.
 */
export function SafeguardsHero() {
  const t = useTranslations('safeguards')
  return (
    <section className="relative overflow-hidden pb-16 pt-36 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(124,58,237,0.22),transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-3xl animate-fade-up px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
          <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <Text element="span" size="xs" className="text-violet-200">
            {t('hero.kicker')}
          </Text>
        </span>

        <Text
          element="h1"
          weight="medium"
          color="text-white"
          leading="tight"
          className="mt-6 text-balance text-3xl lg:text-5xl"
        >
          {t('hero.title')}
        </Text>

        {/* `Text` borne le texte suivi à 70 caractères (D81) : c'est une page de
            lecture, et c'est ici que la règle compte le plus. Le `mx-auto` évite
            le bloc de 70 caractères collé à gauche sous un texte centré. */}
        <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-5 text-center leading-relaxed">
          {t('hero.lead')}
        </Text>
      </div>
    </section>
  )
}
