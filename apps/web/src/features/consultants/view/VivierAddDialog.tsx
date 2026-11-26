import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
  Text,
  cn,
} from '@bellum/ui'
import { FileUp, PencilLine, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDebounce } from '@/hooks/useDebounce'
import { EMPTY_FORM, type ConsultantFormState } from '../lib/consultantForm'
import { applyLinkedinDraft } from '../lib/linkedin-draft'
import { talentNameText } from '../lib/talentName'
import { useTalentDuplicates } from '../talent-api'
import { CvDropZone } from './CvDropZone'
import { LinkedinLookup } from './LinkedinLookup'
import { VivierImportMenu } from './VivierIoMenus'

type Door = 'essential' | 'laura' | 'import'
type Relation = 'employee' | 'freelance' | 'candidate'

/** La relation avec l'ESN, en deux axes du modèle : la NATURE (droit) et l'ENGAGEMENT (commerce). */
const RELATIONS: Record<Relation, Pick<ConsultantFormState, 'kind' | 'engagement_kind'>> = {
  employee: { kind: 'consultant', engagement_kind: 'salarie' },
  freelance: { kind: 'consultant', engagement_kind: 'freelance' },
  candidate: { kind: 'candidate', engagement_kind: 'inconnu' },
}

/**
 * Théo C talents-vivier.R6 / N5 / A1 / A2 — « AJOUTER UN PROFIL », À TROIS PORTES.
 *
 * « Trois entrées, un seul dossier à retrouver » (Louis, 22/10/2026) :
 *
 *  1. **Saisir l'essentiel** — nom, métier, compétences, localisation, relation ; le reste vient ensuite,
 *     sur la fiche (les ~100 autres champs ne disparaissent pas : ils s'éditent depuis « Modifier »).
 *     Un homonyme probable est NOMMÉ avant l'enregistrement (A2) : on PROPOSE, on ne fusionne JAMAIS, et
 *     « ce n'est pas la même personne » est une affirmation qui vient d'un clic.
 *  2. **Préparer avec Laura** — un texte collé (message, compte rendu d'entretien, profil) devient une fiche
 *     à relire avant toute diffusion (N5) ; la lecture est celle de l'import de CV, jamais un second moteur.
 *  3. **Importer ou reprendre un outil** — le dépôt de CV (fichiers, dossier, archive, pièce jointe d'e-mail :
 *     A1, lecture automatique et bandeaux conservés) et les imports en lot.
 */
export function VivierAddDialog({
  open,
  saving,
  initialFullName,
  onClose,
  onSubmit,
  onCvIntake,
}: {
  open: boolean
  saving: boolean
  /** `?name=` — le nom dicté à Laura, qui ouvre la porte « Saisir l'essentiel » déjà remplie. */
  initialFullName?: string
  onClose: () => void
  /** `match` : « Enregistrer et rapprocher » — enchaîne sur le rapprochement de la fiche créée. */
  onSubmit: (form: ConsultantFormState, options: { match: boolean }) => void
  onCvIntake: (consultantId: string) => void
}) {
  const { t } = useTranslation('consultants')
  const [door, setDoor] = useState<Door>('essential')
  // Un SEUL objet : le brouillon d'un profil LinkedIn (A10) pré-remplit les mêmes champs que la saisie.
  const [form, setForm] = useState<ConsultantFormState>(EMPTY_FORM)
  const [linkedinOpen, setLinkedinOpen] = useState(false)
  const [relation, setRelation] = useState<Relation>('employee')
  // La SAISIE du formulaire — pas un nom stocké à afficher (GA-120).
  const typedName = form.full_name
  const set = (key: 'full_name' | 'title' | 'stack' | 'zones') => (value: string) =>
    setForm(previous => ({ ...previous, [key]: value }))
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDoor('essential')
    setForm({ ...EMPTY_FORM, full_name: initialFullName ?? '' })
    setLinkedinOpen(false)
    setRelation('employee')
    setAcknowledgedFor(null)
  }, [open, initialFullName])

  // Le doublon se cherche sur ce qu'on tape, débouncé (une requête par frappe martèlerait l'API).
  const [debouncedName] = useDebounce(typedName.trim(), 400)
  const { data: matches } = useTalentDuplicates({ full_name: debouncedName }, open && door === 'essential')
  const duplicates = matches ?? []
  const acknowledged = acknowledgedFor !== null && acknowledgedFor === typedName.trim()
  const blocked = duplicates.length > 0 && !acknowledged
  const canSave = typedName.trim().length > 0 && !blocked && !saving

  const submit = (match: boolean) => {
    onSubmit(
      {
        ...form,
        full_name: typedName.trim(),
        title: form.title.trim(),
        zones: form.zones.trim(),
        ...RELATIONS[relation],
      },
      { match },
    )
  }

  const doors: { id: Door; icon: typeof PencilLine }[] = [
    { id: 'essential', icon: PencilLine },
    { id: 'laura', icon: Sparkles },
    { id: 'import', icon: FileUp },
  ]

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('vivier.add.title')}</DialogTitle>
          <DialogDescription>{t('vivier.add.subtitle')}</DialogDescription>
        </DialogHeader>

        <div role="group" aria-label={t('vivier.add.doorsAria')} className="grid gap-2 sm:grid-cols-3">
          {doors.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={door === id}
              onClick={() => setDoor(id)}
              className={cn(
                'flex min-h-11 flex-col items-start gap-1 rounded-lg border p-3 text-left',
                door === id
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)]'
                  : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-1)]',
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4" aria-hidden="true" />
                {t(`vivier.add.doors.${id}.title`)}
              </span>
              <span className="text-xs text-[var(--bellum-text-muted)]">{t(`vivier.add.doors.${id}.hint`)}</span>
            </button>
          ))}
        </div>

        {door === 'essential' ? (
          <div className="grid gap-3">
            {/* Théo C talents-vivier.A10 — la recherche d'un profil public pré-remplit ces mêmes champs (éditables). */}
            {linkedinOpen ? (
              <LinkedinLookup onDraft={draft => setForm(previous => applyLinkedinDraft(previous, draft))} />
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setLinkedinOpen(true)}>
                {t('form.linkedinLookup.open')}
              </Button>
            )}
            <label className="grid gap-1">
              <Text size="sm" weight="medium">
                {t('vivier.add.name')}
              </Text>
              <Input value={form.full_name} onChange={event => set('full_name')(event.target.value)} autoFocus />
            </label>

            {blocked ? (
              <div className="rounded-md border border-[var(--bellum-warning)] p-3" role="alert">
                {duplicates.map(match => (
                  <div key={match.talentId}>
                    <Text size="sm" weight="medium">
                      {t('vivier.add.duplicate.title', {
                        name: talentNameText(match.fullName, t('name.unnamed')),
                      })}
                    </Text>
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      {t(`intake.duplicate.reasons.${match.reason}`)} {t('vivier.add.duplicate.nothingMerged')}
                    </Text>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/consultants/${duplicates[0]?.talentId}`} target="_blank" rel="noopener noreferrer">
                      {t('vivier.add.duplicate.compare')}
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAcknowledgedFor(typedName.trim())}>
                    {t('vivier.add.duplicate.notSame')}
                  </Button>
                </div>
              </div>
            ) : null}

            <label className="grid gap-1">
              <Text size="sm" weight="medium">
                {t('vivier.add.jobTitle')}
              </Text>
              <Input value={form.title} onChange={event => set('title')(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <Text size="sm" weight="medium">
                {t('vivier.add.skills')}
              </Text>
              <Input value={form.stack} onChange={event => set('stack')(event.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <Text size="sm" weight="medium">
                  {t('vivier.add.city')}
                </Text>
                <Input value={form.zones} onChange={event => set('zones')(event.target.value)} />
              </label>
              <label className="grid gap-1">
                <Text size="sm" weight="medium">
                  {t('vivier.add.relation')}
                </Text>
                <SelectField
                  ariaLabel={t('vivier.add.relation')}
                  value={relation}
                  onChange={next => setRelation(next as Relation)}
                  options={(Object.keys(RELATIONS) as Relation[]).map(value => ({
                    value,
                    label: t(`vivier.add.relations.${value}`),
                  }))}
                  size="sm"
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                {t('vivier.add.cancel')}
              </Button>
              <Button variant="outline" disabled={!canSave} onClick={() => submit(false)}>
                {t('vivier.add.save')}
              </Button>
              <Button disabled={!canSave} onClick={() => submit(true)}>
                {t('vivier.add.saveAndMatch')}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {door === 'laura' ? (
          <div className="grid gap-3">
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('vivier.add.laura.intro')}
            </Text>
            <CvDropZone onCreated={onCvIntake} startInPaste />
          </div>
        ) : null}

        {door === 'import' ? (
          <div className="grid gap-3">
            <CvDropZone onCreated={onCvIntake} />
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('vivier.add.import.more')}
              </Text>
              <VivierImportMenu />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
