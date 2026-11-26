import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MessageBrief } from '@/lib/message-insight'

/**
 * #3694.4 — le brief compact en trois dimensions : ce que je veux obtenir
 * (objectif), où nous en sommes (relation), sujet ou angle. Il REPREND ce que le
 * moteur a lu au dossier (`brief` de `/message/generate`, chaque valeur avec sa
 * provenance) ; rien n'est inventé ici. Une suggestion est corrigeable :
 * « Corriger » ouvre les paramètres du message — un réglage vit à un seul
 * endroit (GA-26), ce bloc ne duplique aucun champ.
 *
 * Une absence ne fait aucune ligne (relation inconnue), sauf l'objectif
 * indéterminé, NOMMÉ « à préciser » : le manque n'empêche jamais de rédiger.
 */
export function MessageBriefSummary({
  brief,
  angle,
  onCorrect,
}: {
  brief: MessageBrief
  angle: string
  onCorrect: () => void
}) {
  const { t } = useTranslation('engagement')
  const objectiveMissing = !brief.objective && brief.missing.includes('objective')
  const trimmedAngle = angle.trim()

  return (
    <section
      aria-label={t('brief.aria')}
      className="min-w-0 rounded-md border border-[var(--bellum-border)] px-2.5 py-2"
    >
      <dl className="space-y-1 text-xs">
        {brief.objective ? (
          <BriefRow label={t('brief.objective')}>
            {t(`composer.parameters.objectives.${brief.objective}`)}
            <SourceTag source={brief.objectiveSource} />
          </BriefRow>
        ) : null}
        {brief.relationship ? (
          <BriefRow label={t('brief.relationship')}>
            {t(`accountDetail:salesContext.states.${brief.relationship}`)}
          </BriefRow>
        ) : null}
        <BriefRow label={t('brief.angle')}>{trimmedAngle || t('brief.angleDerived')}</BriefRow>
      </dl>
      {objectiveMissing ? (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('brief.toSpecify', { what: t('brief.objective').toLowerCase() })}
        </Text>
      ) : null}
      <Button type="button" variant="ghost" size="xs" className="mt-1 h-auto px-0" onClick={onCorrect}>
        {t('brief.correct')}
      </Button>
    </section>
  )
}

function BriefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-1.5">
      <dt className="text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="min-w-0 text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}

const SOURCES_WITH_LABEL = new Set(['formulaire', 'angle', 'relation', 'defaut'])

function SourceTag({ source }: { source: string }) {
  const { t } = useTranslation('engagement')
  // Une provenance inconnue du client ne s'affiche pas : on ne devine pas un libellé.
  if (!SOURCES_WITH_LABEL.has(source)) return null
  return <span className="ml-1.5 text-[var(--bellum-text-muted)]">({t(`brief.source.${source}`)})</span>
}
