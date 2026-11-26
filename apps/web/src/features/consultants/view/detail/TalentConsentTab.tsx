import { Badge, Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import type { Consultant } from '@bellum/contracts'
import { consentState, daysBeforeConsentExpiry } from '@bellum/contracts'
import { useTalentDeletionPreview } from '../../hooks'
import { useDataExit } from '@/lib/data-exit'

/**
 * L'onglet « Consentement & rétention » (PDF 3 §7.3).
 *
 * Il répond à la question qu'un candidat pose : « qu'est-ce que vous avez de
 * moi, et pourquoi ? » Une politique de rétention ne répond pas à ça — elle dit
 * quand on efface, pas ce qu'on détient.
 *
 * Le §7.3 exige un bouton qui LISTE avant d'exécuter. Il est ici, et il réutilise
 * l'aperçu de suppression : une seconde liste divergerait de la première, et il
 * faudrait alors choisir laquelle croire.
 */
export function TalentConsentTab({ talent }: { talent: Consultant }) {
  const { t } = useTranslation('consultants')
  // #2081.14 — le fichier des données d'un talent fait SORTIR des données
  // personnelles de l'espace : masqué quand la règle d'espace réserve
  // l'export aux administrateurs (ils répondent alors à la demande).
  const dataExit = useDataExit()
  const state = consentState(talent.consent, new Date())
  const days = daysBeforeConsentExpiry(talent.consent, new Date())
  const { data: preview } = useTalentDeletionPreview(talent.id)

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold">
            {t('consent.title')}
          </Text>
          {/* « Jamais recueilli » n'est PAS « expiré » : l'un demande de poser
              la question, l'autre de la reposer. */}
          <Badge variant={state === 'valid' ? 'success' : state === 'none' ? 'outline' : 'warning'}>
            {t(`consent.states.${state}`)}
          </Badge>
          {days !== null && state !== 'expired' ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('consent.daysLeft', { count: days })}
            </Text>
          ) : null}
        </div>

        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          <Row label={t('consent.givenAt')} value={formatDate(talent.consent.givenAt, { dateStyle: 'medium' })} />
          <Row label={t('consent.expiresAt')} value={formatDate(talent.consent.expiresAt, { dateStyle: 'medium' })} />
          <Row label={t('consent.basis')} value={talent.consent.basis} />
          {/* #2185.57 — ce que la personne a EXCLU de son accord, distinct de
              la base légale juste au-dessus. */}
          <Row label={t('consent.restrictions')} value={talent.consent.restrictions} />
          <Row label={t('consent.source')} value={talent.source ? t(`sources.${talent.source}`) : null} />
        </dl>
      </Card>

      <Card className="p-4">
        <Text size="sm" weight="semibold">
          {t('consent.dataTitle')}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('consent.dataIntro')}
        </Text>
        <ul className="mt-2 list-disc pl-5">
          {(preview?.deleted ?? []).map(line => (
            <li key={line.key}>
              <Text size="sm">{t(`delete.lines.${line.key}`, { count: line.count })}</Text>
            </li>
          ))}
          {(preview?.orphaned ?? []).map(line => (
            <li key={line.key}>
              <Text size="sm">{t(`delete.lines.${line.key}`, { count: line.count })}</Text>
            </li>
          ))}
          {(preview?.deleted ?? []).length === 0 && (preview?.orphaned ?? []).length === 0 ? (
            <li>
              <Text size="sm">{t('consent.nothingAttached')}</Text>
            </li>
          ) : null}
        </ul>
        {/* L'export part de la fiche affichée : proposer un second format
            demanderait de garantir qu'il dit la même chose. */}
        {dataExit.allowed ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              const blob = new Blob([JSON.stringify(talent, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = `donnees-${talent.id}.json`
              anchor.click()
              URL.revokeObjectURL(url)
            }}
          >
            {t('consent.export')}
          </Button>
        ) : null}
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation('consultants')
  return (
    <div className="flex flex-col">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm">{value ?? t('detail.notProvided')}</Text>
    </div>
  )
}
