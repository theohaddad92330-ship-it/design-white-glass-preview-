import { MISSING_EXPERTISE_THRESHOLDS, type MissingExpertiseReport } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { useMissingExpertise } from '../hooks'

/**
 * « LE DÉTECTEUR D'EXPERTISE MANQUANTE » — PDF 4 §8.4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DIT, ET CE QU'IL REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Trois besoins Kubernetes fermés faute de profil ce trimestre. » C'est la
 * phrase qui compte, et elle reste vraie même sans montant.
 *
 * ⚠️ Le CA non adressé est une PROMESSE. Il ne s'affiche que lorsqu'il a pu être
 * chiffré à partir des TJM cibles RÉELLEMENT saisis et de durées réellement
 * renseignées. Trois états, jamais fondus :
 *
 *  - `measured`        — le montant s'affiche, avec ce qui est resté dehors ;
 *  - `not_chiffrable`  — aucun besoin ne porte à la fois un TJM et une durée.
 *                        L'écran dit « trois refus sur cette compétence » et
 *                        laisse le commercial conclure ;
 *  - `hidden`          — l'appelant n'a pas `finance:read`. Un montant masqué
 *                        n'est PAS un montant incalculable, et les écrire pareil
 *                        ferait chercher une donnée qui existe.
 *
 * On écrit « CA non adressé » et JAMAIS « CA perdu » : on ne sait pas si on
 * l'aurait gagné, et le dire autrement serait une probabilité déguisée.
 */
export function MissingExpertisePanel() {
  const { t } = useTranslation('consultants')
  const query = useMissingExpertise()

  const items = query.data?.items ?? []
  // Un panneau vide n'apprend rien : sous trois refus, il n'y a rien à dire.
  if (query.isPending || items.length === 0) return null

  return (
    // ⚠️ `shrink-0` — MÊME DÉFAUT QUE L'ENTÊTE DE LA FICHE, TROUVÉ DANS LA
    // MÊME RECETTE (09/09/2026). Mesuré sur `/consultants` : **32 px** rendus
    // pour un `scrollHeight` de **180 px**, donc le titre visible et tout le
    // contenu coupé. La cause est générale — une carte est un enfant de flex à
    // `flex: 0 1 auto`, elle a le droit de rétrécir, et `overflow-hidden`
    // l'empêche de le montrer. Celle-ci est ANTÉRIEURE au lot : elle a été
    // révélée en balayant l'écran, pas causée par lui.
    <Card className="shrink-0 p-4">
      <Text size="sm" weight="semibold" element="h2">
        {t('missingExpertise.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 block">
        {t('missingExpertise.rule', {
          count: MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill,
          // La fenêtre vient du SERVEUR : le seuil vit à un seul endroit, et
          // l'écran l'annonce plutôt que de la supposer.
          days: query.data?.windowDays ?? MISSING_EXPERTISE_THRESHOLDS.windowDays,
        })}
      </Text>

      <Box className="mt-3 flex flex-col gap-3">
        {items.map(item => (
          <SkillRow key={item.skill} item={item} />
        ))}
      </Box>
    </Card>
  )
}

function SkillRow({ item }: { item: MissingExpertiseReport }) {
  const { t } = useTranslation('consultants')

  return (
    <Box className="flex flex-col gap-1">
      <Text size="sm" weight="medium">
        {t('missingExpertise.headline', { skill: item.skill, count: item.refusedCount })}
      </Text>

      {item.revenueState === 'measured' && item.unaddressedRevenueCents !== null ? (
        <>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('missingExpertise.revenue', {
              amount: formatCents(item.unaddressedRevenueCents),
              count: item.countedNeeds,
            })}
          </Text>
          {/* Ce qui est resté DEHORS du montant, nommé. Sans cette ligne, un CA
              chiffré sur un besoin sur trois se lit comme un CA complet. */}
          {/* #3935 — « 0 sans durée renseignée » ne fait aucune ligne : seule la part non nulle se nomme. */}
          {(item.withoutRate > 0 || item.withoutDuration > 0) && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('missingExpertise.excludedPrefix')}{' '}
              {[
                item.withoutRate > 0 ? t('missingExpertise.excludedRate', { count: item.withoutRate }) : null,
                item.withoutDuration > 0
                  ? t('missingExpertise.excludedDuration', { count: item.withoutDuration })
                  : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
          )}
        </>
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {item.revenueState === 'hidden' ? t('missingExpertise.revenueHidden') : t('missingExpertise.revenueUnknown')}
        </Text>
      )}

      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {item.needs
          .slice(0, 3)
          .map(need => need.title)
          .filter(title => title.length > 0)
          .join(' · ')}
      </Text>
    </Box>
  )
}
