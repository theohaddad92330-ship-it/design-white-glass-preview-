import { Badge, Button, Card, Checkbox, SelectField, Text, Textarea } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Columns2, Download, FileText, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { toast } from 'sonner'
import { ANONYMISATION_RULES, CV_VERSION_KINDS, type CvVersion, type CvVersionKind } from '@bellum/contracts'
import { downloadDocument } from '@/features/documents/api'
import { rfpApi, rfpKeys } from '@/features/rfp/api'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import {
  useCompareCvVersions,
  useCvVersions,
  useGenerateCvVersion,
  useOpportunitiesForMatch,
  useTalentMissions,
  useUpdateCvVersionSections,
  useValidateCvVersion,
} from '../../hooks'
import { workspaceRuleRefusalText } from '@/lib/data-exit'

/**
 * Le studio de dossier de compétences (PDF 3 §9.1, ticket BEL-ATS-202).
 *
 * Ce que l'écran montre, et qu'aucun autre ne montrait :
 *
 *  - **les compétences BARRÉES**, avec leur raison. Une compétence retirée sans
 *    un mot fait croire que le profil ne l'a pas ; barrée avec « déclarée,
 *    absente du CV » elle prépare la question que le client posera ;
 *  - **l'historique des versions**. Quand un client répond trois semaines plus
 *    tard, on sait ce qu'il a reçu — et une version ne remplace jamais la
 *    précédente.
 */
export function CvStudioPanel({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')
  // #2081.14 — livrable commercial, décision Louis 19/09 : le dossier de
  // compétences (Word, PDF) n'est plus tenu par la règle d'espace « qui peut
  // exporter » — les boutons restent visibles à tous.
  const { data: versions } = useCvVersions(talentId)
  const generate = useGenerateCvVersion(talentId)
  const validate = useValidateCvVersion(talentId)
  const compare = useCompareCvVersions(talentId)
  const updateSections = useUpdateCvVersionSections(talentId)
  const [kind, setKind] = useState<CvVersionKind>('client')
  const [rule, setRule] = useState<string>('')
  // #2187.25-27 — trois sources de génération : un besoin (déjà géré par
  // l'écran de matching), un appel d'offres, une mission comparable. Le
  // studio ne propose que ce qui se VÉRIFIE : les opportunités et les appels
  // d'offres de l'espace, les missions DÉJÀ FAITES par ce consultant.
  // #2939 (#2187.25) — même picker que « Ajouter à un besoin »
  // (`useOpportunitiesForMatch`, `TalentAddToNeedDialog.tsx`) : jamais un
  // second chemin qui lirait les opportunités autrement.
  const opportunities = useOpportunitiesForMatch()
  const rfps = useQuery({ queryKey: rfpKeys.list, queryFn: () => rfpApi.list() })
  const missions = useTalentMissions(talentId)
  // #2939 (#2187.31) — l'auteur EST exposé sur le contrat (`generatedBy`)
  // depuis toujours, jamais affiché nominativement faute de résolution.
  // Absent de la liste des membres (quitté l'espace, jamais résolu) → rien
  // ne s'affiche, jamais un identifiant technique en repli.
  const { data: members } = useWorkspaceMembers()
  const generatedByName = (userId: string | null) =>
    userId
      ? (members?.find(m => m.userId === userId)?.fullName ?? members?.find(m => m.userId === userId)?.email ?? null)
      : null
  const [source, setSource] = useState<string>('')
  const sourceOptions = [
    ...(opportunities.data ?? []).map(opportunity => ({
      value: `opportunity:${opportunity.id}`,
      label: `${t('studio.sourceOpportunity')} — ${opportunity.label}`,
    })),
    ...(rfps.data?.rfps ?? []).map(rfp => ({
      value: `rfp:${rfp.id}`,
      label: `${t('studio.sourceRfp')} — ${rfp.title}`,
    })),
    ...(missions.data ?? []).map(mission => ({
      value: `mission:${mission.missionId}`,
      label: `${t('studio.sourceMission')} — ${mission.label ?? mission.missionId}`,
    })),
  ]
  // #2187.42 — l'action « Comparer » : au plus DEUX versions sélectionnées à
  // la fois, un troisième clic remplace la plus ancienne sélection.
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const toggleCompareSelection = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) return prev.filter(entry => entry !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1]!, id]
    })
  }
  // #2187.42 — l'action « Modifier » : une seule version en édition à la fois.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftSections, setDraftSections] = useState<{ title: string; body: string }[]>([])
  const startEditing = (version: CvVersion) => {
    setEditingId(version.id)
    setDraftSections(version.sections.map(section => ({ ...section })))
  }
  const saveEditing = () => {
    if (!editingId) return
    updateSections
      .mutateAsync({ versionId: editingId, sections: draftSections })
      .then(() => {
        toast.success(t('studio.saved'))
        setEditingId(null)
      })
      .catch((error: Error) => toast.error(error.message || t('studio.saveFailed')))
  }

  // Une version anonyme force les initiales côté serveur, et une version
  // interne n'est jamais anonymisée : laisser choisir donnerait l'illusion
  // d'un choix qui n'existe pas.
  const ruleIsForced = kind !== 'client'

  const compose = () => {
    // #2187.25-27 — au plus une source à la fois : le studio l'encode dans un
    // seul champ (`kind:id`) pour ne jamais pouvoir en cocher deux.
    const sourceInput = source.startsWith('opportunity:')
      ? { opportunityId: source.slice('opportunity:'.length) }
      : source.startsWith('rfp:')
        ? { rfpId: source.slice('rfp:'.length) }
        : source.startsWith('mission:')
          ? { comparableMissionId: source.slice('mission:'.length) }
          : {}
    generate
      .mutateAsync({
        versionKind: kind,
        templateKey: 'default',
        language: 'fr',
        ...sourceInput,
        // Vide ⇒ la règle de l'espace. Redemander la règle à chaque génération
        // ferait cliquer « nom complet » par habitude.
        ...(rule && !ruleIsForced ? { anonymisationRule: rule as (typeof ANONYMISATION_RULES)[number] } : {}),
      })
      .then(() => toast.success(t('studio.generated')))
      .catch((error: Error) => toast.error(error.message || t('studio.failed')))
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4">
        <Text size="sm" weight="semibold">
          {t('studio.title')}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('studio.intro')}
        </Text>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('studio.version')}
            </Text>
            <SelectField
              ariaLabel={t('studio.version')}
              value={kind}
              onChange={next => setKind(next as CvVersionKind)}
              options={CV_VERSION_KINDS.map(value => ({ value: value, label: t(`studio.kinds.${value}`) }))}
              size="sm"
              className="min-w-0 max-w-full"
            />
          </label>

          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('studio.anonymisation')}
            </Text>
            <SelectField
              ariaLabel={t('studio.anonymisation')}
              value={rule}
              onChange={next => setRule(next)}
              emptyOption={{ label: t('studio.workspaceDefault') }}
              options={ANONYMISATION_RULES.map(value => ({ value: value, label: t(`studio.rules.${value}`) }))}
              size="sm"
              disabled={ruleIsForced}
              className="min-w-0 max-w-full"
            />
            {ruleIsForced ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.ruleForced')}
              </Text>
            ) : null}
          </label>

          {/* #2187.25-27 — le studio ne propose que ce qui se VÉRIFIE : les
              appels d'offres de l'espace, les missions déjà faites par ce
              consultant. Un besoin se cible depuis l'écran de matching. */}
          {sourceOptions.length > 0 ? (
            <label className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.source')}
              </Text>
              <SelectField
                ariaLabel={t('studio.source')}
                value={source}
                onChange={next => setSource(next)}
                emptyOption={{ label: t('studio.sourceNone') }}
                options={sourceOptions}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </label>
          ) : null}

          <Button className="gap-1.5" disabled={generate.isPending} onClick={compose}>
            <FileText className="size-4" />
            {generate.isPending ? t('studio.generating') : t('studio.generate')}
          </Button>
        </div>
      </Card>

      {/* #2187.42 — l'action « Comparer » : sélectionner exactement deux
          versions rend le bouton actif. */}
      {(versions ?? []).length >= 2 ? (
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            className="gap-1"
            disabled={selectedForCompare.length !== 2 || compare.isPending}
            onClick={() => {
              const [a, b] = selectedForCompare
              if (!a || !b) return
              compare
                .mutateAsync({ a, b })
                .catch((error: Error) => toast.error(error.message || t('studio.compareFailed')))
            }}
          >
            <Columns2 className="size-3" />
            {compare.isPending ? t('studio.comparing') : t('studio.compare')}
          </Button>
        </div>
      ) : null}

      {compare.data ? (
        <Card className="p-4">
          <Text size="sm" weight="semibold">
            {t('studio.compareResultTitle')}
          </Text>
          <ul className="mt-2 flex flex-col gap-2">
            {compare.data.sections.map(section => (
              <li key={section.title}>
                <Text size="xs" weight="medium">
                  {section.title}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {section.before ?? t('studio.diffAbsent')}
                </Text>
                <Text size="xs">→</Text>
                <Text size="xs">{section.after ?? t('studio.diffAbsent')}</Text>
              </li>
            ))}
          </ul>
          {compare.data.excludedSkillsAdded.length > 0 ? (
            <Text size="xs" className="mt-2">
              {t('studio.diffSkillsAdded')} : {compare.data.excludedSkillsAdded.join(', ')}
            </Text>
          ) : null}
          {compare.data.excludedSkillsRemoved.length > 0 ? (
            <Text size="xs" className="mt-1">
              {t('studio.diffSkillsRemoved')} : {compare.data.excludedSkillsRemoved.join(', ')}
            </Text>
          ) : null}
          {compare.data.highlightedSkillsAdded.length > 0 ? (
            <Text size="xs" className="mt-1">
              {t('studio.diffHighlightedAdded')} : {compare.data.highlightedSkillsAdded.join(', ')}
            </Text>
          ) : null}
          {compare.data.highlightedSkillsRemoved.length > 0 ? (
            <Text size="xs" className="mt-1">
              {t('studio.diffHighlightedRemoved')} : {compare.data.highlightedSkillsRemoved.join(', ')}
            </Text>
          ) : null}
          {compare.data.sections.length === 0 &&
          compare.data.excludedSkillsAdded.length === 0 &&
          compare.data.excludedSkillsRemoved.length === 0 &&
          compare.data.highlightedSkillsAdded.length === 0 &&
          compare.data.highlightedSkillsRemoved.length === 0 ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
              {t('studio.compareNoDiff')}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {(versions ?? []).map(version => (
        <Card key={version.id} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Checkbox
              aria-label={t('studio.compareSelect')}
              checked={selectedForCompare.includes(version.id)}
              onCheckedChange={() => toggleCompareSelection(version.id)}
            />
            <Badge variant="outline">{t(`studio.kinds.${version.versionKind}`)}</Badge>
            <Badge variant="outline">{t(`studio.rules.${version.anonymisationRule}`)}</Badge>
            {/* #2187.25-27 — la source de la version, NOMMÉE : un besoin, un
                appel d'offres, une mission comparable. Rien quand c'est un
                dossier interne — on n'affiche pas ce qu'on n'a pas. */}
            {version.opportunityId ? <Badge variant="outline">{t('studio.sourceOpportunity')}</Badge> : null}
            {version.rfpId ? <Badge variant="outline">{t('studio.sourceRfp')}</Badge> : null}
            {version.comparableMissionId ? <Badge variant="outline">{t('studio.sourceMission')}</Badge> : null}
            {version.needId ? <Badge variant="outline">{t('studio.sourceNeed')}</Badge> : null}
            {/* #2333.9 — Laura NOMME ce qui attend encore une validation,
                jamais un silence qui laisserait croire le dossier prêt. */}
            <Badge variant={version.status === 'pending_validation' ? 'outline' : 'primary'}>
              {t(`studio.status.${version.status}`)}
            </Badge>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {formatDate(version.generatedAt, { dateStyle: 'medium' })}
            </Text>
            {generatedByName(version.generatedBy) ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.generatedBy', { name: generatedByName(version.generatedBy) })}
              </Text>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              {/* #2187.42 — l'action « Modifier », réservée à une version pas
                  encore validée : une fois validée, un client a pu la
                  recevoir, elle cesse de bouger. */}
              {version.status !== 'validated' && editingId !== version.id ? (
                <Button size="xs" variant="outline" className="gap-1" onClick={() => startEditing(version)}>
                  <Pencil className="size-3" />
                  {t('studio.edit')}
                </Button>
              ) : null}
              {/* #2333.8 — le geste de validation, distinct de la génération,
                  quand la policy d'espace en demande un. */}
              {version.status === 'pending_validation' ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  disabled={validate.isPending}
                  onClick={() =>
                    validate
                      .mutateAsync(version.id)
                      .then(() => toast.success(t('studio.validated')))
                      .catch((error: Error) => toast.error(error.message || t('studio.validateFailed')))
                  }
                >
                  <CheckCircle2 className="size-3" />
                  {validate.isPending ? t('studio.validating') : t('studio.validate')}
                </Button>
              ) : null}
              {/* Le téléchargement passe par le client HTTP authentifié : un
                  lien nu perdrait les cookies de session et rendrait un 401
                  qu'aucun écran n'afficherait. Un échec se DIT — un bouton qui
                  ne fait rien laisse croire que le fichier est parti. */}
              {(['docx', 'pdf'] as const).map(format => (
                <Button
                  key={format}
                  size="xs"
                  variant="ghost"
                  className="gap-1"
                  onClick={() =>
                    downloadDocument(
                      `/consultants/${talentId}/cv-versions/${version.id}.${format}`,
                      `dossier-competences.${format}`,
                    ).catch((error: Error) =>
                      toast.error(workspaceRuleRefusalText(error) ?? (error.message || t('studio.downloadFailed'))),
                    )
                  }
                >
                  <Download className="size-3" />
                  {t(`studio.${format}`)}
                </Button>
              ))}
            </span>
          </div>

          {/* #2187.36/.37/.40 — trois garanties du studio de composition,
              NOMMÉES plutôt que déduites : il ne réécrit jamais, ne réordonne
              jamais les sections, n'ajoute jamais d'expérience. */}
          <ul className="mt-2 flex flex-col gap-0.5">
            <li>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.guarantees.noRewrite')}
              </Text>
            </li>
            <li>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.guarantees.fixedOrder')}
              </Text>
            </li>
            <li>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('studio.guarantees.noExperienceAdded')}
              </Text>
            </li>
          </ul>

          {/* #2187.38 — les compétences RETENUES qui recoupent le besoin ciblé,
              distinctes des autres compétences retenues. Jamais de ligne quand
              il n'y en a aucune (aucun besoin ciblé, ou aucun recoupement). */}
          {version.highlightedSkills.length > 0 ? (
            <div className="mt-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('studio.highlightedTitle')}
              </Text>
              <ul className="mt-1 flex flex-wrap gap-1">
                {version.highlightedSkills.map(skill => (
                  <li key={skill}>
                    <Badge variant="primary">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {version.excludedSkills.length > 0 ? (
            <div className="mt-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('studio.excludedTitle')}
              </Text>
              <ul className="mt-1 flex flex-col gap-0.5">
                {version.excludedSkills.map(skill => (
                  <li key={skill.term}>
                    {/* BARRÉE, pas supprimée : le client doit savoir ce qu'on
                        ne peut pas prouver avant de poser la question. */}
                    <Text size="xs">
                      <span className="line-through">{skill.term}</span>
                      <span className="text-[var(--bellum-text-muted)]"> — {skill.reason}</span>
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {version.status === 'pending_validation' ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('studio.pendingValidationDetail')}
            </Text>
          ) : null}

          {/* #2333.5 — le diff COMPLET, retenu ET barré, avant/après/raison/
              preuve pour CHAQUE changement — jamais un résumé global. */}
          {version.changes.length > 0 ? (
            <div className="mt-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('studio.changesTitle')}
              </Text>
              <ul className="mt-1 flex flex-col gap-1">
                {version.changes.map(change => (
                  <li key={change.before}>
                    <Text size="xs">
                      <span>{change.before}</span>
                      <span className="text-[var(--bellum-text-muted)]"> → {change.after}</span>
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {change.reason}
                      {change.sourceProof ? ` — « ${change.sourceProof} »` : ''}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {editingId === version.id ? (
            <div className="mt-2 flex flex-col gap-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('studio.editing')}
              </Text>
              {draftSections.map((section, index) => (
                <label key={section.title} className="flex flex-col gap-1">
                  <Text size="xs" weight="medium">
                    {section.title}
                  </Text>
                  <Textarea
                    value={section.body}
                    onChange={event => {
                      const body = event.target.value
                      setDraftSections(prev => prev.map((entry, i) => (i === index ? { ...entry, body } : entry)))
                    }}
                  />
                </label>
              ))}
              <div className="flex gap-2">
                <Button size="xs" disabled={updateSections.isPending} onClick={saveEditing}>
                  {updateSections.isPending ? t('studio.saving') : t('studio.save')}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                  {t('studio.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {version.sections.map(section => (
                <li key={section.title}>
                  <Text size="xs" weight="medium">
                    {section.title}
                  </Text>
                  <Text size="xs" className="whitespace-pre-line text-[var(--bellum-text-secondary)]">
                    {section.body.slice(0, 400)}
                    {section.body.length > 400 ? '…' : ''}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      {(versions ?? []).length === 0 ? (
        <Card className="p-4">
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('studio.empty')}
          </Text>
        </Card>
      ) : null}
    </div>
  )
}
