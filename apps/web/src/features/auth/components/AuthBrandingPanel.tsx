import { useTranslation } from 'react-i18next'

/**
 * L'itinéraire 01-03 de la maquette `onboarding-accueil` (`.ob23-itinerary`) :
 * surtitre d'accent, puis trois étapes séparées d'un filet, le numéro en
 * chiffres discrets. Rubriques nommées, jamais un chiffre de décor.
 */
export function AuthBrandingPanel() {
  const { t } = useTranslation('auth')
  const steps = [1, 2, 3].map(n => ({
    n: `0${n}`,
    title: t(`branding.step${n}Title`),
    body: t(`branding.step${n}Body`),
  }))
  return (
    <aside className="border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-6 md:px-8 md:py-8 lg:border-l lg:border-t-0">
      <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
        {t('branding.kicker')}
      </span>
      <ol>
        {steps.map(step => (
          <li key={step.n} className="mt-5 flex gap-5 border-t border-[var(--bellum-border)] pt-5 md:mt-6 md:pt-6">
            <span className="pt-0.5 text-xs tabular-nums text-[var(--bellum-text-muted)]">{step.n}</span>
            <section>
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--bellum-text-secondary)]">{step.body}</p>
            </section>
          </li>
        ))}
      </ol>
    </aside>
  )
}
