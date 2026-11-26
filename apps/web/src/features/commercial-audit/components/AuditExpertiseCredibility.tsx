import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  EXPERTISE_GROUNDING_KINDS,
  EXPERTISE_REFERENCE_CONFIDENTIALITIES,
  type ExpertiseGroundingKind,
  type ExpertiseAuditAxis,
  type ExpertiseCredibilityAuditEntry,
  type ExpertiseGrounding,
  type ExpertiseGroundingSourceOption,
} from '@bellum/contracts'
import { Button, Checkbox, SelectField, Text } from '@bellum/ui'
import { useExpertiseGroundingGesture, useExpertiseGroundings } from '../hooks/useExpertiseGroundings'
import { AuditCard } from './AuditCard'

const AXES = ['knowHow', 'proof', 'sellableNow'] as const

/**
 * Épopée #2880 (lot V33) — L'AUDIT À TROIS ÉTATS, PAR EXPERTISE (#2039.14),
 * et le croisement expertise ↔ fondement/preuve qui le nourrit
 * (#2039.9 missions, #2039.12 documents, #2039.13 confidentialité par
 * référence).
 *
 * Monté sur l'écran de l'audit d'onboarding (`CommercialAuditScreen`,
 * `/settings/profile/audit`) — décision 3 de Louis : « là où l'audit
 * d'onboarding s'affiche déjà ».
 *
 * Ce que ce bloc refuse :
 * - un « 0 » ou un score agrégé : chaque axe est établi / non établi / NOMMÉ
 *   non évaluable, toujours avec sa raison (GA-18/GA-19) ;
 * - un « prouvé » sans objet : la seule façon de prouver est de RATTACHER une
 *   mission, un document, un compte ou un consultant de l'espace ;
 * - une suppression : une ligne s'archive.
 */
export function AuditExpertiseCredibility() {
  const { t } = useTranslation('commercialAudit')
  const headingId = useId()
  const query = useExpertiseGroundings()

  return (
    <section aria-labelledby={headingId}>
      <AuditCard className="space-y-3">
        <Text
          id={headingId}
          element="h2"
          size="xs"
          weight="semibold"
          className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
        >
          {t('expertiseCredibility.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('expertiseCredibility.intro')}
        </Text>
        {query.isLoading ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('loading')}
          </Text>
        ) : query.isError || !query.data ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('expertiseCredibility.loadError')}
          </Text>
        ) : query.data.audit.length === 0 ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('expertiseCredibility.noExpertise')}
          </Text>
        ) : (
          <ul className="space-y-4">
            {query.data.audit.map(entry => (
              <ExpertiseRow
                key={entry.expertiseKey}
                entry={entry}
                groundings={query.data.groundings.filter(g => g.expertiseKey === entry.expertiseKey)}
                sourceOptions={query.data.sourceOptions}
              />
            ))}
          </ul>
        )}
      </AuditCard>
    </section>
  )
}

function ExpertiseRow({
  entry,
  groundings,
  sourceOptions,
}: {
  entry: ExpertiseCredibilityAuditEntry
  groundings: ExpertiseGrounding[]
  sourceOptions: ExpertiseGroundingSourceOption[]
}) {
  const { t } = useTranslation('commercialAudit')
  return (
    <li
      aria-label={entry.expertiseKey}
      className="space-y-2 border-t border-[var(--bellum-border)] pt-3 first:border-t-0 first:pt-0"
    >
      <Text element="h3" size="sm" weight="semibold">
        {entry.expertiseKey}
      </Text>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {AXES.map(axis => (
          <AxisCell key={axis} label={t(`expertiseCredibility.axis.${axis}`)} axis={entry[axis]} />
        ))}
      </dl>
      <NotEvaluableQuestions entry={entry} sourceOptions={sourceOptions} />
      {groundings.length > 0 ? (
        <ul className="space-y-2">
          {groundings.map(grounding => (
            <GroundingLine
              key={grounding.id ?? `${grounding.kind}:${grounding.expertiseKey}`}
              grounding={grounding}
              sourceOptions={sourceOptions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function AxisCell({ label, axis }: { label: string; axis: ExpertiseAuditAxis }) {
  const { t } = useTranslation('commercialAudit')
  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-2">
      <dt>
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {label}
        </Text>
      </dt>
      <dd className="space-y-0.5">
        <Text element="span" size="sm" weight="semibold" className="block">
          {t(`expertiseCredibility.status.${axis.status}`)}
        </Text>
        <Text element="span" size="xs" className="block text-[var(--bellum-text-secondary)]">
          {t(`expertiseCredibility.reason.${axis.reason}`)}
        </Text>
      </dd>
    </div>
  )
}

function GroundingLine({
  grounding,
  sourceOptions,
}: {
  grounding: ExpertiseGrounding
  sourceOptions: ExpertiseGroundingSourceOption[]
}) {
  const { t } = useTranslation('commercialAudit')
  const gesture = useExpertiseGroundingGesture()

  const run = (action: Parameters<typeof gesture.mutate>[0]): void => {
    gesture.mutate(action, { onError: () => toast.error(t('expertiseCredibility.saveError')) })
  }

  // Une ligne projetée (`id: null`) n'existe pas encore : le premier geste la
  // CRÉE pour sa paire (expertise, fondement) — c'est alors une correction
  // humaine, qui gagne sur la réponse plate.
  const write = (patch: {
    state?: 'proven'
    sourceType?: ExpertiseGroundingSourceOption['type']
    sourceId?: string
    confidentiality?: ExpertiseGrounding['confidentiality']
  }): void => {
    if (grounding.id) run({ kind: 'update', id: grounding.id, input: patch })
    else run({ kind: 'create', input: { expertiseKey: grounding.expertiseKey, kind: grounding.kind, ...patch } })
  }

  const onAttach = (value: string): void => {
    const option = sourceOptions.find(o => `${o.type}:${o.id}` === value)
    if (!option) return
    write({ state: 'proven', sourceType: option.type, sourceId: option.id })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bellum-surface-2)] p-2">
      <Text element="span" size="sm" weight="medium">
        {t(`expertiseCredibility.kind.${grounding.kind}`)}
      </Text>
      <Text element="span" size="xs" className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5">
        {t(`expertiseCredibility.state.${grounding.state}`)}
      </Text>
      {grounding.sourceType && grounding.sourceLabel ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t(`expertiseCredibility.sourceType.${grounding.sourceType}`)} · {grounding.sourceLabel}
        </Text>
      ) : null}
      {sourceOptions.length > 0 ? (
        <SelectField
          ariaLabel={t('expertiseCredibility.attach')}
          placeholder={t('expertiseCredibility.attach')}
          value=""
          size="sm"
          disabled={gesture.isPending}
          className="pointer-coarse:min-h-11"
          onChange={onAttach}
          options={sourceOptions.map(option => ({
            value: `${option.type}:${option.id}`,
            label: `${t(`expertiseCredibility.sourceType.${option.type}`)} · ${option.label}`,
          }))}
        />
      ) : null}
      {grounding.kind === 'client_reference' ? (
        <SelectField
          ariaLabel={t('expertiseCredibility.confidentiality.label')}
          value={grounding.confidentiality ?? ''}
          size="sm"
          disabled={gesture.isPending}
          className="pointer-coarse:min-h-11"
          emptyOption={{ label: t('expertiseCredibility.confidentiality.unset') }}
          onChange={value => {
            const next = EXPERTISE_REFERENCE_CONFIDENTIALITIES.find(c => c === value) ?? null
            write({ confidentiality: next })
          }}
          options={EXPERTISE_REFERENCE_CONFIDENTIALITIES.map(value => ({
            value,
            label: t(`expertiseCredibility.confidentiality.${value}`),
          }))}
        />
      ) : null}
      {grounding.id ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={gesture.isPending}
          onClick={() => grounding.id && run({ kind: 'archive', id: grounding.id })}
        >
          {t('expertiseCredibility.archive')}
        </Button>
      ) : null}
    </li>
  )
}

/**
 * #4425.1 — UNE EXPERTISE « NON ÉVALUABLE » POSE SES QUESTIONS.
 *
 * Un axe non évaluable disait POURQUOI (`reason`) sans offrir de quoi y
 * répondre : la seule porte était le questionnaire, deux écrans plus loin. Les
 * trois questions sont celles des trois axes, et chacune écrit sur la MÊME
 * table de fondements que le reste du bloc (`expertiseGroundingsApi.create`) :
 *
 *  1. « Sur quoi repose cette expertise ? » → le fondement (`no_grounding`) ;
 *  2. « Quelle preuve peux-tu rattacher ? » → un objet source de l'espace,
 *     jamais un texte libre (« prouvé » sans objet est refusé par le schéma) ;
 *  3. « Un vivier est-il disponible ? » → un fondement `talent_pool`
 *     (`capacity_unknown`).
 *
 * Rien n'est écrit tant que rien n'est répondu : pas de ligne vide, pas de
 * preuve inventée. Une expertise entièrement évaluable ne pose aucune question.
 */
function NotEvaluableQuestions({
  entry,
  sourceOptions,
}: {
  entry: ExpertiseCredibilityAuditEntry
  sourceOptions: ExpertiseGroundingSourceOption[]
}) {
  const { t } = useTranslation('commercialAudit')
  const gesture = useExpertiseGroundingGesture()
  const [kind, setKind] = useState<ExpertiseGroundingKind | ''>('')
  const [sourceValue, setSourceValue] = useState('')
  const [pool, setPool] = useState(false)

  const needsGrounding = entry.knowHow.status === 'not_evaluable'
  const needsCapacity = entry.sellableNow.status === 'not_evaluable' && entry.sellableNow.reason === 'capacity_unknown'
  if (!needsGrounding && !needsCapacity) return null

  const source = sourceOptions.find(option => `${option.type}:${option.id}` === sourceValue)
  const canSave = (needsGrounding && kind !== '') || pool
  // Le vivier se déclare comme un fondement à part, sauf s'il EST le fondement choisi.
  const poolIsExtra = pool && !(needsGrounding && kind === 'talent_pool')

  const save = async (): Promise<void> => {
    try {
      if (needsGrounding && kind !== '') {
        await gesture.mutateAsync({
          kind: 'create',
          input: {
            expertiseKey: entry.expertiseKey,
            kind,
            state: kind === 'development_intent' ? 'to_prove' : source ? 'proven' : 'declared',
            ...(source && kind !== 'development_intent' ? { sourceType: source.type, sourceId: source.id } : {}),
          },
        })
      }
      if (poolIsExtra) {
        await gesture.mutateAsync({
          kind: 'create',
          input: { expertiseKey: entry.expertiseKey, kind: 'talent_pool', state: 'declared' },
        })
      }
      setKind('')
      setSourceValue('')
      setPool(false)
    } catch {
      toast.error(t('expertiseCredibility.saveError'))
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-[var(--bellum-border)] p-3">
      <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
        {t('expertiseCredibility.questions.title')}
      </Text>
      {needsGrounding && (
        <>
          <SelectField
            ariaLabel={t('expertiseCredibility.questions.grounding')}
            placeholder={t('expertiseCredibility.questions.grounding')}
            value={kind}
            size="sm"
            className="pointer-coarse:min-h-11"
            onChange={value => setKind(EXPERTISE_GROUNDING_KINDS.find(k => k === value) ?? '')}
            options={EXPERTISE_GROUNDING_KINDS.map(value => ({
              value,
              label: t(`expertiseCredibility.kind.${value}`),
            }))}
          />
          <SelectField
            ariaLabel={t('expertiseCredibility.questions.proof')}
            placeholder={t('expertiseCredibility.questions.proof')}
            value={sourceValue}
            size="sm"
            // La preuve se rattache à un fondement : tant qu'il n'est pas dit,
            // la question attend (et une « simple volonté » n'a pas de preuve).
            disabled={kind === '' || kind === 'development_intent' || sourceOptions.length === 0}
            className="pointer-coarse:min-h-11"
            onChange={setSourceValue}
            options={sourceOptions.map(option => ({
              value: `${option.type}:${option.id}`,
              label: `${t(`expertiseCredibility.sourceType.${option.type}`)} · ${option.label}`,
            }))}
          />
        </>
      )}
      <label className="flex min-h-11 items-center gap-2">
        <Checkbox
          checked={pool}
          onCheckedChange={checked => setPool(checked === true)}
          aria-label={t('expertiseCredibility.questions.pool')}
        />
        <Text element="span" size="sm">
          {t('expertiseCredibility.questions.pool')}
        </Text>
      </label>
      <Button
        type="button"
        size="sm"
        className="pointer-coarse:min-h-11"
        disabled={!canSave || gesture.isPending}
        onClick={() => void save()}
      >
        {t('expertiseCredibility.questions.save')}
      </Button>
    </div>
  )
}
