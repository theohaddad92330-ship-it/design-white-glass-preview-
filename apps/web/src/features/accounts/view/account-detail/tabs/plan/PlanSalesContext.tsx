import { Badge, Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { IdCard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { SalesContextAxis, SalesContextView } from './planViewData'

// Valeurs du contrat `@bellum/contracts` (sales-context.ts). Une valeur hors
// contrat est affichée telle quelle plutôt que masquée : mieux vaut un libellé
// brut qu'un écran qui ment par omission.
const KNOWN_STAGES = new Set(['freelance', 'petite', 'structuration', 'etablie', 'grande'])
const KNOWN_STRUCTURES = new Set(['founder_solo', 'founder_alternant', 'duo_trio', 'equipe', 'account_team'])
// #2645.2 — `inconnu` est volontairement ABSENT : un modèle de revenu non
// déclaré ne devient jamais un badge (GA-18/GA-19, « non mesuré n'est pas une
// valeur »). Il n'a donc pas non plus de clé i18n.
const KNOWN_REVENUE_MODELS = new Set(['recurrent', 'mixte', 'ponctuel'])
// #2645.1 — « inconnu » exclu à dessein : un rang non mesuré ne s'affiche
// jamais comme un fait (GA-18/19).
const KNOWN_RANK_POSITIONS = new Set(['rang1', 'rang2', 'mixte'])
const KNOWN_ARCHETYPES = new Set([
  'startup',
  'pme_eti',
  'grand_groupe',
  'banque_assurance',
  'public',
  'luxe_retail_media',
  'industrie',
  'international',
  'inconnu',
])
const KNOWN_STATES = new Set([
  'froid',
  'connu',
  'linkedin',
  'dormant',
  'refere',
  'ancien_client',
  'rang2',
  'client_actif',
  'besoin_ouvert',
  'partenaire_actif', // #2371.4
])

/**
 * Le PROFIL qui a produit les recommandations du dossier.
 *
 * DoD p31 n°6 : « chaque recommandation cite la règle, le profil et les preuves ».
 * La règle et les preuves étaient déjà citées (le « pourquoi » de chaque action,
 * la justification du mouvement). Le PROFIL, lui, n'atteignait aucun écran : le
 * SalesContext pilotait le mouvement d'ouverture, le score /25, le tri des
 * contacts et le choix des actions, et le commercial ne pouvait ni le voir ni le
 * contester. Une reco qu'on ne peut pas contester n'est pas une reco, c'est un
 * verdict.
 *
 * Lecture seule, additive : un dossier sans SalesContext n'affiche rien.
 */
export function PlanSalesContext({ salesContext }: { salesContext: SalesContextView | null }) {
  const { t } = useTranslation('accountDetail')
  if (!salesContext) return null

  const stageLabel = KNOWN_STAGES.has(salesContext.esnStage)
    ? t(`salesContext.stages.${salesContext.esnStage}`)
    : salesContext.esnStage
  const structureLabel =
    salesContext.salesStructure && KNOWN_STRUCTURES.has(salesContext.salesStructure)
      ? t(`salesContext.structures.${salesContext.salesStructure}`)
      : ''
  // #2645.2 — le fait qui a produit l'angle proposé ET les dates de relance.
  const revenueModelLabel =
    salesContext.revenueModel && KNOWN_REVENUE_MODELS.has(salesContext.revenueModel)
      ? t(`salesContext.revenueModels.${salesContext.revenueModel}`)
      : ''
  // #2645.1 — « clients finaux via un partenaire, rang 2 » : le rang que le
  // commercial a déclaré au questionnaire, quand il a été mesuré.
  const rankPositionLabel = KNOWN_RANK_POSITIONS.has(salesContext.rankPosition)
    ? t(`salesContext.rankPositions.${salesContext.rankPosition}`)
    : ''

  return (
    <motion.div variants={cardFade} className="p-1">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <IdCard className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('salesContext.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('salesContext.subtitle')}
          </Text>
        </div>

        <dl className="divide-y divide-[var(--bellum-border)]">
          {stageLabel ? (
            <Row label={t('salesContext.esnStage')}>
              <Badge variant="outline">{stageLabel}</Badge>
              {structureLabel ? <Badge variant="outline">{structureLabel}</Badge> : null}
              {revenueModelLabel ? <Badge variant="outline">{revenueModelLabel}</Badge> : null}
              {rankPositionLabel ? <Badge variant="outline">{rankPositionLabel}</Badge> : null}
            </Row>
          ) : null}

          {salesContext.account ? (
            <AxisRow
              label={t('salesContext.accountArchetype')}
              axis={salesContext.account}
              valueLabel={
                KNOWN_ARCHETYPES.has(salesContext.account.value)
                  ? t(`salesContext.archetypes.${salesContext.account.value}`)
                  : salesContext.account.value
              }
            />
          ) : null}

          {salesContext.relationship ? (
            <AxisRow
              label={t('salesContext.relationship')}
              axis={salesContext.relationship}
              valueLabel={
                KNOWN_STATES.has(salesContext.relationship.value)
                  ? t(`salesContext.states.${salesContext.relationship.value}`)
                  : salesContext.relationship.value
              }
            />
          ) : null}
        </dl>
      </Card>
    </motion.div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3">
      <dt>
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </dt>
      <dd className="mt-1.5 flex flex-wrap items-center gap-2">{children}</dd>
    </div>
  )
}

/** Un axe inféré : sa valeur, sa confiance, et les PREUVES qui l'ont produite.
 *  Sans preuve affichée, « compte froid » est une affirmation ; avec, c'est une
 *  déduction que le commercial peut corriger. */
function AxisRow({ label, axis, valueLabel }: { label: string; axis: SalesContextAxis; valueLabel: string }) {
  const { t } = useTranslation('accountDetail')
  const declared = axis.derivation === 'user_declared' || axis.derivation === 'user_override'

  return (
    <Row label={label}>
      <Badge variant={declared ? 'primary' : 'outline'}>{valueLabel}</Badge>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {declared ? t('salesContext.declared') : t('salesContext.inferred', { confidence: axis.confidence })}
      </Text>
      {axis.evidence.length > 0 ? (
        <Text size="xs" className="w-full break-words text-[var(--bellum-text-secondary)]">
          {t('salesContext.evidencePrefix')} {axis.evidence.join(' · ')}
        </Text>
      ) : null}
    </Row>
  )
}
