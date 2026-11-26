import type { PipelineStage } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
  Text,
} from '@bellum/ui'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCreateProject } from '../hooks/useCreateProject'
import type { OpportunityDraft } from '../model/opportunityDraft'
import { trackedMutation } from '@/lib/product-tracker'

/**
 * #2195.33 — LE FORMULAIRE DE CRÉATION D'UNE AFFAIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau de renouvellement porte un bouton « construire la proposition », et
 * il n'avait aucune destination : le pipe n'avait pas de porte de création. La
 * décision du 16/09/2026 en ouvre une — **et le clic reste la décision de
 * l'humain.** Le bouton NAVIGUE ici, avec le compte et la mission pré-remplis ;
 * c'est le formulaire, donc quelqu'un, qui crée l'affaire.
 *
 * ⚠️ **Rien n'est pré-rempli qu'on ne sache** : le libellé, le montant et la
 * date de clôture restent vides. Proposer « Renouvellement de <mission> » comme
 * nom, ou recopier le TJM de la mission comme montant, ferait passer pour une
 * saisie ce que personne n'a décidé — et un pipe où les montants sont devinés
 * annonce un chiffre faux. Le compte, lui, est un FAIT : la mission en porte un.
 *
 * ⚠️ Aucune valeur de remplissage : un montant laissé vide part à `null`, jamais
 * à `0`. « Non mesuré » n'est pas « mesuré à zéro ».
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  accountId,
  missionId,
  stage,
  draft,
  onCreated,
  onOpenCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Le compte pré-rempli, quand l'appelant en connaît un. */
  accountId?: string
  /** La mission dont cette affaire serait le renouvellement, s'il y en a une. */
  missionId?: string
  /**
   * #2124.11/#2124.13 — l'étape D'ENTRÉE, jamais un champ du formulaire :
   * absente, le serveur pose `PIPELINE_STAGES[0]` (« Créer une opportunité »,
   * `TabProjects.tsx`) ; `'confirmed'` ouvre directement sur l'étape où le
   * pipe range un besoin déjà confirmé, sans qu'un humain ait à l'y glisser
   * après coup.
   */
  stage?: PipelineStage
  /**
   * #3683.2 — un BROUILLON (depuis un signal sans projet) : nom, objectif et contexte repris du fait, ce qui
   * manque dit en toutes lettres. Rien n'est créé avant la validation ; un échec garde ce qui est saisi.
   */
  draft?: OpportunityDraft
  /** L'affaire fraîchement créée — l'écran appelant décide de la suite. */
  onCreated?: (projectId: string, label: string) => void
  /** #3683.4 — « montrer ce qui est créé + un lien » : fourni, le toast de succès nomme l'affaire et l'ouvre. */
  onOpenCreated?: (projectId: string) => void
}) {
  const { t } = useTranslation('projects')
  const create = useCreateProject()
  const fieldId = useId()

  const [account, setAccount] = useState(accountId ?? '')
  const [label, setLabel] = useState(draft?.label ?? '')
  const [objective, setObjective] = useState(draft?.objective ?? '')
  const [closeOn, setCloseOn] = useState('')
  const [amount, setAmount] = useState('')
  // #3266.1 (#3292) — le grain équipe/site/projet, saisi ici et nulle part
  // ailleurs : jamais dérivé de l'org-graph du compte ni d'un axe BTMMP.
  const [scopeLabel, setScopeLabel] = useState('')

  // La liste sert le CHOIX du compte quand l'appelant n'en a pas fourni. Bornée
  // et triée par le serveur : un sélecteur n'est pas une page de recherche.
  const { data: accountPages } = useAccounts({ limit: 100 })
  const accountOptions = useMemo(
    () =>
      (accountPages?.pages ?? [])
        .flatMap(page => page?.data ?? [])
        .map(row => ({ value: row.id, label: row.company_name ?? t('kinds.manual') })),
    [accountPages, t],
  )

  const canSubmit = account.length > 0 && label.trim().length > 0 && !create.isPending

  function submit() {
    if (!canSubmit) return
    // ⚠️ Une chaîne vide n'est pas une valeur : elle part à `null`. Écrire `''`
    // dans `objective` ferait croire que quelqu'un a répondu « rien ».
    const parsedAmount = amount.trim().length > 0 ? Number(amount) : null
    const tracked = trackedMutation('project_created', '/projects')
    create.mutate(
      {
        account_id: account,
        label: label.trim(),
        objective: objective.trim().length > 0 ? objective.trim() : null,
        ...(draft ? { detail: draft.detail } : {}),
        expected_close_on: closeOn.length > 0 ? closeOn : null,
        estimated_amount: parsedAmount !== null && Number.isFinite(parsedAmount) ? parsedAmount : null,
        renewal_of_mission_id: missionId ?? null,
        stage,
        scope_label: scopeLabel.trim().length > 0 ? scopeLabel.trim() : null,
      },
      {
        onSuccess: result => {
          tracked.onSuccess()
          if (onOpenCreated) {
            toast.success(t('create.createdFor', { label: result.project.label }), {
              action: { label: t('create.openCreated'), onClick: () => onOpenCreated(result.project.id) },
            })
          } else {
            toast.success(t('create.done'))
          }
          // Le lien vers la mission renouvelée est DIT quand il n'a pas pu être
          // posé : laisser croire à un rattachement qui n'a pas eu lieu coûte
          // plus cher qu'un message de plus.
          if (missionId && !result.renewal_linked) toast.warning(t('create.renewalNotLinked'))
          onCreated?.(result.project.id, result.project.label)
          onOpenChange(false)
        },
        onError: (error: Error) => {
          tracked.onError()
          toast.error(t('create.failed'), { description: error.message })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>
            {draft
              ? t('create.descriptionDraft')
              : missionId
                ? t('create.descriptionRenewal')
                : stage === 'confirmed'
                  ? t('create.descriptionConfirmedNeed')
                  : t('create.description')}
          </DialogDescription>
        </DialogHeader>

        <Box display="flex" className="flex-col gap-3">
          {draft ? <OpportunityDraftSummary draft={draft} /> : null}
          <Box display="flex" className="flex-col gap-1">
            <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-account`}>
              {t('create.account')}
            </Text>
            <SelectField
              id={`${fieldId}-account`}
              value={account}
              onChange={setAccount}
              emptyOption={{ label: t('create.accountPlaceholder') }}
              options={accountOptions}
            />
          </Box>

          <Box display="flex" className="flex-col gap-1">
            <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-label`}>
              {t('create.label')}
            </Text>
            <Input
              id={`${fieldId}-label`}
              value={label}
              maxLength={200}
              onChange={event => setLabel(event.target.value)}
              placeholder={t('create.labelPlaceholder')}
            />
          </Box>

          <Box display="flex" className="flex-col gap-1">
            <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-objective`}>
              {t('create.objective')}
            </Text>
            <Input
              id={`${fieldId}-objective`}
              value={objective}
              maxLength={500}
              onChange={event => setObjective(event.target.value)}
            />
          </Box>

          <Box display="flex" className="flex-col gap-1">
            <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-scope`}>
              {t('create.scopeLabel')}
            </Text>
            <Input
              id={`${fieldId}-scope`}
              value={scopeLabel}
              maxLength={200}
              onChange={event => setScopeLabel(event.target.value)}
              placeholder={t('create.scopeLabelPlaceholder')}
            />
          </Box>

          <Box display="grid" className="gap-3 md:grid-cols-2">
            <Box display="flex" className="flex-col gap-1">
              <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-close`}>
                {t('create.expectedClose')}
              </Text>
              <Input
                id={`${fieldId}-close`}
                type="date"
                value={closeOn}
                onChange={event => setCloseOn(event.target.value)}
              />
            </Box>
            <Box display="flex" className="flex-col gap-1">
              <Text element="label" size="xs" weight="medium" htmlFor={`${fieldId}-amount`}>
                {t('create.amount')}
              </Text>
              <Input
                id={`${fieldId}-amount`}
                type="number"
                min={0}
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
              />
              {/* Un montant vide reste vide. Le dire évite qu'on saisisse « 0 »
                  pour « je ne sais pas encore » — les deux ne veulent pas dire
                  la même chose dans un pipe. */}
              <Text size="xs" color="text-muted-foreground">
                {t('create.amountHint')}
              </Text>
            </Box>
          </Box>

          <Box display="flex" className="items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {t('create.submit')}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

/** #3683.2 — ce que le signal apporte, et ce qui manque encore : les deux sont DITS, aucun n'est deviné. */
function OpportunityDraftSummary({ draft }: { draft: OpportunityDraft }) {
  const { t } = useTranslation('projects')
  return (
    <Box
      className="space-y-2 rounded-md border border-[var(--bellum-border)] p-3"
      data-testid="opportunity-draft-summary"
    >
      <Text size="xs" weight="medium">
        {t('create.draftFactsTitle')}
      </Text>
      <ul className="space-y-0.5">
        {draft.facts.map(fact => (
          <li key={fact.key}>
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t(`create.draftFact.${fact.key}`)} : {fact.value}
            </Text>
          </li>
        ))}
      </ul>
      {draft.missing.length > 0 ? (
        <>
          <Text size="xs" weight="medium">
            {t('create.draftMissingTitle')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {draft.missing.map(gap => t(`create.draftMissing.${gap}`)).join(' · ')}
          </Text>
        </>
      ) : null}
    </Box>
  )
}
