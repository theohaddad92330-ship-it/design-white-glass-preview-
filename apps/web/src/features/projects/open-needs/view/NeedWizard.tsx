import { projectChoice } from '../model/project-choice'
import { isAttachableProject } from '../../model/attachable-projects'
import { NeedWizardSteps } from './NeedWizardSteps'
import {
  CONTRACT_KINDS,
  NEED_PROCUREMENT_INVOLVEMENTS,
  REMOTE_PREFERENCES,
  type ContractKind,
  type NeedProcurementInvolvement,
  type NeedProvenance,
  type ProjectNeed,
  type Contact,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Input,
  Label,
  Logo,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CircleCheck, Copy, FileUp, Loader2, Mail, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountEntities } from '@/features/adv/api'
import { contactsApi } from '@/features/contacts/api'
import { projectsApi } from '@/features/projects/api'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useAddAccountNeed } from '@/features/projects/hooks/useProjectNeeds'
import { useCreateImplicitProject, useResolveAccountForNeed } from '@/features/projects/hooks/useCreateImplicitProject'
import { useProjectOwners } from '@/features/projects/hooks/useProjectOwners'
import { rfpApi } from '@/features/rfp/api'
import { SupervisedForfaitFields } from './SupervisedForfaitFields'
import { NeedOwnerSuggestion, needOwnerSuggestion } from './NeedOwnerSuggestion'
import { extractMission, type MissionExtraction } from '@/features/missions/mission-extraction'
import { needCompileTextApi, openNeedsApi, openNeedsKeys } from '../api'
import {
  applyCompiledNeedToDraft,
  applyMissionExtractionToDraft,
  clearNeedWizardDraft,
  duplicateNeedIntoDraft,
  emptyNeedWizardDraft,
  loadNeedWizardDraft,
  missionTypeCardPatch,
  missionTypeCardSelected,
  needWizardBlockingUnknowns,
  needWizardDraftToAccountNeedInput,
  needWizardReformulationSegments,
  needWizardStepValid,
  parseCompiledSkills,
  saveNeedWizardDraft,
  updateSkill,
  MISSION_TYPE_CARDS,
  type NeedWizardDraft,
  type NeedWizardStep,
} from '../model/need-wizard'

/**
 * L'ASSISTANT DE CRÉATION D'UN BESOIN, EN QUATRE ÉTAPES (08-creer-un-besoin.png).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUE CE FICHIER FAIT GRANDIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreateNeedDialog.tsx` (30/08/2026) posait déjà DEUX champs — titre et projet
 * de rattachement — sur le MÊME endpoint (`POST /projects/:id/needs`) que ce
 * fichier continue d'utiliser, via le MÊME hook (`useAddProjectNeed`). Ce
 * composant fait grandir ce point d'entrée en assistant à quatre étapes ; il
 * n'ouvre PAS un second chemin de création.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX CHAMPS, JAMAIS UNE LISTE UNIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source démêle sept « types » en trois axes (PDF-22, fiche 08) : l'ORIGINE
 * (entrant, sortant, appel d'offres, apport d'affaires), le CANAL (direct,
 * partenaire, portage), et une ACTION (sourcing interne). Les deux premiers
 * sont des champs (`origin`, `channel` — migration
 * `1790975000001-NeedOriginChannelCertifications.ts`) ; le troisième est un LIEN
 * qui quitte l'assistant pour le vivier, jamais une valeur enregistrée.
 *
 * Les SEPT cartes de la maquette restent affichées telles quelles (31/08/2026) :
 * c'est leur SÉLECTION qui remplit les deux champs — quatre écrivent `origin`,
 * deux écrivent `channel`, une n'écrit rien. La table et sa raison complète
 * vivent dans `model/need-wizard.ts` (`MISSION_TYPE_CARDS`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉPÔT DE FICHE DE POSTE — RÉUTILISÉ, PAS RÉINVENTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/routers/rfp.py` sait déjà déposer un document et en extraire des
 * exigences, CHACUNE avec sa section d'origine dans le document — la
 * traçabilité de l'extraction. Ce fichier appelle le MÊME chemin HTTP
 * (`rfpApi.create`, `apps/web/src/features/rfp/api.ts`, lu et non modifié) : le
 * document part, l'extraction revient, et chaque exigence TECHNIQUE proposée
 * porte sa citation — la phrase extraite ET la section où `rfp.py` l'a trouvée.
 * Rien n'est ACCEPTÉ automatiquement : un clic ajoute la suggestion comme
 * compétence, exactement comme le parsing de CV n'écrit rien sans validation
 * humaine.
 *
 * ⚠️ Effet de bord assumé : ce dépôt crée un dossier RFP réel (table `rfps`),
 * même quand le besoin n'est pas un appel d'offres. C'est le prix de réutiliser
 * le SEUL mécanisme d'extraction de document existant plutôt que d'en écrire un
 * second — voir le rapport de ce lot pour la mesure complète de ce compromis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE PROMESSE CHIFFRÉE NON MESURÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette affiche « +35 % de précision » sur l'extraction — personne n'a
 * mesuré ce chiffre. Il n'apparaît nulle part ici (garde i18n `no-overpromise`).
 * Ce qui le remplace est VRAI et déjà construit : chaque champ extrait porte sa
 * CITATION dans le document (`upload.citation`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN SEUL ASSISTANT, DEUX PORTES (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce composant est monté par DEUX écrans, et il n'en existe pas de copie :
 *  · `CreateNeedDialog` — le dialogue de `/projects/needs` (« Créer un besoin ») ;
 *  · `CreateMissionPage` — la pleine page `/missions/nouvelle`
 *    (« Créer une mission »), demandée par Louis le 31/08/2026.
 *
 * Ce qui varie d'une porte à l'autre est passé en PROPS (`backLabel`,
 * `submitLabel`) : la coque, le titre et le libellé du geste final. Le reste —
 * les quatre étapes, le brouillon, la validation, l'appel serveur — vit ici,
 * une fois. Deux copies auraient divergé en trois semaines (loi 4 du tome 7),
 * et c'est la garde `one-need-wizard.test.ts` qui refuse la seconde.
 *
 * ⚠️ VOCABULAIRE — « mission » à la porte, « besoin » en base (31/08/2026).
 * Le dépôt tient « besoin » pour l'objet AVANT signature (décision D3,
 * `agent_docs/dossier-26-aout-2026.md:606-610`) : une mission n'existe qu'APRÈS
 * signature. Louis veut l'écran titré « Créer une mission », et il l'a : le
 * TITRE et la PORTE disent « mission », l'objet métier écrit reste un
 * `project_need`. Renommer l'objet ferait DEUX objets pour la même affaire —
 * c'est exactement ce que D3 a tranché. Cette nuance ne se re-litigie pas.
 */

const MAX_STEP: NeedWizardStep = 5
/** Même borne que `RfpPage.tsx` (`MAX_RFP_FILE_MB`) — non exportée là-bas, donc
 *  répétée ici avec sa source nommée plutôt que devinée. */
const MAX_JOB_POSTING_FILE_MB = 8
const MAX_JOB_POSTING_FILE_BYTES = MAX_JOB_POSTING_FILE_MB * 1_000_000

/** #2174.30 — `inconnu` reste HORS de cette liste : c'est l'état que le
 *  serveur pose quand personne n'a choisi (`saveNeed`), jamais un choix
 *  qu'on ferait exprès à la création. */
const CONTRACT_KIND_OPTIONS = CONTRACT_KINDS.filter(value => value !== 'inconnu')

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

export function NeedWizard({
  onOpenChange,
  onCreated,
  /** Point d'entrée n°2 (`ProjectNeedsPanel`) : le projet est déjà connu, et
   *  l'étape 1 ne redemande pas ce que l'écran appelant sait déjà. */
  fixedProjectId,
  /** Le retour NOMMÉ du pied de page. Chaque porte revient chez elle : le
   *  dialogue vers les besoins en cours, la pleine page vers les missions. */
  backLabel,
  /** Le geste final, nommé par la porte. Défaut : « Créer le besoin ». */
  submitLabel,
  /**
   * #2942, #2152.17 — D'OÙ VIENT CE BESOIN, quand l'appelant le sait déjà.
   *
   * Absent = `null` : la saisie manuelle n'affirme rien sur son origine (le
   * formulaire ne le demande à personne). Posé par `ProjectsPage` à `'model'`
   * quand ce dialogue s'ouvre depuis la carte « besoin compilé » de Laura
   * (`?create_need=1`) — le seul appelant du dépôt qui SACHE que la matière
   * vient d'elle. Un humain qui remplit ce même formulaire sans venir de
   * cette carte ne pose toujours rien : ce n'est pas un défaut du formulaire,
   * c'est ce que l'appelant sait.
   */
  provenance,
  /**
   * #2942, #2152.17 — LE TITRE COMPILÉ PAR LAURA, quand il y en a un.
   *
   * `?create_need=1` ne posait que la provenance : le brouillon reste vide et
   * redemande tout ce que Laura savait déjà. Posé par `ProjectsPage` depuis
   * les champs compilés de la carte (`needTitle`, `PendingActions.tsx`) —
   * GAGNE désormais sur un brouillon REPRIS (`persisted`) plutôt que d'en
   * être écarté (revirement du 28/09/2026, constat production : un lien qui
   * pré-remplit nomme un compte/besoin PRÉCIS, un vieux brouillon d'une autre
   * session ne peut pas le deviner). Le brouillon écarté n'est ni appliqué NI
   * PERDU pour autant — voir `hasPrefill` plus bas, qui ne LIT ni n'ÉCRIT
   * plus `STORAGE_KEY` tant qu'un pré-remplissage gouverne la session.
   */
  initialTitle,
  /** Même garde que `initialTitle` — voir `context` (#2174.17). */
  initialContext,
  /**
   * #2942 (reste du 26/09) — LES COMPÉTENCES COMPILÉES PAR LAURA, en liste
   * jointe par virgules (même forme que `needField(action, 'skills')` dans
   * l'aperçu de la carte, `PendingActions.tsx` — aucune structure inventée).
   * Chaque terme devient une compétence NON éliminatoire par défaut
   * (`requiredSkillSchema.required` vaut déjà `true`) : Laura ne dit jamais
   * qu'un critère est bloquant, ce champ ne l'affirme donc pas non plus.
   */
  initialSkills,
  /** Le TJM compilé par Laura, en CENTIMES — jamais reconverti. */
  initialTjmCents,
  /**
   * #2942 (recette écran 27/09/2026) — LE COMPTE VISÉ, quand Laura l'a
   * RAPPROCHÉ (#2322.16) : un identifiant de compte RÉEL, déjà dans la base —
   * jamais créé ici, seulement choisi, exactement comme un clic sur une ligne
   * du sélecteur de projet pose déjà `accountId` sans aucun projet
   * (#2558.1, « besoin sans projet »). Recette du 27/09 : `create_need=1`
   * ouvrait la bonne porte, mais l'étape 1 redemandait un compte que Laura
   * avait pourtant déjà nommé.
   */
  initialAccountId,
  /**
   * #2942 (recette écran 27/09/2026) — LE NOM D'ENTREPRISE lu dans la
   * source, quand Laura n'a PAS pu rapprocher de compte (`company_hint`,
   * #2322.16). Jamais posé comme `accountId` : un nom seul ne désigne aucun
   * compte réel, l'affirmer serait en inventer un (GA-43, « un espace ne se
   * devine pas »). Il pré-remplit seulement la RECHERCHE — la personne
   * choisit ou crée le compte, exactement comme si elle avait tapé ce nom.
   */
  initialAccountName,
}: {
  onOpenChange: (open: boolean) => void
  onCreated: (need: ProjectNeed) => void
  fixedProjectId?: string
  backLabel?: string
  submitLabel?: string
  provenance?: NeedProvenance
  initialTitle?: string
  initialContext?: string
  initialSkills?: string
  initialTjmCents?: number
  initialAccountId?: string
  initialAccountName?: string
}) {
  const { t } = useTranslation('projects')
  const queryClient = useQueryClient()
  // #2558.1 — la liste est lue MEME quand le projet est fixe : c'est par elle
  // qu'on resout le COMPTE du projet, et le compte est desormais requis.
  const projects = useProjects(true)
  const [step, setStep] = useState<NeedWizardStep>(1)
  /**
   * #2942 (recette écran 27/09/2026, constat production du 28/09) — UN
   * PRÉ-REMPLISSAGE EXPLICITE GAGNE SUR LE BROUILLON REPRIS, désormais.
   *
   * Recette écran du soir du 28/09 : la carte « Besoin compilé » de Laura
   * (compte THALES) ouvrait `?create_need=1&need_account_id=…`, et le
   * formulaire affichait un vieux brouillon SANS RAPPORT (« Consultant test
   * recette L2 ») au lieu du pré-remplissage — `loadNeedWizardDraft()`
   * gagnait TOUJOURS, même quand l'appelant venait d'un lien qui
   * pré-remplit (l'ancienne garde « jamais appliqué à un brouillon REPRIS »
   * visait le cas où Laura ENRICHIT une saisie en cours, pas celui où le
   * lien nomme un compte/besoin PRÉCIS que le brouillon d'une autre session
   * n'a aucune raison de connaître).
   *
   * Le brouillon écarté n'est pour autant ni appliqué NI PERDU : tant que ce
   * pré-remplissage gouverne la session, on ne LIT ni n'ÉCRIT plus
   * `STORAGE_KEY` — ni l'auto-sauvegarde à chaque frappe (plus bas), ni
   * l'effacement à la création réussie (`submit`). Il n'existe aujourd'hui
   * aucun geste de reprise dédié à CE brouillon (contrairement au filtre de
   * `NeedsFilterDrawer`) : la seule façon de ne pas le perdre est de ne pas
   * le toucher, donc il reste tel quel en stockage, restaurable le jour où
   * ce geste existera.
   */
  const hasPrefill = Boolean(
    initialTitle ||
    initialContext ||
    initialSkills ||
    initialTjmCents != null ||
    initialAccountId ||
    initialAccountName,
  )
  const [draft, setDraft] = useState<NeedWizardDraft>(() => {
    const base = hasPrefill ? emptyNeedWizardDraft() : (loadNeedWizardDraft() ?? emptyNeedWizardDraft())
    const seeded = hasPrefill
      ? {
          ...base,
          title: initialTitle ?? base.title,
          context: initialContext ?? base.context,
          skills: initialSkills ? parseCompiledSkills(initialSkills) : base.skills,
          target_tjm_cents: initialTjmCents ?? base.target_tjm_cents,
          // #2942 (recette écran 27/09/2026) — un compte déjà RAPPROCHÉ se
          // pose exactement comme le clic d'un humain sur une ligne du
          // sélecteur (`patch({ projectId, accountId })` plus bas) : aucun
          // projet, un compte réel.
          accountId: initialAccountId ?? base.accountId,
        }
      : base
    return fixedProjectId ? { ...seeded, projectId: fixedProjectId } : seeded
  })
  const [projectQuery, setProjectQuery] = useState(() => {
    // #2942 (recette écran 27/09/2026) — le nom lu dans la source, quand
    // aucun compte n'a pu être rapproché (`initialAccountId` absent) : la
    // recherche de compte/projet de l'étape 1 s'ouvrait vide, comme si
    // Laura n'avait rien dit du client.
    if (!hasPrefill) return ''
    // #2942 (recette 29/09) — le nom voyage AUSSI avec un compte rapproché : c'est
    // lui que le sélecteur replié affiche (« QONTO — sans projet »), au lieu d'un champ vide.
    return initialAccountName ?? ''
  })
  // #2559.1 — le sélecteur est OUVERT tant qu'aucun projet n'est choisi (rien
  // à replier), et FERMÉ d'entrée quand un brouillon repris en porte déjà un.
  // Il se referme ensuite à chaque nouvelle sélection (voir `patch` ci-dessous
  // et `createProject`) — jamais de lui-même : un menu qui se replie tout
  // seul sans clic masquerait le choix qu'on vient de faire.
  const [projectPickerOpen, setProjectPickerOpen] = useState(
    () => draft.projectId.length === 0 && draft.accountId.length === 0,
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const addNeed = useAddAccountNeed()
  const createImplicitProject = useCreateImplicitProject()
  const resolveAccount = useResolveAccountForNeed()
  // #2174.11 (épopée #2939) — l'INTERLOCUTEUR, un contact DE CE COMPTE : la
  // liste ne se charge qu'une fois un compte choisi, jamais avant (rien à
  // proposer sans compte, et #2559.1 replie le sélecteur de compte dès qu'un
  // choix existe — la requête suit le même rythme).
  const accountContacts = useQuery({
    queryKey: ['contacts', 'account', draft.accountId],
    queryFn: () => contactsApi.listByAccount(draft.accountId),
    enabled: draft.accountId.length > 0,
  })
  // #2174.12 — LE PORTEUR : même liste que `ProjectOwnerControl.tsx`
  // (GA-26), jamais un second appel pour les mêmes membres.
  const { members: owners } = useProjectOwners()

  /**
   * #2174.1 — créer le projet MANQUANT, au nom du compte, et rattacher le
   * besoin en cours de saisie. Le compte est résolu d'abord (il crée
   * l'entreprise au portefeuille si elle est inconnue, #2174.14) : sans
   * compte, un projet n'existe pas.
   *
   * L'échec laisse le brouillon INTACT et le dit — refermer l'étape ferait
   * croire que le projet existe.
   */
  const createProject = (companyName: string) => {
    setProjectError(null)
    createImplicitProject
      .mutateAsync(companyName)
      .then(({ projectId, accountId }) => {
        // #2558.1 — le compte vient AVEC le projet : il est requis, et le
        // deduire plus tard d'une liste rechargee laisserait l'etape 1 bloquee.
        patch({ projectId, accountId })
        setProjectQuery('')
        // #2559.1 — même geste de fermeture qu'un clic sur une ligne de la
        // liste : le projet vient d'être choisi, le montrer suffit.
        setProjectPickerOpen(false)
      })
      .catch((error: Error) => {
        setProjectError(error.message || t('openNeeds.createNeed.createProjectFailed'))
      })
  }

  /**
   * #2558.1 — LE BESOIN SANS PROJET : on nomme le CLIENT, et c'est tout.
   *
   * La majorité des missions d'ESN ne produisent aucun signal public (retour
   * bêta François Thomas, 17/09/2026). Leur inventer un projet, c'était
   * fabriquer une affaire vide pour satisfaire une contrainte technique —
   * celle-ci est levée depuis la migration `1795711263408`.
   *
   * ⚠️ Le compte, LUI, se résout pour de bon : `POST /accounts/portfolio` (la
   * même résolution d'entité que le projet implicite, #2174.14) crée
   * l'entreprise au portefeuille si elle est inconnue et ne duplique jamais.
   * Un besoin sans compte n'aurait aucun sens et ne serait joignable par
   * personne.
   *
   * L'échec laisse le brouillon INTACT et le dit — se refermer ferait croire
   * que le client est enregistré.
   */
  const chooseAccountWithoutProject = (companyName: string) => {
    setProjectError(null)
    resolveAccount
      .mutateAsync(companyName)
      .then(accountId => {
        patch({ accountId, projectId: '' })
        // Golden journey 11 (#2208.42) — le NOM reste dans `projectQuery` : c'est lui que
        // le sélecteur replié affiche (« Nova Conseil — sans projet »). Le vider ici
        // faisait lire « Projet sélectionné — sans projet », le client disparu.
        setProjectQuery(companyName.trim())
        setProjectPickerOpen(false)
      })
      .catch((error: Error) => {
        setProjectError(error.message || t('openNeeds.createNeed.withoutProjectFailed'))
      })
  }

  // LE BROUILLON PERSISTANT — écrit à CHAQUE changement. « On quitte, on
  // revient, on retrouve » : rien à faire de plus pour ça, la lecture initiale
  // (`useState(() => loadNeedWizardDraft())`) fait le reste.
  //
  // ⚠️ #2942 (constat production du 28/09) — JAMAIS quand un pré-remplissage
  // gouverne cette session : ce brouillon-là n'est pas celui qu'on vient
  // d'écarter, l'écrire ÉCRASERAIT le brouillon d'une autre session au
  // premier caractère tapé, ce que la décision « ni appliqué ni perdu »
  // refuse explicitement.
  useEffect(() => {
    if (hasPrefill) return
    saveNeedWizardDraft(draft)
  }, [draft, hasPrefill])

  const patch = (partial: Partial<NeedWizardDraft>) => setDraft(current => ({ ...current, ...partial }))

  const rows = projects.data ?? []
  // #4469 — le sélecteur ne liste que de vrais projets ; `rows` complet reste lu pour résoudre le compte d'un projet déjà choisi.
  const attachableRows = useMemo(() => rows.filter(isAttachableProject), [rows])

  /**
   * #2558.1 — LE COMPTE D'UN PROJET DÉJÀ CHOISI.
   *
   * Deux cas où le brouillon porte un projet sans porter son compte : la porte
   * n°2 qui fixe le projet, et un brouillon repris d'avant ce lot (il n'avait
   * pas de champ `accountId`). Dans les deux, l'étape 1 resterait bloquée sur
   * un choix que l'appelant a pourtant déjà fait — donc on le complète dès que
   * la liste répond, et jamais en devinant : si le projet n'est pas dans la
   * liste de l'espace, rien n'est posé.
   */
  useEffect(() => {
    if (draft.accountId.length > 0 || draft.projectId.length === 0) return
    const parent = rows.find(project => project.id === draft.projectId)
    // ⚠️ `?? ''` et jamais `undefined` : une ligne de projet sans compte
    //    laisserait l'étape 1 sur une valeur qui n'est pas une chaîne, et le
    //    blocage doit rester un blocage lisible, pas une exception.
    if (parent?.account_id) patch({ accountId: parent.account_id })
  }, [rows, draft.projectId, draft.accountId])
  const filteredProjects = useMemo(() => {
    if (fixedProjectId) return rows
    const q = projectQuery.trim().toLowerCase()
    if (!q) return attachableRows
    return attachableRows.filter(
      project => project.label.toLowerCase().includes(q) || (project.company_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, attachableRows, projectQuery, fixedProjectId])

  // #2939 (#2174.35) — LE LIBELLÉ DU CLIENT pour la reformulation de l'étape
  // 5. `null` = aucun projet connu de ce compte n'a encore été chargé — la
  // reformulation dit alors seulement le titre, jamais un nom deviné.
  const selectedAccountLabel = rows.find(project => project.account_id === draft.accountId)?.company_name ?? null

  const canLeaveStep = needWizardStepValid(step, draft)

  const back = () => {
    if (addNeed.isPending) return
    onOpenChange(false)
  }

  const submit = () => {
    setFormError(null)
    addNeed
      .mutateAsync({ ...needWizardDraftToAccountNeedInput(draft), ...(provenance ? { provenance } : {}) })
      .then(need => {
        // #2942 (constat production du 28/09) — même garde que l'auto-
        // sauvegarde plus haut : un pré-remplissage n'a jamais lu NI écrit
        // `STORAGE_KEY`, l'effacer ici supprimerait le brouillon d'une AUTRE
        // session, jamais celui qu'on vient de créer.
        if (!hasPrefill) clearNeedWizardDraft()
        void queryClient.invalidateQueries({ queryKey: openNeedsKeys.all })
        onCreated(need)
      })
      .catch((error: Error) => {
        // Le formulaire reste OUVERT sur l'échec — le fermer laisserait croire
        // que le besoin a été créé, et le brouillon PERSISTE : rien à retaper.
        setFormError(error.message || t('openNeeds.createNeed.failed'))
      })
  }

  return (
    <Box className="space-y-4">
      <NeedWizardSteps current={step} />

      {step === 1 && (
        <StepType
          draft={draft}
          patch={patch}
          replaceDraft={setDraft}
          rows={filteredProjects}
          allRows={attachableRows}
          fixedProjectId={fixedProjectId}
          loading={projects.isLoading}
          projectQuery={projectQuery}
          setProjectQuery={setProjectQuery}
          onCreateProject={createProject}
          onChooseWithoutProject={chooseAccountWithoutProject}
          resolvingAccount={resolveAccount.isPending}
          creatingProject={createImplicitProject.isPending}
          createProjectError={projectError}
          pickerOpen={projectPickerOpen}
          setPickerOpen={setProjectPickerOpen}
          contacts={accountContacts.data ?? []}
          owners={owners}
        />
      )}
      {step === 2 && <StepKeyInfo draft={draft} patch={patch} />}
      {step === 3 && <StepDecision draft={draft} patch={patch} contacts={accountContacts.data ?? []} />}
      {step === 4 && <StepMatching draft={draft} />}
      {step === 5 && <StepConfirmation draft={draft} formError={formError} accountLabel={selectedAccountLabel} />}

      {/* LE PIED — le retour nommé à gauche, l'étape suivante à droite, comme
          la maquette. Le retour était en TÊTE jusqu'au 31/08/2026 ; il descend
          ici parce que c'est là qu'on le cherche une fois la page lue, et
          parce que la pleine page porte déjà sa flèche de retour dans son
          entête. Même geste, deux formes — pas deux fois la même. */}
      <Box
        display="flex"
        className="flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-3"
      >
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={back} disabled={addNeed.isPending}>
            <ArrowLeft className="size-4" aria-hidden />
            {backLabel ?? t('needWizard.backToNeeds')}
          </Button>
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={addNeed.isPending}
              onClick={() => setStep(current => (current > 1 ? ((current - 1) as NeedWizardStep) : current))}
            >
              {t('needWizard.previous')}
            </Button>
          ) : null}
        </Box>
        {step < MAX_STEP ? (
          <Button
            size="sm"
            variant="black"
            disabled={!canLeaveStep}
            onClick={() => setStep(current => (current < MAX_STEP ? ((current + 1) as NeedWizardStep) : current))}
            className="pointer-coarse:min-h-11"
          >
            {t('needWizard.next')}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="black"
            disabled={!canLeaveStep || addNeed.isPending}
            isLoading={addNeed.isPending}
            onClick={submit}
            className="pointer-coarse:min-h-11"
          >
            {submitLabel ?? t('needWizard.submit')}
          </Button>
        )}
      </Box>
    </Box>
  )
}

/**
 * #2939 (#2174.3/.5/.6) — LES TROIS MODES D'ENTRÉE DE L'ÉTAPE 1, en plus de la
 * saisie manuelle : coller un brief, coller un e-mail, dupliquer un besoin
 * existant.
 *
 * ⚠️ Un mode qui compile REMPLACE le brouillon (`replaceDraft`), jamais une
 * fusion : à ce stade rien n'a encore été tapé à la main (l'assistant vient de
 * s'ouvrir), donc écraser ne perd rien — et fusionner silencieusement des
 * champs venus de deux sources rendrait impossible de dire d'où vient chaque
 * valeur.
 */
function StepTypeEntryModes({
  draft,
  replaceDraft,
}: {
  draft: NeedWizardDraft
  replaceDraft: (draft: NeedWizardDraft) => void
}) {
  const { t } = useTranslation('projects')
  const [mode, setMode] = useState<'manual' | 'paste_brief' | 'paste_email' | 'from_document' | 'duplicate'>('manual')
  // #2560 — la lecture d'un contrat / d'une fiche de poste : une PROPOSITION à prévisualiser.
  const [documentExtraction, setDocumentExtraction] = useState<MissionExtraction | null>(null)
  const [documentReading, setDocumentReading] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [duplicateQuery, setDuplicateQuery] = useState('')

  const duplicateResults = useQuery({
    queryKey: ['open-needs', 'duplicate-search', duplicateQuery],
    queryFn: () => openNeedsApi.list({ q: duplicateQuery, limit: 8, offset: 0 }),
    enabled: mode === 'duplicate' && duplicateQuery.trim().length > 1,
  })

  const readDocument = async (file: File) => {
    setDocumentError(null)
    setDocumentExtraction(null)
    setDocumentReading(true)
    try {
      const result = await extractMission({ fileBase64: await fileToBase64(file), fileName: file.name })
      if (result.status !== 'ok') setDocumentError(t('needWizard.entryModes.documentFailed'))
      else setDocumentExtraction(result)
    } catch {
      setDocumentError(t('needWizard.entryModes.documentFailed'))
    } finally {
      setDocumentReading(false)
    }
  }

  const runCompile = () => {
    if (!pastedText.trim()) return
    setCompileError(null)
    setCompiling(true)
    needCompileTextApi
      .compile(pastedText.trim(), mode === 'paste_email' ? 'email' : 'free_brief')
      .then(result => {
        if (result.status !== 'ok') {
          setCompileError(result.error)
          return
        }
        replaceDraft(applyCompiledNeedToDraft(draft, result.compiled))
      })
      .catch((error: Error) => setCompileError(error.message || t('needWizard.entryModes.compileFailed')))
      .finally(() => setCompiling(false))
  }

  return (
    <Box className="space-y-2">
      <Box display="flex" className="flex-wrap gap-1.5" role="radiogroup" aria-label={t('needWizard.entryModes.label')}>
        {(['manual', 'paste_brief', 'paste_email', 'from_document', 'duplicate'] as const).map(entry => (
          <Button
            key={entry}
            type="button"
            size="sm"
            variant={mode === entry ? 'black' : 'outline'}
            aria-pressed={mode === entry}
            onClick={() => setMode(entry)}
          >
            {entry === 'paste_brief' || entry === 'from_document' ? (
              <FileUp className="size-4" aria-hidden />
            ) : entry === 'paste_email' ? (
              <Mail className="size-4" aria-hidden />
            ) : entry === 'duplicate' ? (
              <Copy className="size-4" aria-hidden />
            ) : null}
            {t(`needWizard.entryModes.${entry}`)}
          </Button>
        ))}
      </Box>

      {(mode === 'paste_brief' || mode === 'paste_email') && (
        <Box className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-3">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t(`needWizard.entryModes.${mode}Hint`)}
          </Text>
          <Textarea
            value={pastedText}
            onChange={event => setPastedText(event.target.value)}
            placeholder={t('needWizard.entryModes.pastePlaceholder')}
            rows={5}
          />
          <Button type="button" size="sm" variant="outline" disabled={compiling} onClick={runCompile}>
            {compiling ? t('needWizard.entryModes.compiling') : t('needWizard.entryModes.compile')}
          </Button>
          {compileError ? (
            <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
              {compileError}
            </Text>
          ) : null}
        </Box>
      )}

      {mode === 'from_document' && (
        <Box className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-3">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('needWizard.entryModes.from_documentHint')}
          </Text>
          <Input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            aria-label={t('needWizard.entryModes.from_document')}
            disabled={documentReading}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void readDocument(file)
            }}
          />
          {documentReading ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('needWizard.entryModes.documentReading')}
            </Text>
          ) : null}
          {documentError ? (
            <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
              {documentError}
            </Text>
          ) : null}
          {documentExtraction ? (
            <Box className="space-y-1.5" data-testid="document-extraction-preview">
              <Text size="xs" weight="medium">
                {t('needWizard.entryModes.documentPreviewTitle')}
              </Text>
              {(
                [
                  ['documentFieldRole', documentExtraction.fields.roleTitle.value],
                  ['documentFieldAccount', documentExtraction.fields.accountName.value],
                  ['documentFieldStart', documentExtraction.fields.startedOn.value],
                  ['documentFieldEnd', documentExtraction.fields.endsOn.value],
                  ['documentFieldRate', documentExtraction.fields.dailyRate.value],
                ] as const
              )
                // Un champ que le document ne dit pas ne fait AUCUNE ligne : on n'affiche pas ce qu'on n'a pas.
                .filter(([, value]) => value !== null)
                .map(([key, value]) => (
                  <Text key={key} size="xs">
                    {t(`needWizard.entryModes.${key}`)} : {String(value)}
                  </Text>
                ))}
              {documentExtraction.fields.accountName.value ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('needWizard.entryModes.documentAccountHint')}
                </Text>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  replaceDraft(applyMissionExtractionToDraft(draft, documentExtraction))
                  setDocumentExtraction(null)
                }}
              >
                {t('needWizard.entryModes.documentApply')}
              </Button>
            </Box>
          ) : null}
        </Box>
      )}

      {mode === 'duplicate' && (
        <Box className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-3">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('needWizard.entryModes.duplicateHint')}
          </Text>
          <Input
            value={duplicateQuery}
            onChange={event => setDuplicateQuery(event.target.value)}
            placeholder={t('needWizard.entryModes.duplicateSearchPlaceholder')}
          />
          <div
            role="listbox"
            aria-label={t('needWizard.entryModes.duplicate')}
            className="max-h-40 overflow-y-auto rounded-md border border-[var(--bellum-border)]"
          >
            {duplicateResults.isLoading ? (
              <Text size="xs" className="p-3 text-[var(--bellum-text-muted)]">
                {t('needWizard.entryModes.duplicateSearching')}
              </Text>
            ) : (duplicateResults.data?.data.length ?? 0) === 0 ? (
              <Text size="xs" className="p-3 text-[var(--bellum-text-muted)]">
                {t('needWizard.entryModes.duplicateNoResult')}
              </Text>
            ) : (
              duplicateResults.data?.data.map(need => (
                <button
                  key={need.id}
                  type="button"
                  role="option"
                  onClick={() => replaceDraft(duplicateNeedIntoDraft(need))}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm pointer-coarse:min-h-11 text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
                >
                  <span className="truncate">
                    {need.account_name ? `${need.account_name} — ${need.title}` : need.title}
                  </span>
                </button>
              ))
            )}
          </div>
        </Box>
      )}
    </Box>
  )
}

/**
 * #2939 (#2174.10) — L'ENTITÉ CLIENTE, filiale ou BU du compte — distincte du
 * compte lui-même (déjà choisi juste au-dessus). `entity_id` vit sur le
 * PROJET (`opportunities.entity_id`, lu par `open-needs.service.ts` depuis
 * toujours, jamais écrit avant ce lot — voir `ProjectPipelineService.
 * setProjectEntity`) : le geste écrit donc IMMÉDIATEMENT sur le projet, pas
 * sur le brouillon du besoin, qui n'a pas de colonne où le porter.
 */
function StepTypeEntityPicker({ projectId, accountId }: { projectId: string; accountId: string }) {
  const { t } = useTranslation('projects')
  const entities = useAccountEntities(accountId || null)
  const [entityId, setEntityId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setEntity = useMutation({
    mutationFn: (value: string) => projectsApi.setEntity(projectId, value || null),
    onError: (err: Error) => setError(err.message || t('needWizard.entityFailed')),
  })
  const items = entities.data?.items ?? []
  if (items.length === 0) return null

  return (
    <Box className="space-y-1.5">
      <Label htmlFor="need-wizard-entity">{t('needWizard.entityLabel')}</Label>
      <Select
        value={entityId || undefined}
        onValueChange={value => {
          setError(null)
          setEntityId(value)
          setEntity.mutate(value)
        }}
      >
        <SelectTrigger id="need-wizard-entity" aria-label={t('needWizard.entityLabel')}>
          <SelectValue placeholder={t('needWizard.entityPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {items.map(entity => (
            <SelectItem key={entity.id} value={entity.id}>
              {entity.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      ) : null}
    </Box>
  )
}

/** ÉTAPE 1 — Type : le titre, le projet, l'origine et le canal. */
function StepType({
  draft,
  patch,
  replaceDraft,
  rows,
  allRows,
  fixedProjectId,
  loading,
  projectQuery,
  setProjectQuery,
  onCreateProject,
  onChooseWithoutProject,
  resolvingAccount,
  creatingProject,
  createProjectError,
  pickerOpen,
  setPickerOpen,
  contacts,
  owners,
}: {
  draft: NeedWizardDraft
  patch: (partial: Partial<NeedWizardDraft>) => void
  /** #2939 (#2174.3/.5/.6) — REMPLACE le brouillon entier : coller un texte
   *  compilé ou dupliquer un besoin existant remplit CHAQUE champ, jamais un
   *  seul (`patch`, lui, reste réservé aux gestes qui touchent un champ à la
   *  fois — le titre, le compte…). */
  replaceDraft: (draft: NeedWizardDraft) => void
  rows: ReturnType<typeof useProjects>['data']
  allRows: ReturnType<typeof useProjects>['data']
  fixedProjectId: string | undefined
  loading: boolean
  projectQuery: string
  setProjectQuery: (value: string) => void
  onCreateProject: (companyName: string) => void
  /** #2558.1 — nommer le CLIENT sans créer de projet. */
  onChooseWithoutProject: (companyName: string) => void
  resolvingAccount: boolean
  creatingProject: boolean
  createProjectError: string | null
  /** #2559.1 — replié dès qu'un projet est choisi ; voir `NeedWizard`. */
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
  /** #2174.11 — les contacts DE CE COMPTE, vide tant qu'aucun compte n'est choisi. */
  contacts: Contact[]
  /** #2174.12 — les membres de l'espace, à qui attribuer le besoin. */
  owners: Array<{ id: string; name: string }>
}) {
  const { t } = useTranslation('projects')
  const list = rows ?? []
  const all = allRows ?? []
  const selectedProject = all.find(project => project.id === draft.projectId)
  // #4016.L4 — le porteur du projet, PROPOSÉ (badgé « suggéré »), jamais posé sans clic (c42).
  const ownerSuggestion = needOwnerSuggestion({
    projectOwnerId: selectedProject?.owner_id,
    owners,
    currentOwnerId: draft.ownerId,
  })
  /**
   * #2558.1 — CE QUE L'ÉTAT REPLIÉ AFFICHE, et ce qu'il n'affiche jamais.
   *
   * Trois cas, trois phrases distinctes — aucune n'emprunte la formulation
   * d'une autre :
   *
   *  · un projet choisi : le client et l'affaire ;
   *  · un CLIENT choisi SANS projet : « sans projet », dit en toutes lettres.
   *    ⚠️ Jamais un tiret, jamais une étiquette vide : une valeur absente ne
   *    s'affiche pas comme une valeur (GA-18 / GA-19), et « — » se lirait
   *    « une affaire dont on ignore le nom » ;
   *  · rien de choisi : le repli d'avant ce lot.
   */
  const selectedProjectLabel = selectedProject
    ? projectChoice(selectedProject).title
    : draft.accountId.length > 0
      ? t('openNeeds.createNeed.withoutProjectChosen', {
          name: projectQuery.trim() || t('openNeeds.createNeed.projectChosenFallback'),
        })
      : projectQuery.trim() || t('openNeeds.createNeed.projectChosenFallback')

  return (
    <Box className="space-y-4">
      <StepTypeEntryModes draft={draft} replaceDraft={replaceDraft} />
      <Box className="space-y-1.5">
        <Label htmlFor="need-wizard-title">{t('openNeeds.createNeed.titleLabel')}</Label>
        <Input
          id="need-wizard-title"
          value={draft.title}
          onChange={event => patch({ title: event.target.value })}
          placeholder={t('openNeeds.createNeed.titlePlaceholder')}
          maxLength={200}
          autoFocus
        />
      </Box>

      {!fixedProjectId && (
        <Box className="space-y-1.5">
          <Label htmlFor="need-wizard-project-search">{t('openNeeds.createNeed.projectLabel')}</Label>
          {/* #2557.2 — le mot « projet » s'explique ICI, à l'endroit où il est
              demandé : retour bêta du 17/09/2026 (François Thomas), qui n'a
              pas compris ce qu'un « projet » recouvrait pendant la démo. */}
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('openNeeds.createNeed.projectHint')}
          </Text>
          {pickerOpen ? (
            <>
              <Input
                id="need-wizard-project-search"
                value={projectQuery}
                onChange={event => setProjectQuery(event.target.value)}
                placeholder={t('openNeeds.createNeed.projectSearchPlaceholder')}
              />
              <div
                role="listbox"
                aria-label={t('openNeeds.createNeed.projectLabel')}
                className="max-h-40 overflow-y-auto rounded-md border border-[var(--bellum-border)]"
              >
                {loading ? (
                  <Text size="xs" className="p-3 text-[var(--bellum-text-muted)]">
                    {t('openNeeds.createNeed.projectsLoading')}
                  </Text>
                ) : all.length === 0 ? (
                  <Text size="xs" className="p-3 text-[var(--bellum-text-muted)]">
                    {t('openNeeds.createNeed.noProjectAtAll')}
                  </Text>
                ) : list.length === 0 ? (
                  <Text size="xs" className="p-3 text-[var(--bellum-text-muted)]">
                    {t('openNeeds.createNeed.noProject')}
                  </Text>
                ) : (
                  list.map(project => {
                    const selected = draft.projectId === project.id
                    return (
                      <button
                        key={project.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          // #2558.1 — le projet POSE son compte : c'est le
                          // compte qui rattache le besoin désormais, le projet
                          // n'est plus qu'une précision utile.
                          patch({ projectId: project.id, accountId: project.account_id ?? '' })
                          // #2559.1 — le sélecteur SE REFERME sur le choix, et
                          // la valeur choisie s'affiche : un menu resté
                          // ouvert après un clic laisse croire que rien ne
                          // s'est passé (issue #2559, François Thomas,
                          // 17/09/2026).
                          setPickerOpen(false)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm pointer-coarse:min-h-11 ${
                          selected
                            ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]'
                            : 'text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]'
                        }`}
                      >
                        {/* #3709 — le libellé COURT seul ; la description complète
                            reste à l'infobulle, jamais recopiée sous chaque ligne. */}
                        <span className="min-w-0" title={projectChoice(project).description ?? undefined}>
                          <span className="block truncate">{projectChoice(project).title}</span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
              {/* #2174.1 — LE PROJET IMPLICITE (arbitrage de Louis, 16/09/2026).
                  L'assistant EXIGEAIT un projet existant : un commercial qui
                  raccroche avec un compte jamais analysé n'avait aucun chemin. Le
                  besoin orphelin a été refusé (un `project_id: null` voyagerait
                  dans toutes les lectures qui remontent vers le projet), donc le
                  projet se crée ICI, au nom du compte — et il accueillera le
                  deuxième besoin du même compte. */}
              {/* #2558.2 — UN seul caractère suffit, pas deux. Mesuré à
                  l'écran le 18/09/2026 : sur un espace sans AUCUN projet, la
                  phrase « Crée-en un juste en dessous » n'était tenue qu'après
                  deux caractères tapés — invisible au premier coup d'œil,
                  donc une porte qui n'en était pas une. */}
              {/* #2557.1 / #2558.3 — « Créer un projet » est TOUJOURS dans le sélecteur,
                  pas seulement quand la recherche ne trouve rien : le geste existait,
                  mais caché derrière un champ vide de réponse. Sans texte tapé, il
                  ramène au champ ; avec un texte qui trouve déjà des projets, il crée
                  quand même au nom saisi. Le cas « aucun résultat » garde son bloc
                  complet juste en dessous (avec « sans projet »). */}
              {!loading && !(projectQuery.trim().length > 0 && list.length === 0) ? (
                <Box className="space-y-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={creatingProject}
                    onClick={() => {
                      if (projectQuery.trim().length > 0) onCreateProject(projectQuery.trim())
                      else document.getElementById('need-wizard-project-search')?.focus()
                    }}
                  >
                    {projectQuery.trim().length > 0
                      ? t('openNeeds.createNeed.createProjectFor', { name: projectQuery.trim() })
                      : t('openNeeds.createNeed.createProjectGeneric')}
                  </Button>
                  {projectQuery.trim().length === 0 ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('openNeeds.createNeed.createProjectGenericHint')}
                    </Text>
                  ) : null}
                </Box>
              ) : null}
              {!loading && projectQuery.trim().length > 0 && list.length === 0 ? (
                <Box className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={creatingProject}
                    onClick={() => onCreateProject(projectQuery.trim())}
                  >
                    {creatingProject
                      ? t('openNeeds.createNeed.creatingProject')
                      : t('openNeeds.createNeed.createProjectFor', { name: projectQuery.trim() })}
                  </Button>
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('openNeeds.createNeed.createProjectHint')}
                  </Text>
                  {/* #2558.1 — LE SECOND CHEMIN, et il est aussi légitime que
                      le premier : « ce client cherche quelqu'un », sans
                      affaire à ouvrir. La majorité des missions d'ESN ne
                      produisent aucun signal public (retour bêta du
                      17/09/2026) ; leur inventer un projet fabriquait de la
                      donnée vide. Les deux boutons sont côte à côte parce que
                      c'est bien un CHOIX, pas un repli. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resolvingAccount}
                    onClick={() => onChooseWithoutProject(projectQuery.trim())}
                  >
                    {resolvingAccount
                      ? t('openNeeds.createNeed.choosingWithoutProject')
                      : t('openNeeds.createNeed.withoutProjectFor', { name: projectQuery.trim() })}
                  </Button>
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('openNeeds.createNeed.withoutProjectHint')}
                  </Text>
                  {createProjectError ? (
                    <Text size="xs" className="text-[var(--danger-soft-text)]">
                      {createProjectError}
                    </Text>
                  ) : null}
                </Box>
              ) : null}
            </>
          ) : (
            // #2559.1 — REPLIÉ : la valeur choisie s'affiche, et rouvre le
            // sélecteur pour la changer. `<button>` et non un `<div onClick>` :
            // ce qui se clique se tabule (GA-35).
            // ⚠️ PAS le même `id` que l'`<Input>` de l'état ouvert : un
            // `<label for>` nomme aussi un `<button>` labellable, et aurait
            // effacé la valeur choisie de son nom accessible. `aria-label`
            // porte le champ ET la valeur, dans cet ordre.
            <button
              type="button"
              aria-label={`${t('openNeeds.createNeed.projectLabel')} : ${selectedProjectLabel}`}
              onClick={() => {
                setProjectQuery('')
                setPickerOpen(true)
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] px-3 py-2 text-left text-sm pointer-coarse:min-h-11 hover:bg-[var(--bellum-surface-2)]"
            >
              <span className="truncate text-[var(--bellum-text-primary)]">{selectedProjectLabel}</span>
              <Text size="xs" noWrap color="text-[var(--bellum-text-accent)]">
                {t('openNeeds.createNeed.changeProject')}
              </Text>
            </button>
          )}
        </Box>
      )}

      {/* #2174.11/.12 (épopée #2939) — L'INTERLOCUTEUR et LE PORTEUR, à
          l'étape 1 désormais : les deux colonnes existaient en base et sur le
          contrat depuis toujours, LUES partout (liste transverse, fiche du
          besoin), jamais SAISISSABLES à la création — assignées après coup,
          ou jamais. `contactId` n'apparaît qu'une fois un compte choisi : rien
          à proposer avant, et un contact d'un AUTRE compte serait la mauvaise
          personne sur le dossier (vérifié côté serveur). */}
      {draft.accountId.length > 0 && (
        <Box className="space-y-1.5">
          <Label htmlFor="need-wizard-contact">{t('openNeeds.createNeed.contactLabel')}</Label>
          <Select value={draft.contactId || undefined} onValueChange={value => patch({ contactId: value })}>
            <SelectTrigger id="need-wizard-contact" aria-label={t('openNeeds.createNeed.contactLabel')}>
              <SelectValue placeholder={t('openNeeds.createNeed.contactPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {contacts.map(contact => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.title ? `${contact.full_name} — ${contact.title}` : contact.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>
      )}
      <Box className="space-y-1.5">
        <Label htmlFor="need-wizard-owner">{t('openNeeds.createNeed.ownerLabel')}</Label>
        <Select value={draft.ownerId || undefined} onValueChange={value => patch({ ownerId: value })}>
          <SelectTrigger id="need-wizard-owner" aria-label={t('openNeeds.createNeed.ownerLabel')}>
            <SelectValue placeholder={t('openNeeds.createNeed.ownerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {owners.map(owner => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ownerSuggestion ? (
          <NeedOwnerSuggestion owner={ownerSuggestion} onApply={ownerId => patch({ ownerId })} />
        ) : null}
      </Box>

      {/* #2939 (#2174.10) — L'ENTITÉ CLIENTE (filiale, BU) : n'apparaît
          qu'une fois un PROJET connu (`entity_id` vit sur `opportunities`,
          jamais sur le besoin) — rien à proposer avant, et un projet fraîchement
          créé n'a jamais encore d'entité. */}
      {draft.projectId.length > 0 && <StepTypeEntityPicker projectId={draft.projectId} accountId={draft.accountId} />}

      {/* LES SEPT CARTES — deux champs derrière, jamais une liste unique. La
          table et sa raison vivent dans `model/need-wizard.ts`. */}
      <Box className="space-y-2">
        <Text size="base" weight="semibold" element="h3">
          {t('needWizard.typeCards.title')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.typeCards.hint')}
        </Text>
        <Box display="grid" className="grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {MISSION_TYPE_CARDS.map(card => {
            const title = t(`needWizard.typeCards.${card.key}.title`)
            const subtitle = t(`needWizard.typeCards.${card.key}.subtitle`)
            // « Sourcing interne » OUVRE le vivier au lieu d'écrire : c'est un
            // lien, donc une balise `<a>`, pas un bouton déguisé — le clic
            // milieu, « ouvrir dans un onglet » et le survol qui montre
            // l'adresse en dépendent.
            if (card.to) {
              return (
                <Link
                  key={card.key}
                  to={card.to}
                  className="flex min-h-[5.5rem] flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-3 text-left hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
                >
                  <Text size="sm" weight="medium" className="block">
                    {title}
                  </Text>
                  <Text size="xs" className="block" color="text-[var(--bellum-text-secondary)]">
                    {subtitle}
                  </Text>
                  <Text size="xs" className="block" color="text-[var(--bellum-text-muted)]">
                    {t('needWizard.typeCards.opensPool')}
                  </Text>
                </Link>
              )
            }
            const selected = missionTypeCardSelected(card, draft)
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={selected}
                onClick={() => patch(missionTypeCardPatch(card, draft))}
                className={`flex min-h-[5.5rem] flex-col gap-1 rounded-md border p-3 text-left pointer-coarse:min-h-11 ${
                  selected
                    ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)]'
                    : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]'
                }`}
              >
                <Box display="flex" className="items-start justify-between gap-2">
                  <Text size="sm" weight="medium" className="block">
                    {title}
                  </Text>
                  {/* ⚠️ La coche n'est pas le SEUL signal : la bordure change
                      aussi, et `aria-pressed` le dit à qui n'a pas d'écran.
                      Une couleur seule ne porte jamais un état. */}
                  {selected ? (
                    <Check
                      role="img"
                      className="size-4 shrink-0 text-[var(--bellum-text-accent)]"
                      aria-label={t('needWizard.typeCards.selected')}
                    />
                  ) : null}
                </Box>
                <Text size="xs" className="block" color="text-[var(--bellum-text-secondary)]">
                  {subtitle}
                </Text>
              </button>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

/** ÉTAPE 2 — Informations clés : ce que le contrat serveur accepte déjà, plus
 *  le dépôt de fiche de poste et les certifications obligatoires. */
function StepKeyInfo({ draft, patch }: { draft: NeedWizardDraft; patch: (partial: Partial<NeedWizardDraft>) => void }) {
  const { t } = useTranslation('projects')
  const [skillsText, setSkillsText] = useState(() => draft.skills.map(skill => skill.term).join(', '))
  const [certificationsText, setCertificationsText] = useState(() => draft.required_certifications.join(', '))
  const [tjmInput, setTjmInput] = useState(() =>
    draft.target_tjm_cents === null ? '' : String(Math.round(draft.target_tjm_cents / 100)),
  )
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{ text: string; section: string | null }[]>([])

  const commitSkills = (value: string) => {
    setSkillsText(value)
    patch({
      skills: value
        .split(',')
        .map(term => term.trim())
        .filter(Boolean)
        .map(term => ({ term, required: true, level: null })),
    })
  }

  const commitCertifications = (value: string) => {
    setCertificationsText(value)
    patch({
      required_certifications: value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean),
    })
  }

  const handleFile = async (file: File) => {
    setFileError(null)
    setExtractError(null)
    if (file.size > MAX_JOB_POSTING_FILE_BYTES) {
      setFileError(t('needWizard.upload.tooLarge', { max: MAX_JOB_POSTING_FILE_MB }))
      return
    }
    setFileName(file.name)
    setExtracting(true)
    try {
      const base64 = await fileToBase64(file)
      const detail = await rfpApi.create({
        title: draft.title.trim() || t('needWizard.upload.fallbackTitle'),
        fileBase64: base64,
        fileName: file.name,
      })
      // Seules les exigences TECHNIQUES deviennent des suggestions de
      // compétences — les autres catégories (juridique, financier…) ne sont
      // pas des compétences de poste.
      setSuggestions(
        detail.rfp.requirements
          .filter(requirement => requirement.kind === 'technical')
          .slice(0, 12)
          .map(requirement => ({ text: requirement.text, section: requirement.section })),
      )
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : t('needWizard.upload.failed'))
    } finally {
      setExtracting(false)
    }
  }

  const applySuggestion = (suggestion: { text: string; section: string | null }) => {
    const term = suggestion.text.slice(0, 80).trim()
    if (!term) return
    if (draft.skills.some(skill => skill.term === term)) return
    const nextSkills = [...draft.skills, { term, required: true, level: null }]
    patch({ skills: nextSkills })
    setSkillsText(nextSkills.map(skill => skill.term).join(', '))
    setSuggestions(current => current.filter(entry => entry !== suggestion))
  }

  return (
    <Box className="space-y-4">
      <Box className="space-y-1">
        <Text size="base" weight="semibold" element="h3">
          {t('needWizard.keyInfoTitle')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.keyInfoHint')}
        </Text>
      </Box>

      {/* Deux colonnes à partir de `lg`, comme la maquette : le dépôt de fiche
          à gauche, ce qui sert au rapprochement à droite. En dessous, elles
          s'empilent — le dépôt d'abord, parce que ce qu'il extrait remplit la
          colonne de droite. */}
      <Box display="grid" className="grid-cols-1 gap-4 lg:grid-cols-2">
        <Box className="space-y-1.5">
          <Label>{t('needWizard.upload.label')}</Label>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-[var(--bellum-border)] p-4 text-center"
          >
            <FileUp className="size-5 text-[var(--bellum-text-accent)]" aria-hidden />
            <Text size="sm">{fileName ?? t('needWizard.upload.placeholder')}</Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('needWizard.upload.hint', { max: MAX_JOB_POSTING_FILE_MB })}
            </Text>
          </button>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ''
            }}
          />
          {fileError ? (
            <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
              {fileError}
            </Text>
          ) : null}
          {extracting ? (
            <Box display="flex" className="items-center gap-1">
              <Loader2 className="size-3.5 animate-spin text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('needWizard.upload.extracting')}
              </Text>
            </Box>
          ) : null}
          {extractError ? (
            <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
              {extractError}
            </Text>
          ) : null}
          {/* CHAQUE champ extrait porte sa CITATION — la section du document où
            `rfp.py` l'a trouvé. Jamais accepté seul : un clic l'ajoute. */}
          {suggestions.length > 0 ? (
            <Box className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-2">
              <Text size="xs" weight="medium">
                {t('needWizard.upload.suggestionsTitle')}
              </Text>
              {suggestions.map(suggestion => (
                <Box
                  key={suggestion.text}
                  display="flex"
                  className="items-center justify-between gap-2 rounded border border-[var(--bellum-border)] p-1.5"
                >
                  <Box className="min-w-0">
                    <Text size="xs" className="block truncate">
                      {suggestion.text}
                    </Text>
                    <Text size="xs" className="block truncate text-[var(--bellum-text-muted)]">
                      {t('needWizard.upload.citation', {
                        section: suggestion.section ?? t('needWizard.upload.document'),
                      })}
                    </Text>
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => applySuggestion(suggestion)}>
                    {t('needWizard.upload.apply')}
                  </Button>
                </Box>
              ))}
            </Box>
          ) : null}

          {/* L'ENCART D'EXTRACTION — ce qui est VRAI de ce dépôt.
            ⚠️ La maquette met ici un badge « +35 % de précision ». Personne
            n'a mesuré ce nombre, et la garde i18n `no-overpromise` refuse une
            promesse chiffrée sans mesure. Ce qui le remplace est le vrai
            avantage, déjà construit : chaque champ extrait porte la CITATION
            du passage d'où il vient, et rien ne s'ajoute sans un clic. */}
          <Box
            display="flex"
            className="items-start gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
            <Box className="min-w-0">
              <Text size="sm" weight="medium" className="block">
                {t('needWizard.extraction.title')}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('needWizard.extraction.body')}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* La colonne DROITE — ce qui sert au rapprochement. */}
        <Box className="space-y-3">
          <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-tjm">{t('needWizard.tjmLabel')}</Label>
              <Box display="flex" className="items-center gap-2">
                <Input
                  id="need-wizard-tjm"
                  inputMode="numeric"
                  value={tjmInput}
                  onChange={event => {
                    const raw = event.target.value.replace(/[^\d]/g, '')
                    setTjmInput(raw)
                    patch({ target_tjm_cents: raw ? Number(raw) * 100 : null })
                  }}
                  placeholder={t('needWizard.tjmPlaceholder')}
                />
                {/* ⚠️ La maquette met un SÉLECTEUR de devise ici. Le besoin n'a
                pas de colonne `currency` (`createProjectNeedSchema`), et un
                sélecteur qui n'écrit nulle part est le défaut n°1 du dépôt :
                du code juste que personne n'appelle. L'unité est donc DITE,
                pas choisie — c'est celle de tout le produit. */}
                <Text size="sm" noWrap color="text-[var(--bellum-text-muted)]">
                  {t('needWizard.tjmCurrency')}
                </Text>
              </Box>
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-location">{t('needWizard.locationLabel')}</Label>
              <Input
                id="need-wizard-location"
                value={draft.location}
                onChange={event => patch({ location: event.target.value })}
                placeholder={t('needWizard.locationPlaceholder')}
              />
            </Box>
            {/* #2173.29 — LE TÉLÉTRAVAIL. `undefined` (personne n'a choisi) rend
                le sélecteur VIDE, jamais présélectionné sur « Sur site » — un
                défaut choisi ferait passer pour une réponse ce qui n'en est
                pas une. */}
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-remote">{t('openNeeds.columns.remote')}</Label>
              <Select
                value={draft.remote ?? undefined}
                onValueChange={value => patch({ remote: value as (typeof REMOTE_PREFERENCES)[number] })}
              >
                <SelectTrigger id="need-wizard-remote" aria-label={t('openNeeds.columns.remote')}>
                  <SelectValue placeholder={t('needWizard.remotePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {REMOTE_PREFERENCES.map(value => (
                    <SelectItem key={value} value={value}>
                      {t(`openNeeds.remote.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-seniority">{t('openNeeds.columns.seniority')}</Label>
              <Input
                id="need-wizard-seniority"
                value={draft.seniority}
                onChange={event => patch({ seniority: event.target.value })}
                placeholder={t('needWizard.seniorityPlaceholder')}
              />
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-headcount">{t('openNeeds.columns.headcount')}</Label>
              <Input
                id="need-wizard-headcount"
                type="number"
                min={1}
                value={draft.headcount}
                onChange={event => patch({ headcount: Math.max(1, Number(event.target.value) || 1) })}
              />
            </Box>
            {/* #2174.25 — LE DÉMARRAGE. `start_on` existe au contrat de création
            (`createProjectNeedSchema`) et voyage déjà tel quel dans
            `needWizardDraftToCreateInput` — rien, jusqu'ici, ne permettait de
            le SAISIR : la valeur ne s'écrivait qu'après coup, sur la fiche. */}
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-start-on">{t('needWizard.startOnLabel')}</Label>
              <Input
                id="need-wizard-start-on"
                type="date"
                value={draft.start_on}
                onChange={event => patch({ start_on: event.target.value })}
              />
            </Box>
            {/* #2174.26 — LA DURÉE. Même histoire que le démarrage juste
            au-dessus : `duration_months` existe au contrat et dans le
            brouillon, jamais saisissable avant ce lot. */}
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-duration">{t('needWizard.durationLabel')}</Label>
              <Input
                id="need-wizard-duration"
                type="number"
                min={1}
                value={draft.duration_months ?? ''}
                onChange={event => {
                  const raw = event.target.value
                  patch({ duration_months: raw ? Math.max(1, Number(raw)) : null })
                }}
              />
            </Box>
            {/* #2174.30 — LE TYPE DE CONTRAT. `contract_kind` existe au
            contrat ; `inconnu` reste hors de cette liste — c'est un état
            d'ABSENCE (la valeur que le serveur pose quand personne n'a
            choisi), jamais un choix qu'on ferait exprès. */}
            <Box className="space-y-1.5">
              <Label htmlFor="need-wizard-contract-kind">{t('needWizard.contractKindLabel')}</Label>
              <Select
                value={draft.contract_kind || undefined}
                onValueChange={value => patch({ contract_kind: value as ContractKind })}
              >
                <SelectTrigger id="need-wizard-contract-kind" aria-label={t('needWizard.contractKindLabel')}>
                  <SelectValue placeholder={t('needWizard.contractKindPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_KIND_OPTIONS.map(value => (
                    <SelectItem key={value} value={value}>
                      {t(`openNeeds.contract.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          </Box>

          {/* #3547 — LE FORFAIT ENCADRÉ. Un client de l'ESN fait du forfait avec les
          salariés de SON client, sans consultants : il trouve la mission, contacte
          la DSI, cadre ou supervise. Le bloc n'existe qu'au forfait (le serveur
          refuse le mode ailleurs). Tout est facultatif : rôle, équipe par noms ou
          par nombre — rien n'est posé tant que rien n'est saisi, jamais « 0 ». */}
          {draft.contract_kind === 'forfait' && (
            <SupervisedForfaitFields value={draft} onChange={patch} idPrefix="need-wizard" />
          )}

          {/* #2174.17 — LE PROBLÈME. `context` existe déjà au contrat de
          LECTURE (`ProjectNeed.context`, rendu par `NeedDetailPage.tsx`) et
          au SEMIS de démo — seule la création n'en offrait pas la saisie. */}
          <Box className="space-y-1.5">
            <Label htmlFor="need-wizard-context">{t('needWizard.contextLabel')}</Label>
            <Textarea
              id="need-wizard-context"
              value={draft.context}
              onChange={event => patch({ context: event.target.value })}
              placeholder={t('needWizard.contextPlaceholder')}
              rows={2}
            />
          </Box>

          {/* #2939 (#2174.16) — LA CAPACITÉ RECHERCHÉE. `expertise` existe déjà
          au contrat de LECTURE (`ProjectNeed.expertise`, rendu par
          `NeedDetailPage.tsx` — « Expertise attendue ») — seule la création
          n'en offrait pas la saisie, même patron que `context` juste
          au-dessus. */}
          <Box className="space-y-1.5">
            <Label htmlFor="need-wizard-expertise">{t('needWizard.expertiseLabel')}</Label>
            <Input
              id="need-wizard-expertise"
              value={draft.expertise}
              onChange={event => patch({ expertise: event.target.value })}
              placeholder={t('needWizard.expertisePlaceholder')}
            />
          </Box>

          {/* #2939 (#2174.31) — LES CONTRAINTES ADMINISTRATIVES. `constraints`
          existe déjà au contrat de LECTURE (`ProjectNeed.constraints`, rendu
          par `NeedDetailPage.tsx` — « Contraintes »), même patron que
          `expertise`/`context` juste au-dessus. */}
          <Box className="space-y-1.5">
            <Label htmlFor="need-wizard-constraints">{t('needWizard.constraintsLabel')}</Label>
            <Textarea
              id="need-wizard-constraints"
              value={draft.constraints}
              onChange={event => patch({ constraints: event.target.value })}
              placeholder={t('needWizard.constraintsPlaceholder')}
              rows={2}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="need-wizard-skills">{t('needWizard.skillsLabel')}</Label>
            <Input
              id="need-wizard-skills"
              value={skillsText}
              onChange={event => commitSkills(event.target.value)}
              placeholder={t('needWizard.skillsPlaceholder')}
            />
            {/* #2939 (#2174.20, #2174.22, #2174.24) — CHAQUE compétence saisie
                arrivait `required: true` figé (`commitSkills`), sans niveau :
                aucune séparation Indispensable/Souhaitable n'était possible.
                `updateSkill` (pur, testé) règle CE critère, jamais les autres.
                ⚠️ Deux états seulement (`required`, booléen du contrat) —
                pas de troisième « à clarifier » sans faire grandir le
                contrat d'abord (GA-11/GA-12). */}
            {draft.skills.length > 0 ? (
              <Box className="space-y-1.5 pt-1">
                {draft.skills.map((skill, index) => (
                  <Box key={`${skill.term}-${index}`} display="flex" className="items-center gap-2">
                    <Text size="sm" className="min-w-0 flex-1 truncate">
                      {skill.term}
                    </Text>
                    <Select
                      value={skill.required ? 'must' : 'nice'}
                      onValueChange={value =>
                        patch({ skills: updateSkill(draft.skills, index, { required: value === 'must' }) })
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-40"
                        aria-label={t('needWizard.skillBucketLabel', { term: skill.term })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="must">{t('needWizard.skillBucket.must')}</SelectItem>
                        <SelectItem value="nice">{t('needWizard.skillBucket.nice')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 w-32"
                      value={skill.level ?? ''}
                      aria-label={t('needWizard.skillLevelLabel', { term: skill.term })}
                      placeholder={t('needWizard.skillLevelPlaceholder')}
                      onChange={event =>
                        patch({
                          skills: updateSkill(draft.skills, index, { level: event.target.value || null }),
                        })
                      }
                    />
                    {/* #2939 (#2174.23) — la preuve attendue est un TEXTE LIBRE
                        décrivant ce qui ferait dire le critère rempli, jamais
                        une case cochée qui prétendrait avoir vérifié quoi que
                        ce soit (doctrine : "vu le <date>, source <la source>",
                        jamais "vérifié"). */}
                    <Input
                      className="h-8 w-40"
                      value={skill.proof ?? ''}
                      aria-label={t('needWizard.skillProofLabel', { term: skill.term })}
                      placeholder={t('needWizard.skillProofPlaceholder')}
                      onChange={event =>
                        patch({
                          skills: updateSkill(draft.skills, index, { proof: event.target.value || null }),
                        })
                      }
                    />
                  </Box>
                ))}
              </Box>
            ) : null}
          </Box>

          {/* Les certifications OBLIGATOIRES du besoin — nouvelles côté besoin
          (elles existaient déjà côté détection de CV, jamais comme exigence). */}
          <Box className="space-y-1.5">
            <Label htmlFor="need-wizard-certifications">{t('needWizard.certifications.label')}</Label>
            <Input
              id="need-wizard-certifications"
              value={certificationsText}
              onChange={event => commitCertifications(event.target.value)}
              placeholder={t('needWizard.certifications.placeholder')}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/**
 * ÉTAPE 3 — Décision (#2939, #2174.32/.33/.34) : comment le client décide en
 * interne, qui décide, et si les achats sont dans la boucle.
 *
 * Les trois champs sont OPTIONNELS, même règle que le reste de l'étape 2 :
 * `needWizardStepValid` ne bloque QUE l'étape 1 — un commercial qui ne connaît
 * pas encore le décideur ne doit pas être empêché de créer le besoin.
 */
function StepDecision({
  draft,
  patch,
  contacts,
}: {
  draft: NeedWizardDraft
  patch: (partial: Partial<NeedWizardDraft>) => void
  contacts: Contact[]
}) {
  const { t } = useTranslation('projects')
  return (
    <Box className="space-y-4">
      <Box className="space-y-1">
        <Text size="base" weight="semibold" element="h3">
          {t('needWizard.decisionTitle')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.decisionHint')}
        </Text>
      </Box>

      <Box className="space-y-1.5">
        <Label htmlFor="need-wizard-decision-process">{t('needWizard.decisionProcessLabel')}</Label>
        <Textarea
          id="need-wizard-decision-process"
          value={draft.decisionProcess}
          onChange={event => patch({ decisionProcess: event.target.value })}
          placeholder={t('needWizard.decisionProcessPlaceholder')}
          rows={2}
        />
      </Box>

      {/* #2174.33 — LE DÉCIDEUR, un contact DE CE COMPTE — même liste que
          l'interlocuteur de l'étape 1 (`accountContacts`), jamais un second
          appel pour les mêmes personnes. */}
      <Box className="space-y-1.5">
        <Label htmlFor="need-wizard-decision-maker">{t('needWizard.decisionMakerLabel')}</Label>
        <Select
          value={draft.decisionMakerContactId || undefined}
          onValueChange={value => patch({ decisionMakerContactId: value })}
        >
          <SelectTrigger id="need-wizard-decision-maker" aria-label={t('needWizard.decisionMakerLabel')}>
            <SelectValue placeholder={t('needWizard.decisionMakerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {contacts.map(contact => (
              <SelectItem key={contact.id} value={contact.id}>
                {contact.title ? `${contact.full_name} — ${contact.title}` : contact.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      <Box className="space-y-1.5">
        <Label htmlFor="need-wizard-procurement">{t('needWizard.procurement.label')}</Label>
        <Select
          value={draft.procurementInvolvement ?? undefined}
          onValueChange={value => patch({ procurementInvolvement: value as NeedProcurementInvolvement })}
        >
          <SelectTrigger id="need-wizard-procurement" aria-label={t('needWizard.procurement.label')}>
            <SelectValue placeholder={t('needWizard.procurement.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {NEED_PROCUREMENT_INVOLVEMENTS.map(value => (
              <SelectItem key={value} value={value}>
                {t(`needWizard.procurement.values.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>
    </Box>
  )
}

/** ÉTAPE 4 — Matching IA : ce qui se passera après création, et un résumé pour
 *  vérifier avant de créer. Ne LANCE rien : le rapprochement (`POST
 *  /needs/:id/match`) exige un besoin déjà créé (`needId`), et le simuler ici
 *  produirait un calcul sur un objet qui n'existe pas encore. */
function StepMatching({ draft }: { draft: NeedWizardDraft }) {
  const { t } = useTranslation('projects')
  return (
    <Box className="space-y-3">
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('needWizard.matching.intro')}
      </Text>
      <Box className="rounded-md border border-[var(--bellum-border)] p-3">
        <Text size="xs" weight="medium">
          {t('needWizard.matching.criteriaTitle')}
        </Text>
        <Box display="flex" className="mt-1.5 flex-wrap gap-1.5">
          {draft.skills.length === 0 ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('needWizard.matching.noSkills')}
            </Text>
          ) : (
            draft.skills.map(skill => (
              <Badge key={skill.term} variant="default">
                {skill.term}
              </Badge>
            ))
          )}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * ÉTAPE 5 — Confirmation : la reformulation RELUE (#2174.35), les inconnues
 * bloquantes (#2174.36), puis le geste — créé comme besoin À QUALIFIER
 * (#2174.39, jamais un second statut de sortie : c'est le défaut de la
 * colonne, `saveNeed`, `project-pipeline.service.ts`).
 */
function StepConfirmation({
  draft,
  formError,
  accountLabel,
}: {
  draft: NeedWizardDraft
  formError: string | null
  accountLabel: string | null
}) {
  const { t } = useTranslation('projects')
  const segments = needWizardReformulationSegments(draft, accountLabel)
  const blockingUnknowns = needWizardBlockingUnknowns(draft)
  return (
    <Box className="space-y-3">
      {/* #2174.35 — « Voici ce que j'ai compris » : une PHRASE relue, pas une
          nouvelle grille de champs — les badges juste en dessous montrent déjà
          la grille. */}
      <Box className="space-y-1 rounded-md border border-[var(--bellum-border)] p-3">
        <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.confirmation.reformulationTitle')}
        </Text>
        <ul className="space-y-1">
          {segments.map((segment, index) => (
            <li key={index}>
              <Text size="sm">
                {segment.kind === 'title' &&
                  (segment.accountLabel && segment.title
                    ? t('needWizard.reformulation.titleWithAccount', {
                        title: segment.title,
                        account: segment.accountLabel,
                      })
                    : segment.accountLabel
                      ? t('needWizard.reformulation.accountOnly', { account: segment.accountLabel })
                      : segment.title
                        ? t('needWizard.reformulation.titleOnly', { title: segment.title })
                        : t('needWizard.reformulation.nothingYet'))}
                {segment.kind === 'skillsRequired' &&
                  t('needWizard.reformulation.skillsRequired', { terms: segment.terms.join(', ') })}
                {segment.kind === 'skillsOptional' &&
                  t('needWizard.reformulation.skillsOptional', { terms: segment.terms.join(', ') })}
                {segment.kind === 'tjm' && t('needWizard.reformulation.tjm', { amount: segment.amount })}
                {segment.kind === 'location' && t('needWizard.reformulation.location', { location: segment.value })}
                {segment.kind === 'decisionProcess' &&
                  t('needWizard.reformulation.decisionProcess', { process: segment.value })}
                {segment.kind === 'procurement' && t(`needWizard.procurement.values.${segment.value}`)}
              </Text>
            </li>
          ))}
        </ul>
      </Box>

      <Box className="rounded-md border border-[var(--bellum-border)] p-3">
        <Text size="sm" weight="medium">
          {draft.title || t('needWizard.confirmation.noTitle')}
        </Text>
        <Box display="flex" className="mt-1 flex-wrap gap-1.5">
          {draft.origin ? <Badge variant="default">{t(`needWizard.origin.values.${draft.origin}`)}</Badge> : null}
          {draft.channel ? <Badge variant="default">{t(`needWizard.channel.values.${draft.channel}`)}</Badge> : null}
          {draft.location ? <Badge variant="default">{draft.location}</Badge> : null}
          {draft.remote ? <Badge variant="default">{t(`openNeeds.remote.${draft.remote}`)}</Badge> : null}
          {draft.target_tjm_cents !== null ? (
            <Badge variant="default">
              {t('needWizard.confirmation.tjm', { amount: draft.target_tjm_cents / 100 })}
            </Badge>
          ) : null}
        </Box>
      </Box>

      {/* #2174.36 — LES INCONNUES BLOQUANTES, nommées. Vide (aucune ligne)
          quand aucune compilation n'a eu lieu : « on n'affiche pas ce qu'on
          n'a pas ». */}
      {blockingUnknowns.length > 0 ? (
        <Box className="space-y-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
          <Text size="xs" weight="medium">
            {t('needWizard.confirmation.blockingUnknownsTitle')}
          </Text>
          <ul className="space-y-1">
            {blockingUnknowns.map(field => (
              <li key={field}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t(`needWizard.confirmation.blockingUnknown.${field}`)}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {/* #2174.39 — un SEUL chemin de soumission : ce besoin sera créé À
          QUALIFIER, jamais un second statut de sortie deviné ici. */}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('needWizard.confirmation.willBeCreatedToQualify')}
      </Text>

      {formError ? (
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {formError}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * LA COLONNE « CONSEILS DE LAURA » (08-creer-un-besoin.png).
 *
 * ⚠️ Cinq conseils, du texte STATIQUE — c'est une aide à la saisie, pas une
 * mesure. Aucun chiffre : « +35 % de précision » de la maquette n'est PAS
 * repris (garde i18n `no-overpromise`, personne n'a mesuré ce nombre).
 *
 * ⚠️ LE VISAGE DE LAURA — décision EN ATTENTE (31/08/2026).
 * La maquette dessine un avatar féminin. Le produit n'a jamais validé de
 * visage : partout où Laura se montre (`Chat.tsx`), c'est le LOGO qui est
 * rendu. On garde le logo ici. Fabriquer un visage pour remplir une maquette
 * poserait, en trois minutes de code, une identité visuelle que personne n'a
 * arbitrée — et qu'il faudrait ensuite défaire partout.
 *
 * ⚠️ L'ENCART DE RÉSULTAT dit ce qui est VRAI du calcul, pas un bénéfice
 * promis : les axes non renseignés SORTENT du dénominateur du rapprochement,
 * ils ne comptent pas pour zéro. C'est exactement pour ça que remplir ces
 * champs change quelque chose, et ça se vérifie dans le code du score.
 */
export function NeedWizardTips() {
  const { t } = useTranslation('projects')
  const tips = t('needWizard.tips', { returnObjects: true }) as string[]
  return (
    <Box className="w-full shrink-0 space-y-3 rounded-md border border-[var(--bellum-border)] p-3 lg:w-72">
      <Box display="flex" className="items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="sm" weight="semibold" element="h3">
          {t('needWizard.tipsTitle')}
        </Text>
      </Box>

      <Box display="flex" className="items-start gap-2">
        <Logo className="mt-0.5 size-5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.tipsIntro')}
        </Text>
      </Box>

      <ul className="space-y-1.5">
        {tips.map(tip => (
          <li key={tip} className="flex items-start gap-2">
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {tip}
            </Text>
          </li>
        ))}
      </ul>

      <Box className="rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2">
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('needWizard.tipsOutcome')}
        </Text>
      </Box>
    </Box>
  )
}
