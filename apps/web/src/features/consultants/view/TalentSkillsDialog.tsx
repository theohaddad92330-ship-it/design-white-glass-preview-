import type { Consultant, ConsultantExperience, ConsultantSkill, SkillLevel, SkillSource } from '@bellum/contracts'
import { SKILL_LEVELS, SKILL_SOURCES } from '@bellum/contracts'
import {
  Badge,
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
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAddTalentDocument,
  useRemoveTalentDocument,
  useRemoveTalentSkill,
  useTalentDocuments,
  useTalentExperiences,
  useTalentSkills,
  useUpsertTalentSkill,
  useValidateTalentSkill,
} from '../talent-api'
import { talentNameText } from '../lib/talentName'

/**
 * Les COMPÉTENCES et les DOCUMENTS d'un talent.
 *
 * La stack (`consultants.stack`) reste ce qu'elle est : une liste de mots. Ce
 * panneau porte ce qu'un mot ne peut pas dire — le niveau, l'ancienneté, et
 * surtout la SOURCE. « Kubernetes, expert, confirmé en entretien » et
 * « Kubernetes lu sur un CV » n'ont pas la même valeur devant un client, et
 * c'est cette différence qu'un vivier doit savoir montrer.
 *
 * ⚠️ La SOURCE SE SAISIT ICI depuis le 28/08/2026 (PDF-02 §3.2 : « des
 * compétences typées avec leur niveau ET leur source »). Elle était écrite
 * `'declared'` en dur, si bien que « confirmé en entretien » et « vu en
 * mission » étaient AFFICHÉS partout — sur la puce, sur la fiche, dans le tri
 * du vivier qui les fait remonter en premier — et qu'aucun geste du produit ne
 * savait les poser. Une valeur qu'on montre et qu'on ne peut pas produire est
 * la promesse la plus coûteuse : elle se découvre en réunion.
 *
 * Le dépôt de document reçoit du TEXTE, pas un fichier : rien dans le produit
 * ne réaffiche un PDF, et stocker le binaire multiplierait la surface de donnée
 * personnelle sans usage en face.
 */
export function TalentSkillsDialog({
  talent,
  open,
  onOpenChange,
}: {
  talent: Consultant
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  const { data: skills, isLoading, isError } = useTalentSkills(talent.id)
  const { data: experiences } = useTalentExperiences(talent.id)
  const { data: documents, isLoading: documentsLoading, isError: documentsError } = useTalentDocuments(talent.id)
  const upsert = useUpsertTalentSkill(talent.id)
  const removeSkill = useRemoveTalentSkill(talent.id)
  const validateSkill = useValidateTalentSkill(talent.id)
  const addDocument = useAddTalentDocument(talent.id)
  const removeDocument = useRemoveTalentDocument(talent.id)

  const [draft, setDraft] = useState('')
  const [level, setLevel] = useState<SkillLevel>('autonome')
  /**
   * Le défaut reste `declared`, et ce n'est pas un repli.
   *
   * C'est ce que la saisie EST : quelqu'un l'écrit. Pré-sélectionner
   * « confirmé en entretien » ferait poser d'un clic distrait une preuve que
   * personne n'a apportée — le même défaut que le niveau `autonome` posé par
   * défaut sur une compétence lue dans une liste libre, corrigé en base le
   * 20/08 par l'ajout de `inconnu`.
   */
  const [source, setSource] = useState<SkillSource>('declared')
  const [pasted, setPasted] = useState('')

  const submitSkill = () => {
    const skill = draft.trim()
    if (!skill) return
    upsert.mutate({ skill, level, years: null, lastUsedYear: null, source }, { onSuccess: () => setDraft('') })
  }

  // Le nom AFFICHABLE : une fiche née d'un CV porte le nom de son FICHIER dans
  // `full_name` tant que rien n'a écrit de nom (`talentName.ts`).
  const displayName = talentNameText(talent.full_name, t('name.unnamed'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-2xl border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle>{t('skills.title', { name: displayName })}</DialogTitle>
          <DialogDescription>{t('skills.subtitle')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-5">
          <Box className="space-y-2">
            <Box display="flex" className="flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder={t('skills.placeholder')}
                aria-label={t('skills.label')}
                className="min-w-[200px] flex-1"
              />
              {SKILL_LEVELS.map(value => (
                <Button
                  key={value}
                  variant={level === value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevel(value)}
                >
                  {t(`skills.levels.${value}`)}
                </Button>
              ))}
              {/* La SOURCE en `<select>` et non en rangée de boutons : quatre
                  boutons de plus à côté des cinq niveaux feraient neuf cibles
                  sur une ligne, et on ne saurait plus laquelle des deux séries
                  on est en train de choisir. */}
              <SelectField
                ariaLabel={t('skills.source')}
                value={source}
                onChange={next => setSource(next as SkillSource)}
                options={SKILL_SOURCES.map(value => ({ value: value, label: t(`skills.sources.${value}`) }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
              <Button variant="black" size="sm" isLoading={upsert.isPending} onClick={submitSkill}>
                {t('skills.add')}
              </Button>
            </Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('skills.canonicalHint')}
            </Text>
            {/* Ce que la source ENGAGE, dit au moment où on la choisit : une
                compétence « vue en mission » se défend autrement qu'une
                compétence déclarée, et c'est celle-là qu'un client vérifie. */}
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('skills.sourceHint')}
            </Text>
          </Box>

          {isLoading ? (
            <Text size="sm" color="text-muted-foreground">
              {t('loading')}
            </Text>
          ) : isError ? (
            <Text size="sm" color="text-muted-foreground">
              {t('skills.loadError')}
            </Text>
          ) : (skills?.length ?? 0) === 0 ? (
            <Text size="sm" color="text-muted-foreground">
              {t('skills.empty')}
            </Text>
          ) : (
            <Box className="flex flex-wrap gap-2">
              {skills?.map(skill => (
                <SkillChip
                  key={skill.id}
                  skill={skill}
                  experience={experiences?.find(experience => experience.id === skill.sourceExperienceId) ?? null}
                  onRemove={() => removeSkill.mutate({ skillId: skill.id })}
                  onValidate={() => validateSkill.mutate({ skillId: skill.id, validatedBy: 'recruiter' })}
                  validating={validateSkill.isPending}
                />
              ))}
            </Box>
          )}

          <Box className="space-y-2 border-t border-border pt-4">
            <Text element="p" size="sm" weight="medium">
              {t('documents.title')}
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('documents.hint')}
            </Text>
            <textarea
              value={pasted}
              onChange={event => setPasted(event.target.value)}
              placeholder={t('documents.placeholder')}
              aria-label={t('documents.label')}
              className="min-h-[100px] w-full rounded-md border border-border bg-transparent p-2 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pasted.trim().length === 0}
              isLoading={addDocument.isPending}
              onClick={() =>
                addDocument.mutate(
                  {
                    kind: 'cv',
                    filename: t('documents.defaultName', { name: displayName }),
                    mimeType: 'text/plain',
                    text: pasted,
                    sizeBytes: pasted.length,
                  },
                  { onSuccess: () => setPasted('') },
                )
              }
            >
              {t('documents.add')}
            </Button>

            {documentsLoading ? (
              <Text size="xs" color="text-muted-foreground">
                {t('loading')}
              </Text>
            ) : documentsError ? (
              <Text size="xs" color="text-muted-foreground">
                {t('documents.loadError')}
              </Text>
            ) : (documents?.length ?? 0) === 0 ? (
              <Text size="xs" color="text-muted-foreground">
                {t('documents.empty')}
              </Text>
            ) : (
              <Box className="space-y-1">
                {documents?.map(document => (
                  <Box
                    key={document.id}
                    display="flex"
                    className="items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <Box className="min-w-0">
                      <Text element="p" size="xs" weight="medium" className="truncate">
                        {document.filename}
                      </Text>
                      <Text element="p" size="xs" color="text-muted-foreground">
                        {document.extractedChars === 0
                          ? t('documents.noTextShort')
                          : t('documents.chars', { count: document.extractedChars })}
                      </Text>
                    </Box>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('documents.delete')}
                      onClick={() => removeDocument.mutate({ documentId: document.id })}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function SkillChip({
  skill,
  experience,
  onRemove,
  onValidate,
  validating,
}: {
  skill: ConsultantSkill
  experience: ConsultantExperience | null
  onRemove: () => void
  onValidate: () => void
  validating: boolean
}) {
  const { t } = useTranslation('consultants')
  return (
    <Box display="flex" className="items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
      <Text element="span" size="xs" weight="medium">
        {skill.skill}
      </Text>
      <Badge variant="secondary">{t(`skills.levels.${skill.level}`)}</Badge>
      {/* La SOURCE est affichée : « confirmé en entretien » et « lu sur un CV »
          ne se défendent pas de la même façon devant un client. */}
      <Text element="span" size="xs" color="text-muted-foreground">
        {t(`skills.sources.${skill.source}`)}
      </Text>
      {/* #2328.9/.10 — l'EXPÉRIENCE (et, dans celle-ci, le projet NOMMÉ) qui
          prouve cette compétence, jamais un chiffre : la preuve se cite, elle
          ne se résume pas. */}
      {experience ? (
        <Badge
          variant="outline"
          title={t('skills.evidenceHint', { company: experience.entreprise ?? t('skills.evidenceMaskedCompany') })}
        >
          {t('skills.evidence', {
            reference: skill.sourceProject ?? experience.entreprise ?? t('skills.evidenceMaskedCompany'),
          })}
        </Badge>
      ) : null}
      {/* #2328.24 — une compétence INFÉRÉE (un mot trouvé seul dans un texte,
          jamais une expérience détaillée) se montre « à vérifier », jamais
          comme un niveau acquis. */}
      {skill.inferred ? (
        <Badge variant="outline" title={t('skills.inferredHint')}>
          {t('skills.inferred')}
        </Badge>
      ) : null}
      {/* #2328.12/.13 — l'endpoint de validation existait sans appelant. Une
          compétence déjà validée montre son état, jamais un bouton qu'un
          second clic re-déclencherait pour rien. */}
      {skill.validatedByRecruiterAt ? (
        <Badge variant="outline" title={t('skills.validatedHint')}>
          {t('skills.validated')}
        </Badge>
      ) : (
        <Button variant="ghost" size="sm" isLoading={validating} onClick={onValidate} className="h-auto px-1.5 py-0">
          {t('skills.validate')}
        </Button>
      )}
      <button type="button" onClick={onRemove} aria-label={t('skills.delete')} className="text-muted-foreground">
        <Trash2 className="size-3" aria-hidden />
      </button>
    </Box>
  )
}
