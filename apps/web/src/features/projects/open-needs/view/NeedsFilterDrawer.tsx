import {
  CONTRACT_KINDS,
  NEED_FILTERS_UNAVAILABLE,
  NEED_SOURCES,
  NEED_URGENCIES,
  NEED_THEO_STATUSES,
  PROJECT_NEED_STATUSES,
  activeNeedFilterCount,
  emptyNeedFilters,
  type NeedFilters,
  isNeedCandidateStage,
} from '@bellum/contracts'
import {
  Box,
  Button,
  Input,
  Label,
  ScrollArea,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SavedNeedViews } from './SavedNeedViews'

/**
 * Le tiroir « Plus de filtres » (PDF-03 §1.3, I-34).
 *
 * Le défaut qu'il ferme : le contrat serveur expose DOUZE critères et l'écran
 * n'en câblait que trois. Neuf filtres livrés, testés, qu'aucune interface
 * n'atteignait.
 *
 * Deux règles portent ce tiroir.
 *
 * 1. **On n'applique qu'au clic.** Les filtres se posent dans un état LOCAL et
 *    ne remontent qu'avec « Appliquer ». Un tiroir qui filtre à chaque frappe
 *    relance une requête par caractère sur un écran paginé, et fait clignoter
 *    la liste qu'on est en train de regarder.
 * 2. **Ce que le serveur ne sait pas filtrer est NOMMÉ.** La source demande
 *    aussi le tarif, la durée, les langues, les habilitations, l'origine, le
 *    canal et le propriétaire — aucun n'existe côté serveur. Livrer les
 *    contrôles quand même produirait des cases qui ne filtrent rien ; les taire
 *    ferait qu'on ne saurait plus, dans six mois, si c'est un oubli ou un choix.
 */
export function NeedsFilterDrawer({
  open,
  onOpenChange,
  filters,
  searchTerm,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: NeedFilters
  /**
   * Le terme de recherche de l'écran. Il vit dans la barre du haut et pas dans
   * ce tiroir, mais c'est un CRITÈRE : une vue enregistrée qui le perdrait
   * rendrait, une semaine plus tard, une liste qui ne correspond plus à son nom.
   */
  searchTerm: string
  onApply: (filters: NeedFilters) => void
}) {
  const { t } = useTranslation('projects')
  const [draft, setDraft] = useState<NeedFilters>({ ...filters, q: searchTerm })

  // Rouvrir le tiroir doit montrer ce qui est RÉELLEMENT appliqué, pas le
  // brouillon abandonné la fois d'avant — sinon « Appliquer » reposerait des
  // critères que l'utilisateur croyait avoir laissés tomber.
  useEffect(() => {
    if (open) setDraft({ ...filters, q: searchTerm })
  }, [open, filters, searchTerm])

  const set = <K extends keyof NeedFilters>(key: K, value: NeedFilters[K]) =>
    setDraft(current => ({ ...current, [key]: value }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">{t('openNeeds.drawer.title')}</SheetTitle>
          <SheetDescription>{t('openNeeds.drawer.description')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <Box className="space-y-4 px-5 py-4">
            <Field label={t('openNeeds.filters.skill')}>
              <Input value={draft.skill} onChange={event => set('skill', event.target.value)} />
            </Field>
            <Field label={t('openNeeds.filters.seniority')}>
              <Input value={draft.seniority} onChange={event => set('seniority', event.target.value)} />
            </Field>
            <Field label={t('openNeeds.filters.location')}>
              <Input value={draft.location} onChange={event => set('location', event.target.value)} />
            </Field>

            <Field label={t('openNeeds.filters.urgency')}>
              <Choice
                value={draft.urgency}
                onChange={value => set('urgency', value as NeedFilters['urgency'])}
                anyLabel={t('openNeeds.filters.any')}
                options={NEED_URGENCIES.map(value => ({ value, label: t(`openNeeds.urgency.${value}`, value) }))}
              />
            </Field>
            {/* Théo C projects-besoins.R3 — le statut AFFICHÉ (trois valeurs) ;
                l'état précis se filtre plus bas, comme étiquette. */}
            <Field label={t('openNeeds.filters.status')}>
              <Choice
                value={draft.theo_status}
                onChange={value => set('theo_status', value as NeedFilters['theo_status'])}
                anyLabel={t('openNeeds.filters.any')}
                options={NEED_THEO_STATUSES.map(value => ({ value, label: t(`needTheoStatus.${value}`) }))}
              />
            </Field>
            <Field label={t('openNeeds.filters.contractKind')}>
              <Choice
                value={draft.contract_kind}
                onChange={value => set('contract_kind', value as NeedFilters['contract_kind'])}
                anyLabel={t('openNeeds.filters.any')}
                options={CONTRACT_KINDS.map(value => ({ value, label: t(`openNeeds.contract.${value}`, value) }))}
              />
            </Field>

            {/* L'ORIGINE (§7.2). Le serveur rendait `need.source` sur chaque
                ligne sans qu'aucun critère ne permette de s'en servir : « ne me
                montre que ce qui vient d'un e-mail client » — la question qui
                dit si un canal d'acquisition vaut la peine — n'avait pas de
                réponse. Un besoin dont personne n'a noté l'origine n'est retenu
                par AUCUNE des douze valeurs, et c'est voulu. */}
            <Field label={t('openNeeds.filters.source')}>
              <Choice
                value={draft.source}
                onChange={value => set('source', value as NeedFilters['source'])}
                anyLabel={t('openNeeds.filters.any')}
                options={NEED_SOURCES.map(value => ({ value, label: t(`openNeeds.source.${value}`, value) }))}
              />
            </Field>

            <Field label={t('openNeeds.filters.preciseState')}>
              <Choice
                value={draft.status}
                onChange={value => set('status', value as NeedFilters['status'])}
                anyLabel={t('openNeeds.filters.any')}
                options={PROJECT_NEED_STATUSES.filter(value => !isNeedCandidateStage(value)).map(value => ({
                  value,
                  label: t(`needStatus.${value}`, value),
                }))}
              />
            </Field>

            <Field label={t('openNeeds.filters.startingWithin')}>
              {/* `null` et non `0` : « je ne filtre pas sur le démarrage » et
                  « ceux qui démarrent aujourd'hui » sont deux questions. */}
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.starting_within_days ?? ''}
                onChange={event => {
                  const raw = event.target.value.trim()
                  set('starting_within_days', raw === '' ? null : Number(raw))
                }}
              />
            </Field>

            <Toggle
              label={t('openNeeds.filters.withoutShortlist')}
              checked={draft.without_shortlist}
              onChange={value => set('without_shortlist', value)}
            />
            <Toggle
              label={t('openNeeds.filters.deadlinePassed')}
              checked={draft.deadline_passed}
              onChange={value => set('deadline_passed', value)}
            />
            <Toggle
              label={t('openNeeds.filters.includeClosed')}
              checked={draft.include_closed}
              onChange={value => set('include_closed', value)}
            />

            {/* Au pied du tiroir : ce qu'on refait tous les matins s'enregistre
                une fois. Ce sont les CRITÈRES qui sont gardés, jamais les
                résultats — une vue qui stockerait des identifiants se périmerait
                le lendemain et afficherait une liste étrangère à son nom. */}
            <SavedNeedViews
              draft={draft}
              onApply={next => {
                onApply(next)
                onOpenChange(false)
              }}
            />

            {/* Ce que le serveur ne sait pas filtrer, DIT. Un tiroir muet sur ce
                qu'il ne fait pas se relit comme un tiroir incomplet. */}
            <Box className="border-t border-border pt-3">
              <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
                {t('openNeeds.drawer.unavailableTitle')}
              </Text>
              <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                {NEED_FILTERS_UNAVAILABLE.map(entry => t(`openNeeds.drawer.unavailable.${entry.key}`, entry.key)).join(
                  ' · ',
                )}
              </Text>
            </Box>
          </Box>
        </ScrollArea>

        <Box display="flex" className="items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => setDraft(emptyNeedFilters())}>
            {t('openNeeds.drawer.reset')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
          >
            {t('openNeeds.drawer.apply', { count: activeNeedFilterCount(draft) })}
          </Button>
        </Box>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </Box>
  )
}

/** Une liste native : elle est tabulable, annoncée par les lecteurs d'écran et
 *  utilisable au pouce sans code supplémentaire. */
function Choice({
  value,
  onChange,
  options,
  anyLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  anyLabel: string
}) {
  return (
    <SelectField
      value={value}
      onChange={next => onChange(next)}
      emptyOption={{ label: anyLabel }}
      options={options.map(option => ({ value: option.value, label: option.label }))}
      size="sm"
      className="w-full"
    />
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-primary)]">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
