import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormTextareaField,
  SelectField,
  Switch,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FIELD_REPORT_CONFIDENCE_LEVELS, FIELD_REPORT_CONFIDENTIALITY_LEVELS } from '@bellum/contracts'
import type { FieldReportConfidenceLevel, FieldReportConfidentialityLevel } from '@bellum/contracts'
import { formatDateTime } from '@/lib/locale'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { toList } from '../../lib/consultantForm'
import { useRecordFieldReport } from '../../hooks'

/**
 * #3406 (retour bêta #3406) — capitaliser une information terrain remontée
 * par ce consultant, avec consentement et sans le mettre en difficulté.
 *
 * La trame à trois questions du retour bêta groupe les champs structurés,
 * elle n'ouvre pas trois textes libres en plus (voir le docblock de
 * `consultantFieldReportSchema`, packages/contracts) : Q1 « où travailles-tu »
 * → entité/équipe/manager ; Q2 « qui décide » → sponsor/décideurs ; Q3 « qui
 * contacter » → personnes à contacter/introduction possible.
 *
 * APPEND-ONLY : ce formulaire n'édite ni ne supprime rien, il ajoute une
 * entrée de plus à l'historique (doctrine « on archive, on ne supprime pas »).
 */
export function TalentFieldReportDialog({
  talentId,
  open,
  onOpenChange,
}: {
  talentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  const record = useRecordFieldReport()
  const currentUser = useCurrentUserStore(state => state.currentUser)
  const { data: profile } = useProfile()
  // #3406 : on nomme la personne ; l'e-mail ne sert que faute de nom.
  const recorderName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()

  const [accountName, setAccountName] = useState('')
  const [entity, setEntity] = useState('')
  const [team, setTeam] = useState('')
  const [manager, setManager] = useState('')
  const [project, setProject] = useState('')
  const [technologies, setTechnologies] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [partnersObserved, setPartnersObserved] = useState('')
  const [painPoints, setPainPoints] = useState('')
  const [possibleSponsor, setPossibleSponsor] = useState('')
  const [decisionMakers, setDecisionMakers] = useState('')
  const [uncoveredNeed, setUncoveredNeed] = useState('')
  const [peopleToContact, setPeopleToContact] = useState('')
  const [introductionPossible, setIntroductionPossible] = useState('')
  const [notForCommercialUse, setNotForCommercialUse] = useState(false)
  const [confidentialityLevel, setConfidentialityLevel] = useState<FieldReportConfidentialityLevel>('interne')
  const [usageAuthorization, setUsageAuthorization] = useState('')
  const [scope, setScope] = useState('')
  const [confidence, setConfidence] = useState<FieldReportConfidenceLevel>('moyenne')

  const reset = () => {
    setAccountName('')
    setEntity('')
    setTeam('')
    setManager('')
    setProject('')
    setTechnologies('')
    setTeamSize('')
    setPartnersObserved('')
    setPainPoints('')
    setPossibleSponsor('')
    setDecisionMakers('')
    setUncoveredNeed('')
    setPeopleToContact('')
    setIntroductionPossible('')
    setNotForCommercialUse(false)
    setConfidentialityLevel('interne')
    setUsageAuthorization('')
    setScope('')
    setConfidence('moyenne')
  }

  // #3406 (recette 30/09, « vu en passant ») — Échap/clic-hors-cadre passent
  // par le `onOpenChange` de `Dialog`, qui appelait déjà `reset()` ; le bouton
  // « Annuler » appelait directement le `onOpenChange` du PARENT et sautait ce
  // `reset()` — deux chemins de fermeture divergents pour un même geste.
  // Un seul chemin désormais, pour les deux.
  const close = () => {
    reset()
    onOpenChange(false)
  }

  const submit = () => {
    record
      .mutateAsync({
        id: talentId,
        input: {
          accountName: accountName.trim() || null,
          entity: entity.trim() || null,
          team: team.trim() || null,
          manager: manager.trim() || null,
          project: project.trim() || null,
          technologies: toList(technologies),
          teamSize: teamSize.trim() || null,
          partnersObserved: toList(partnersObserved),
          painPoints: painPoints.trim() || null,
          possibleSponsor: possibleSponsor.trim() || null,
          decisionMakers: toList(decisionMakers),
          uncoveredNeed: uncoveredNeed.trim() || null,
          peopleToContact: toList(peopleToContact),
          introductionPossible: introductionPossible.trim() || null,
          notForCommercialUse,
          confidentialityLevel,
          usageAuthorization: usageAuthorization.trim() || null,
          scope: scope.trim() || null,
          confidence,
        },
      })
      .then(() => {
        close()
      })
      .catch(() => {
        // Le toast d'échec est déjà porté par `useRecordFieldReport` — le
        // formulaire reste rempli pour ne pas perdre la saisie.
      })
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(next) : close())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('detail.fieldReports.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('detail.fieldReports.dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('detail.fieldReports.question1')}
            </Text>
            <FormField
              label={t('detail.fieldReports.accountName')}
              inputProps={{ value: accountName, onChange: e => setAccountName(e.target.value), maxLength: 200 }}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                label={t('detail.fieldReports.entity')}
                inputProps={{ value: entity, onChange: e => setEntity(e.target.value), maxLength: 200 }}
              />
              <FormField
                label={t('detail.fieldReports.team')}
                inputProps={{ value: team, onChange: e => setTeam(e.target.value), maxLength: 200 }}
              />
              <FormField
                label={t('detail.fieldReports.manager')}
                inputProps={{ value: manager, onChange: e => setManager(e.target.value), maxLength: 200 }}
              />
              <FormField
                label={t('detail.fieldReports.project')}
                inputProps={{ value: project, onChange: e => setProject(e.target.value), maxLength: 200 }}
              />
            </div>
            <FormField
              label={t('detail.fieldReports.technologies')}
              description={t('detail.fieldReports.listHint')}
              inputProps={{ value: technologies, onChange: e => setTechnologies(e.target.value) }}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                label={t('detail.fieldReports.teamSize')}
                inputProps={{ value: teamSize, onChange: e => setTeamSize(e.target.value), maxLength: 80 }}
              />
              <FormField
                label={t('detail.fieldReports.partnersObserved')}
                description={t('detail.fieldReports.listHint')}
                inputProps={{ value: partnersObserved, onChange: e => setPartnersObserved(e.target.value) }}
              />
            </div>
            <FormTextareaField
              label={t('detail.fieldReports.painPoints')}
              inputProps={{ value: painPoints, onChange: e => setPainPoints(e.target.value), rows: 2, maxLength: 1000 }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('detail.fieldReports.question2')}
            </Text>
            <FormField
              label={t('detail.fieldReports.possibleSponsor')}
              inputProps={{ value: possibleSponsor, onChange: e => setPossibleSponsor(e.target.value), maxLength: 200 }}
            />
            <FormField
              label={t('detail.fieldReports.decisionMakers')}
              description={t('detail.fieldReports.listHint')}
              inputProps={{ value: decisionMakers, onChange: e => setDecisionMakers(e.target.value) }}
            />
            <FormTextareaField
              label={t('detail.fieldReports.uncoveredNeed')}
              inputProps={{
                value: uncoveredNeed,
                onChange: e => setUncoveredNeed(e.target.value),
                rows: 2,
                maxLength: 1000,
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('detail.fieldReports.question3')}
            </Text>
            <FormField
              label={t('detail.fieldReports.peopleToContact')}
              description={t('detail.fieldReports.listHint')}
              inputProps={{ value: peopleToContact, onChange: e => setPeopleToContact(e.target.value) }}
            />
            <FormField
              label={t('detail.fieldReports.introductionPossible')}
              inputProps={{
                value: introductionPossible,
                onChange: e => setIntroductionPossible(e.target.value),
                maxLength: 500,
              }}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('detail.fieldReports.provenance')}
            </Text>
            {/* #3406 (recette 30/09) — « qui l'a déclarée, quand » se VOIT avant
                d'enregistrer, pas seulement dans l'historique une fois la fiche
                sauvegardée (`TalentFieldReportsSection.tsx:58-59`, même formule). */}
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('detail.fieldReports.recordedBy', {
                name: recorderName || currentUser?.email || t('detail.fieldReports.recordedByUnknown'),
                date: formatDateTime(new Date().toISOString()),
              })}
            </Text>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-[var(--bellum-text-muted)]">
                {t('detail.fieldReports.confidentialityLevel')}
                <SelectField
                  value={confidentialityLevel}
                  onChange={next => setConfidentialityLevel(next as FieldReportConfidentialityLevel)}
                  options={FIELD_REPORT_CONFIDENTIALITY_LEVELS.map(value => ({
                    value,
                    label: t(`detail.fieldReports.confidentialityLevels.${value}`),
                  }))}
                  ariaLabel={t('detail.fieldReports.confidentialityLevel')}
                  size="sm"
                  className="w-full"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--bellum-text-muted)]">
                {t('detail.fieldReports.confidence')}
                <SelectField
                  value={confidence}
                  onChange={next => setConfidence(next as FieldReportConfidenceLevel)}
                  options={FIELD_REPORT_CONFIDENCE_LEVELS.map(value => ({
                    value,
                    label: t(`detail.fieldReports.confidenceLevels.${value}`),
                  }))}
                  ariaLabel={t('detail.fieldReports.confidence')}
                  size="sm"
                  className="w-full"
                />
              </label>
            </div>
            <FormField
              label={t('detail.fieldReports.usageAuthorization')}
              inputProps={{
                value: usageAuthorization,
                onChange: e => setUsageAuthorization(e.target.value),
                maxLength: 500,
              }}
            />
            <FormField
              label={t('detail.fieldReports.scope')}
              inputProps={{ value: scope, onChange: e => setScope(e.target.value), maxLength: 500 }}
            />
            <div className="flex items-center gap-3 rounded-md border border-[var(--bellum-border)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <Text size="sm" weight="medium">
                  {t('detail.fieldReports.notForCommercialUse')}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('detail.fieldReports.notForCommercialUseHint')}
                </Text>
              </div>
              <Switch
                checked={notForCommercialUse}
                aria-label={t('detail.fieldReports.notForCommercialUse')}
                onCheckedChange={setNotForCommercialUse}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" disabled={record.isPending} onClick={submit}>
            {t('detail.fieldReports.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
