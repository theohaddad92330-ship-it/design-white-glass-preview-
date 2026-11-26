import type { NumberExplanation } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { Completeness } from '../primitives/Completeness'

/**
 * LE PANNEAU — les six lignes du PDF 6 §5.1, dans l'ordre de la source.
 *
 *   FORMULE     consultants sans affectation active / effectif total
 *   CALCUL      7 / 56
 *   SOURCE      mission_assignments, recalculé à 06:12
 *   COMPLÉTUDE  94 % — 3 consultants sans affectation renseignée
 *   SEUIL       < 5 % piloté · > 15 % critique
 *   DÉCISION    si > 10 % : plan de push profils, revue des TJM
 *
 * ⚠️ La COMPLÉTUDE n'est pas rendue ici : elle passe par la primitive
 * `<Completeness>`, qui applique `deriveCompleteness`. Réécrire la phrase à cet
 * endroit ferait un second calcul de part — « une dérivation vit à un seul
 * endroit », et deux chemins qui la refont divergent (l'un arrondira, l'autre
 * pas). C'est la même raison qui a fait sortir `deriveCompleteness` du composant
 * le jour où l'API a eu besoin de poser le même dénominateur.
 *
 * SEUIL et DÉCISION disparaissent quand ils n'existent pas. On n'invente ni un
 * seuil ni une consigne : une ligne « Seuil : —' » apprend à ignorer le panneau.
 */
export function ExplainPanel({ explanation }: { explanation: NumberExplanation }) {
  const { t } = useTranslation('explain')

  return (
    <Box className="flex w-[min(22rem,80vw)] max-w-full flex-col gap-3 p-4">
      <Row label={t('rows.formula')}>{explanation.formula}</Row>
      {/* `calculation` ne peut pas être `null` ici : `canExplainNumber` a déjà
          refusé le geste dans ce cas, et le panneau n'existe donc pas. */}
      <Row label={t('rows.calculation')}>{explanation.calculation}</Row>
      <Row label={t('rows.source')}>
        {explanation.source.computedAt === null
          ? explanation.source.label
          : t('sourceWithTime', {
              label: explanation.source.label,
              time: new Date(explanation.source.computedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
      </Row>

      <Box className="flex flex-col gap-0.5">
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wide">
          {t('rows.completeness')}
        </Text>
        <Completeness
          counted={explanation.completeness.counted}
          total={explanation.completeness.total}
          of={t(`population.${explanation.metric}`)}
          excluded={explanation.completeness.excluded}
        />
      </Box>

      {explanation.thresholds.length > 0 && <Row label={t('rows.threshold')}>{explanation.thresholds.join(' · ')}</Row>}
      {explanation.decision !== null && <Row label={t('rows.decision')}>{explanation.decision}</Row>}
    </Box>
  )
}

/** Une ligne : son intitulé au-dessus, sa valeur en dessous. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="flex flex-col gap-0.5">
      <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wide">
        {label}
      </Text>
      {/* Pas de `full` : la borne de lecture est un cliquet à zéro échappatoire
          (GA-34), et le panneau fait 22 rem — bien en deçà des 70 caractères. */}
      <Text size="sm" color="text-[var(--bellum-text-primary)]">
        {children}
      </Text>
    </Box>
  )
}
