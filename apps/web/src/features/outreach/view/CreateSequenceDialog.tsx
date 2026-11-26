import type { CreateOutreachSequenceRequest, OutreachTemplateKey } from '@bellum/contracts'
import {
  OUTREACH_SEQUENCE_MAX_STEPS,
  OUTREACH_SEQUENCE_TEMPLATES,
  outreachStepKindSchema,
  outreachTemplateKeySchema,
  outreachTemplateSpan,
  type OutreachStepKind,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Import, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useColleagueContactsGuard } from '@/features/team-guardrails/components/ColleagueContactDialog'
import { toast } from 'sonner'
import { useCrmWriteRequests } from '@/features/crm/api'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate } from '@/lib/locale'
import { i18n } from '@/i18n'
import { useCreateOutreachSequence } from '../hooks/useOutreachMutations'
import { useEnrollmentEligibility, useOutreachSequences } from '../hooks/useOutreachSequences'
import { isHardBlocked } from '../enrollment-exclusions'
import { EnrollmentExclusions } from './EnrollmentExclusions'
import { needsNoEmailConfirmation, noEmailContactIds } from '../no-email-confirmation'
import { contactsAlreadyInSequence, duplicateEmailContacts, homonymContacts } from '../audience-validation'
import { campaignLabelFor } from '../campaign-label'
import { firstSampleCandidate, useCampaignSample } from '../campaign-sample'
import { prepareEmailDraft, type DraftFailureReason } from '../prepare-email-draft'

/**
 * CRÉER UNE SÉQUENCE, DEPUIS L'ÉCRAN DES SÉQUENCES (#1510, #1512, #1513).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI N'AVAIT PAS DE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout le moteur était là : six gabarits nommés dans le contrat, un chemin de
 * création qui valide l'espacement des messages, refuse un contact qui a
 * probablement quitté l'entreprise, et respecte l'opt-out. Et pourtant :
 *
 *  · l'écran des séquences n'avait AUCUN bouton pour en créer une ;
 *  · la seule porte, sur la fiche contact, imposait `prospection_3_touches` —
 *    une constante écrite en dur. **Cinq gabarits sur six étaient
 *    inatteignables**, alors que chacun porte une situation commerciale
 *    différente et une cadence différente.
 *
 * C'est le défaut n°1 de ce dépôt : du code juste que personne n'appelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PORTES POUR L'AUDIENCE, ET UNE SEULE BASE DE CONTACTS
 * ─────────────────────────────────────────────────────────────────────────────
 * #1513 demande trois portes. Elles sont ici, et la deuxième et la troisième
 * ne REFONT rien : « importer une liste » emmène vers l'import de contacts
 * existant, avec sa prévisualisation, sa déduplication et son rattachement au
 * compte — le refaire dans cette fenêtre aurait fabriqué un second importeur,
 * donc une seconde façon de créer des doublons. « Importer depuis mon CRM »
 * n'est proposé que si un connecteur l'est réellement.
 *
 * ⚠️ #1512 le dit et c'est tenu : **aucune base de contacts propre aux
 * séquences**. Le sélecteur lit `GET /contacts`, la même table que l'écran
 * Contacts, avec la même recherche serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLUSIEURS CONTACTS = PLUSIEURS SÉQUENCES
 * ─────────────────────────────────────────────────────────────────────────────
 * Une séquence porte UN contact (`contact_id`), et c'est ce qui lui permet de
 * s'arrêter quand cette personne répond. Sélectionner douze contacts crée donc
 * douze séquences, et la fenêtre le DIT avant de valider — « 12 séquences
 * seront créées, une par contact ». Prétendre le contraire ferait croire à une
 * campagne qui s'arrêterait d'un bloc à la première réponse.
 *
 * ⚠️ Un échec partiel se dit. Douze créations, trois qui échouent : le message
 * annonce « 9 sur 12 », il ne dit pas « créées » tout court.
 */

const STEP_KIND_KEY = {
  email: 'kind.email',
  reminder: 'kind.reminder',
  task: 'kind.task',
  // Lot L-B (#4165) — les vrais canaux : LinkedIn et appel restent des gestes manuels.
  linkedin_invite: 'kind.linkedin_invite',
  linkedin_message: 'kind.linkedin_message',
  call: 'kind.call',
} as const

/**
 * Aperçu d'une échéance J+n (indicatif — le serveur ancre sur Europe/Paris).
 *
 * ⚠️ `formatDate` rend `null` sur une valeur illisible plutôt qu'une fausse
 * date : la chaîne vide est ce qui reste quand il n'y a rien de vrai à écrire.
 */
function previewDate(offsetDays: number): string {
  return formatDate(new Date(Date.now() + offsetDays * 86_400_000)) ?? ''
}

/**
 * Ce que la fenêtre a besoin de savoir d'un contact — un sous-ensemble, et non
 * `GlobalContact` : la fiche contact ouvre la MÊME fenêtre avec un objet d'une
 * autre forme, et exiger la forme de la liste l'aurait obligée à en fabriquer
 * une, donc à recopier des champs.
 */
type PickableContact = {
  id: string
  full_name: string
  title: string | null
  email: string | null
  excluded_at?: string | null
  /**
   * #2202.23 — le PORTEUR attribué (`contacts.assigned_to`), pour avertir avant
   * de lancer une séquence sur un contact déjà suivi par un COLLÈGUE.
   * `undefined` = non chargé ici (appelant qui ne le fournit pas) ; `null` =
   * chargé, aucun porteur. Les deux ne se confondent jamais (GA-18/GA-19) : un
   * appelant qui ne le fournit pas ne déclenche AUCUN avertissement, jamais un
   * faux « personne ne le porte ».
   */
  assigned_to?: string | null
  /**
   * #1935.24 — le brouillon d'étape e-mail, pour le RELIRE avant de créer la
   * séquence. `undefined` = pas chargé ici (on ne sait pas) ; `null` = chargé,
   * aucun brouillon écrit. Ne jamais confondre les deux : « je ne sais pas »
   * n'est pas « il n'y a rien » (GA-18/GA-19) — un appelant qui ne le fournit
   * pas ne voit donc AUCUNE ligne de prévisualisation pour ce contact, jamais
   * un faux « aucun brouillon ».
   */
  email_message?: { subject: string; body: string } | null
}

/** #1935.1 → .6 — ce qu'une conversation avec Laura a établi pour CETTE
 *  campagne : affiché en tête, jamais utilisé pour décider à la place de
 *  l'utilisateur (il choisit et change librement le gabarit, l'audience). */
type CampaignContext = {
  /**
   * #2123.80 — qui a PRÉPARÉ ce contexte : Laura (une conversation) ou le
   * dossier du compte (sélection multiple de contacts). Absent = Laura, le
   * seul appelant d'avant.
   */
  source?: 'laura' | 'account'
  /** Absent quand le dossier ne porte aucun objectif lisible — jamais inventé. */
  objective?: string
  persona?: string | null
  relation?: string | null
  tone?: string | null
  channels?: readonly string[]
  /**
   * #1935.15 — `outreach` (défaut, prospection active) ou `nurturing`
   * (relation à entretenir, sans relance insistante). Le champ voyageait déjà
   * du chat jusqu'à l'URL de cet écran (`campaignSearch`,
   * `PendingActions.tsx`) sans jamais être LU ici : une campagne « nurturing »
   * atterrissait donc identique à une « outreach ». `outreach` reste le
   * chemin implicite, silencieux — seule l'exception se nomme.
   */
  mode?: string | null
  /**
   * #1935.14 — `call_list` quand l'audience visée est SEULE téléphone (le
   * calcul vit dans `chat_tools.py`, voyage par `campaign-prefill.ts`) : une
   * liste d'appels n'est pas une campagne e-mail, elle se nomme pour ce
   * qu'elle est. `sequence_campaign` (défaut, absent y compris) reste le
   * chemin implicite, silencieux — seule l'exception se nomme.
   */
  outputKind?: string | null
}

const CAMPAIGN_RELATIONS = ['cold', 'warm', 'referred', 'existing'] as const
const CAMPAIGN_CHANNELS = ['email', 'linkedin', 'phone'] as const

export function CreateSequenceDialog({
  open,
  onOpenChange,
  initialContacts = [],
  contactsLocked = false,
  initialTemplate,
  campaignContext,
  initialName,
  initialCustomSteps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Contacts déjà choisis ailleurs — l'action groupée de l'écran Contacts, ou
   *  la fiche d'un contact, qui n'en propose qu'un et n'ouvre pas le sélecteur. */
  initialContacts?: readonly PickableContact[]
  /** La fiche contact : le contact est celui de la fiche, il ne se choisit pas. */
  contactsLocked?: boolean
  /** #1935 — le gabarit suggéré par Laura, présélectionné mais changeable. */
  initialTemplate?: OutreachTemplateKey
  /** #1903.10 / #1935 — le contexte de la campagne préparée depuis le chat. */
  campaignContext?: CampaignContext
  /** #2123.80 — le nom proposé (le compte du dossier), modifiable. */
  initialName?: string
  /** Théo C sequences-assistant.N1 — la cadence réglée dans l'assistant (canal et jour de chaque touche). */
  initialCustomSteps?: readonly CustomStep[]
}) {
  const { t } = useTranslation('outreach')
  const create = useCreateOutreachSequence()

  const [picked, setPicked] = useState<ReadonlyMap<string, PickableContact>>(() => new Map())
  const [template, setTemplate] = useState<OutreachTemplateKey>(initialTemplate ?? 'prospection_3_touches')
  /**
   * LA CADENCE PERSONNALISÉE (#1510).
   *
   * ⚠️ Le moteur acceptait DÉJÀ des étapes libres — `createOutreachSequenceRequestSchema`
   * prend « un template OU des étapes », et le plafond de douze est au contrat
   * depuis le premier jour. C'est l'écran qui n'offrait pas la porte : encore
   * une capacité juste, testée, que personne ne pouvait atteindre.
   */
  const [custom, setCustom] = useState(false)
  const [customSteps, setCustomSteps] = useState<CustomStep[]>(() => [...DEFAULT_CUSTOM_STEPS])
  // #1935 — le gabarit suggéré s'applique à CHAQUE ouverture (une carte
  // confirmée deux fois de suite doit proposer le même gabarit les deux fois),
  // jamais une seule fois au montage.
  useEffect(() => {
    if (open && initialTemplate) {
      setCustom(false)
      setTemplate(initialTemplate)
    }
  }, [open, initialTemplate])
  // Théo C sequences-assistant.N1 — la cadence réglée dans l'assistant arrive en cadence personnalisée,
  // à CHAQUE ouverture (comme le gabarit suggéré ci-dessus).
  useEffect(() => {
    if (open && initialCustomSteps && initialCustomSteps.length > 0) {
      setCustom(true)
      setCustomSteps(initialCustomSteps.map(step => ({ ...step })))
    }
  }, [open, initialCustomSteps])
  // #2123.80 — le nom part du compte quand la fenêtre s'ouvre depuis un dossier.
  const [name, setName] = useState(initialName ?? '')
  // Théo C sequences-assistant.N5 — le nom saisi dans l'assistant, repris à l'ouverture.
  useEffect(() => {
    if (open && initialName) setName(initialName)
  }, [open, initialName])
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  /**
   * #1935.20 — un contact SANS e-mail exigeait un badge, pas une confirmation :
   * rien n'empêchait de cliquer « Créer » avec une ligne oubliée au milieu de
   * vingt autres. L'ensemble confirmé, pas un booléen global : ajouter un
   * treizième contact sans e-mail après avoir coché les douze premiers redemande
   * la question sur celui-ci (voir `needsNoEmailConfirmation`).
   */
  const [confirmedNoEmailIds, setConfirmedNoEmailIds] = useState<ReadonlySet<string>>(() => new Set())

  // Les contacts venus de l'écran Contacts sont pris tels quels à l'ouverture.
  // `open` est dans la dépendance : refermer puis rouvrir doit repartir de la
  // sélection courante, pas de celle d'il y a dix minutes.
  const seeded = useMemo(() => new Map(initialContacts.map(c => [c.id, c])), [initialContacts])
  const selection = picked.size > 0 || seeded.size === 0 ? picked : seeded

  const contacts = useContacts(debounced ? { q: debounced } : {})
  const searchRows = useMemo(
    () => (contacts.data?.pages ?? []).flatMap(page => page.data).slice(0, 40),
    [contacts.data],
  )
  // #3700 / #3695 — le contact venu de la fiche est DÉJÀ dans la sélection, mais le sélecteur ne
  // liste que les 40 premiers contacts de l'espace : il n'y figurait pas, et la fenêtre s'ouvrait
  // avec toutes les cases décochées (recette démo 10/10). Les contacts de départ sont épinglés en
  // tête de liste (cochés), tant qu'aucune recherche n'est saisie.
  const rows: readonly PickableContact[] = useMemo(() => {
    if (debounced) return searchRows
    const pinned = [...seeded.values()]
    const pinnedIds = new Set(pinned.map(c => c.id))
    return [...pinned, ...searchRows.filter(c => !pinnedIds.has(c.id))]
  }, [debounced, searchRows, seeded])
  // #2202.14 — MÊME statut que la file de validation CRM (`useCrmWriteRequests`),
  // jamais un second calcul qui pourrait diverger.
  const crmWriteRequests = useCrmWriteRequests()
  const crmReady = crmWriteRequests.data?.status === 'ready'

  const toggle = (contact: PickableContact) => {
    const next = new Map(selection)
    if (next.has(contact.id)) next.delete(contact.id)
    else next.set(contact.id, contact)
    setPicked(next)
  }

  const chosen = [...selection.values()]
  // #1935.20 — voir le state juste au-dessus.
  const pendingNoEmailIds = noEmailContactIds(chosen)
  const requiresNoEmailConfirmation = needsNoEmailConfirmation(chosen, confirmedNoEmailIds)
  // #2202.23 — AVANT VALIDATION : PROPRIÉTAIRES. Un contact déjà PORTÉ par un
  // collègue (`contacts.assigned_to`) mérite un signal avant de lancer une
  // séquence dessus — même geste que `colleagueOwner` sur la fiche contact
  // (`ContactHeader.tsx`), jamais un second calcul qui pourrait diverger sur
  // qui compte comme « moi ».
  //
  // ⚠️ Tant que la liste des membres n'a pas répondu, on ne SAIT pas qui est
  // « moi » : ne rien afficher plutôt que deviner (GA-18/19), même discipline
  // que `unreadCountStatus` ('unknown' ≠ silence total, mais ici un chargement
  // encore en cours n'est pas une absence à annoncer).
  const workspaceMembers = useWorkspaceMembers()
  const selfMemberId = workspaceMembers.data?.find(member => member.isSelf)?.userId ?? null
  const ownedByColleague = workspaceMembers.data
    ? chosen
        .filter(contact => contact.assigned_to && contact.assigned_to !== selfMemberId)
        .map(contact => ({
          id: contact.id,
          contactName: contact.full_name,
          // `undefined` = collègue introuvable dans l'espace (compte retiré) :
          // on avertit quand même, sans inventer un nom qu'on n'a pas.
          ownerName: workspaceMembers.data?.find(member => member.userId === contact.assigned_to)?.fullName ?? null,
        }))
    : []
  /**
   * #2202.19 — AVANT VALIDATION : DOUBLONS. Deux fiches de la sélection qui
   * partagent la même adresse e-mail sont deux enregistrements pour une seule
   * personne réelle — lancer une séquence sur les deux ferait deux e-mails
   * dans la même boîte. Calcul pur, testé (`audience-validation.ts`).
   */
  const duplicateEmailIds = new Set(duplicateEmailContacts(chosen).map(contact => contact.id))
  // #3701.8 — mêmes noms, fiches distinctes : montrés, jamais fusionnés.
  const homonymGroups = homonymContacts(chosen)
  /**
   * #2202.22 — AVANT VALIDATION : PERSONNES DÉJÀ EN SÉQUENCE. Réutilise la
   * MÊME liste que l'écran des séquences (`useOutreachSequences()`, sans
   * filtre) — jamais un second calcul qui pourrait diverger sur ce qui compte
   * comme « en cours ».
   *
   * ⚠️ Tant que les séquences n'ont pas répondu, `contactsAlreadyInSequence`
   * ne signale rien (GA-18/19) — même discipline que `ownedByColleague`.
   */
  const allSequences = useOutreachSequences()
  const alreadyInSequenceIds = new Set(contactsAlreadyInSequence(chosen, allSequences.data))
  // Lot L-B (#4165) — les exclusions à l'inscription, nommées contact par
  // contact : séquence active, contacté il y a moins de 30 jours, opposition
  // RGPD, compte déjà client. Levables d'un geste, sauf le RGPD.
  const eligibility = useEnrollmentEligibility(chosen.map(contact => contact.id))
  const [overrideExclusions, setOverrideExclusions] = useState(false)
  // La durée d'une cadence personnalisée est l'offset de sa DERNIÈRE touche —
  // exactement la même définition que `outreachTemplateSpan` pour les gabarits,
  // sinon « 4 touches sur 18 jours » voudrait dire deux choses sur le même écran.
  const customSpanDays = customSteps.reduce((max, step) => Math.max(max, step.offsetDays), 0)

  const span = outreachTemplateSpan(template)
  const definition = OUTREACH_SEQUENCE_TEMPLATES[template]
  // #1935.24 — SEULE une cadence qui porte une étape e-mail a un brouillon à
  // relire ; une cadence 100 % LinkedIn/appel n'a rien à prévisualiser ici.
  const hasEmailStep = custom
    ? customSteps.some(step => step.kind === 'email')
    : definition.steps.some(step => step.kind === 'email')

  /**
   * #2874 / #2367.17 — L'ÉCHANTILLON avant de valider une campagne à
   * PLUSIEURS contacts (« Fais-moi un mail pour les cinquante contacts » ne
   * doit PAS générer cinquante e-mails d'un coup, mais rien n'en montrait un
   * SEUL non plus avant ce lot). Un seul candidat à la fois — le premier
   * contact JOIGNABLE par e-mail — et `sample.contactId` garde la fraîcheur :
   * si l'audience change de premier contact, l'ancien échantillon ne
   * s'affiche plus (le bouton redevient disponible), sans effet ni minuteur.
   */
  const { sample, generate: generateSample } = useCampaignSample()
  const sampleCandidate = firstSampleCandidate(chosen)

  /**
   * L'aperçu, sous UNE seule forme.
   *
   * Un gabarit rend une clé de catalogue, une cadence personnalisée rend le
   * texte que la personne a écrit. Les laisser cohabiter en union obligeait à
   * demander `'label' in step` à l'affichage — et tous les pas de gabarit ont
   * un `label`, donc la question était toujours vraie. On aplatit une fois, ici.
   */
  const previewLines: { key: string; text: string; offsetDays: number }[] = custom
    ? customSteps.map((step, index) => ({
        key: `custom-${index}`,
        // Une touche sans intention écrite affiche au moins sa nature : « Rappel »
        // se lit, une ligne vide se lit comme un bug.
        text: step.label.trim() || t(STEP_KIND_KEY[step.kind]),
        offsetDays: step.offsetDays,
      }))
    : definition.steps.map(step => ({
        key: step.purposeKey,
        text: t(`templates.purpose.${step.purposeKey}`),
        offsetDays: step.offset_days,
      }))

  // #4158.47 — la garde « contacté par un collègue » (#21) à la création :
  // confirmation avant d'armer, jamais un blocage dur.
  const colleagueGuard = useColleagueContactsGuard(id => chosen.find(contact => contact.id === id)?.full_name ?? '')

  const submit = async () => {
    if (chosen.length === 0) return
    // Lot L-B — qui part vraiment. Une opposition RGPD ne se lève JAMAIS ; les
    // autres exclusions se lèvent par la case explicite. Le serveur re-vérifie.
    const exclusionByContact = new Map((eligibility.data?.contacts ?? []).map(row => [row.contact_id, row]))
    const enrollable = chosen.filter(contact => {
      const row = exclusionByContact.get(contact.id)
      if (!row || row.exclusions.length === 0) return true
      return !isHardBlocked(row) && overrideExclusions
    })
    if (enrollable.length < chosen.length) {
      toast.warning(i18n.t('outreach:toast.excludedSkipped', { count: chosen.length - enrollable.length }))
    }
    if (enrollable.length === 0) return
    let done = 0
    /**
     * #2203.32 → .38 — L'ÉTIQUETTE que les séquences de CE geste partagent.
     *
     * Calculée UNE fois, avant la boucle : la dériver à chaque tour ferait
     * douze étiquettes différentes pour douze contacts lancés ensemble — et le
     * dernier recours porte l'heure, donc elles auraient réellement divergé.
     */
    const campaignLabel = campaignLabelFor({
      contactCount: chosen.length,
      name,
      objective: campaignContext?.objective ?? null,
      templateLabel: custom ? t('custom.title') : t(`templates.name.${template}`),
      at: new Date(),
    })
    // #3702 — l'étape e-mail naît avec un brouillon relisible : le serveur fige
    // `contacts.email_message` dans l'étape, donc on le PRÉPARE d'abord (moteur
    // de rédaction existant, jamais d'envoi). Un échec se NOMME, la séquence
    // se crée quand même (objet + corps s'écrivent dans « Modifier »).
    const draftFailures: { name: string; reason: DraftFailureReason }[] = []
    for (const contact of enrollable) {
      const excluded = exclusionByContact.get(contact.id)?.exclusions.some(() => true) === true
      if (hasEmailStep) {
        const outcome = await prepareEmailDraft(contact, campaignContext?.objective)
        if (outcome.status === 'failed') draftFailures.push({ name: contact.full_name, reason: outcome.reason })
      }
      const body: CreateOutreachSequenceRequest = {
        contact_id: contact.id,
        // Exactement l'un des deux, jamais les deux : le contrat le refuse, et
        // il a raison — « quel gabarit, avec quelles étapes » n'a pas de sens.
        ...(custom
          ? {
              steps: customSteps.map(step => ({
                kind: step.kind,
                offset_days: step.offsetDays,
                ...(step.label.trim() ? { label: step.label.trim() } : {}),
              })),
            }
          : { template }),
        ...(name.trim() ? { name: name.trim() } : {}),
        // Absente quand un seul contact part : une séquence lancée seule
        // n'appartient à aucune campagne (cf. `campaign-label.ts`).
        ...(campaignLabel ? { campaign_label: campaignLabel } : {}),
        // Lot L-B — passer outre est un geste explicite, tracé : le motif écrit
        // lève aussi le refus de collision de séquence active (#2380.67).
        ...(excluded && overrideExclusions
          ? {
              override_exclusions: true,
              force_justification: i18n.t('outreach:multichannel.exclusions.forceJustification'),
            }
          : {}),
      }
      try {
        await create.mutateAsync(body)
        done += 1
      } catch {
        // Le hook a déjà dit ce qui n'allait pas sur CETTE ligne ; on continue
        // les autres plutôt que d'abandonner douze créations pour une.
      }
    }
    if (done === enrollable.length) toast.success(i18n.t('outreach:toast.createdMany', { count: done }))
    else toast.warning(i18n.t('outreach:toast.createPartial', { done, total: enrollable.length }))
    if (draftFailures.length > 0) {
      toast.warning(
        i18n.t('outreach:toast.draftFailed', {
          names: draftFailures.map(failure => failure.name).join(', '),
          reasons: [
            ...new Set(draftFailures.map(failure => i18n.t(`outreach:toast.draftReason.${failure.reason}`))),
          ].join(' ; '),
        }),
      )
    }
    if (done > 0) {
      setPicked(new Map())
      setConfirmedNoEmailIds(new Set())
      setName('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        <Box className="flex flex-col gap-5">
          {/* #1903.10 / #1935.1 → .6 — LE CONTEXTE DE LA CAMPAGNE PRÉPARÉE
              PAR LAURA, EN TÊTE : objectif, persona, relation, ton. Affiché,
              jamais imposé — l'audience et le gabarit restent modifiables
              juste en dessous. */}
          {campaignContext ? (
            <Box className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
              <Box className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
                <Text size="xs" weight="medium">
                  {campaignContext.source === 'account'
                    ? t('campaign.preparedFromAccount')
                    : campaignContext.outputKind === 'call_list'
                      ? t('campaign.preparedCallList')
                      : t('campaign.preparedByLaura')}
                </Text>
              </Box>
              {campaignContext.objective ? <Text size="sm">{campaignContext.objective}</Text> : null}
              <Box className="flex flex-wrap gap-x-3 gap-y-1">
                {campaignContext.persona ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.persona', { value: campaignContext.persona })}
                  </Text>
                ) : null}
                {campaignContext.relation &&
                (CAMPAIGN_RELATIONS as readonly string[]).includes(campaignContext.relation) ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.relation', { value: t(`campaign.relationValue.${campaignContext.relation}`) })}
                  </Text>
                ) : null}
                {campaignContext.tone ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.tone', { value: campaignContext.tone })}
                  </Text>
                ) : null}
                {/* #1935.15 — seule l'exception se nomme : `outreach` (le
                    défaut implicite) reste silencieux, comme `channels` ne
                    s'affiche pas pour le seul email. */}
                {campaignContext.mode === 'nurturing' ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.mode', { value: t('campaign.modeValue.nurturing') })}
                  </Text>
                ) : null}
                {/* #1935.5 — même règle : `['email']` est le REPLI implicite du
                    outil (`chat_tools.py` : `channels or ["email"]`), jamais un
                    choix annoncé — l'afficher promettrait une décision qui
                    n'a pas été prise. Seule une audience réellement demandée
                    (un autre canal, ou plusieurs) se nomme. */}
                {campaignContext.channels?.length &&
                !(campaignContext.channels.length === 1 && campaignContext.channels[0] === 'email') ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.channels', {
                      value: campaignContext.channels
                        .filter((channel): channel is (typeof CAMPAIGN_CHANNELS)[number] =>
                          (CAMPAIGN_CHANNELS as readonly string[]).includes(channel),
                        )
                        .map(channel => t(`campaign.channelValue.${channel}`))
                        .join(', '),
                    })}
                  </Text>
                ) : null}
              </Box>
            </Box>
          ) : null}

          {/* ── 1. POUR QUI ─────────────────────────────────────────────── */}
          <Box className={contactsLocked ? 'hidden' : 'flex flex-col gap-2'}>
            <Text size="sm" weight="medium">
              {t('audience.title')}
            </Text>
            <Box className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                {t('audience.pickContacts')}
              </Badge>
              {/* Les deux autres portes ne REFONT rien : elles emmènent là où
                  l'import vit déjà, avec sa prévisualisation et sa
                  déduplication. */}
              <Link
                to="/settings/mes-donnees"
                search={{ tab: 'imports' }}
                className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
              >
                <Import className="size-3.5" aria-hidden="true" />
                {t('audience.importList')}
              </Link>
              {/* #2202.14 — TROISIÈME PORTE, conditionnée à un connecteur RÉEL :
                  le même statut que la file de validation CRM
                  (`useCrmWriteRequests`), jamais un second calcul qui pourrait
                  diverger. Un bouton qu'on sait déjà refusé ne s'affiche pas
                  (même règle que les demandes d'écriture ERP, `ErpWriteList`). */}
              {crmReady ? (
                <Link
                  to="/settings/mes-donnees"
                  search={{ tab: 'imports' }}
                  className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                >
                  <Import className="size-3.5" aria-hidden="true" />
                  {t('audience.importFromCrm')}
                </Link>
              ) : null}
            </Box>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('audience.importHint')} {crmReady ? null : t('audience.crmHint')}
            </Text>

            <Input
              value={search}
              aria-label={t('audience.search')}
              placeholder={t('audience.search')}
              onChange={event => setSearch(event.target.value)}
            />

            <Box className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--bellum-border)] p-2">
              {rows.length === 0 ? (
                <Text size="sm" className="p-2 text-[var(--bellum-text-secondary)]">
                  {t('audience.empty')}
                </Text>
              ) : (
                rows.map(contact => {
                  const optedOut = !!contact.excluded_at
                  return (
                    <label
                      key={contact.id}
                      className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
                    >
                      <Checkbox
                        checked={selection.has(contact.id)}
                        onCheckedChange={() => toggle(contact)}
                        aria-label={contact.full_name}
                      />
                      <Box className="flex min-w-0 flex-col">
                        <Text size="sm" className="truncate">
                          {contact.full_name}
                        </Text>
                        <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                          {/* Le poste ABSENT se DIT ; il ne se remplace pas par
                              un tiret, qui se lirait comme une valeur. */}
                          {contact.title ?? t('columns.noRole')}
                        </Text>
                      </Box>
                      <Box className="ml-auto flex shrink-0 items-center gap-1.5">
                        {!contact.email ? (
                          <Badge variant="outline" className="text-xs">
                            {t('audience.noEmail')}
                          </Badge>
                        ) : null}
                        {optedOut ? (
                          <Badge variant="outline" className="text-xs text-[var(--danger-soft-text)]">
                            {t('audience.excluded')}
                          </Badge>
                        ) : null}
                      </Box>
                    </label>
                  )
                })
              )}
            </Box>

            {chosen.length > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('audience.selected', { count: chosen.length })} —{' '}
                {t('audience.willCreate', { count: chosen.length })}
              </Text>
            ) : null}
          </Box>

          {/* #1935.20 — le badge « pas d'e-mail » sur chaque ligne ne bloquait
              rien : cette case EST le blocage, et elle porte la LISTE, pas un
              compte, pour qu'on sache de qui on parle avant de confirmer.
              ⚠️ HORS du bloc `contactsLocked` ci-dessus : depuis la fiche d'un
              contact sans e-mail, le sélecteur est masqué mais la confirmation
              doit rester atteignable — sinon le bouton « Créer » resterait
              bloqué sans aucun moyen visible de le débloquer. */}
          {pendingNoEmailIds.length > 0 ? (
            <label className="flex items-start gap-2 rounded-md border border-[var(--bellum-border)] p-2 pointer-coarse:min-h-11">
              <Checkbox
                checked={!requiresNoEmailConfirmation}
                onCheckedChange={checked =>
                  setConfirmedNoEmailIds(checked ? new Set([...confirmedNoEmailIds, ...pendingNoEmailIds]) : new Set())
                }
                aria-label={t('audience.noEmailConfirm', { count: pendingNoEmailIds.length })}
              />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('audience.noEmailConfirm', { count: pendingNoEmailIds.length })}
              </Text>
            </label>
          ) : null}

          {/* Lot L-B (#4165) — les exclusions à l'inscription, nommées. */}
          <EnrollmentExclusions
            eligibility={eligibility.data}
            overridden={overrideExclusions}
            onOverrideChange={setOverrideExclusions}
            t={t}
          />

          {/* #2202.23 — même position HORS du bloc `contactsLocked` que la
              confirmation ci-dessus : depuis la fiche d'un contact déjà porté
              par un collègue, l'avertissement doit rester visible même quand
              le sélecteur est masqué. Informatif, jamais bloquant — proposer
              n'est pas décider à la place du commercial (doctrine « on
              PROPOSE, on ne fusionne/décide jamais à sa place »). */}
          {ownedByColleague.length > 0 ? (
            <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-warning)] p-2">
              <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
                {t('audience.ownedByColleagues', { count: ownedByColleague.length })}
              </Text>
              {ownedByColleague.map(entry => (
                <Text key={entry.id} size="xs" className="text-[var(--bellum-text-secondary)]">
                  {entry.ownerName
                    ? t('audience.ownedByColleagueNamed', { contact: entry.contactName, name: entry.ownerName })
                    : t('audience.ownedByColleagueGeneric', { contact: entry.contactName })}
                </Text>
              ))}
            </Box>
          ) : null}

          {/* #2202.19 — même position hors du bloc `contactsLocked` que les
              avertissements ci-dessus : informatif, jamais bloquant (doctrine
              « on PROPOSE, on ne décide jamais à la place »). */}
          {duplicateEmailIds.size > 0 ? (
            <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-warning)] p-2">
              <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
                {t('audience.duplicateEmails', { count: duplicateEmailIds.size })}
              </Text>
              {chosen
                .filter(contact => duplicateEmailIds.has(contact.id))
                .map(contact => (
                  <Text key={contact.id} size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('audience.duplicateEmailEntry', { contact: contact.full_name, email: contact.email })}
                  </Text>
                ))}
            </Box>
          ) : null}

          {/* #3701.8 — deux fiches au même nom : peut-être la même personne, peut-être
              deux. On le montre, on ne fusionne pas et on ne bloque pas. */}
          {homonymGroups.length > 0 ? (
            <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-warning)] p-2">
              <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
                {t('audience.homonyms', { count: homonymGroups.length })}
              </Text>
              {homonymGroups.map(group => (
                <Text key={group[0]?.id} size="xs" className="text-[var(--bellum-text-secondary)]">
                  {group
                    .map(contact =>
                      contact.email
                        ? t('audience.homonymEntry', { contact: contact.full_name, detail: contact.email })
                        : t('audience.homonymEntryNoEmail', { contact: contact.full_name }),
                    )
                    .join(' · ')}
                </Text>
              ))}
            </Box>
          ) : null}

          {/* #2202.22 — même geste : signaler, jamais empêcher de relancer une
              personne déjà en séquence (elle peut légitimement en recevoir une
              seconde, sur un autre sujet). */}
          {alreadyInSequenceIds.size > 0 ? (
            <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-warning)] p-2">
              <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
                {t('audience.alreadyInSequence', { count: alreadyInSequenceIds.size })}
              </Text>
              {chosen
                .filter(contact => alreadyInSequenceIds.has(contact.id))
                .map(contact => (
                  <Text key={contact.id} size="xs" className="text-[var(--bellum-text-secondary)]">
                    {contact.full_name}
                  </Text>
                ))}
            </Box>
          ) : null}

          {/* ── 2. QUELLE CADENCE ───────────────────────────────────────── */}
          <Box className="flex flex-col gap-2">
            <Text size="sm" weight="medium">
              {t('templates.pick')}
            </Text>
            <Box className="grid gap-2 md:grid-cols-2">
              {outreachTemplateKeySchema.options.map(key => {
                const info = outreachTemplateSpan(key)
                const selected = !custom && key === template
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCustom(false)
                      setTemplate(key)
                    }}
                    aria-pressed={selected}
                    className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left ${
                      selected
                        ? 'border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-400)_8%,transparent)]'
                        : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]'
                    }`}
                  >
                    <Text size="sm" weight="medium">
                      {/* Le nom vient du catalogue : celui du contrat est en français. */}
                      {t(`templates.name.${key}`)}
                    </Text>
                    {/* Le compte d'étapes, la durée et les natures employées
                        sont DÉRIVÉS du gabarit, jamais recopiés à côté de lui. */}
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t('templates.steps', { count: info.stepCount })} ·{' '}
                      {t('templates.spanDays', { count: info.spanDays })} ·{' '}
                      {info.kinds.map(kind => t(STEP_KIND_KEY[kind])).join(' · ')}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t(`templates.${key}.when`)}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t(`templates.${key}.outcome`)}
                    </Text>
                  </button>
                )
              })}

              {/* #1510 — « Permettre également de créer une cadence
                  personnalisée, en réutilisant les étapes custom déjà
                  supportées par le backend. » Elles l'étaient ; il manquait
                  cette carte. */}
              <button
                type="button"
                onClick={() => setCustom(true)}
                aria-pressed={custom}
                className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border border-dashed p-3 text-left ${
                  custom
                    ? 'border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-400)_8%,transparent)]'
                    : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]'
                }`}
              >
                <Text size="sm" weight="medium">
                  {t('custom.title')}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('templates.steps', { count: customSteps.length })} ·{' '}
                  {t('templates.spanDays', { count: customSpanDays })}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('custom.when')}
                </Text>
              </button>
            </Box>

            {custom ? <CustomCadenceEditor steps={customSteps} onChange={setCustomSteps} /> : null}
          </Box>

          {/* ── 3. LES ÉCHÉANCES, AVANT DE VALIDER ──────────────────────── */}
          <Box className="flex flex-col gap-1.5">
            <Text size="sm" weight="medium">
              {t('dialog.previewLabel')}
            </Text>
            {/* #1510 — CE QUE CHAQUE TOUCHE APPORTE, pas seulement quand elle
                tombe. « Ne pas afficher uniquement J0 / J+4 / J+10 sans
                expliquer ce que chaque message apporte. »

                ⚠️ Le texte vient des catalogues, plus de `step.label` : celui-ci
                est le libellé ÉCRIT EN BASE à la création — un enregistrement,
                pas un texte d'interface — et il est en français quelle que soit
                la langue. Un utilisateur anglophone lisait « Relance valeur ». */}
            {previewLines.map(line => (
              <Box key={line.key} className="flex items-start gap-2">
                <CalendarClock
                  className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]"
                  aria-hidden="true"
                />
                <Text size="sm" className="min-w-0 flex-1">
                  {line.text}
                </Text>
                <Text size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
                  {previewDate(line.offsetDays)}
                </Text>
              </Box>
            ))}
          </Box>

          {/* #2874 / #2367.17 — L'ÉCHANTILLON, UN SEUL MESSAGE, POUR UN
              CONTACT RÉEL DE LA CAMPAGNE (doctrine c74 : jamais un contact
              inventé). Réutilise le générateur du composer (`POST
              /ia/message`, crédit 0) sur un geste explicite — jamais au
              chargement, jamais un par contact. Seulement au-delà d'UN
              contact : une séquence à un seul destinataire a déjà sa relecture
              juste en dessous (#1935.24) si un brouillon y est chargé. */}
          {hasEmailStep && chosen.length > 1 ? (
            <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
              <Box className="flex flex-wrap items-center justify-between gap-2">
                <Text size="sm" weight="medium">
                  {t('sample.title')}
                </Text>
                {sampleCandidate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:min-h-11"
                    disabled={sample.state === 'loading'}
                    onClick={() => void generateSample(sampleCandidate, campaignContext?.objective)}
                  >
                    {sample.state === 'loading' ? t('sample.loading') : t('sample.cta')}
                  </Button>
                ) : null}
              </Box>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('sample.hint', { count: chosen.length })}
              </Text>
              {!sampleCandidate ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('sample.noCandidate')}
                </Text>
              ) : sample.state === 'error' && sample.contactId === sampleCandidate.id ? (
                <Text size="xs" className="text-[var(--danger-soft-text)]">
                  {t('sample.error')}
                </Text>
              ) : sample.state === 'ready' && sample.contactId === sampleCandidate.id ? (
                <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-2">
                  <Text size="xs" weight="medium">
                    {sample.contactName}
                  </Text>
                  {sample.subject ? (
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {sample.subject}
                    </Text>
                  ) : null}
                  <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                    {sample.body}
                  </Text>
                </Box>
              ) : null}
            </Box>
          ) : null}

          {/* #1935.24 — CHAQUE MESSAGE, RELISIBLE INDIVIDUELLEMENT AVANT LA
              CRÉATION. C'est la garantie qui rend le reste acceptable : sans
              elle, « préparer » devient « faire à ma place ». Le brouillon
              vient de `prepare_message_for_contact`, déjà relu par la
              personne ; cette section ne rédige rien, elle relit. */}
          {hasEmailStep && chosen.length > 0 ? (
            <Box className="flex flex-col gap-2">
              <Text size="sm" weight="medium">
                {t('preview.title')}
              </Text>
              {chosen.map(contact => (
                <Box
                  key={contact.id}
                  className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] p-2"
                >
                  <Text size="xs" weight="medium">
                    {contact.full_name}
                  </Text>
                  {contact.email_message === undefined ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('preview.unknown')}
                    </Text>
                  ) : contact.email_message === null ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('preview.noDraft')}
                    </Text>
                  ) : (
                    <>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {contact.email_message.subject}
                      </Text>
                      <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                        {contact.email_message.body}
                      </Text>
                    </>
                  )}
                </Box>
              ))}
            </Box>
          ) : null}

          <Box className="flex flex-col gap-1.5">
            <Text size="sm" weight="medium">
              {t('dialog.nameLabel')}
            </Text>
            <Input
              value={name}
              aria-label={t('dialog.nameLabel')}
              placeholder={definition.name}
              onChange={event => setName(event.target.value)}
            />
          </Box>

          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('card.neverAutoSend')}
          </Text>
        </Box>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={() =>
              colleagueGuard.run(
                chosen.map(contact => contact.id),
                () => void submit(),
              )
            }
            disabled={create.isPending || chosen.length === 0 || requiresNoEmailConfirmation}
          >
            {create.isPending ? t('dialog.creating') : t('dialog.create')}
          </Button>
        </DialogFooter>
        {colleagueGuard.dialog}
      </DialogContent>
    </Dialog>
  )
}

/**
 * UNE ÉTAPE DE CADENCE PERSONNALISÉE, TELLE QUE L'ÉCRAN LA MANIPULE (#1510).
 *
 * `offsetDays` et pas une date : une cadence se pense en « J+4 », pas en
 * « 9 septembre ». Le contrat accepte les deux (`offset_days` OU `due_at`) ; on
 * n'expose que celui qui décrit un RYTHME, parce que c'est ce qu'on construit
 * ici — une date absolue transformerait le gabarit en calendrier à usage unique.
 */
type CustomStep = { kind: OutreachStepKind; offsetDays: number; label: string }

/**
 * Trois touches, comme la cadence la plus simple du catalogue : on part de
 * quelque chose de VALIDE plutôt que d'une liste vide, qui obligerait à
 * découvrir le geste « ajouter » avant de comprendre ce qu'on construit.
 */
const DEFAULT_CUSTOM_STEPS: readonly CustomStep[] = [
  { kind: 'email', offsetDays: 0, label: '' },
  { kind: 'reminder', offsetDays: 4, label: '' },
  { kind: 'email', offsetDays: 10, label: '' },
]

/**
 * L'ATELIER — ajouter, retirer, choisir le canal, poser le décalage.
 *
 * ⚠️ Les garde-fous ne sont pas décoratifs :
 *  · **douze étapes au plus**, le plafond du CONTRAT — lu chez lui, jamais
 *    recopié, sinon les deux divergent au premier changement ;
 *  · **au moins une** : une séquence sans étape n'est pas une séquence, et le
 *    serveur la refuserait après coup ;
 *  · les décalages sont **triés** avant l'envoi. Une touche à J+2 saisie après
 *    une touche à J+10 est une erreur de saisie, pas une intention.
 */
/**
 * Le décalage de la dernière touche.
 *
 * ⚠️ Une liste vide ne peut pas arriver — l'éditeur garde toujours une étape —
 * mais on ne l'écrit pas `?? 0` pour autant : GA-19 compte les replis sur zéro,
 * et un cliquet ne discute pas l'atteignabilité. Le `reduce` n'a pas ce défaut
 * puisqu'il part de zéro comme d'un MINIMUM, pas comme d'un remplacement.
 */
function lastOffset(steps: readonly CustomStep[]): number {
  return steps.reduce((max, step) => Math.max(max, step.offsetDays), 0)
}

function CustomCadenceEditor({ steps, onChange }: { steps: CustomStep[]; onChange: (next: CustomStep[]) => void }) {
  const { t } = useTranslation('outreach')
  const update = (index: number, patch: Partial<CustomStep>) =>
    onChange(steps.map((step, position) => (position === index ? { ...step, ...patch } : step)))

  return (
    <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
      {steps.map((step, index) => (
        <Box key={index} display="flex" className="flex-wrap items-center gap-2">
          {/* ⚠️ `SelectField` et non un `<select>` natif : GA-251 l'interdit, et
              elle a raison — un menu natif ne suit ni le thème ni la grammaire
              de focus du produit, et il se voit tout de suite au milieu du
              reste. La liste des natures vient du CONTRAT. */}
          <SelectField
            ariaLabel={t('custom.kindLabel')}
            value={step.kind}
            onChange={next => update(index, { kind: next as OutreachStepKind })}
            options={outreachStepKindSchema.options.map(kind => ({ value: kind, label: t(STEP_KIND_KEY[kind]) }))}
          />
          <label className="flex items-center gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('custom.dayLabel')}
            </Text>
            <input
              type="number"
              min={0}
              max={365}
              aria-label={t('custom.dayLabel')}
              className="w-16 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm"
              value={step.offsetDays}
              onChange={event => {
                // ⚠️ Un champ vidé ne vaut PAS « jour 0 » : il vaut « en cours de
                // saisie ». Replier sur zéro déplacerait la touche au premier
                // jour à chaque fois qu'on efface pour retaper — et GA-19 refuse
                // ce genre de repli, à raison.
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(parsed)) return
                update(index, { offsetDays: Math.min(365, Math.max(0, parsed)) })
              }}
            />
          </label>
          <input
            aria-label={t('custom.purposeLabel')}
            placeholder={t('custom.purposePlaceholder')}
            className="min-w-0 flex-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm"
            value={step.label}
            onChange={event => update(index, { label: event.target.value })}
          />
          {/* La dernière étape ne se retire pas : une séquence sans étape n'est
              pas une séquence, et le serveur la refuserait après coup. */}
          {steps.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('custom.removeStep')}
              onClick={() => onChange(steps.filter((_, position) => position !== index))}
            >
              ✕
            </Button>
          ) : null}
        </Box>
      ))}

      {steps.length < OUTREACH_SEQUENCE_MAX_STEPS ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start pointer-coarse:min-h-11"
          onClick={() =>
            onChange([
              ...steps,
              // La nouvelle touche tombe APRÈS la dernière : c'est ce qu'on veut
              // neuf fois sur dix, et c'est modifiable en un chiffre.
              { kind: 'reminder', offsetDays: lastOffset(steps) + 3, label: '' },
            ])
          }
        >
          {t('custom.addStep')}
        </Button>
      ) : (
        // Le plafond se DIT plutôt que de désactiver un bouton en silence.
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('custom.maxReached', { count: OUTREACH_SEQUENCE_MAX_STEPS })}
        </Text>
      )}
    </Box>
  )
}
