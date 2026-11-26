import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'
import { findAuditChainBreakLocation, type AuditChainStage, type AuditChainStageKey } from '../lib/audit-chain'

/**
 * #2090.15 / #2090.16 / #2090.17 — LA CHAÎNE, SES RUPTURES, ET LEUR PORTE.
 * #2066.1-.9 — désormais NEUF étapes fines (Contact → Capitalisation), plus
 * #2066.10/.17 — la conclusion NOMMÉE qui situe le premier endroit cassé.
 *
 * ⚠️ GA-35 — ce qui se clique se tabule. Seules les étapes en RUPTURE sont
 * cliquables (`<button type="button">`), les autres restent un simple
 * conteneur : rien à ouvrir dessus, un bouton qui ne fait rien tromperait le
 * clavier. `stage.ruptures` porte la MATIÈRE de chaque tension déclenchée —
 * lue une seule fois dans `lib/audit-chain.ts`, jamais recalculée ici.
 */
export function AuditChain({ stages }: { stages: readonly AuditChainStage[] }) {
  const { t } = useTranslation('commercialAudit')
  const [openStage, setOpenStage] = useState<AuditChainStageKey | null>(null)
  const open = stages.find(stage => stage.key === openStage) ?? null
  // #2066.10/.17 — un ENDROIT de la chaîne, jamais un jugement sur la
  // personne : `null` tant qu'aucune rupture n'a été mesurée, pas de
  // conclusion inventée sur un profil pauvre.
  const breakLocation = findAuditChainBreakLocation(stages)

  return (
    <section className="space-y-3">
      <div>
        <Text element="h2" size="lg" weight="semibold">
          {t('chain.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('chain.description')}
        </Text>
        {breakLocation ? (
          <Text element="p" size="sm" weight="medium" className="text-[var(--danger-soft-text)]">
            {breakLocation.beforeKey
              ? t('chain.conclusion.between', {
                  before: t(`chain.stage.${breakLocation.beforeKey}`),
                  stage: t(`chain.stage.${breakLocation.brokenKey}`),
                })
              : t('chain.conclusion.at', { stage: t(`chain.stage.${breakLocation.brokenKey}`) })}
          </Text>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex items-center gap-2">
            <ChainStageNode
              stage={stage}
              isOpen={openStage === stage.key}
              onToggle={() => setOpenStage(current => (current === stage.key ? null : stage.key))}
            />
            {index < stages.length - 1 ? (
              <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]" aria-hidden="true">
                →
              </Text>
            ) : null}
          </div>
        ))}
      </div>

      {open ? <RuptureDetail stage={open} /> : null}
    </section>
  )
}

function ChainStageNode({
  stage,
  isOpen,
  onToggle,
}: {
  stage: AuditChainStage
  isOpen: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('commercialAudit')
  const isRupture = stage.state === 'rupture'
  const stateLabel =
    stage.state === 'rupture'
      ? t('chain.state.rupture', { count: stage.ruptures.length })
      : t(`chain.state.${stage.state}`)

  const card = (
    <AuditCard className={`min-w-[9.5rem] space-y-1 ${isRupture ? 'border-[var(--bellum-danger)]' : ''}`}>
      <Text element="p" size="sm" weight="semibold">
        {t(`chain.stage.${stage.key}`)}
      </Text>
      <Text
        element="p"
        size="xs"
        className={isRupture ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-muted)]'}
      >
        {stateLabel}
      </Text>
    </AuditCard>
  )

  // #2090.17 — seule une étape en RUPTURE ouvre un détail : les autres n'ont
  // rien à révéler, un bouton inerte tromperait le clavier (GA-35).
  if (!isRupture) return card

  return (
    <button type="button" onClick={onToggle} aria-expanded={isOpen} className="text-left pointer-coarse:min-h-11">
      {card}
    </button>
  )
}

function RuptureDetail({ stage }: { stage: AuditChainStage }) {
  const { t } = useTranslation('commercialAudit')

  if (stage.ruptures.length === 0) {
    return (
      <AuditCard className="space-y-1">
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t(`chain.state.${stage.state}`)}
        </Text>
      </AuditCard>
    )
  }

  return (
    <div className="space-y-3">
      {stage.ruptures.map(rupture => (
        <AuditCard key={rupture.ruleId} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Text element="h3" size="sm" weight="semibold">
              {t(`tensions.rule.${rupture.ruleId}.label`)}
            </Text>
            <ConfidenceBadge confidence={rupture.confidence} />
          </div>
          <Text element="p" size="sm">
            {rupture.tension}
          </Text>
          {rupture.facts.length > 0 ? (
            <div className="space-y-1">
              <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                {t('chain.facts')}
              </Text>
              <ul className="space-y-0.5">
                {rupture.facts.map(fact => (
                  <li key={fact}>
                    <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                      {fact}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rupture.possibleExplanation ? (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('chain.possibleExplanation')} : {rupture.possibleExplanation}
            </Text>
          ) : null}
          {rupture.questionToValidate ? (
            <Text element="p" size="sm" weight="medium">
              {t('chain.questionToValidate')} : {rupture.questionToValidate}
            </Text>
          ) : null}
          {rupture.consequenceIfUnaddressed ? (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('chain.consequenceIfUnaddressed')} : {rupture.consequenceIfUnaddressed}
            </Text>
          ) : null}
          {/* #2066.18 — chaque rupture porte AUSSI un geste concret et ce
              qu'il faudrait suivre pour vérifier qu'il a été fait. */}
          <Text element="p" size="sm" weight="medium">
            {t('chain.recommendation')} : {rupture.recommendation}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('chain.indicator')} : {rupture.indicator}
          </Text>
        </AuditCard>
      ))}
    </div>
  )
}
