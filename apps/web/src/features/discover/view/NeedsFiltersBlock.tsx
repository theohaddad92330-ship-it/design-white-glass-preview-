import { useTranslation } from 'react-i18next'
import { NEED_NATURES, NEED_PERIODS, type NeedNature } from '../lib/discover-needs-filters'
import { withSkills, type UnifiedFilters } from '../lib/discover-filters'
import { Field, SelectInput, ToggleChip } from './filter-controls'

/** « Nom — Poste », ou l'un des deux ; aucun des deux ⇒ absent (le sélecteur numérote). */
export function consultantOptionLabel(
  fullName: string | null | undefined,
  title: string | null | undefined,
): string | null {
  // Lot 786 — « Consultant 22 » n'est pas un nom : c'est un libellé de remplacement, il s'efface devant le poste.
  const name = fullName?.trim()
  const parts = [PLACEHOLDER_NAME.test(name ?? '') ? undefined : name, title?.trim()].filter((part): part is string =>
    Boolean(part),
  )
  return parts.length > 0 ? parts.join(' — ') : null
}

const PLACEHOLDER_NAME = /^consultant\s*\d*$/i

const foldName = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Lots 786-788 (#5203) — les options du sélecteur « Depuis un consultant » : archivés et sans pile écartés, UNE ligne
 * par LIBELLÉ AFFICHÉ (normalisé : casse, accents, espaces) — l'entrée la plus complète (un nom réel, puis la pile la
 * plus fournie) gagne. Les fiches du même nom s'additionnent d'abord (leurs piles se réunissent). Une entrée sans nom
 * ni poste n'apparaît pas : on n'affiche pas ce qu'on n'a pas, jamais de « Consultant N ».
 */
export function consultantSelectOptions(
  consultants: ReadonlyArray<{
    id: string
    full_name: string | null | undefined
    title: string | null | undefined
    stack: readonly string[]
    archived_at: string | null
  }>,
): NeedsConsultantOption[] {
  const byId = new Set<string>()
  const byName = new Map<string, Candidate>()
  const byLabel = new Map<string, Candidate>()
  for (const consultant of consultants) {
    if (consultant.archived_at !== null || consultant.stack.length === 0 || byId.has(consultant.id)) continue
    byId.add(consultant.id)
    const label = consultantOptionLabel(consultant.full_name, consultant.title)
    if (!label) continue
    const rawName = consultant.full_name?.trim() ?? ''
    const named = rawName !== '' && !PLACEHOLDER_NAME.test(rawName)
    const nameKey = named ? foldName(rawName) : ''
    const twin = nameKey ? byName.get(nameKey) : undefined
    if (twin) {
      twin.option.stack = [...new Set([...twin.option.stack, ...consultant.stack])]
      continue
    }
    const entry: Candidate = { option: { id: consultant.id, label, stack: consultant.stack }, named }
    if (nameKey) byName.set(nameKey, entry)
    const labelKey = foldName(label)
    const same = byLabel.get(labelKey)
    if (!same) {
      byLabel.set(labelKey, entry)
    } else if (
      (entry.named && !same.named) ||
      (entry.named === same.named && entry.option.stack.length > same.option.stack.length)
    ) {
      byLabel.set(labelKey, entry)
    }
  }
  return [...byLabel.values()].map(entry => entry.option)
}

type Candidate = { option: NeedsConsultantOption; named: boolean }

/** Un consultant de l'espace, réduit à ce que le sélecteur lit : son nom et son poste, et sa pile. */
export interface NeedsConsultantOption {
  id: string
  label: string
  stack: readonly string[]
}

/**
 * #5203 (lot 782) — filtres de BESOINS de « Cadrer la recherche » : période (Tous / Récents < 6 mois / Anciens),
 * nature (recrutement / mission / projet) — qui RETIRENT — et la recherche DEPUIS UN CONSULTANT, qui pose ses
 * compétences comme critères (le champ « Compétences », un seul endroit : GA-26). « Tous » est le défaut : par défaut
 * la recherche porte sur tous les besoins, récents ET anciens. Aucune source nommée.
 */
export function NeedsFiltersBlock({
  draft,
  onChange,
  consultants,
}: {
  draft: UnifiedFilters
  onChange: (update: (current: UnifiedFilters) => UnifiedFilters) => void
  consultants: readonly NeedsConsultantOption[]
}) {
  const { t } = useTranslation('discover')
  const toggleNature = (nature: NeedNature) =>
    onChange(current => ({
      ...current,
      needsNature: current.needsNature.includes(nature)
        ? current.needsNature.filter(other => other !== nature)
        : NEED_NATURES.filter(other => other === nature || current.needsNature.includes(other)),
    }))
  const fromConsultant = (id: string) => {
    const picked = consultants.find(consultant => consultant.id === id)
    if (!picked || picked.stack.length === 0) return
    onChange(current => withSkills(current, picked.stack.join(', ')))
  }
  return (
    <>
      {consultants.length > 0 && (
        <Field label={t('needsFilters.fromConsultantLabel')} hint={t('needsFilters.fromConsultantHint')}>
          <SelectInput
            ariaLabel={t('needsFilters.fromConsultantLabel')}
            value=""
            onChange={fromConsultant}
            options={consultants.map(consultant => ({ value: consultant.id, label: consultant.label }))}
          />
        </Field>
      )}
      <Field mode="include" label={t('needsFilters.periodLabel')} hint={t('needsFilters.periodHint')}>
        <SelectInput
          ariaLabel={t('needsFilters.periodLabel')}
          value={draft.needsPeriod}
          onChange={value => onChange(current => ({ ...current, needsPeriod: value as UnifiedFilters['needsPeriod'] }))}
          options={NEED_PERIODS.map(period => ({ value: period, label: t(`needsFilters.period.${period}`) }))}
        />
      </Field>
      <Field mode="include" label={t('needsFilters.natureLabel')} hint={t('needsFilters.natureHint')}>
        <div className="flex flex-wrap gap-2">
          {NEED_NATURES.map(nature => (
            <ToggleChip key={nature} active={draft.needsNature.includes(nature)} onClick={() => toggleNature(nature)}>
              {t(`needsFilters.nature.${nature}`)}
            </ToggleChip>
          ))}
        </div>
      </Field>
    </>
  )
}
