import { useState } from 'react'
import type { FeedbackAxis, MatchNeed, NextBestMoveOption, RemotePreference, RequiredSkill } from '@bellum/contracts'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { useConsultants } from '@/features/consultants/hooks'
import { useOpenNeed } from '@/features/projects/open-needs/hooks/useOpenNeed'
import { NeedExternalSourcing } from '@/features/projects/open-needs/view/NeedExternalSourcing'

/**
 * #2178.11-.17 — LES ARBITRAGES D'UN ZÉRO RÉSULTAT, DEVENUS DES GESTES GUIDÉS.
 *
 * Avant : chaque arbitrage était un LIEN vers une page (fiche du besoin,
 * vivier) où l'utilisateur devait retrouver seul le champ à changer. Ici,
 * UN dialogue générique (pas sept — même discipline que c75) ouvre le geste
 * sur place :
 *  - clarifier (.11), négocier (.12), élargir la zone (.13), élargir le
 *    contrat (.14) → les SEULS champs du besoin que le geste touche, préremplis
 *    depuis la fiche, écrits par le PATCH existant au clic « Enregistrer » —
 *    jamais avant ;
 *  - réactiver (.15) → le vivier FILTRÉ sur les profils indisponibles ou
 *    archivés, chacun vers sa fiche. Rien n'est écrit ;
 *  - recommandation (.16) → un BROUILLON déterministe (aucun prompt) à copier :
 *    Laura prépare, le commercial envoie. Rien ne part d'ici ;
 *  - sourcer (.17) → la recherche externe EXISTANTE (`NeedExternalSourcing`),
 *    qui ne part que sur son propre bouton « Lancer » — aucune collecte à
 *    l'ouverture.
 *
 * #2178.33 — `proposedBy` : le même dialogue, ouvert depuis ce que les refus
 * client disent du besoin. L'origine est NOMMÉE et la mise à jour attend la
 * validation : le feedback PROPOSE, il ne réécrit rien, et il ne pèse JAMAIS
 * sur le classement (#2178.34 écarté).
 */
export type GuidedGesture = Extract<
  NextBestMoveOption,
  'clarifier' | 'negocier' | 'elargir' | 'elargir_contrat' | 'reactiver' | 'recommandation' | 'sourcer'
>

const GUIDED: ReadonlySet<NextBestMoveOption> = new Set([
  'clarifier',
  'negocier',
  'elargir',
  'elargir_contrat',
  'reactiver',
  'recommandation',
  'sourcer',
])

export function isGuidedGesture(option: NextBestMoveOption): option is GuidedGesture {
  return GUIDED.has(option)
}

/** #2178.33 — quel geste un axe de refus client PROPOSE. `null` = aucun champ du besoin ne lui répond. */
export function gestureForFeedbackAxis(axis: FeedbackAxis): GuidedGesture | null {
  switch (axis) {
    case 'price':
    case 'technical':
      return 'negocier'
    case 'location':
      return 'elargir'
    case 'seniority':
    case 'timing':
    case 'experience':
      return 'clarifier'
    default:
      return null
  }
}

type NeedPatch = {
  seniority?: string | null
  start_on?: string | null
  duration_months?: number | null
  target_tjm_cents?: number | null
  skills?: RequiredSkill[]
  location?: string | null
  remote?: RemotePreference | null
  contract_kind?: 'regie' | 'forfait' | 'recrutement'
}

function useUpdateNeedFromMatching(needId: string) {
  const client = useQueryClient()
  const { t } = useTranslation('matching')
  return useMutation<unknown, Error, NeedPatch>({
    mutationFn: patch => apiFetch({ path: `/projects/needs/${needId}`, method: 'PATCH', body: patch }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['open-needs'] })
      toast.success(t('gesture.saved'))
    },
    onError: error => toast.error(error.message || t('gesture.saveError')),
  })
}

export function NextBestMoveGestureDialog({
  option,
  need,
  onOpenChange,
  proposedBy,
}: {
  option: GuidedGesture
  need: MatchNeed
  onOpenChange: (open: boolean) => void
  proposedBy?: FeedbackAxis
}) {
  const { t } = useTranslation('matching')
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(`nextBestMove.options.${option}`)}</DialogTitle>
          <DialogDescription>{t(`gesture.${option}.description`)}</DialogDescription>
        </DialogHeader>
        {proposedBy ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {/* GA-26 — le libellé d'un axe de feedback vit dans `submissions`. */}
            {t('gesture.proposedBy', { axis: t(`submissions:feedback.axis.${proposedBy}`) })}
          </Text>
        ) : null}
        <GestureBody option={option} need={need} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function GestureBody({ option, need, onDone }: { option: GuidedGesture; need: MatchNeed; onDone: () => void }) {
  const { t } = useTranslation('matching')
  const needId = need.needId
  switch (option) {
    case 'clarifier':
    case 'negocier':
    case 'elargir':
    case 'elargir_contrat':
      // Un rapprochement hors d'un besoin enregistré n'a pas de fiche à modifier.
      return needId ? (
        <NeedFieldsForm option={option} needId={needId} onDone={onDone} />
      ) : (
        <Text size="sm">{t('gesture.needUnavailable')}</Text>
      )
    case 'reactiver':
      return <UnavailableProfiles />
    case 'recommandation':
      return <RecommendationDraft need={need} />
    case 'sourcer':
      return needId ? (
        <Box className="pt-2">
          <NeedExternalSourcing
            needId={needId}
            needTitle={need.role}
            skillTerms={need.skills.map(skill => skill.term)}
            headcount={1}
            onImportResult={onDone}
          />
        </Box>
      ) : (
        <Text size="sm">{t('gesture.needUnavailable')}</Text>
      )
  }
}

/* ------------------------------------------------------------------ */
/* .11-.14 — les champs du besoin, préremplis, écrits au clic         */
/* ------------------------------------------------------------------ */

const REMOTE_CHOICES: readonly RemotePreference[] = ['sur_site', 'hybride', 'full_remote', 'indifferent']
const CONTRACT_CHOICES = ['regie', 'forfait', 'recrutement'] as const

function NeedFieldsForm({
  option,
  needId,
  onDone,
}: {
  option: 'clarifier' | 'negocier' | 'elargir' | 'elargir_contrat'
  needId: string
  onDone: () => void
}) {
  const { t } = useTranslation('matching')
  const { need, isPending } = useOpenNeed(needId)
  const update = useUpdateNeedFromMatching(needId)
  if (isPending) return <Text size="sm">{t('gesture.loading')}</Text>
  if (!need) return <Text size="sm">{t('gesture.needUnavailable')}</Text>
  // La clé remonte le formulaire quand la fiche arrive : l'état local part de
  // la fiche lue, jamais d'un champ vide qui écraserait la valeur en base.
  return (
    <NeedFieldsEditor
      key={need.id}
      option={option}
      initial={{
        seniority: need.seniority,
        start_on: need.start_on,
        duration_months: need.duration_months,
        target_tjm_cents: need.target_tjm_cents,
        skills: need.skills,
        location: need.location,
        remote: need.remote ?? null,
        contract_kind: need.contract_kind,
      }}
      saving={update.isPending}
      onSave={patch => update.mutate(patch, { onSuccess: onDone })}
    />
  )
}

type NeedFields = {
  seniority: string | null
  start_on: string | null
  duration_months: number | null
  target_tjm_cents: number | null
  skills: RequiredSkill[]
  location: string | null
  remote: RemotePreference | null
  contract_kind: string
}

function NeedFieldsEditor({
  option,
  initial,
  saving,
  onSave,
}: {
  option: 'clarifier' | 'negocier' | 'elargir' | 'elargir_contrat'
  initial: NeedFields
  saving: boolean
  onSave: (patch: NeedPatch) => void
}) {
  const { t } = useTranslation('matching')
  const [seniority, setSeniority] = useState(initial.seniority ?? '')
  const [startOn, setStartOn] = useState(initial.start_on ?? '')
  const [duration, setDuration] = useState(initial.duration_months == null ? '' : String(initial.duration_months))
  const [rate, setRate] = useState(initial.target_tjm_cents == null ? '' : String(initial.target_tjm_cents / 100))
  const [relaxed, setRelaxed] = useState<ReadonlySet<string>>(new Set())
  const [location, setLocation] = useState(initial.location ?? '')
  const [remote, setRemote] = useState<RemotePreference | null>(initial.remote)
  const [contract, setContract] = useState(initial.contract_kind)

  const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim())
  const numberOrNull = (value: string) =>
    value.trim().length === 0 || Number.isNaN(Number(value)) ? null : Number(value)

  // Chaque geste n'écrit QUE ses champs : un PATCH qui renverrait toute la
  // fiche écraserait ce qu'un collègue a changé entre-temps.
  const patch = (): NeedPatch => {
    switch (option) {
      case 'clarifier': {
        const months = numberOrNull(duration)
        return {
          seniority: blankToNull(seniority),
          start_on: blankToNull(startOn),
          duration_months: months === null ? null : Math.round(months),
        }
      }
      case 'negocier': {
        const euros = numberOrNull(rate)
        return {
          target_tjm_cents: euros === null ? null : Math.round(euros * 100),
          // La compétence entière est gardée (niveau, preuve) : seul `required` change.
          skills: initial.skills.map(skill => (relaxed.has(skill.term) ? { ...skill, required: false } : skill)),
        }
      }
      case 'elargir':
        return { location: blankToNull(location), remote }
      case 'elargir_contrat':
        return { contract_kind: contract as (typeof CONTRACT_CHOICES)[number] }
    }
  }

  return (
    <form
      className="flex flex-col gap-3 pt-2"
      onSubmit={event => {
        event.preventDefault()
        onSave(patch())
      }}
    >
      {option === 'clarifier' ? (
        <>
          <Field id="gesture-seniority" label={t('gesture.fields.seniority')}>
            <Input id="gesture-seniority" value={seniority} onChange={event => setSeniority(event.target.value)} />
          </Field>
          <Field id="gesture-start" label={t('gesture.fields.startOn')}>
            <Input id="gesture-start" type="date" value={startOn} onChange={event => setStartOn(event.target.value)} />
          </Field>
          <Field id="gesture-duration" label={t('gesture.fields.duration')}>
            <Input
              id="gesture-duration"
              type="number"
              min={1}
              value={duration}
              onChange={event => setDuration(event.target.value)}
            />
          </Field>
        </>
      ) : null}

      {option === 'negocier' ? (
        <>
          <Field id="gesture-rate" label={t('gesture.fields.targetRate')}>
            <Input
              id="gesture-rate"
              type="number"
              min={0}
              value={rate}
              onChange={event => setRate(event.target.value)}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('gesture.fields.relaxSkills')}</legend>
            {initial.skills.filter(skill => skill.required !== false).length === 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('gesture.fields.noRequiredSkill')}
              </Text>
            ) : (
              initial.skills
                .filter(skill => skill.required !== false)
                .map(skill => (
                  <label key={skill.term} className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      aria-label={t('gesture.fields.relaxSkill', { term: skill.term })}
                      checked={relaxed.has(skill.term)}
                      onCheckedChange={checked =>
                        setRelaxed(current => {
                          const next = new Set(current)
                          if (checked === true) next.add(skill.term)
                          else next.delete(skill.term)
                          return next
                        })
                      }
                    />
                    {skill.term}
                  </label>
                ))
            )}
          </fieldset>
        </>
      ) : null}

      {option === 'elargir' ? (
        <>
          <Field id="gesture-location" label={t('gesture.fields.location')}>
            <Input id="gesture-location" value={location} onChange={event => setLocation(event.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{t('gesture.fields.remote')}</legend>
            {REMOTE_CHOICES.map(choice => (
              <label key={choice} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="gesture-remote"
                  value={choice}
                  checked={remote === choice}
                  onChange={() => setRemote(choice)}
                />
                {t(`gesture.remote.${choice}`)}
              </label>
            ))}
          </fieldset>
        </>
      ) : null}

      {option === 'elargir_contrat' ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{t('gesture.fields.contract')}</legend>
          {CONTRACT_CHOICES.map(choice => (
            <label key={choice} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="gesture-contract"
                value={choice}
                checked={contract === choice}
                onChange={() => setContract(choice)}
              />
              {t(`gesture.contract.${choice}`)}
            </label>
          ))}
        </fieldset>
      ) : null}

      <Box display="flex" className="justify-end gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {t('gesture.save')}
        </Button>
      </Box>
    </form>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* .15 — le vivier filtré sur les profils indisponibles               */
/* ------------------------------------------------------------------ */

function UnavailableProfiles() {
  const { t } = useTranslation('matching')
  const consultants = useConsultants()
  // « Momentanément indisponible » = archivé OU déclaré indisponible : les
  // deux se réactivent sur la fiche, jamais d'ici (rien n'est écrit).
  const asleep = (consultants.data ?? []).filter(
    consultant => consultant.archived_at != null || consultant.availability === 'indisponible',
  )
  if (asleep.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('gesture.reactiver.empty')}
      </Text>
    )
  }
  return (
    <ul className="flex flex-col gap-1 pt-2">
      {asleep.map(consultant => (
        <li key={consultant.id}>
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link to="/consultants/$id" params={{ id: consultant.id }}>
              {consultant.full_name ?? t('card.unknownName')}
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* .16 — la demande de recommandation, en BROUILLON                   */
/* ------------------------------------------------------------------ */

function RecommendationDraft({ need }: { need: MatchNeed }) {
  const { t } = useTranslation('matching')
  const required = need.skills.filter(skill => skill.required).map(skill => skill.label)
  // Déterministe, aucun prompt (#2178.36) : un gabarit traduit, rempli des
  // seuls faits du besoin. Modifiable avant copie ; jamais envoyé d'ici.
  const [draft, setDraft] = useState(() =>
    t('gesture.recommandation.template', {
      role: need.role,
      skills: required.length > 0 ? required.join(', ') : t('gesture.recommandation.noSkill'),
    }),
  )
  return (
    <Box className="flex flex-col gap-2 pt-2">
      <label htmlFor="gesture-draft" className="text-sm font-medium">
        {t('gesture.recommandation.label')}
      </label>
      <Textarea id="gesture-draft" rows={7} value={draft} onChange={event => setDraft(event.target.value)} />
      <Box display="flex" className="flex-wrap justify-end gap-2">
        {need.accountId ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/accounts/$id" params={{ id: need.accountId }} search={{ tab: 'contacts' }}>
              {t('gesture.recommandation.pickRecipient')}
            </Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(draft)
              .then(() => toast.success(t('gesture.recommandation.copied')))
              .catch(() => toast.error(t('gesture.recommandation.copyError')))
          }
        >
          {t('gesture.recommandation.copy')}
        </Button>
      </Box>
    </Box>
  )
}
