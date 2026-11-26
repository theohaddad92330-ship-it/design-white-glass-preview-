import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, X } from 'lucide-react'
import { Checkbox, Text } from '@bellum/ui'
import type { LauraFraming } from './rankingBatchItems'

/** Ce que la carte propose (posé par le serveur) : le cadrage s'ouvre prérempli avec. */
type FramingSeed = { talentId?: string; talentName?: string; skills: readonly string[]; zone?: string }

/**
 * #4642 — le CADRAGE d'une analyse lancée depuis une carte « Comptes où placer X » : prérempli depuis la
 * demande à Laura, VISIBLE et MODIFIABLE avant le lancement (jamais un lancement muet). Chaque axe se retire,
 * une compétence s'ajoute. Le cadrage PRIORISE le dossier (ce qui touche la demande passe en tête, nommé) ;
 * il n'écarte rien — le texte le dit.
 */
export function AnalysisFraming({
  seed,
  offerCount,
  launching,
  onLaunch,
  onCancel,
}: {
  seed: FramingSeed
  /** Le nombre d'offres relevées des comptes cochés — 0 = rien à joindre, aucune case. */
  offerCount: number
  launching: boolean
  onLaunch: (framing: Omit<LauraFraming, 'offers'> & { withOffers: boolean }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('chat')
  const [skills, setSkills] = useState<string[]>([...seed.skills])
  const [zone, setZone] = useState<string | undefined>(seed.zone)
  const [withOffers, setWithOffers] = useState(true)
  const [draft, setDraft] = useState('')

  const addSkill = () => {
    const skill = draft.trim().slice(0, 60)
    setDraft('')
    if (!skill || skills.some(existing => existing.toLowerCase() === skill.toLowerCase())) return
    setSkills(current => [...current, skill].slice(0, 20))
  }

  return (
    <div
      role="group"
      aria-label={t('blocks.framing.title')}
      className="space-y-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <Text size="sm" weight="medium">
        {t('blocks.framing.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('blocks.framing.intro')}
      </Text>
      <div className="flex flex-wrap items-center gap-1.5">
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('blocks.framing.skills')}
        </Text>
        {skills.map(skill => (
          <Chip
            key={skill}
            label={skill}
            removeLabel={t('blocks.framing.removeSkill', { skill })}
            onRemove={() => setSkills(current => current.filter(existing => existing !== skill))}
          />
        ))}
        <input
          type="text"
          value={draft}
          maxLength={60}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addSkill()
          }}
          aria-label={t('blocks.framing.addSkill')}
          placeholder={t('blocks.framing.addSkill')}
          className="h-8 w-40 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 text-xs text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--bellum-primary-500)] pointer-coarse:min-h-11"
        />
      </div>
      {zone ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('blocks.framing.zone')}
          </Text>
          <Chip
            label={zone}
            removeLabel={t('blocks.framing.removeZone', { zone })}
            onRemove={() => setZone(undefined)}
          />
        </div>
      ) : null}
      {offerCount > 0 ? (
        <label className="flex items-center gap-2">
          <Checkbox
            checked={withOffers}
            onCheckedChange={checked => setWithOffers(checked === true)}
            aria-label={t('blocks.framing.offers', { count: offerCount })}
          />
          <Text size="xs">{t('blocks.framing.offers', { count: offerCount })}</Text>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={launching}
          onClick={() => onLaunch({ talentId: seed.talentId, talentName: seed.talentName, skills, zone, withOffers })}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-1)] disabled:opacity-60 pointer-coarse:min-h-11"
        >
          <Play className="size-3.5" aria-hidden />
          {t('blocks.framing.launch')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-md px-2 text-xs font-medium text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-1)] pointer-coarse:min-h-11"
        >
          {t('blocks.framing.cancel')}
        </button>
      </div>
    </div>
  )
}

function Chip({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg)] pl-2 text-xs text-[var(--bellum-text-primary)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex size-6 items-center justify-center rounded-full text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:size-11"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  )
}
