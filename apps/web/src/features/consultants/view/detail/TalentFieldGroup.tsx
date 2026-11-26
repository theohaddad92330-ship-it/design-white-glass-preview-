import { Card } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { Consultant } from '@bellum/contracts'
import { InlineEditableField } from '@/components/primitives/InlineEditableField'
import { formatDate } from '@/lib/locale'
import { readValidationIssues } from '@/lib/api-error'
import { useUserPermissions } from '@/lib/permissions'
import { useUpdateConsultant } from '../../hooks'
import { isoDay, toForm, type ConsultantFormState } from '../../lib/consultantForm'
import {
  TALENT_FIELD_GROUPS,
  TALENT_INLINE_FIELDS,
  buildInlineUpsert,
  explainSaveRefusal,
  isHandEntered,
  lockedSourceOf,
  withFormDefaults,
  type TalentFieldKey,
} from '../../lib/talentInlineFields'

/** Les natures payées au prix d'achat (le coût chargé est celui du salarié) — la règle de la modale. */
const PURCHASE_ENGAGEMENTS = new Set(['freelance', 'portage', 'sous_traitance', 'partenaire'])

/**
 * #4402.1 (retour bêta 21/10) — UNE section d'une fiche talent, dont chaque champ se modifie EN LIGNE
 * (`InlineEditableField`). Remplace la modale « Modifier » : mêmes champs (inventaire dans
 * `talentInlineFields.ts`), mêmes vocabulaires, MÊME PATCH (`useUpdateConsultant`, aucun nouvel endpoint).
 *
 * Hors périmètre financier, les montants sont RETIRÉS (pas grisés) et l'absence est nommée — la règle de la modale.
 */
export function TalentFieldGroup({
  talent,
  groupId,
  managerCandidates = [],
}: {
  talent: Consultant
  groupId: string
  /** Le vivier dans lequel se choisit un manager (la fiche elle-même en est retirée). */
  managerCandidates?: readonly { id: string; full_name: string | null }[]
}) {
  const { t } = useTranslation('consultants')
  const update = useUpdateConsultant()
  // #4577 — corriger exige le MÊME droit que l'API (`records:write`, PUT /consultants/:id). Droit inconnu ou en erreur :
  // fail-closed, la valeur se lit sans promettre une écriture que le serveur refuserait.
  const access = useUserPermissions()
  const canEdit = access.status === 'known' && access.permissions.includes('records:write')
  const group = TALENT_FIELD_GROUPS.find(entry => entry.id === groupId)
  if (!group) return null

  const form = toForm(withFormDefaults(talent))
  const showFinance = talent.finance_visible !== false
  const save = (key: TalentFieldKey) => (next: string) =>
    update
      .mutateAsync({
        id: talent.id,
        input: buildInlineUpsert(talent, { [key]: next } as Partial<ConsultantFormState>, { finance: showFinance }),
      })
      .catch((error: unknown) => {
        throw explainSaveRefusal(error, key)
      })

  const visible = group.fields.filter(key => {
    const finance = TALENT_INLINE_FIELDS[key].finance
    if (!finance) return true
    if (!showFinance) return false
    if (finance === 'salarie') return form.engagement_kind === 'salarie'
    if (finance === 'achat') return PURCHASE_ENGAGEMENTS.has(form.engagement_kind)
    return true
  })
  const financeOutOfScope = !showFinance && group.fields.some(key => TALENT_INLINE_FIELDS[key].finance)

  const optionsOf = (key: TalentFieldKey) => {
    const spec = TALENT_INLINE_FIELDS[key]
    if (key === 'manager_id') {
      const people = managerCandidates
        .filter(person => person.id !== talent.id && Boolean(person.full_name))
        .map(person => ({ value: person.id, label: person.full_name ?? '' }))
        .sort((a, b) => a.label.localeCompare(b.label))
      // Le manager DÉJÀ enregistré reste proposé même si le vivier n'est pas chargé : sinon on l'effacerait en silence.
      const current = form.manager_id
      const missing = current && !people.some(person => person.value === current)
      return [
        { value: '', label: t('detail.inline.managerNone') },
        ...(missing ? [{ value: current, label: talent.manager_name ?? t('detail.inline.managerNone') }] : []),
        ...people,
      ]
    }
    return (spec.choices?.values ?? []).map(value => ({ value, label: t(spec.choices?.labelKey(value) ?? '') }))
  }

  return (
    <section aria-label={t(group.titleKey)} className="grid gap-3">
      <h3 className="text-sm font-semibold text-[var(--bellum-text-primary)]">{t(group.titleKey)}</h3>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {visible.map(key => {
          const spec = TALENT_INLINE_FIELDS[key]
          const raw = form[key] ?? ''
          return (
            <InlineEditableField
              key={key}
              id={`talent-field-${key}`}
              label={t(spec.labelKey)}
              hint={spec.hintKey ? t(spec.hintKey) : undefined}
              placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
              kind={spec.kind}
              inputType={spec.inputType}
              min={spec.min}
              max={spec.max}
              options={spec.kind === 'select' ? optionsOf(key) : undefined}
              // Tronqué à l'AFFICHAGE seulement : un accord de 14 h 32 ne glisse pas à minuit sans geste.
              value={spec.kind === 'date' ? isoDay(raw) : raw}
              // D2 (#4191) — la date se LIT dans la langue de l'interface, jamais « 2026-11-10 » ; l'ISO ne sert qu'à l'édition.
              display={spec.kind === 'date' ? (formatDate(isoDay(raw)) ?? undefined) : undefined}
              disabled={!canEdit}
              // #4577.3 — une correction humaine se dit, à l'écran, champ par champ.
              provenanceNote={isHandEntered(talent, key) ? t('detail.inline.handEntered') : undefined}
              // #4577.6 — une valeur de connecteur ou du CV dit d'où elle vient et ne s'ouvre que par « Corriger ».
              lockedNote={
                lockedSourceOf(talent, key) === 'connector'
                  ? t('detail.inline.fromConnector')
                  : lockedSourceOf(talent, key) === 'pipeline'
                    ? t('detail.inline.fromImport')
                    : undefined
              }
              onSave={save(key)}
            />
          )
        })}
      </div>
      {financeOutOfScope ? (
        <p className="text-xs text-[var(--bellum-text-muted)]">{t('form.financeOutOfScope')}</p>
      ) : null}
    </section>
  )
}

/** Toutes les sections d'un onglet, dans une carte — l'onglet se contente de la poser. */
export function TalentTabFields({
  talent,
  tab,
  managerCandidates,
}: {
  talent: Consultant
  tab: (typeof TALENT_FIELD_GROUPS)[number]['tab']
  managerCandidates?: readonly { id: string; full_name: string | null }[]
}) {
  const { t } = useTranslation('consultants')
  const access = useUserPermissions()
  const canEdit = access.status === 'known' && access.permissions.includes('records:write')
  const groups = TALENT_FIELD_GROUPS.filter(group => group.tab === tab)
  return (
    <Card className="mt-3 grid gap-5 p-4" data-testid={`talent-fields-${tab}`}>
      {/* Dit UNE fois par carte pourquoi rien ne s'ouvre, au lieu de laisser des valeurs inertes sans explication. */}
      {canEdit ? null : <p className="text-xs text-[var(--bellum-text-muted)]">{t('detail.inline.readOnly')}</p>}
      {groups.map(group => (
        <TalentFieldGroup key={group.id} talent={talent} groupId={group.id} managerCandidates={managerCandidates} />
      ))}
    </Card>
  )
}
