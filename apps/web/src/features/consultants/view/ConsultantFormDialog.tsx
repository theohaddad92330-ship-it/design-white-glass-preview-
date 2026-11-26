import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Textarea,
} from '@bellum/ui'
import { X } from 'lucide-react'
import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Consultant } from '@bellum/contracts'
import { consentState } from '@bellum/contracts'
import { useDebounce } from '@/hooks/useDebounce'
import { EMPTY_FORM, toForm, toList, type ConsultantFormState } from '../lib/consultantForm'
import { applyLinkedinDraft } from '../lib/linkedin-draft'
import { talentNameText } from '../lib/talentName'
import { useSkillSuggestion, useTalentDuplicates } from '../talent-api'
import { CvDropZone } from './CvDropZone'
import { LinkedinLookup } from './LinkedinLookup'

const SENIORITIES = ['inconnu', 'junior', 'confirme', 'senior', 'expert'] as const
// #2186.5 — `en_mission` EN FIN (GA-08) : une affectation ailleurs, déclarée
// par la personne, distincte d'`indisponible` (pas mobilisable, pour toute
// autre raison). `a_confirmer` (#2186.7/.14) n'y figure PAS : c'est un état
// calculé à la lecture, jamais choisi dans ce formulaire.
const AVAILABILITIES = ['inconnu', 'immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'en_mission'] as const
const CONTRACTS = ['inconnu', 'cdi', 'cdd', 'freelance', 'portage', 'sous_traitance'] as const
const KINDS = ['consultant', 'candidate'] as const
// #2948 (#2329.28) — `partenaire` ajouté : contrainte SQL déjà élargie
// (`20260927181000-ConsultantEngagementPartner`, GA-11/12).
const ENGAGEMENTS = ['inconnu', 'salarie', 'freelance', 'portage', 'sous_traitance', 'partenaire'] as const
// Le premier choix est VIDE et vaut « non renseigné » : un défaut à
// « indifférent » ferait proposer des missions sur site à quelqu'un qui n'a
// jamais dit qu'il acceptait (§8.2).
const REMOTE_CHOICES = ['', 'sur_site', 'hybride', 'full_remote', 'indifferent'] as const
const TRAVEL_CHOICES = ['', 'aucun', 'ponctuel', 'frequent'] as const
// #2948 (#2329.19) — fréquence sur site EXACTE, distincte de TRAVEL_CHOICES.
const SITE_FREQUENCY_CHOICES = ['', 'jamais', 'ponctuelle', 'reguliere', 'permanente'] as const
// #2948 (#2329.22) — tri-état, même patron que `relocation` : `''` = non
// demandé, jamais un « non » deviné.
const INTERNATIONAL_CHOICES = ['', 'true', 'false'] as const
// #2948 (#2329.30/.31) — même tri-état pour les deux axes booléens du
// processus.
const PROCESS_BOOL_CHOICES = ['', 'true', 'false'] as const

/**
 * Formulaire de saisie / édition d'un consultant du vivier (p22).
 *
 * Le formulaire n'exige que le NOM : un vivier se remplit par petites touches, et
 * un formulaire qui demande tout reste vide. Le reste précise au fil de l'eau.
 * Le bloc consentement (BEL-BO-003) s'ajoute sous cette règle, pas contre elle.
 */
export function ConsultantFormDialog({
  open,
  consultant,
  saving,
  financeVisible,
  onClose,
  onSubmit,
  onCvIntake,
  initialFullName,
  managerCandidates = [],
}: {
  open: boolean
  consultant: Consultant | null
  saving: boolean
  /**
   * `false` = l'appelant SAIT que les montants sont hors périmètre (`finance:read`).
   *
   * `undefined` = personne ne sait — un espace dont la liste est encore vide n'a
   * aucune ligne à interroger. On montre alors les champs : masquer une capacité
   * à quelqu'un qui y a droit est pire que la montrer à quelqu'un dont le
   * serveur refusera l'écriture, et c'est le serveur qui tranche.
   */
  financeVisible?: boolean
  onClose: () => void
  onSubmit: (form: ConsultantFormState, rights: { finance?: boolean }) => void
  /**
   * #1801.1 — le dépôt de CV, EN PREMIER dans cette modale, À LA CRÉATION.
   *
   * `undefined` = pas de dépôt de CV ici : la modale garde son formulaire nu,
   * comme avant. Seul l'écran Vivier (`ConsultantsPage`) le câble aujourd'hui —
   * les autres portes d'ajout (depuis un besoin, depuis le pool de
   * réactivation) restent inchangées, chacune pourra se brancher plus tard.
   *
   * Le dépôt crée la fiche DIRECTEMENT (`useCvIntake`, dans `CvDropZone`),
   * sans passer par les champs ci-dessous : c'est pourquoi il remonte par un
   * chemin séparé d'`onSubmit`, qui lui reste celui du formulaire manuel.
   */
  onCvIntake?: (consultantId: string) => void
  /**
   * #1903.16 — le nom DICTÉ à Laura (`prepare_consultant_record`), pour ouvrir
   * une fiche déjà préremplie plutôt qu'un formulaire vide. Ignoré en ÉDITION :
   * `consultant` porte alors le nom RÉEL de la fiche, qu'aucune amorce ne doit
   * recouvrir.
   */
  initialFullName?: string
  /**
   * #2195.12 — le vivier dans lequel se CHOISIT un manager.
   *
   * Une PROPRIÉTÉ et non une requête posée ici : les quatre écrans qui ouvrent
   * cette modale ont déjà la liste sous la main, et la redemander depuis la
   * modale ajouterait une lecture par ouverture. Défaut `[]` — le champ se
   * réduit alors à « non renseigné », ce qui est honnête : on ne propose pas un
   * choix qu'on n'a pas lu.
   */
  managerCandidates?: readonly { id: string; full_name: string | null }[]
}) {
  const { t } = useTranslation('consultants')
  const [form, setForm] = useState<ConsultantFormState>(EMPTY_FORM)
  // #3813.1 — le brouillon de compétence vit ICI, pas dans le champ : « Enregistrer »
  // doit pouvoir l'intégrer. Dans le champ, un texte tapé sans Entrée se perdait
  // en silence.
  const [skillDraft, setSkillDraft] = useState('')
  // H-DECISIONS #4348 — le geste « depuis un profil LinkedIn » s'ouvre à la demande.
  const [linkedinOpen, setLinkedinOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setSkillDraft('')
    setLinkedinOpen(false)
    if (consultant) {
      setForm(toForm(consultant))
      return
    }
    setForm(initialFullName ? { ...EMPTY_FORM, full_name: initialFullName } : EMPTY_FORM)
  }, [open, consultant, initialFullName])

  const set = (key: keyof ConsultantFormState) => (value: string) => setForm(prev => ({ ...prev, [key]: value }))

  /**
   * LE DOUBLON, cherché sur ce qu'on est en train de taper.
   *
   * Débouncé : une requête par frappe interrogerait le vivier cinquante fois
   * pour écrire un nom. Et jamais en ÉDITION — une fiche ouverte se
   * signalerait comme son propre doublon, « même e-mail », confiance 0,95.
   */
  const [debouncedName] = useDebounce(form.full_name.trim(), 400)
  const [debouncedEmail] = useDebounce(form.email.trim(), 400)
  const isCreation = consultant === null
  const { data: duplicateMatches } = useTalentDuplicates(
    { full_name: debouncedName, email: debouncedEmail },
    isCreation && open,
  )
  const duplicates = isCreation ? (duplicateMatches ?? []) : []
  // L'affirmation porte sur UN nom. La garder acquise laisserait passer le
  // doublon suivant en silence, après une correction de frappe.
  const [acknowledgedFor, setAcknowledgedFor] = useState<string | null>(null)
  const duplicatesAcknowledged = acknowledgedFor !== null && acknowledgedFor === form.full_name.trim()

  /**
   * #2195.12 — DE QUI ON PEUT DIRE QU'IL EST LE MANAGER.
   *
   * Le vivier de l'espace, moins la fiche en cours d'édition — personne n'est
   * son propre manager, et la base le refuse aussi
   * (`consultants_manager_not_self`). Une fiche SANS nom (D366) est écartée :
   * une option muette dans une liste déroulante ne se choisit pas.
   *
   * ⚠️ Le manager DÉJÀ enregistré reste proposé même si la liste ne l'a pas
   * encore chargée — sinon ouvrir le formulaire pour corriger une faute de
   * frappe effacerait le manager en silence à l'enregistrement.
   */
  const managerOptions = useMemo(() => {
    const people = managerCandidates
      .filter(person => person.id !== consultant?.id && Boolean(person.full_name))
      .map(person => ({ value: person.id, label: person.full_name ?? '' }))
      .sort((a, b) => a.label.localeCompare(b.label))
    const current = form.manager_id
    const missing = current && !people.some(person => person.value === current)
    return [
      { value: '', label: t('form.managerNone') },
      ...(missing ? [{ value: current, label: consultant?.manager_name ?? t('form.managerNone') }] : []),
      ...people,
    ]
  }, [managerCandidates, consultant?.id, consultant?.manager_name, form.manager_id, t])

  // « Un sous-traitant porte toujours son partenaire » : la question est posée
  // AVANT l'envoi plutôt que renvoyée en 400, qui ne dirait pas quel champ.
  const missingPartner = form.engagement_kind === 'sous_traitance' && form.partner_account_id.trim().length === 0
  const blockedByDuplicate = duplicates.length > 0 && !duplicatesAcknowledged
  const canSave = form.full_name.trim().length > 0 && !missingPartner && !blockedByDuplicate && !saving
  const showFinance = financeVisible !== false
  // L'état du consentement se DÉRIVE, il ne se recopie pas : `consentState` est
  // la seule définition de « expiré », partagée avec l'onglet Consentement et
  // avec le contrôle de positionnement. Deux calculs divergeraient.
  const consent = consentState(
    {
      givenAt: form.consent_given_at.trim() || null,
      expiresAt: form.consent_expires_at.trim() || null,
      basis: form.consent_basis.trim() || null,
      restrictions: form.consent_restrictions.trim() || null,
    },
    new Date(),
  )

  return (
    <Dialog open={open} onOpenChange={value => (value ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{consultant ? t('form.editTitle') : t('form.addTitle')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>

        {/* #1801.1 — « aérer cette page » : le dépôt de CV vivait dans le
            corps du vivier, entre le bouton d'ajout et les filtres. Il
            devient la PREMIÈRE chose visible ici — avant même le champ Nom —
            pour le geste le plus courant (déposer un fichier plutôt que
            tout ressaisir). Uniquement à la CRÉATION : une fiche déjà
            ouverte en édition n'a pas besoin d'un second chemin qui en
            créerait une AUTRE par CV. */}
        {isCreation && onCvIntake ? <CvDropZone onCreated={onCvIntake} /> : null}

        {/* H-DECISIONS #4348 — l'adresse d'un profil LinkedIn pré-remplit les champs
            ci-dessous (éditables). À la CRÉATION seulement, comme le dépôt de CV. */}
        {isCreation ? (
          linkedinOpen ? (
            <LinkedinLookup onDraft={draft => setForm(prev => applyLinkedinDraft(prev, draft))} />
          ) : (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setLinkedinOpen(true)}>
              {t('form.linkedinLookup.open')}
            </Button>
          )
        ) : null}

        <div className="grid gap-4 py-2">
          <Field label={t('form.fullName')} required>
            <Input value={form.full_name} onChange={e => set('full_name')(e.target.value)} autoFocus />
          </Field>

          {/* LE DOUBLON, À LA SAISIE DU NOM (§3.3, ligne 1).
              Il existait au dépôt de CV et NULLE PART ailleurs : le formulaire
              créait une seconde fiche sans rien dire, et le doublon se
              découvrait trois mois plus tard, quand deux personnes ont poussé
              le même profil chez le même client.

              Même motif que `CvDropZone` : ARRÊTER, nommer la personne ET la
              raison, laisser « créer quand même ». On PROPOSE, on ne fusionne
              JAMAIS (doctrine `c37_fusion_doublons`) : « ce n'est pas la même
              personne » est une affirmation, elle doit venir d'un clic. */}
          {duplicates.length > 0 && !duplicatesAcknowledged ? (
            <div className="rounded-md border border-[var(--bellum-warning)] p-3">
              <p className="text-sm font-medium">{t('form.duplicate.title')}</p>
              <ul className="mt-1 list-disc pl-5">
                {duplicates.map(match => (
                  <li key={match.talentId} className="text-sm">
                    {t('form.duplicate.line', {
                      name: talentNameText(match.fullName, t('name.unnamed')),
                      reason: t(`intake.duplicate.reasons.${match.reason}`),
                    })}
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <Button size="xs" variant="outline" onClick={() => setAcknowledgedFor(form.full_name.trim())}>
                  {t('form.duplicate.createAnyway')}
                </Button>
              </div>
            </div>
          ) : null}

          <Field label={t('form.title')}>
            <Input
              value={form.title}
              onChange={e => set('title')(e.target.value)}
              placeholder={t('form.titlePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* La NATURE (droit) et l'ENGAGEMENT (commerce) sont deux axes :
                « un freelance encore candidat » doit rester exprimable. */}
            <Field label={t('form.kind')} hint={t('form.kindHint')}>
              <NativeSelect value={form.kind} onChange={set('kind')} options={KINDS} tPrefix="kind" />
            </Field>
            <Field label={t('form.engagement')} hint={t('form.engagementHint')}>
              <NativeSelect
                value={form.engagement_kind}
                onChange={set('engagement_kind')}
                options={ENGAGEMENTS}
                tPrefix="engagement"
              />
            </Field>
          </div>

          {/* #2195.12 — LE MANAGER SE CHOISIT, IL NE SE DEVINE PAS.
              Décision de Louis du 16/09/2026 : c'est le responsable
              HIÉRARCHIQUE de la personne — ni le référent client (un contact),
              ni le référent commercial (`owner_id`).
              ⚠️ Le premier choix est VIDE et vaut « non renseigné » : aucun
              défaut n'est posé, parce qu'aucun défaut ne serait VRAI. Et la
              fiche en cours d'édition est retirée de la liste — personne n'est
              son propre manager (`consultants_manager_not_self`). */}
          <Field label={t('form.manager')} hint={t('form.managerHint')}>
            <SelectField
              value={form.manager_id}
              onChange={next => set('manager_id')(next)}
              options={managerOptions}
              size="sm"
              className="min-w-0 max-w-full"
            />
          </Field>

          {form.engagement_kind === 'sous_traitance' ? (
            <Field label={t('form.partner')} hint={t('form.partnerHint')} required>
              <Input
                value={form.partner_account_id}
                onChange={e => set('partner_account_id')(e.target.value)}
                placeholder={t('form.partnerPlaceholder')}
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.seniority')}>
              <NativeSelect
                value={form.seniority}
                onChange={set('seniority')}
                options={SENIORITIES}
                tPrefix="seniority"
              />
            </Field>
            <Field label={t('form.contract')}>
              <NativeSelect
                value={form.contract_type}
                onChange={set('contract_type')}
                options={CONTRACTS}
                tPrefix="contract"
              />
            </Field>
          </div>

          {/* Années d'expérience (§ décision du 31/08/2026) : un champ SAISI,
              distinct de la séniorité (une catégorie) et des années d'UNE
              compétence (`consultantSkillSchema.years`). Vide reste vide au
              lieu de zéro — « 0 » saisi, lui, est une vraie réponse. */}
          <Field label={t('form.yearsExperience')} hint={t('form.yearsExperienceHint')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={form.years_experience}
              onChange={e => set('years_experience')(e.target.value)}
              // #5018.1 — un exemple se dit exemple, jamais une valeur qui semble saisie
              placeholder={t('form.yearsExperiencePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.availability')}>
              <NativeSelect
                value={form.availability}
                onChange={set('availability')}
                options={AVAILABILITIES}
                tPrefix="availability"
              />
            </Field>
            <Field label={t('form.availableFrom')}>
              <Input type="date" value={form.available_from} onChange={e => set('available_from')(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.email')}>
              <Input type="email" value={form.email} onChange={e => set('email')(e.target.value)} />
            </Field>
            <Field label={t('form.phone')}>
              <Input value={form.phone} onChange={e => set('phone')(e.target.value)} />
            </Field>
          </div>
          <Field label={t('form.publicProfile')} hint={t('form.publicProfileHint')}>
            <Input
              value={form.public_profile_url}
              onChange={e => set('public_profile_url')(e.target.value)}
              placeholder="https://…"
            />
          </Field>

          {/* LE TJM CIBLE reste hors du droit financier : `consultantSchema.tjm`
              n'est pas conditionné, la liste l'affiche à tout le monde. Le
              ranger avec les trois autres masquerait un champ public. */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.tjm')}>
              <Input
                type="number"
                inputMode="numeric"
                value={form.tjm}
                onChange={e => set('tjm')(e.target.value)}
                // #5018.1 — idem : « ex. 620 », pas « 620 »
                placeholder={t('form.tjmPlaceholder')}
              />
            </Field>
            {/* LES TROIS MONTANTS SOUS `finance:read` (§3.2, bloc 3).
                Ils étaient saisissables par n'importe qui : la garde n'existait
                qu'en LECTURE de liste (`talent.service.ts`). Ici ils sont
                RETIRÉS — pas désactivés — et l'absence est NOMMÉE : un champ
                grisé sans raison se lit « panne ». */}
            {showFinance ? (
              <Field label={t('form.minTjm')} hint={t('form.financeHint')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.min_tjm}
                  onChange={e => set('min_tjm')(e.target.value)}
                />
              </Field>
            ) : null}
          </div>

          {/* Coût chargé OU TJM d'achat selon la nature : les deux ne
              s'appliquent jamais à la même personne, et les afficher ensemble
              ferait saisir les deux, puis calculer une marge fausse. */}
          {!showFinance ? (
            <p className="text-xs text-[var(--bellum-text-muted)]">{t('form.financeOutOfScope')}</p>
          ) : form.engagement_kind === 'salarie' ? (
            <Field label={t('form.costRate')} hint={t('form.costHint')}>
              <Input
                type="number"
                inputMode="numeric"
                value={form.cost_rate}
                onChange={e => set('cost_rate')(e.target.value)}
              />
            </Field>
          ) : form.engagement_kind === 'freelance' ||
            form.engagement_kind === 'portage' ||
            form.engagement_kind === 'sous_traitance' ||
            // #2948 (#2329.28) — un partenaire est payé au prix d'achat, comme
            // les trois natures ci-dessus : jamais un coût chargé de salarié.
            form.engagement_kind === 'partenaire' ? (
            <Field label={t('form.purchaseTjm')} hint={t('form.costHint')}>
              <Input
                type="number"
                inputMode="numeric"
                value={form.purchase_tjm}
                onChange={e => set('purchase_tjm')(e.target.value)}
              />
            </Field>
          ) : null}

          {/* LES COMPÉTENCES, TYPÉES PLUTÔT QUE PLATES (§3.2 bloc 2, §3.3).
              C'était un champ texte séparé par des virgules, alors que le
              panneau « Compétences » d'une fiche porte le NIVEAU et la SOURCE
              depuis des mois. Deux conséquences : on ne voyait pas ce qu'on
              venait d'écrire (« Kubernetes, Terraform, Go » est une seule
              chaîne à l'œil), et rien ne disait ce qui serait enregistré. */}
          <SkillsField
            value={form.stack}
            onChange={set('stack')}
            draft={skillDraft}
            onDraftChange={setSkillDraft}
            aliasEnabled={open}
            hint={t('form.stackTyping')}
          />
          <Field label={t('form.sectors')} hint={t('form.listHint')}>
            <Input
              value={form.sectors}
              onChange={e => set('sectors')(e.target.value)}
              placeholder="Banque, Assurance"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.remote')} hint={t('form.mobilityHint')}>
              <SelectField
                ariaLabel={t('form.remote')}
                value={form.remote_preference}
                onChange={next => set('remote_preference')(next)}
                options={REMOTE_CHOICES.map(value => ({
                  value: value,
                  label: value ? t(`remote.${value}`) : t('form.notAsked'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
            <Field label={t('form.travel')}>
              <SelectField
                ariaLabel={t('form.travel')}
                value={form.travel_acceptance}
                onChange={next => set('travel_acceptance')(next)}
                options={TRAVEL_CHOICES.map(value => ({
                  value: value,
                  label: value ? t(`travel.${value}`) : t('form.notAsked'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
          </div>

          <Field label={t('form.mobilityZones')} hint={t('form.listHint')}>
            <Input
              value={form.mobility_zones}
              onChange={e => set('mobility_zones')(e.target.value)}
              placeholder="75, 92, Lyon"
            />
          </Field>

          {/* #2948 (#2329.19/.22/.23) — mobilité FINE. Même doctrine que le
              reste du §8.2 : vide = non demandé, jamais deviné. */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.siteFrequency')} hint={t('form.siteFrequencyHint')}>
              <SelectField
                ariaLabel={t('form.siteFrequency')}
                value={form.site_frequency}
                onChange={next => set('site_frequency')(next)}
                options={SITE_FREQUENCY_CHOICES.map(value => ({
                  value: value,
                  label: value ? t(`siteFrequency.${value}`) : t('form.notAsked'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
            <Field label={t('form.internationalMobility')}>
              <SelectField
                ariaLabel={t('form.internationalMobility')}
                value={form.international_mobility}
                onChange={next => set('international_mobility')(next)}
                options={INTERNATIONAL_CHOICES.map(value => ({
                  value: value,
                  label:
                    value === ''
                      ? t('form.notAsked')
                      : value === 'true'
                        ? t('form.internationalYes')
                        : t('form.internationalNo'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
          </div>
          <Field label={t('form.mobilityRestrictions')} hint={t('form.mobilityRestrictionsHint')}>
            <Textarea
              value={form.mobility_restrictions}
              onChange={e => set('mobility_restrictions')(e.target.value)}
              rows={2}
            />
          </Field>

          {/* #2948 (#2329.30-.34) — PROCESSUS. L'owner n'a pas de champ ici :
              `manager`/référent commercial vivent déjà ailleurs sur la fiche
              (GA-26). */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.processInProgress')}>
              <SelectField
                ariaLabel={t('form.processInProgress')}
                value={form.process_in_progress}
                onChange={next => set('process_in_progress')(next)}
                options={PROCESS_BOOL_CHOICES.map(value => ({
                  value: value,
                  label:
                    value === ''
                      ? t('form.notAsked')
                      : value === 'true'
                        ? t('form.processInProgressYes')
                        : t('form.processInProgressNo'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
            <Field label={t('form.processExclusive')}>
              <SelectField
                ariaLabel={t('form.processExclusive')}
                value={form.process_exclusive}
                onChange={next => set('process_exclusive')(next)}
                options={PROCESS_BOOL_CHOICES.map(value => ({
                  value: value,
                  label:
                    value === ''
                      ? t('form.notAsked')
                      : value === 'true'
                        ? t('form.processExclusiveYes')
                        : t('form.processExclusiveNo'),
                }))}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </Field>
          </div>
          <Field label={t('form.processOtherInterviews')} hint={t('form.processOtherInterviewsHint')}>
            <Textarea
              value={form.process_other_interviews}
              onChange={e => set('process_other_interviews')(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label={t('form.processDecisionDeadline')}>
            <Input
              type="date"
              value={form.process_decision_deadline}
              onChange={e => set('process_decision_deadline')(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.refusedSectors')} hint={t('form.refusedHint')}>
              <Input value={form.refused_sectors} onChange={e => set('refused_sectors')(e.target.value)} />
            </Field>
            <Field label={t('form.refusedTechnologies')} hint={t('form.refusedHint')}>
              <Input value={form.refused_technologies} onChange={e => set('refused_technologies')(e.target.value)} />
            </Field>
          </div>

          {/* #3410.10/.11/.13/.14 — retour bêta #3410 : « une préférence
              négative est aussi importante qu'une compétence positive ». */}
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('form.preferredClientTypes')} hint={t('form.listHint')}>
              <Input
                value={form.preferred_client_types}
                onChange={e => set('preferred_client_types')(e.target.value)}
                placeholder="Grand compte, Scale-up"
              />
            </Field>
            <Field label={t('form.refusedClients')} hint={t('form.refusedHint')}>
              <Input value={form.refused_clients} onChange={e => set('refused_clients')(e.target.value)} />
            </Field>
          </div>
          <Field label={t('form.environmentsToAvoid')} hint={t('form.refusedHint')}>
            <Input value={form.environments_to_avoid} onChange={e => set('environments_to_avoid')(e.target.value)} />
          </Field>
          <Field label={t('form.nonNegotiableConditions')} hint={t('form.nonNegotiableConditionsHint')}>
            <Textarea
              value={form.non_negotiable_conditions}
              onChange={e => set('non_negotiable_conditions')(e.target.value)}
              rows={2}
            />
          </Field>

          <Field label={t('form.zones')} hint={t('form.listHint')}>
            <Input value={form.zones} onChange={e => set('zones')(e.target.value)} placeholder="IDF, remote" />
          </Field>
          <Field label={t('form.languages')} hint={t('form.languagesHint')}>
            <Input value={form.languages} onChange={e => set('languages')(e.target.value)} />
          </Field>

          <Field label={t('form.clearances')} hint={t('form.clearancesHint')}>
            <Input value={form.clearances} onChange={e => set('clearances')(e.target.value)} />
          </Field>

          <Field label={t('form.references')} hint={t('form.listHint')}>
            <Input value={form.references} onChange={e => set('references')(e.target.value)} />
          </Field>

          <Field label={t('form.wants')} hint={t('form.wantsHint')}>
            <Textarea value={form.wants} onChange={e => set('wants')(e.target.value)} rows={2} />
          </Field>
          <Field label={t('form.notes')}>
            <Textarea value={form.notes} onChange={e => set('notes')(e.target.value)} rows={2} />
          </Field>
          {/* Le CV source (p22). C'est la matière de la réécriture selon la
              mission, et la référence contre laquelle chaque ligne produite est
              vérifiée : sans lui, rien ne peut être adapté honnêtement. */}
          <Field label={t('form.cvText')} hint={t('form.cvTextHint')}>
            <Textarea value={form.cv_text} onChange={e => set('cv_text')(e.target.value)} rows={6} />
          </Field>

          {/* LE BLOC 4 — LE CONSENTEMENT (§3.2).
              Les trois valeurs s'affichaient sur l'onglet « Consentement » et ne
              se saisissaient NULLE PART : une fiche naissait « jamais
              recueilli » et le restait, quoi qu'on ait demandé à la personne.

              Facultatif comme le reste du formulaire — le refus d'exiger tient
              (« un formulaire qui demande tout reste vide ») — mais la phrase
              d'état, elle, est toujours là : elle dit lequel des DEUX états on
              a sous les yeux. */}
          <div className="grid gap-4 border-t border-[var(--bellum-border)] pt-4">
            <p className="text-sm font-medium">{t('form.consentTitle')}</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t('form.consentGivenAt')}>
                <Input
                  type="date"
                  // ⚠️ Tronqué à l'AFFICHAGE seulement. L'état garde
                  // l'horodatage complet du serveur ; le couper ici déplacerait
                  // un accord de 14 h 32 à minuit au premier enregistrement.
                  value={form.consent_given_at.slice(0, 10)}
                  onChange={e => set('consent_given_at')(e.target.value)}
                />
              </Field>
              <Field label={t('form.consentExpiresAt')}>
                <Input
                  type="date"
                  value={form.consent_expires_at.slice(0, 10)}
                  onChange={e => set('consent_expires_at')(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t('form.consentBasis')} hint={t('form.consentBasisHint')}>
              <Input
                value={form.consent_basis}
                onChange={e => set('consent_basis')(e.target.value)}
                placeholder={t('form.consentBasisPlaceholder')}
              />
            </Field>
            {/* #2185.57 — ce que la personne a EXCLU de son accord, distinct
                de la base légale ci-dessus : une restriction borne l'USAGE,
                pas le fondement. */}
            <Field label={t('form.consentRestrictions')} hint={t('form.consentRestrictionsHint')}>
              <Input
                value={form.consent_restrictions}
                onChange={e => set('consent_restrictions')(e.target.value)}
                placeholder={t('form.consentRestrictionsPlaceholder')}
              />
            </Field>
            {/* ⚠️ « Jamais recueilli » n'annonce AUCUN blocage — décision de
                Louis du 28/08/2026, et c'est ce que fait le code :
                `submission-preflight` pose un AVERTISSEMENT sur `none` et un
                refus sur `expired`. Écrire « ce profil ne peut pas être
                positionné » ici contredirait le produit deux écrans plus loin. */}
            <p
              className={
                consent === 'expired'
                  ? 'text-xs text-[var(--danger-soft-text)]'
                  : consent === 'expiring'
                    ? 'text-xs text-[var(--warning-soft-text)]'
                    : 'text-xs text-[var(--bellum-text-muted)]'
              }
            >
              {t(`form.consentState.${consent}`)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('form.cancel')}
          </Button>
          {/* Le dialogue remonte le droit qu'il a APPLIQUÉ. Laisser l'appelant
              le redéduire ferait deux sources pour une même décision, et un
              formulaire qui masque un champ puis l'envoie à `null` EFFACE. */}
          <Button
            onClick={() =>
              // #3813.1 — le brouillon non validé est INTÉGRÉ (même découpage
              // que les puces : virgule, dédoublonné sur la casse), jamais ignoré.
              onSubmit(
                { ...form, stack: toList([...toList(form.stack), ...toList(skillDraft)].join(', ')).join(', ') },
                { finance: financeVisible },
              )
            }
            disabled={!canSave}
          >
            {saving ? t('form.saving') : t('form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Un champ et son étiquette — ATTACHÉS.
 *
 * ⚠️ Le `<Label>` flottait à côté de son contrôle, sans `htmlFor`. Ce n'est pas
 * cosmétique : un lecteur d'écran annonce alors « zone de saisie », sans dire
 * laquelle, et le clic sur l'étiquette ne place pas le curseur. Le lot en a fait
 * la preuve avant même de coder — aucun champ de ce formulaire n'était
 * trouvable par son nom dans un test.
 *
 * L'identifiant vient de `useId()` et descend dans l'enfant : le formulaire
 * s'ouvre parfois deux fois dans la même page (vivier + fiche), et un identifiant
 * écrit à la main s'y dédoublerait.
 */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-[var(--bellum-text-secondary)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--danger-soft-text)]">*</span> : null}
      </Label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
      {hint ? <span className="text-xs text-[var(--bellum-text-muted)]">{hint}</span> : null}
    </div>
  )
}

/**
 * LE CHAMP « COMPÉTENCES » — des puces, et ce qui sera vraiment enregistré.
 *
 * Ce qu'il ferme (§3.2 bloc 2, §3.3 ligne 3) :
 *
 *  - c'était un champ texte séparé par des virgules. « Kubernetes, Terraform,
 *    Go » est une seule chaîne à l'œil : on ne voyait pas ce qu'on venait
 *    d'écrire, ni comment en retirer un sans réécrire la ligne ;
 *  - le niveau et la source EXISTENT (panneau « Compétences » d'une fiche) et
 *    rien ne disait lesquels seraient posés. Le semis écrit « inconnu /
 *    déclaré » ; c'est écrit ici plutôt que découvert plus tard, parce qu'une
 *    évaluation que personne n'a faite finit devant un client ;
 *  - le référentiel PROPOSE son écriture canonique, et ne l'applique jamais
 *    d'office. « k8s » reste « k8s » tant que personne n'a cliqué.
 *
 * L'état reste la chaîne du formulaire (`stack`), découpée par `toList` — le
 * MÊME découpage que celui de l'envoi. Deux découpages divergeraient au premier
 * cas tordu, et on verrait quatre puces pour trois compétences enregistrées.
 */
function SkillsField({
  value,
  onChange,
  draft,
  onDraftChange,
  aliasEnabled,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  /** #3813.1 — le texte tapé et pas encore validé, tenu par le dialogue. */
  draft: string
  onDraftChange: (draft: string) => void
  /** Le dialogue est-il ouvert ? Fermé, il n'interroge pas le référentiel. */
  aliasEnabled: boolean
  hint: string
}) {
  const { t } = useTranslation('consultants')
  const id = useId()
  const setDraft = onDraftChange
  const pointerInGroup = useRef(false)
  const [debouncedDraft] = useDebounce(draft.trim(), 350)
  const { data: suggestion } = useSkillSuggestion(aliasEnabled ? debouncedDraft : '')
  const skills = toList(value)

  const add = (skill: string) => {
    const trimmed = skill.trim()
    if (!trimmed) return
    // `toList` déduplique sur la casse : « kubernetes » après « Kubernetes » ne
    // crée pas une seconde puce, et c'est la même règle qu'à l'envoi.
    onChange(toList([...skills, trimmed].join(', ')).join(', '))
    setDraft('')
  }

  return (
    <div
      className="grid gap-1.5"
      onPointerDownCapture={() => {
        pointerInGroup.current = true
      }}
      onPointerUp={() => {
        // Après le clic éventuel (le blur a lieu entre l'appui et le relâchement).
        setTimeout(() => {
          pointerInGroup.current = false
        }, 0)
      }}
    >
      <Label htmlFor={id} className="text-xs text-[var(--bellum-text-secondary)]">
        {t('form.stack')}
      </Label>
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {skills.map(skill => (
            <span
              key={skill}
              className="flex items-center gap-1 rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-xs"
            >
              {skill}
              {/* Ce qui se clique se tabule (GA-35), et une croix seule porte un
                  nom (GA-32). La cible passe à 44 px AU DOIGT — la variante du
                  dépôt est `pointer-coarse:`, qui pose la question qui compte
                  (« avec quoi cette personne pointe-t-elle ? ») ; une variante
                  arbitraire inventée ne produirait aucune règle CSS et
                  échouerait en silence. */}
              <button
                type="button"
                aria-label={t('form.stackRemove', { skill })}
                onClick={() => onChange(skills.filter(item => item !== skill).join(', '))}
                className="inline-flex items-center justify-center text-[var(--bellum-text-muted)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          id={id}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          // #3813.1 — quitter le champ VALIDE ce qui est tapé (Entrée n'est plus
          // nécessaire). #3813.2 : au CLAVIER (Tab), le focus passe à « Ajouter »
          // sans clic — l'ancien « focus dans le groupe = on ignore » n'ajoutait
          // donc RIEN. On n'ignore plus que le geste qui fait son propre ajout :
          // un appui souris dans le groupe, ou l'alias proposé (sinon le brouillon
          // brut « java » passerait avant « Java » canonique, dédupliqué sur la casse).
          onBlur={event => {
            if (pointerInGroup.current) return
            const next = event.relatedTarget
            if (next instanceof HTMLElement && next.dataset.skillAlias === 'true') return
            add(draft)
          }}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            // Sinon la touche envoie le formulaire entier, et une compétence à
            // moitié tapée devient une fiche enregistrée.
            event.preventDefault()
            add(draft)
          }}
          placeholder={t('form.stackPlaceholder')}
          className="min-w-0 flex-1"
        />
        <Button size="sm" variant="outline" onClick={() => add(draft)} disabled={draft.trim().length === 0}>
          {t('form.stackAdd')}
        </Button>
      </div>
      {/* L'ALIAS SE PROPOSE. `canonical: null` est le cas le plus fréquent et
          il est voulu : on ne rapproche pas un mot inconnu du terme connu le
          plus ressemblant, ce serait inventer une compétence.

          Aucun garde-fou « la réponse correspond-elle au mot courant ? » : la
          clé de requête EST le mot débouncé, donc une réponse d'un autre mot ne
          peut pas arriver ici — et en ajouter un ferait clignoter la
          proposition à chaque frappe. */}
      {suggestion?.canonical ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--bellum-text-muted)]">
            {t('form.stackAliasHint', { term: suggestion.term, canonical: suggestion.canonical })}
          </span>
          <Button
            size="xs"
            variant="outline"
            data-skill-alias="true"
            onClick={() => add(suggestion.canonical as string)}
          >
            {t('form.stackAliasUse', { canonical: suggestion.canonical })}
          </Button>
        </div>
      ) : null}
      <span className="text-xs text-[var(--bellum-text-muted)]">{hint}</span>
    </div>
  )
}

/** Un `<select>` natif, i18n. Le vocabulaire d'enum est fermé (contrat) — un
 *  select natif suffit et évite le poids d'un composant custom. */
function NativeSelect({
  id,
  value,
  onChange,
  options,
  tPrefix,
}: {
  /** Posé par {@link Field}, qui porte l'étiquette. */
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  tPrefix: string
}) {
  const { t } = useTranslation('consultants')
  return (
    <SelectField
      id={id}
      value={value}
      onChange={next => onChange(next)}
      options={options.map(option => ({ value: option, label: t(`${tPrefix}.${option}`) }))}
      size="sm"
      className="min-w-0 max-w-full"
    />
  )
}
