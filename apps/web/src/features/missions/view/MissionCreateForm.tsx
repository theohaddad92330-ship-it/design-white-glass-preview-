import { Box, Button, Input, SelectField, Text } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CreateMissionRequest } from '@bellum/contracts'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useConsultants } from '@/features/consultants/hooks'
import { useCreateMission, type MissionView } from '@/features/missions/api'
import { useProject } from '@/features/projects/hooks/useProject'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useDebounce } from '@/hooks/useDebounce'

/**
 * #4196 (épopée #4191, lot L5) — « NOUVELLE MISSION » crée une MISSION.
 *
 * Avant ce lot, `/missions/nouvelle` montait l'assistant de BESOIN : on y tapait
 * « Nouvelle mission » et on repartait avec un besoin. Ce formulaire écrit la vraie
 * mission (`POST /delivery/missions`, le MÊME appel que « Créer depuis un document »)
 * et rend la main à l'appelant, qui ouvre `/missions/$id`.
 *
 * Obligatoires : compte, intitulé, date de début. Optionnels : consultant, TJM,
 * fin, affaire. Un champ vide n'est JAMAIS envoyé (ni « 0 », ni chaîne vide).
 * Le coût chargé ne se saisit pas ici : il vit dans les conditions commerciales
 * de la mission, sous le droit finance (décision D43).
 *
 * Venant d'une opportunité signée (`projectId`), le compte et l'affaire sont
 * imposés — le formulaire ne les redemande pas.
 */
export function MissionCreateForm({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId?: string
  onCreated: (mission: MissionView) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('missions')
  const fixed = useProject(projectId ?? '').project
  const projects = useProjects(!projectId)
  const consultants = useConsultants()

  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 250)
  const accountsQuery = useAccounts({ q: debouncedSearch || undefined, limit: 8 })
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [opportunityId, setOpportunityId] = useState('')
  const [label, setLabel] = useState('')
  const [startedOn, setStartedOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [consultantId, setConsultantId] = useState('')

  const account = fixed ? { id: fixed.account_id, name: fixed.company_name ?? fixed.label } : picked
  const create = useCreateMission(account?.id ?? '')

  const accountChoices = useMemo(
    () => accountsQuery.data?.pages.flatMap(page => page.data).slice(0, 8) ?? [],
    [accountsQuery.data],
  )
  const affaires = useMemo(
    () => (projects.data ?? []).filter(project => project.account_id === account?.id),
    [projects.data, account?.id],
  )

  const endsBeforeStart = Boolean(startedOn && endsOn && endsOn < startedOn)
  const rate = dailyRate.trim() === '' ? null : Number(dailyRate)
  const rateInvalid = rate !== null && !(rate > 0)
  const ready = Boolean(account && label.trim() && startedOn) && !endsBeforeStart && !rateInvalid

  const submit = () => {
    if (!ready || !account) return
    const body: CreateMissionRequest = { accountId: account.id, label: label.trim(), startedOn }
    if (endsOn) body.endsOn = endsOn
    if (rate !== null) body.dailyRate = rate
    if (consultantId) body.consultantId = consultantId
    const affaire = projectId ?? opportunityId
    if (affaire) body.opportunityId = affaire
    create.mutate(body, { onSuccess: onCreated })
  }

  // Refonte Théo PR12 — la grammaire du dossier de mission (`c/missions-dossier`) : le formulaire se
  // range en trois blocs `.ht-block` (surtitre, titre, phrase), dans l'ordre du dossier — le client,
  // la mission, les conditions — et ses deux gestes en pied, à droite (`.dialog-footer`).
  return (
    <form
      data-theo-form="mission-create"
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <FormBlock id="mission-create-client" section="client">
        {fixed || picked ? (
          <Field id="mission-create-account-fixed" label={t('createForm.account')}>
            <Box display="flex" className="items-center gap-2">
              <Text size="sm" weight="medium">
                {account?.name}
              </Text>
              {!fixed ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(null)}>
                  {t('createForm.changeAccount')}
                </Button>
              ) : null}
            </Box>
          </Field>
        ) : (
          <Field id="mission-create-account" label={t('createForm.account')} required>
            <Input
              id="mission-create-account"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t('createForm.accountPlaceholder')}
              autoComplete="off"
            />
            {search.trim() ? (
              <Box className="flex flex-col gap-1" role="list">
                {accountChoices.map(choice => (
                  <Button
                    key={choice.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start pointer-coarse:min-h-11"
                    onClick={() => setPicked({ id: choice.id, name: choice.company_name })}
                  >
                    {choice.company_name}
                  </Button>
                ))}
              </Box>
            ) : null}
          </Field>
        )}
        {!projectId && account && affaires.length > 0 ? (
          <Field id="mission-create-affaire" label={t('createForm.affaire')}>
            <SelectField
              id="mission-create-affaire"
              ariaLabel={t('createForm.affaire')}
              value={opportunityId}
              onChange={setOpportunityId}
              placeholder={t('createForm.affairePlaceholder')}
              emptyOption={{ label: t('createForm.noAffaire') }}
              options={affaires.map(project => ({ value: project.id, label: project.label }))}
            />
          </Field>
        ) : null}
      </FormBlock>

      <FormBlock id="mission-create-mission" section="mission">
        <Field id="mission-create-label" label={t('createForm.label')} required>
          <Input id="mission-create-label" value={label} onChange={event => setLabel(event.target.value)} />
        </Field>
        <Box className="grid gap-4 sm:grid-cols-2">
          <Field id="mission-create-start" label={t('createForm.startedOn')} required>
            <Input
              id="mission-create-start"
              type="date"
              value={startedOn}
              onChange={event => setStartedOn(event.target.value)}
            />
          </Field>
          <Field id="mission-create-end" label={t('createForm.endsOn')}>
            <Input
              id="mission-create-end"
              type="date"
              value={endsOn}
              onChange={event => setEndsOn(event.target.value)}
            />
            {endsBeforeStart ? (
              <Box role="alert">
                <Text size="xs" color="text-[var(--danger-soft-text)]">
                  {t('createForm.endBeforeStart')}
                </Text>
              </Box>
            ) : null}
          </Field>
        </Box>
      </FormBlock>

      <FormBlock id="mission-create-conditions" section="conditions">
        <Box className="grid gap-4 sm:grid-cols-2">
          <Field id="mission-create-rate" label={t('createForm.dailyRate')}>
            <Input
              id="mission-create-rate"
              type="number"
              inputMode="decimal"
              min={0}
              value={dailyRate}
              onChange={event => setDailyRate(event.target.value)}
            />
          </Field>
          <Field id="mission-create-consultant" label={t('createForm.consultant')}>
            <SelectField
              id="mission-create-consultant"
              ariaLabel={t('createForm.consultant')}
              value={consultantId}
              onChange={setConsultantId}
              placeholder={t('createForm.consultantPlaceholder')}
              emptyOption={{ label: t('createForm.noConsultant') }}
              options={(consultants.data ?? []).map(c => ({ value: c.id, label: c.full_name ?? c.id }))}
            />
          </Field>
        </Box>
      </FormBlock>

      <Box
        display="flex"
        data-theo-block="form-footer"
        className="flex-wrap items-center justify-end gap-2 border-t border-[var(--bellum-border)] pt-4"
      >
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-11">
          {t('createForm.cancel')}
        </Button>
        <Button type="submit" disabled={!ready || create.isPending} isLoading={create.isPending} className="min-h-11">
          {t('createForm.submit')}
        </Button>
      </Box>
    </form>
  )
}

/** `.ht-block` — un bloc du formulaire : surtitre, titre de section, phrase, puis ses champs. */
function FormBlock({
  id,
  section,
  children,
}: {
  id: string
  section: 'client' | 'mission' | 'conditions'
  children: React.ReactNode
}) {
  const { t } = useTranslation('missions')
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-theo-section={section}
      className="flex flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-5"
    >
      <header>
        <Text
          element="p"
          size="xs"
          weight="semibold"
          color="var(--bellum-text-muted)"
          className="uppercase tracking-wide"
        >
          {t(`createForm.sections.${section}.eyebrow`)}
        </Text>
        <Text element="h2" id={`${id}-title`} size="base" weight="semibold" className="mt-1">
          {t(`createForm.sections.${section}.title`)}
        </Text>
        <Text element="p" size="sm" color="var(--bellum-text-secondary)" className="mt-1">
          {t(`createForm.sections.${section}.lede`)}
        </Text>
      </header>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation('missions')
  const requiredLabel = t('createForm.required')
  return (
    <Box className="flex flex-col gap-1">
      <Box display="flex" className="items-baseline gap-1">
        {id.endsWith('-fixed') ? (
          <Text size="xs" weight="medium" color="var(--bellum-text-secondary)">
            {label}
          </Text>
        ) : (
          <label htmlFor={id}>
            <Text size="xs" weight="medium" color="var(--bellum-text-secondary)">
              {label}
            </Text>
          </label>
        )}
        {required ? (
          <Text size="xs" color="var(--bellum-text-muted)">
            <span aria-hidden="true">*</span>
            <span className="sr-only">{requiredLabel}</span>
          </Text>
        ) : null}
      </Box>
      {children}
    </Box>
  )
}
