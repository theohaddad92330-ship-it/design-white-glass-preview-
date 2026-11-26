import {
  ORG_CORRECTION_MOTIVES,
  ORG_CORRECTION_SCOPES,
  orgCorrectionVisibilityFor,
  type OrgCorrectionMotive,
  type OrgCorrectionScope,
  type OrgDecisionRole,
  type OrgGraph,
  type OrgGraphConflict,
} from '@bellum/contracts'
import {
  Box,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  Input,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountKeys } from '@/features/accounts/api'
import { ApiError } from '@/lib/api'
import {
  CORRECTION_EVIDENCE_KINDS,
  buildPersonCorrection,
  correctionEditor,
  currentPersonValue,
  defaultFieldFor,
  emptyDraft,
  describeCorrectionValue,
  fieldsFor,
  graphNodeLabels,
  motiveAssertsValue,
  readGraphConflict,
  type CorrectableObjectType,
  type CorrectionField,
  type OrgCorrectionDraft,
} from './orgCorrectionDraft'
import { orgCorrectionKeys, useCorrectOrgPerson } from './useOrgCorrections'

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LE TIROIR DE CORRECTION — le geste par lequel un commercial reprend la main
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GLISSER-DÉPOSER : REFUSÉ LE 27/08, RÉTABLI LE 31/08 — SOUS CETTE PORTE
 * ─────────────────────────────────────────────────────────────────────────
 * **Ce qui était refusé** (décision 7 du paquet OrgGraph, 27/08/2026) : « le
 * drag & drop est séduisant visuellement mais trop destructeur pour une donnée
 * sourcée ». **La raison d'origine** : un déplacement à la souris ne porte NI
 * raison NI preuve, et l'API n'a aucune route qui accepterait l'un sans les
 * deux. Ce n'était pas une convention d'écran, c'était l'absence de chemin.
 *
 * **Le revirement de Louis, 31/08/2026** : le mode Édition livre le
 * réarrangement par glisser-déposer — **et la raison d'origine tient toujours,
 * intacte**. Ce qui a changé n'est pas le niveau d'exigence, c'est la place du
 * geste : un dépôt de carte ne remplace pas ce tiroir, il l'OUVRE. Déposer une
 * personne sur une autre PROPOSE `reportsTo`, puis ce même formulaire réclame
 * la raison et la preuve, et c'est ce même `useCorrectOrgPerson` qui écrit.
 * Une dérivation, une écriture : il n'existe toujours qu'UNE porte (GA-26).
 *
 * Trois conséquences directes, à ne pas défaire :
 *   · le geste n'écrit RIEN par lui-même — il pré-remplit une proposition ;
 *   · la valeur pré-remplie vient d'un GESTE HUMAIN, jamais du graphe. C'est
 *     exactement ce que « le champ est VIDE à l'ouverture » protège : ne pas
 *     faire valider machinalement ce que la machine affirmait déjà ;
 *   · raison et preuve restent obligatoires, donc le bouton reste désactivé
 *     tant que l'utilisateur n'a pas dit POURQUOI.
 *
 * **Le geste s'accroche à la CARTE d'une personne**, et le choix est mesuré.
 * Le bouton voisin « vérifier ce lien » se rend sur `person.reporting`,
 * c'est-à-dire sur une arête `reports_to` — que le pipeline ne produit plus
 * depuis le correctif P0 (`cartes: 2 | avec reporting: 0`, mesuré le 30/08). Un
 * tiroir accroché au même endroit serait né mort. La carte, elle, existe dès
 * qu'une personne existe.
 *
 * **Une affirmation à la fois.** Le contrat accepte jusqu'à dix claims par
 * requête ; l'écran n'en compose qu'un, parce que chaque claim porte SA preuve
 * (« deux claims différents = deux preuves différentes »). Un formulaire qui
 * corrigerait cinq champs sous une seule preuve traduirait exactement le défaut
 * que le contrat existe pour interdire.
 *
 * **On PROPOSE, on ne décide pas.** Le champ de la nouvelle valeur est VIDE à
 * l'ouverture : la valeur courante est affichée à côté, en lecture. Pré-remplir
 * inviterait à valider sans lire — et le ledger enregistrerait comme une
 * affirmation humaine ce que personne n'a affirmé.
 *
 * **Une saisie vide vaut « on ne sait pas », jamais « 0 » ni la chaîne vide.**
 * Effacer un titre qu'on sait faux rend la personne SANS titre connu : c'est
 * une information vraie, et le contrat la porte en `null`.
 */
export function OrgCorrectionDrawer({
  accountId,
  graph,
  objectType,
  objectId,
  objectName,
  field,
  proposedValue,
  open: openProp,
  onOpenChange,
  withTrigger = true,
  triggerLabel,
  triggerClassName,
}: {
  accountId: string
  graph: OrgGraph
  /**
   * #2310.54 — quel objet ce tiroir corrige. Détermine à la fois la liste des
   * champs proposés (`fieldsFor`) et le champ ouvert par défaut
   * (`defaultFieldFor`) — jamais une personne écrite en dur.
   */
  objectType: CorrectableObjectType
  objectId: string
  objectName: string
  /** Le champ sur lequel le tiroir s'ouvre. Défaut : `defaultFieldFor(objectType)`. */
  field?: CorrectionField
  /**
   * La valeur qu'un GESTE de l'utilisateur propose — un dépôt de carte, et rien
   * d'autre. Elle n'est JAMAIS lue sur le graphe : pré-remplir avec la valeur
   * courante inviterait à valider sans lire, et le ledger enregistrerait comme
   * une affirmation humaine ce que personne n'a affirmé.
   */
  proposedValue?: string
  /** Ouverture CONTRÔLÉE. Absent = le tiroir gère son propre état. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** `false` = pas de bouton propre : l'ouverture vient d'ailleurs (mode Édition). */
  withTrigger?: boolean
  /**
   * #2121.43-45 — le NOM du geste qui ouvre ce tiroir (« Déclarer un rôle »…).
   * Absent = « Corriger », le libellé générique.
   */
  triggerLabel?: string
  /** Remplace la marge haute par défaut du bouton quand il vit dans une ligne de CTA (#3282). */
  triggerClassName?: string
}) {
  const { t } = useTranslation('accountOrg')
  const queryClient = useQueryClient()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const [draft, setDraft] = useState<OrgCorrectionDraft>(() => ({
    ...emptyDraft(field ?? defaultFieldFor(objectType)),
    text: proposedValue ?? '',
  }))
  const [conflict, setConflict] = useState<OrgGraphConflict | null>(null)
  const [unchanged, setUnchanged] = useState(false)
  // #2126.7 — un refus de droits a son NOM, distinct d'une panne.
  const [forbidden, setForbidden] = useState(false)
  const correct = useCorrectOrgPerson(accountId)

  const labels = graphNodeLabels(graph)
  const editor = correctionEditor(graph, draft.field, objectId)
  const current = currentPersonValue(graph, objectId, draft.field)
  const request = buildPersonCorrection({
    expectedGraphVersion: graph.graphVersion,
    personId: objectId,
    draft,
    current,
  })
  const availableFields = fieldsFor(objectType)

  const patch = (next: Partial<OrgCorrectionDraft>) => {
    setUnchanged(false)
    setForbidden(false)
    setDraft(previous => ({ ...previous, ...next }))
  }

  const chooseField = (field: CorrectionField) => {
    setConflict(null)
    setUnchanged(false)
    // Changer de champ change la preuve exigée : on repart d'un brouillon
    // propre plutôt que de traîner une référence qui prouvait autre chose.
    // Le motif et la portée, eux, restent : ils disent ce qu'on affirme et pour
    // qui, pas ce que la preuve prouve.
    setDraft(previous => ({ ...emptyDraft(field), motive: previous.motive, scope: previous.scope }))
  }

  const toggleRole = (role: OrgDecisionRole) => {
    patch({ roles: draft.roles.includes(role) ? draft.roles.filter(r => r !== role) : [...draft.roles, role] })
  }

  const submit = () => {
    if (!request || correct.isPending) return
    setConflict(null)
    setUnchanged(false)
    correct.mutate(request, {
      onSuccess: response => {
        if (!response.applied) {
          // #2126.26-.30 / .44 — une ligne DÉPOSÉE sans réécrire (confirmer, moi
          // seul…) n'est pas un non-geste : elle est au ledger, et on le dit.
          if (response.corrections.length > 0) {
            toast.success(t('correction.recorded'))
            setOpen(false)
            setDraft(emptyDraft(draft.field))
            return
          }
          // Le serveur ne bump pas une version pour un non-geste. Le dire, plutôt
          // que d'annoncer une correction qui n'a rien corrigé.
          setUnchanged(true)
          return
        }
        toast.success(t('correction.saved', { version: response.graphVersion }))
        setOpen(false)
        setDraft(emptyDraft(draft.field))
      },
      onError: error => {
        // ⚠️ LE POINT DE TOUT CE TIROIR. Le serveur répond 409 avec le diff
        // quand quelqu'un est passé entre-temps. Un 409 avalé en silence
        // transforme un verrou optimiste en perte de saisie : on RÉAFFICHE ce
        // qui a changé, et on garde le brouillon intact.
        const versionConflict = readGraphConflict(error)
        if (versionConflict) {
          setConflict(versionConflict)
          return
        }
        if (error instanceof ApiError && error.status === 403) {
          setForbidden(true)
          return
        }
        toast.error(error instanceof Error && error.message ? error.message : t('correction.error'))
      },
    })
  }

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    void queryClient.invalidateQueries({ queryKey: orgCorrectionKeys.history(accountId) })
    setConflict(null)
  }

  return (
    <>
      {withTrigger ? (
        <Button
          size="xs"
          variant="outline"
          className={cn('gap-1.5 pointer-coarse:min-h-11', triggerClassName ?? 'mt-2')}
          onClick={() => setOpen(true)}
          data-testid="org-correction-open"
        >
          <PencilLine className="size-3" aria-hidden />
          {triggerLabel ?? t('correction.trigger')}
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t('common:actions.close')}
          className="max-h-[90dvh] overflow-y-auto border-[var(--bellum-border)] sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
              <PencilLine className="size-4" aria-hidden />
              {t('correction.title', { name: objectName })}
            </DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('correction.subtitle')}
            </DialogDescription>
          </DialogHeader>

          <Box className="space-y-4">
            {/* #2126.25-.30 — ce qu'on DIT du fait. Six vrais boutons : ce qui se
                clique se tabule (GA-35), et l'état choisi s'annonce. */}
            <Box className="space-y-2">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('correction.motiveLabel')}
              </Text>
              <FilterChips
                ariaLabel={t('correction.motiveLabel')}
                value={draft.motive}
                onChange={next => (next ? patch({ motive: next }) : undefined)}
                options={ORG_CORRECTION_MOTIVES.map((motive: OrgCorrectionMotive) => ({
                  value: motive,
                  label: t(`correction.motives.${motive}`),
                }))}
              />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`correction.motiveHints.${draft.motive}`)}
              </Text>
            </Box>

            {/* Ce qu'on corrige — la liste vient du contrat, pas d'une recopie. */}
            <label className="block">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('correction.fieldLabel')}
              </Text>
              <SelectField
                ariaLabel={t('correction.fieldLabel')}
                value={draft.field}
                onChange={next => chooseField(next as CorrectionField)}
                options={availableFields.map(field => ({
                  value: field,
                  label: t(`correction.fields.${field}`),
                }))}
                className="mt-1 w-full"
              />
            </label>

            {/* Ce que le graphe dit AUJOURD'HUI. En lecture : corriger à
                l'aveugle, c'est écraser sans savoir quoi. */}
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('correction.currentLabel')} ·{' '}
              <span className="text-[var(--bellum-text-primary)]">
                {describeCorrectionValue(current, labels, t('correction.currentUnknown'), key =>
                  t(`correction.roles.${key}`),
                )}
              </span>
            </Text>

            {/* La nouvelle valeur. VIDE à l'ouverture — on propose, on ne décide pas.
                Seul « Corriger » en demande une (#2126.25-.30). */}
            {motiveAssertsValue(draft.motive) ? (
              <Box className="space-y-1">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('correction.newLabel')}
                </Text>
                {editor.kind === 'text' ? (
                  <Input
                    value={draft.text}
                    onChange={event => patch({ text: event.target.value })}
                    aria-label={t('correction.newLabel')}
                    placeholder={t('correction.textPlaceholder')}
                  />
                ) : null}
                {editor.kind === 'choice' ? (
                  <SelectField
                    ariaLabel={t('correction.newLabel')}
                    value={draft.text}
                    onChange={next => patch({ text: next })}
                    emptyOption={{ label: t('correction.choiceUnknown') }}
                    options={editor.options.map(option => ({ value: option.value, label: option.label }))}
                    className="w-full"
                  />
                ) : null}
                {editor.kind === 'level' ? (
                  <SelectField
                    ariaLabel={t('correction.newLabel')}
                    value={draft.text}
                    onChange={next => patch({ text: next })}
                    emptyOption={{ label: t('correction.choiceUnknown') }}
                    options={editor.options.map(level => ({
                      value: level,
                      label: `${level} · ${t(`correction.levels.${level}`)}`,
                    }))}
                    className="w-full"
                  />
                ) : null}
                {editor.kind === 'roles' ? (
                  <Box className="flex flex-wrap gap-x-4 gap-y-2">
                    {editor.options.map(role => (
                      <label key={role} className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--bellum-primary-500)]"
                          checked={draft.roles.includes(role)}
                          onChange={() => toggleRole(role)}
                        />
                        <span className="text-[var(--bellum-text-primary)]">{t(`correction.roles.${role}`)}</span>
                      </label>
                    ))}
                  </Box>
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('correction.clearHint')}
                </Text>
              </Box>
            ) : null}

            {/* La raison. Sans elle, le contrat refuse — et il a raison : une
                correction sans raison n'est pas une correction, c'est un écrasement. */}
            <label className="block">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('correction.reasonLabel')}
              </Text>
              <Textarea
                className="mt-1"
                rows={2}
                value={draft.reason}
                onChange={event => patch({ reason: event.target.value })}
                aria-label={t('correction.reasonLabel')}
                placeholder={t('correction.reasonPlaceholder')}
              />
            </label>

            {/* La preuve. L'utilisateur dit d'où elle vient ; ce qu'elle PROUVE
                est décidé par le champ corrigé, jamais par lui. */}
            <Box className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('correction.evidenceLabel')}
                </Text>
                <SelectField
                  ariaLabel={t('correction.evidenceLabel')}
                  value={draft.evidenceKind}
                  onChange={next => patch({ evidenceKind: next as OrgCorrectionDraft['evidenceKind'] })}
                  options={CORRECTION_EVIDENCE_KINDS.map(kind => ({
                    value: kind,
                    label: t(`orgGraph.sourceKinds.${kind}`),
                  }))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('correction.evidenceDateLabel')}
                </Text>
                <Input
                  className="mt-1"
                  type="date"
                  value={draft.evidenceDate}
                  onChange={event => patch({ evidenceDate: event.target.value })}
                  aria-label={t('correction.evidenceDateLabel')}
                />
              </label>
            </Box>
            <label className="block">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('correction.evidenceRefLabel')}
              </Text>
              <Input
                className="mt-1"
                value={draft.evidenceRef}
                onChange={event => patch({ evidenceRef: event.target.value })}
                aria-label={t('correction.evidenceRefLabel')}
                placeholder={t('correction.evidenceRefPlaceholder')}
              />
            </label>

            {/* #2126.37 / .39-.42 — pour qui, et qui la verra. « Équipe / BU »
                n'y est pas : aucune source ne la porte (#2118.9). */}
            <label className="block">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('correction.scopeLabel')}
              </Text>
              <SelectField
                ariaLabel={t('correction.scopeLabel')}
                value={draft.scope}
                onChange={next => patch({ scope: next as OrgCorrectionScope })}
                options={ORG_CORRECTION_SCOPES.map(scope => ({ value: scope, label: t(`correction.scopes.${scope}`) }))}
                className="mt-1 w-full"
              />
              <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t(`correction.visibility.${orgCorrectionVisibilityFor(draft.scope)}`)}
              </Text>
            </label>

            {unchanged ? (
              <Text size="sm" className="text-[var(--bellum-text-secondary)]" data-testid="org-correction-unchanged">
                {t('correction.unchanged')}
              </Text>
            ) : null}

            {conflict ? <ConflictNotice conflict={conflict} labels={labels} onReload={reload} /> : null}

            {forbidden ? (
              <Box
                className="rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3"
                role="alert"
                data-testid="org-correction-forbidden"
              >
                <Text size="sm" weight="semibold" className="text-[var(--warning-soft-text)]">
                  {t('correction.forbiddenTitle')}
                </Text>
                <Text size="sm" className="mt-1 text-[var(--warning-soft-text)]">
                  {t('correction.forbiddenBody')}
                </Text>
              </Box>
            ) : null}
          </Box>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('correction.cancel')}
            </Button>
            <Button onClick={submit} disabled={!request || correct.isPending} isLoading={correct.isPending}>
              {t('correction.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * LE 409, RENDU — « quelqu'un a modifié cet organigramme pendant que tu le
 * corrigeais, voici ce qui a changé ».
 *
 * Trois choses que ce bloc doit dire, et qu'un toast « Conflit » ne dit pas :
 *
 *  1. **rien n'a été écrasé** — c'est la première inquiétude de qui vient de
 *     perdre son clic ;
 *  2. **ce qui a changé**, ligne par ligne, avec l'auteur QUAND il est connu.
 *     `by` vaut `null` quand le profil n'est plus lisible : on écrit alors
 *     « auteur inconnu », jamais un identifiant technique présenté comme un nom ;
 *  3. **le brouillon est conservé.** L'écran ne se vide pas : on recharge, on
 *     relit ce qui a changé, et on renvoie sa correction si elle tient toujours.
 *
 * ⚠️ `intervening` peut être VIDE alors que le conflit est réel — le serveur le
 * dit lui-même : « le conflit reste un conflit même si on ne sait pas le
 * raconter ». On l'écrit plutôt que d'afficher une liste vide qui ressemblerait
 * à « rien n'a changé ».
 */
function ConflictNotice({
  conflict,
  labels,
  onReload,
}: {
  conflict: OrgGraphConflict
  labels: ReadonlyMap<string, string>
  onReload: () => void
}) {
  const { t, i18n } = useTranslation('accountOrg')
  return (
    <Box
      className="rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3"
      role="alert"
      data-testid="org-correction-conflict"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-[var(--warning-soft-text)]" aria-hidden />
        <Text size="sm" weight="semibold" className="text-[var(--warning-soft-text)]">
          {t('correction.conflict.title')}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--warning-soft-text)]">
        {t('correction.conflict.body', { yours: conflict.yours, current: conflict.current })}
      </Text>
      {conflict.intervening.length > 0 ? (
        <ol className="mt-2 space-y-1">
          {conflict.intervening.map(entry => (
            <li key={`${entry.objectId}-${entry.field}-${entry.at}`}>
              <Text size="xs" className="text-[var(--warning-soft-text)]">
                {t('correction.conflict.line', {
                  what: t(`correction.fields.${entry.field}`),
                  who: labels.get(entry.objectId) ?? entry.objectId,
                  by: entry.by ?? t('correction.conflict.byUnknown'),
                  when: new Date(entry.at).toLocaleDateString(i18n.language),
                })}
              </Text>
            </li>
          ))}
        </ol>
      ) : (
        <Text size="xs" className="mt-2 text-[var(--warning-soft-text)]">
          {t('correction.conflict.interveningUnknown')}
        </Text>
      )}
      <Text size="xs" className="mt-2 text-[var(--warning-soft-text)]">
        {t('correction.conflict.draftKept')}
      </Text>
      <Button size="sm" variant="outline" className="mt-2" onClick={onReload}>
        {t('correction.conflict.reload')}
      </Button>
    </Box>
  )
}
