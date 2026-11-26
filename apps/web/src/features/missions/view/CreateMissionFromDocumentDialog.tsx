import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import type { ChangeEvent } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateMission } from '@/features/missions/api'
import { extractMission, type MissionExtraction } from '@/features/missions/mission-extraction'
import { supervisedCreateFieldsOf } from '@/features/missions/supervised-forfait'
import {
  SupervisedForfaitFields,
  type SupervisedForfaitDraft,
} from '@/features/projects/open-needs/view/SupervisedForfaitFields'

type FormState = {
  label: string
  roleTitle: string
  startedOn: string
  endsOn: string
  dailyRate: string
  /** X66 / #3547 — le forfait encadré : proposé par le document, modifiable. */
  forfait: SupervisedForfaitDraft
}

const EMPTY_FORFAIT: SupervisedForfaitDraft = {
  supervised: false,
  supervision_role: null,
  client_team_size: null,
  client_team_names: '',
}

const EMPTY_FORM: FormState = {
  label: '',
  roleTitle: '',
  startedOn: '',
  endsOn: '',
  dailyRate: '',
  forfait: EMPTY_FORFAIT,
}

/**
 * « CRÉER UNE MISSION DEPUIS UN DOCUMENT » (#2560).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE DIALOGUE, ET PAS `NeedWizard` NI `/missions/nouvelle`
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreateMissionPage.tsx` (`/missions/nouvelle`) écrit un `project_need`
 * (`POST /projects/:id/needs`) — l'objet AVANT signature. Ce dialogue écrit la
 * vraie `MissionEntity` (`POST /delivery/missions`), qui n'avait jusqu'ici
 * AUCUN appelant web (seul l'outil interne `create_mission` du copilote
 * l'appelait). Les deux chemins ne se recouvrent pas : celui-ci sert le cas où
 * le contrat est DÉJÀ signé et le commercial a le document en main.
 *
 * ⚠️ Le COMPTE n'est PAS extrait du document : il vient du contexte où ce
 * dialogue s'ouvre (`TabMissions.tsx`, `accountId` de la fiche compte). Le
 * commentaire #2124.30/.31 de `TabMissions.tsx` documente que ni `NeedWizard`
 * ni l'écran d'import ne préremplissent le compte — deviner un nom d'entreprise
 * écrit dans un document serait moins fiable que l'endroit d'où l'utilisateur
 * a cliqué, et la doctrine interdit de toute façon d'inventer un rattachement.
 *
 * ⚠️ **UNE EXTRACTION EST UNE PROPOSITION, JAMAIS UNE CRÉATION.** Les champs se
 * pré-remplissent depuis `extractMission`, TOUJOURS modifiables, et rien n'est
 * écrit avant le clic sur « Créer la mission ».
 *
 * Le NOMBRE DE JOURS (bon de commande) est PROPOSÉ mais ne se soumet pas ici :
 * il vit dans les conditions commerciales de la mission
 * (`mission_commercial_terms.po_volume_days`, sous `finance:read`/
 * `finance:write`, distinct de `records:write` qui crée la mission) — l'écrire
 * automatiquement engagerait un droit que l'utilisateur qui crée la mission
 * n'a pas forcément. Le dialogue le montre et dit où le confirmer.
 */
export function CreateMissionFromDocumentDialog({
  accountId,
  accountName,
  open,
  onOpenChange,
}: {
  accountId: string
  accountName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('accountMissions')
  const inputRef = useRef<HTMLInputElement>(null)
  const [pastedText, setPastedText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [extraction, setExtraction] = useState<MissionExtraction | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const create = useCreateMission(accountId)

  const reset = () => {
    setPastedText('')
    setFileName(null)
    setExtraction(null)
    setForm(EMPTY_FORM)
  }

  const applyProposal = (result: MissionExtraction) => {
    setExtraction(result)
    // Chaque champ absent reste vide — jamais une valeur devinée à sa place.
    setForm({
      label: result.fields.roleTitle.value ?? '',
      roleTitle: result.fields.roleTitle.value ?? '',
      startedOn: result.fields.startedOn.value ?? '',
      endsOn: result.fields.endsOn.value ?? '',
      dailyRate: result.fields.dailyRate.value != null ? String(result.fields.dailyRate.value) : '',
      // Allumé SEULEMENT si le document le dit (citation retrouvée côté serveur).
      forfait: { ...EMPTY_FORFAIT, supervised: result.fields.supervisedForfait?.value === 'supervised' },
    })
  }

  const readText = async () => {
    if (!pastedText.trim()) return
    setReading(true)
    try {
      applyProposal(await extractMission({ text: pastedText.trim() }))
    } finally {
      setReading(false)
    }
  }

  const readFile = async (file: File) => {
    setFileName(file.name)
    setReading(true)
    try {
      applyProposal(await extractMission({ fileBase64: await readAsBase64(file), fileName: file.name }))
    } finally {
      setReading(false)
    }
  }

  const set = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm(current => ({ ...current, [key]: event.target.value }))

  const submit = () => {
    if (!form.label.trim()) return
    create.mutate(
      {
        accountId,
        label: form.label.trim(),
        roleTitle: form.roleTitle.trim() || undefined,
        startedOn: form.startedOn || undefined,
        endsOn: form.endsOn || undefined,
        dailyRate: form.dailyRate ? Number(form.dailyRate) : undefined,
        ...supervisedCreateFieldsOf(form.forfait),
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  const daysProposal = extraction?.fields.days.value ?? null
  const accountHint = extraction?.fields.accountName.value ?? null
  const showFailure = extraction && extraction.status !== 'ok'
  const forfaitExcerpt = extraction?.fields.supervisedForfait?.sourceExcerpt ?? ''

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('fromDocument.close')}>
        <DialogHeader>
          <DialogTitle>{t('fromDocument.title')}</DialogTitle>
          <DialogDescription>{t('fromDocument.description')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          {/* #2732.1 — les formats lus se disent AVANT le dépôt, et ce qui n'est pas lu. */}
          {!extraction ? (
            <Text size="xs" color="text-muted-foreground">
              {t('fromDocument.formats')}
            </Text>
          ) : null}
          <Field label={t('fromDocument.account')}>
            <Text element="p" size="sm">
              {accountName}
            </Text>
          </Field>

          {!extraction ? (
            <>
              <Field label={t('fromDocument.pasteLabel')}>
                <Textarea
                  value={pastedText}
                  onChange={event => setPastedText(event.target.value)}
                  rows={6}
                  aria-label={t('fromDocument.pasteLabel')}
                  placeholder={t('fromDocument.pastePlaceholder')}
                />
              </Field>
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  isLoading={reading && pastedText.trim().length > 0}
                  onClick={readText}
                  disabled={!pastedText.trim() || reading}
                >
                  {t('fromDocument.readText')}
                </Button>
                <Text size="xs" color="text-muted-foreground">
                  {t('fromDocument.or')}
                </Text>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => inputRef.current?.click()}
                  disabled={reading}
                >
                  {fileName ?? t('fromDocument.chooseFile')}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  aria-label={t('fromDocument.chooseFile')}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0]
                    if (file) void readFile(file)
                    event.target.value = ''
                  }}
                />
              </Box>
            </>
          ) : (
            <>
              {showFailure ? (
                <Text size="sm" color="text-muted-foreground">
                  {t(`fromDocument.status.${extraction.status}`)}
                </Text>
              ) : null}
              {accountHint ? (
                <Text size="xs" color="text-muted-foreground">
                  {t('fromDocument.accountHint', { name: accountHint })}
                </Text>
              ) : null}
              <Field label={t('fromDocument.label')} required>
                <Input value={form.label} onChange={set('label')} aria-label={t('fromDocument.label')} autoFocus />
              </Field>
              <Field label={t('fromDocument.roleTitle')}>
                <Input
                  value={form.roleTitle}
                  onChange={set('roleTitle')}
                  aria-label={t('fromDocument.roleTitle')}
                  placeholder={t('fromDocument.notFound')}
                />
              </Field>
              <Box display="flex" className="gap-3">
                <Box className="flex-1">
                  <Field label={t('fromDocument.startedOn')}>
                    <Input
                      type="date"
                      value={form.startedOn}
                      onChange={set('startedOn')}
                      aria-label={t('fromDocument.startedOn')}
                    />
                  </Field>
                </Box>
                <Box className="flex-1">
                  <Field label={t('fromDocument.endsOn')}>
                    <Input
                      type="date"
                      value={form.endsOn}
                      onChange={set('endsOn')}
                      aria-label={t('fromDocument.endsOn')}
                    />
                  </Field>
                </Box>
              </Box>
              <Field label={t('fromDocument.dailyRate')}>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.dailyRate}
                  onChange={set('dailyRate')}
                  aria-label={t('fromDocument.dailyRate')}
                  placeholder={t('fromDocument.notFound')}
                />
              </Field>
              {/* X66 / #3547 — le forfait encadré, DANS le formulaire (pas un bloc de
                  plus) : proposé par le document avec sa citation, jamais imposé. */}
              <SupervisedForfaitFields
                value={form.forfait}
                onChange={patch => setForm(current => ({ ...current, forfait: { ...current.forfait, ...patch } }))}
                idPrefix="from-document"
              />
              {form.forfait.supervised && forfaitExcerpt ? (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('fromDocument.supervisedProposed', { excerpt: forfaitExcerpt })}
                </Text>
              ) : null}
              {/* #2560.5 — les jours PROPOSÉS, jamais soumis ici : voir le
                  commentaire de tête. Une valeur absente ne s'affiche jamais
                  « 0 » — `daysProposal === null` dit « non lu », pas zéro jour. */}
              <Field label={t('fromDocument.days')}>
                <Text element="p" size="sm">
                  {daysProposal === null
                    ? t('fromDocument.notFound')
                    : t('fromDocument.daysValue', { count: daysProposal })}
                </Text>
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('fromDocument.daysHint')}
                </Text>
              </Field>
            </>
          )}
        </Box>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('fromDocument.cancel')}
          </Button>
          {extraction ? (
            <Button
              variant="black"
              onClick={submit}
              disabled={!form.label.trim()}
              isLoading={create.isPending}
              loadingText={t('fromDocument.creating')}
            >
              {t('fromDocument.submit')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <Box className="space-y-1">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
    </Box>
  )
}

/** Le fichier → du base64 nu, sans le préfixe `data:` que le lecteur ajoute —
 *  même geste que `toUploadInput` (`features/expenses/view/AttachmentDeposit.tsx`),
 *  dupliqué ici pour la même raison que `mission-extraction.ts` : un domaine
 *  qui n'en a besoin qu'ici pour l'instant. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
