import type { CoverageGapsResponse } from '@bellum/contracts'
import { Card, CardContent, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** Les 5 composants de la grille p29, dans l'ordre du rapport — c'est l'ordre
 *  que Théo lit, on ne le réordonne pas par valeur. */
const CONFIDENCE_COMPONENTS = ['identity', 'freshness', 'coverage', 'sources', 'consistency'] as const

type ConfidenceComponentKey = (typeof CONFIDENCE_COMPONENTS)[number]

type Confidence = NonNullable<CoverageGapsResponse['confidence']>

/** Même échelle de couleur que le compteur de couverture : rouge sous 34,
 *  orange sous 66, vert au-dessus. Un composant faible se repère sans lire. */
function componentColorVar(value: number): string {
  if (value >= 66) return 'var(--bellum-success)'
  if (value >= 34) return 'var(--bellum-warning)'
  return 'var(--bellum-danger)'
}

/**
 * Le DÉTAIL de la confiance donnée /100 (rapport TF1 p29). Le serveur calcule
 * les cinq composants depuis toujours (`coverage.service.ts`), mais l'écran
 * n'affichait que leur moyenne : un « 61/100 » ne dit pas au commercial CE QU'IL
 * DOIT CORRIGER. Chaque composant est donc rendu avec son nom métier, sa valeur
 * sur 100 et ce qui le fait monter.
 *
 * Un composant absent du payload (réponse mise en cache avant son ajout) n'est
 * pas affiché : jamais un 0 inventé à la place d'une valeur inconnue.
 */
export function ConfidenceBreakdown({ confidence }: { confidence: Confidence }) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'coverage' })

  const components = CONFIDENCE_COMPONENTS.flatMap((key: ConfidenceComponentKey) => {
    const value = confidence[key]
    return typeof value === 'number' && Number.isFinite(value) ? [{ key, value }] : []
  })
  // #2307.7/#2307.2 — « personnes vérifiées » et « scope résolu » : DIAGNOSTIC,
  // ne participent PAS à la moyenne p29 ci-dessus (`confidence.score` reste
  // calculé sur les 5 composants seuls). Absents d'un payload mis en cache
  // avant leur ajout ⇒ rien n'est affiché, jamais un 0 inventé (même règle que
  // les 5 autres).
  const diagnostics = (['verified', 'scope'] as const).flatMap(key => {
    const value = confidence[key]
    return typeof value === 'number' && Number.isFinite(value) ? [{ key, value }] : []
  })
  if (components.length === 0 && diagnostics.length === 0) return null

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="min-w-0">
          <Text element="h3" size="sm" weight="semibold">
            {t('confidenceSectionTitle')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
            {t('confidenceSectionDescription')}
          </Text>
        </div>

        <ul className="space-y-3">
          {components.map(({ key, value }) => (
            <li key={key}>
              <ConfidenceComponentRow
                label={t(`confidenceComponents.${key}.label`)}
                hint={t(`confidenceComponents.${key}.hint`)}
                value={value}
              />
            </li>
          ))}
        </ul>

        {diagnostics.length > 0 && (
          <div className="border-t border-[var(--bellum-border)] pt-4 space-y-3">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mb-2">
              {t('confidenceVerifiedSectionHint')}
            </Text>
            {diagnostics.map(({ key, value }) => (
              <ConfidenceComponentRow
                key={key}
                label={t(`confidenceComponents.${key}.label`)}
                hint={t(`confidenceComponents.${key}.hint`)}
                value={value}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Une ligne composant : nom, valeur/100 et barre colorée — factorisée entre
 *  les 5 composants p29 et le diagnostic « personnes vérifiées » (#2307.7)
 *  pour ne porter qu'une seule fois la grammaire de mouvement (GA-25). */
function ConfidenceComponentRow({ label, hint, value }: { label: string; hint: string; value: number }) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'coverage' })
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Text size="sm" weight="medium" className="min-w-0 truncate">
          {label}
        </Text>
        {/* Toujours le dénominateur : « 42 » seul ne veut rien dire. */}
        <Text size="sm" weight="semibold" className="shrink-0 font-mono">
          {t('confidenceComponentValue', { value })}
        </Text>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, backgroundColor: componentColorVar(value) }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {hint}
      </Text>
    </>
  )
}
