import type { ReferenceDossier } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import type { PlanActionInput } from '@/features/actions/planItems.api'

/** 12 cartes puis « Voir les suivantes » (décision Louis 22/10, pas de vue tableau). */
const PAGE_SIZE = 12
const NEEDS_PREVIEW = 3
const ECOSYSTEM_PREVIEW = 5

interface ReferenceDossierViewProps {
  dossier: ReferenceDossier
  /** « périmètre France » — dit sur chaque section (N4). */
  scopeNote: string
  onAddAction: (input: PlanActionInput) => void
}

function Section({
  eyebrow,
  title,
  hint,
  scopeNote,
  children,
}: {
  eyebrow: string
  title: string
  hint?: string
  scopeNote: string
  children: ReactNode
}) {
  const { t } = useTranslation('accounts')
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <header className="flex flex-col gap-0.5">
        <Text size="xs" weight="medium" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {eyebrow}
        </Text>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        {hint && (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {hint}
          </Text>
        )}
      </header>
      {children}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('referenceDossier.scope', { scope: scopeNote })}
      </Text>
    </section>
  )
}

function MoreButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="min-h-11 self-start" onClick={onClick}>
      {children}
    </Button>
  )
}

function Counters({ counts }: { counts: ReferenceDossier['counts'] }) {
  const { t } = useTranslation('accounts')
  const items: Array<[number, string]> = [
    [counts.units, t('referenceDossier.counts.units')],
    [counts.historical_needs, t('referenceDossier.counts.needs')],
    [counts.tjm_observations, t('referenceDossier.counts.tjm')],
    [counts.contacts, t('referenceDossier.counts.contacts')],
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([value, label]) => (
        <div key={label} className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
          <dt className="sr-only">{label}</dt>
          <dd className="text-2xl font-semibold text-[var(--bellum-text-primary)]">{value}</dd>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" aria-hidden>
            {label}
          </Text>
        </div>
      ))}
    </dl>
  )
}

function Purchasing({ steps, scopeNote }: { steps: ReferenceDossier['purchasing']; scopeNote: string }) {
  const { t } = useTranslation('accounts')
  if (steps.length === 0)
    return <NamedAbsence what={t('referenceDossier.purchasing.title')} testId="reference-absence-purchasing" />
  return (
    <Section
      eyebrow={t('referenceDossier.purchasing.eyebrow')}
      title={t('referenceDossier.purchasing.title')}
      hint={t('referenceDossier.purchasing.hint')}
      scopeNote={scopeNote}
    >
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={`${step.title}-${index}`} className="flex gap-3">
            <span className="text-xs font-medium text-[var(--bellum-text-muted)]">{index + 1}</span>
            <div className="min-w-0">
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {step.title}
                {step.reliability && (
                  <span className="ml-2 text-xs font-normal text-[var(--bellum-text-muted)]">{step.reliability}</span>
                )}
              </Text>
              {step.note && (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {step.note}
                </Text>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Organisation({ groups, scopeNote }: { groups: ReferenceDossier['organisation']; scopeNote: string }) {
  const { t } = useTranslation('accounts')
  const [shown, setShown] = useState(PAGE_SIZE)
  if (groups.length === 0)
    return <NamedAbsence what={t('referenceDossier.structure.title')} testId="reference-absence-structure" />
  const total = groups.reduce((sum, group) => sum + group.units.length, 0)
  let quota = shown
  return (
    <Section
      eyebrow={t('referenceDossier.structure.eyebrow')}
      title={t('referenceDossier.structure.title')}
      hint={t('referenceDossier.structure.hint')}
      scopeNote={scopeNote}
    >
      {groups.map(group => {
        const visible = group.units.slice(0, Math.max(0, quota))
        quota -= visible.length
        if (visible.length === 0) return null
        return (
          <div key={group.label} className="flex flex-col gap-2">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
              {group.label} · {group.units.length}
            </Text>
            <ul className="grid gap-2 md:grid-cols-2">
              {visible.map((unit, index) => (
                <li key={`${unit.name}-${index}`} className="rounded-lg border border-[var(--bellum-border)] p-3">
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {unit.kind}
                  </Text>
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {unit.name}
                  </Text>
                  {unit.note && (
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {unit.note}
                    </Text>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {total > shown && (
        <MoreButton onClick={() => setShown(total)}>
          {t('referenceDossier.showMore', { count: total - shown })}
        </MoreButton>
      )}
    </Section>
  )
}

function Expertises({
  items,
  needCount,
  scopeNote,
}: {
  items: ReferenceDossier['expertises']
  needCount: number
  scopeNote: string
}) {
  const { t } = useTranslation('accounts')
  if (items.length === 0)
    return <NamedAbsence what={t('referenceDossier.expertises.title')} testId="reference-absence-expertises" />
  return (
    <Section
      eyebrow={t('referenceDossier.expertises.eyebrow')}
      title={t('referenceDossier.expertises.title')}
      hint={t('referenceDossier.expertises.hint', { count: needCount })}
      scopeNote={scopeNote}
    >
      <ul className="flex flex-wrap gap-2">
        {items.map(item => (
          <li
            key={item.label}
            className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
          >
            <Text size="sm" className="text-[var(--bellum-text-primary)]">
              {item.label}
            </Text>
            <span className="text-sm font-semibold text-[var(--bellum-text-primary)]">{item.count}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Tjm({ circuits, scopeNote }: { circuits: ReferenceDossier['tjm']; scopeNote: string }) {
  const { t } = useTranslation('accounts')
  if (circuits.length === 0)
    return <NamedAbsence what={t('referenceDossier.tjm.title')} testId="reference-absence-tjm" />
  return (
    <Section
      eyebrow={t('referenceDossier.tjm.eyebrow')}
      title={t('referenceDossier.tjm.title')}
      hint={t('referenceDossier.tjm.subtitle')}
      scopeNote={scopeNote}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {circuits.map(circuit => (
          <div key={circuit.channel} className="rounded-lg border border-[var(--bellum-border)] p-3">
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t(`referenceDossier.tjm.${circuit.channel}`)}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('referenceDossier.tjm.observations', { count: circuit.observations })}
            </Text>
            <p className="mt-1 text-xl font-semibold text-[var(--bellum-text-primary)]">
              <span>{`${circuit.min}–${circuit.max}`}</span>{' '}
              <span className="text-sm font-normal text-[var(--bellum-text-muted)]">
                {t('referenceDossier.tjm.unit')}
              </span>
            </p>
          </div>
        ))}
      </div>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('referenceDossier.tjm.hint')}
      </Text>
    </Section>
  )
}

function Needs({ needs, scopeNote }: { needs: ReferenceDossier['needs']; scopeNote: string }) {
  const { t } = useTranslation('accounts')
  const [all, setAll] = useState(false)
  if (needs.length === 0)
    return <NamedAbsence what={t('referenceDossier.needs.title')} testId="reference-absence-needs" />
  const visible = all ? needs : needs.slice(0, NEEDS_PREVIEW)
  return (
    <Section
      eyebrow={t('referenceDossier.needs.eyebrow')}
      title={t('referenceDossier.needs.title')}
      hint={t('referenceDossier.needs.subtitle')}
      scopeNote={scopeNote}
    >
      <ul className="flex flex-col divide-y divide-[var(--bellum-border)]">
        {visible.map((need, index) => (
          <li key={`${need.title}-${index}`} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {need.title}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {[need.entity, need.period].filter(Boolean).join(' · ')}
              </Text>
            </div>
            <Text size="sm" className="shrink-0 text-[var(--bellum-text-primary)]">
              {need.rate === null
                ? t('referenceDossier.needs.noRate')
                : t('referenceDossier.needs.rate', { rate: need.rate })}
            </Text>
          </li>
        ))}
      </ul>
      {needs.length > NEEDS_PREVIEW && (
        <MoreButton onClick={() => setAll(value => !value)}>
          {all ? t('referenceDossier.needs.showLess') : t('referenceDossier.needs.showAll')}
        </MoreButton>
      )}
    </Section>
  )
}

function Ecosystem({ actors, scopeNote }: { actors: ReferenceDossier['ecosystem']; scopeNote: string }) {
  const { t } = useTranslation('accounts')
  const [shown, setShown] = useState(ECOSYSTEM_PREVIEW)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  if (actors.length === 0)
    return <NamedAbsence what={t('referenceDossier.ecosystem.title')} testId="reference-absence-ecosystem" />
  return (
    <Section
      eyebrow={t('referenceDossier.ecosystem.eyebrow')}
      title={t('referenceDossier.ecosystem.title')}
      hint={t('referenceDossier.ecosystem.hint')}
      scopeNote={scopeNote}
    >
      <ul className="flex flex-col gap-2">
        {actors.slice(0, shown).map((actor, index) => (
          <li key={`${actor.name}-${index}`} className="rounded-lg border border-[var(--bellum-border)] p-3">
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {actor.name}
            </Text>
            {actor.perimeter && (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {actor.perimeter}
              </Text>
            )}
            {actor.observation && (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {actor.observation}
              </Text>
            )}
            <Text size="xs" weight="medium" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t(`referenceDossier.ecosystem.${actor.nature === 'indirect' ? 'indirect' : 'observed'}`)}
            </Text>
            {actor.reserve && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  aria-expanded={open.has(index)}
                  onClick={() =>
                    setOpen(prev => {
                      const next = new Set(prev)
                      if (next.has(index)) next.delete(index)
                      else next.add(index)
                      return next
                    })
                  }
                >
                  {t('referenceDossier.ecosystem.detail')}
                </Button>
                {open.has(index) && (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {actor.reserve}
                  </Text>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {actors.length > shown && (
        <MoreButton onClick={() => setShown(actors.length)}>
          {t('referenceDossier.showMore', { count: actors.length - shown })}
        </MoreButton>
      )}
    </Section>
  )
}

function Programmes({
  items,
  scopeNote,
  onAddAction,
}: {
  items: ReferenceDossier['programmes']
  scopeNote: string
  onAddAction: (input: PlanActionInput) => void
}) {
  const { t } = useTranslation('accounts')
  if (items.length === 0)
    return <NamedAbsence what={t('referenceDossier.programmes.title')} testId="reference-absence-programmes" />
  return (
    <Section
      eyebrow={t('referenceDossier.programmes.eyebrow')}
      title={t('referenceDossier.programmes.title')}
      hint={t('referenceDossier.programmes.hint')}
      scopeNote={scopeNote}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((programme, index) => {
          const deduced = [programme.reading, programme.angle].filter((line): line is string => Boolean(line))
          return (
            <article
              key={`${programme.title}-${index}`}
              aria-label={programme.title}
              className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3"
            >
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {String(index + 1).padStart(2, '0')} · {programme.period ?? t('referenceDossier.programmes.undated')} ·{' '}
                {programme.statement_label}
              </Text>
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {programme.title}
              </Text>
              {programme.summary && (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {programme.summary}
                </Text>
              )}
              {deduced.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                    {t('referenceDossier.programmes.reading')}
                  </Text>
                  {deduced.map(line => (
                    <Text key={line} size="xs" className="text-[var(--bellum-text-secondary)]">
                      {line}
                    </Text>
                  ))}
                  <Text size="xs" className="italic text-[var(--bellum-text-muted)]">
                    {t('referenceDossier.programmes.disclaimer')}
                  </Text>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() =>
                    onAddAction({
                      label: t('referenceDossier.programmes.angleLabel', { title: programme.title }),
                      reason: deduced[deduced.length - 1] ?? programme.summary ?? programme.title,
                      // #2395.8 — résultat attendu requis à la création.
                      expected_outcome: t('referenceDossier.programmes.angleOutcome'),
                      target: null,
                    })
                  }
                >
                  {t('referenceDossier.programmes.prepareAngle')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() =>
                    onAddAction({
                      label: t('referenceDossier.programmes.checkLabel', { title: programme.title }),
                      reason: t('referenceDossier.programmes.checkReason'),
                      expected_outcome: t('referenceDossier.programmes.checkOutcome'),
                      target: null,
                    })
                  }
                >
                  {t('referenceDossier.programmes.addCheck')}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </Section>
  )
}

/**
 * Théo A comptes-fiche-reference.N1/N2/N3/R3 — ce que montre un dossier de référence de plus que
 * la fiche standard. Tout vient du relevé : une valeur absente se dit (« Prix non publié »,
 * « Période non datée »), jamais 0 ; les TJM restent par circuit.
 */
export function ReferenceDossierView({ dossier, scopeNote, onAddAction }: ReferenceDossierViewProps) {
  return (
    <div data-testid="reference-dossier" className="flex flex-col gap-3">
      <Counters counts={dossier.counts} />
      <Purchasing steps={dossier.purchasing} scopeNote={scopeNote} />
      <Organisation groups={dossier.organisation} scopeNote={scopeNote} />
      <Expertises items={dossier.expertises} needCount={dossier.counts.historical_needs} scopeNote={scopeNote} />
      <Tjm circuits={dossier.tjm} scopeNote={scopeNote} />
      <Needs needs={dossier.needs} scopeNote={scopeNote} />
      <Ecosystem actors={dossier.ecosystem} scopeNote={scopeNote} />
      <Programmes items={dossier.programmes} scopeNote={scopeNote} onAddAction={onAddAction} />
    </div>
  )
}
