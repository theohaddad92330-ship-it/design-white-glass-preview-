import {
  hasPermission,
  isDisputeOpen,
  MISSION_SATISFACTION_LEVELS,
  SUPPLIER_INVOICE_STATUSES,
  type ConnectedClientTool,
  type ContractKind,
  type InvoiceConnectorWriteRequestView,
  type InvoiceReadiness,
  type MissionAssignment,
  type MissionBillingRead,
  type MissionCommercialTerms,
  type MissionFeedbackItem,
  type MissionFeedbackRail,
  type MissionSatisfactionLevel,
  type MissionScore,
  type SupplierInvoiceStatus,
  type UpsertCommercialTermsInput,
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
  TabNav,
  Text,
  Textarea,
  type TabNavItem,
} from '@bellum/ui'
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useSession } from '@/lib/hooks/use-session'
import { NotesPanel } from '@/features/crm-core/view/NotesPanel'
import { RecordHistory } from '@/features/crm-core/view/RecordHistory'
import { InvoiceAttachments } from './InvoiceAttachments'
import {
  SupervisedForfaitFields,
  type SupervisedForfaitDraft,
} from '@/features/projects/open-needs/view/SupervisedForfaitFields'
import { clientTeamLabel, draftOfMission, missionModeUpdateOf } from '../supervised-forfait'
import { useUpdateMission } from './mission-panel.api'
import { apiFetch } from '@/lib/api'
import { formatDate, formatDateTime, formatMonth } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import {
  useCreateMissionExpense,
  useCreateSupplierInvoice,
  useMissionAssignments,
  useMissionExpenses,
  useMissionFeedback,
  useMissionScores,
  useMissionTerms,
  useSetMissionTerms,
  useSetSupplierInvoiceStatus,
  useSubmitMissionFeedback,
  useSupplierInvoices,
  useUpdateMissionExpense,
  useRenewalWindows,
  type TimesheetLine,
  type MissionView,
} from '../api'
import { renewalWindowBadge } from '../renewalWindowLabel'
import { supervisedForfaitLabel } from '../supervised-forfait'
import { MissionCostSourceForm } from './MissionCostSourceForm'
import { MissionMarginEngine } from './MissionMarginEngine'
import { MissionMonthPreparation } from './MissionMonthPreparation'
import { PoConsumptionBar } from './PoConsumptionBar'
import { MissionDocumentsPanel } from './MissionDocumentsPanel'
import { MissionAfterBlock } from './MissionAfterBlock'
import { MissionDriftPanel } from '@/features/mission-tracking/view/MissionDriftPanel'
import { MissionBusinessUnitLine } from './MissionBusinessUnitLine'

export type MissionTab = 'overview' | 'staffing' | 'terms' | 'scores' | 'history'

/**
 * LE CONTENU d'une mission — cinq onglets, et pas un de plus que la donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE (30/08/2026, D200)
 * ─────────────────────────────────────────────────────────────────────────
 * Il vivait dans `MissionDetailSheet`, qui était le SEUL endroit d'où une
 * mission s'ouvrait. La mission a maintenant DEUX formes — le tiroir, qu'on
 * ferme pour retrouver sa liste, et le DOSSIER (`/missions/$id`), qui se
 * garde, se partage par lien et s'ouvre dans un onglet. Les deux formes
 * coexistent dans la matrice du tome 7 ; ce qu'elles ne font pas, c'est porter
 * deux fois le même contenu.
 *
 * « Rien n'apparaît deux fois sous la même forme avec le même contenu » est la
 * loi 4 du tome 7, et un second composant qui rendrait ces mêmes cinq onglets
 * divergerait du premier en trois semaines. Le contenu vit donc ICI, une fois ;
 * les deux hôtes n'apportent que leur CHROME — un tiroir, ou une page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CINQ, ET LESQUELS
 * ─────────────────────────────────────────────────────────────────────────
 *  1. **Synthèse** — ce que porte la ligne elle-même (statut, nature, rôle,
 *     dates, risques calculés). Elle répond à la question qu'on se pose en
 *     ouvrant une fiche, et elle évitait jusqu'ici d'être posée : le rôle
 *     cherché, la nature du contrat et les risques n'étaient visibles NULLE
 *     PART dans le produit.
 *  2. **Qui est dessus** — `GET /delivery/missions/:id/assignments`.
 *  3. **Conditions commerciales** — `GET|PUT /delivery/missions/:id/terms`, et
 *     depuis le 30/08/2026, DEUX sections de plus dans le MÊME onglet : les
 *     relevés d'activité et la facturation de CETTE mission (voir plus bas,
 *     « POURQUOI PAS DEUX ONGLETS DE PLUS »).
 *  4. **Risque & opportunité** — `GET /delivery/finance/missions/:id/scores`.
 *     Cette route servait depuis des mois et n'avait AUCUN appelant : le
 *     service calculait deux scores décomposés que personne ne voyait.
 *  5. **Historique du compte** — la timeline du compte porteur.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DEUX ONGLETS DE PLUS (30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Le manque mesuré était réel : pour voir les relevés ou la facturation d'UNE
 * mission, il fallait quitter la fiche, aller sur l'écran global
 * (`/missions/cra`, `/missions/facturation`) et la retrouver dans une liste de
 * tout l'espace. `timesheetMonthQuerySchema.missionId` existait déjà dans le
 * contrat ; seul le web ne le passait pas.
 *
 * La fiche a déjà CINQ onglets, et le mobile en tolère QUATRE (au-delà, les
 * cibles passent sous 44 px). Deux onglets de PLUS l'auraient portée à sept.
 * Le choix retenu : deux SECTIONS de plus dans l'onglet « Conditions
 * commerciales », pas deux onglets — le nombre d'onglets ne bouge pas, sur
 * aucune largeur.
 *
 * ⚠️ Elles vivent AVANT la porte `finance:read` de `TermsTab`, pas derrière.
 * `GET /delivery/timesheets` et `GET /delivery/invoice-readiness` sont deux
 * routes SANS permission déclarée — la LISTE est légitime pour tout membre,
 * seul le MONTANT est rédigé sans le droit financier (`canReadFinance`, porté
 * par la réponse). Les ranger derrière la même porte que le coût chargé et la
 * marge aurait caché à un gestionnaire de delivery sans `finance:read`
 * exactement ce qu'il doit pouvoir lire : « relevé manquant », « bloqué ». Ni
 * l'une ni l'autre n'écrit — expliquer un écart, valider ou rejeter un relevé,
 * marquer facturé, encaisser, contester restent les gestes de leurs écrans
 * dédiés : ces deux sections MONTRENT, elles ne gèrent pas.
 *
 * ⚠️ #2930 (point couvert #2191.38) — **le besoin d'origine** (`opportunity_id`)
 * n'était pas un refus PRODUIT : `opportunity_id` sortait en identifiant nu
 * faute de résolution GROUPÉE côté serveur, exactement comme l'était `owner_id`
 * avant #2195.13. `DeliveryService.opportunitiesOf` le résout désormais (une
 * requête, pas N) et la Synthèse l'affiche en toutes lettres — `null` quand
 * aucun besoin n'est lié, jamais un UUID.
 */
export function MissionDetailTabs({
  mission,
  tab: controlledTab,
  onTabChange,
  hideNav = false,
  extras,
}: {
  mission: MissionView
  /** Théo missions-dossier — le DOSSIER pose lui-même la barre d'onglets (sous son entête) et pilote l'onglet ;
   *  le tiroir, lui, garde le comportement d'avant : sa propre barre, son propre état. */
  tab?: MissionTab
  onTabChange?: (tab: MissionTab) => void
  hideNav?: boolean
  /** Des blocs que l'hôte range EN TÊTE d'un onglet (le dossier y place ce qui flottait au-dessus des onglets). */
  extras?: Partial<Record<MissionTab, React.ReactNode>>
}) {
  const { t } = useTranslation('missions')
  const [ownTab, setOwnTab] = useState<MissionTab>('overview')
  const tab = controlledTab ?? ownTab
  const setTab = (next: MissionTab) => {
    setOwnTab(next)
    onTabChange?.(next)
  }

  const tabs = useMemo<TabNavItem[]>(
    () => [
      { key: 'overview', label: t('tabs.overview') },
      // Les libellés des trois onglets historiques sont RÉUTILISÉS, pas
      // recopiés : le même sujet ne porte pas deux noms selon l'endroit.
      { key: 'staffing', label: t('tabs.staffing') },
      // #2953 (#2193.15, recette 30/09) — l'entrée « Finance » était
      // introuvable par son nom (« Conditions commerciales ») : l'onglet
      // porte les conditions ET la finance, il le dit.
      { key: 'terms', label: t('tabs.terms') },
      { key: 'scores', label: t('tabs.scores') },
      { key: 'history', label: t('tabs.history') },
    ],
    [t],
  )

  return (
    <>
      {hideNav ? null : (
        <Box className="border-b border-border px-5 py-2">
          <TabNav tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as MissionTab)} size="sm" />
        </Box>
      )}

      <Box className={hideNav ? 'space-y-5' : 'space-y-5 px-5 py-4'}>
        {extras?.[tab] ?? null}
        {tab === 'overview' ? <OverviewTab mission={mission} compact={hideNav} /> : null}
        {tab === 'staffing' ? <StaffingTab missionId={mission.id} /> : null}
        {tab === 'terms' ? <TermsTab missionId={mission.id} contractKind={mission.contract_kind} /> : null}
        {tab === 'scores' ? <ScoresTab missionId={mission.id} /> : null}
        {tab === 'history' ? (
          <Box className="space-y-5">
            {mission.account_id ? (
              <TimelinePanel
                scope="account"
                entityId={mission.account_id}
                accountId={mission.account_id}
                showSync={false}
              />
            ) : null}
            {/* #2193.50 — « qui a corrigé quoi sur CETTE mission ? », distinct
                de la timeline du compte porteur juste au-dessus : même lecteur
                générique que compte/contact, pas une seconde classification. */}
            <RecordHistory entityType="mission" entityId={mission.id} />
            {/* #2193.51 — LES DOCUMENTS de la mission (contrat signé, avenant,
                NDA), dernière section de l'Historique — même patron que
                `ProjectDocumentsPanel` (#2171.24) côté opportunité. */}
            <MissionDocumentsPanel missionId={mission.id} />
          </Box>
        ) : null}
      </Box>
    </>
  )
}

/**
 * La synthèse — ce que la ligne porte déjà, enfin lisible.
 *
 * ⚠️ Aucune ligne ne réclame quoi que ce soit à un FORFAIT. Un forfait n'a ni
 * TJM ni relevé d'activité : il se facture aux jalons. Lui afficher un manque
 * produirait une alerte qui ne se résoudra jamais — et une alerte qui ne se
 * résout pas fait ignorer toutes les autres.
 */
function OverviewTab({ mission, compact = false }: { mission: MissionView; compact?: boolean }) {
  const { t } = useTranslation('missions')
  const { data: windows } = useRenewalWindows()
  const risks = mission.risks ?? []
  const risksComputed = mission.status === 'active' || mission.status === 'onboarding'
  const prepOnTop = mission.contract_kind !== 'forfait' && risksComputed
  /**
   * ⚠️ Les dates passent par `formatDate` — la langue de l'APP, jamais celle du
   * navigateur. Elles sortaient d'ici en ISO brut (« 2026-02-01 ») : lisible
   * par une machine, par personne d'autre. Une chaîne illisible rend `null`, et
   * l'écran dit alors « non renseignée » plutôt qu'« Invalid Date ».
   */
  const startedOn = formatDate(mission.started_on)
  const endsOn = formatDate(mission.ends_on)

  return (
    <Box className="space-y-4">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge variant="secondary">{t(`status.${mission.status}`)}</Badge>
        <Badge variant="secondary">{t(`table.contractKinds.${mission.contract_kind}`)}</Badge>
        {/* #2195.8 — la pastille se CALCULE depuis l'échelle de l'espace : « J-20 »
            chez qui règle vingt jours, jamais le nom figé du palier. */}
        <Badge variant="secondary">{renewalWindowBadge(t, mission.renewal ?? 'unknown', windows?.days)}</Badge>
      </Box>

      {/* R3b-3 — recette prod 08/10 : le panneau était à y≈3291 px, tout en bas.
          Pour une mission régie/AT en cours, c'est LE geste du mois : il monte
          juste après l'en-tête. Hors « en cours », il garde sa place d'avant. */}
      {prepOnTop ? <MissionMonthPreparationBlock missionId={mission.id} /> : null}

      <Box className="space-y-2">
        {/* Théo missions-dossier — dans le DOSSIER, les dates, le lieu, la source et la BU vivent dans la colonne des
            propriétés (une donnée, un seul endroit) ; le tiroir, lui, les garde ici. */}
        <Line label={t('overview.role')}>{mission.role_title ?? <UnknownValue reason={t('table.roleUnknown')} />}</Line>
        {/* #3547 — le forfait encadré, DANS la fiche (pas un bloc de plus) : le rôle
            tenu par l'ESN et l'équipe côté client, sans consultants. Aucune ligne
            sur une mission qui en attend ; une équipe inconnue se dit, jamais « 0 ». */}
        <DeliveryModeLines mission={mission} />
        {/* #3413 « autre BU » — la BU propriétaire et le geste de transfert, DANS
            une ligne de la fiche (pas un bloc de plus) ; le journal se lit dans
            « Historique ». */}
        {compact ? null : (
          <>
            <Line label={t('overview.businessUnit')}>
              <MissionBusinessUnitLine missionId={mission.id} />
            </Line>
          </>
        )}
        {/* #2930 (point couvert #2191.38) — résolu côté serveur
            (`DeliveryService.opportunitiesOf`) : `null` dit aussi bien
            « aucun besoin lié » que « besoin introuvable » ou « lecture
            illisible », jamais un UUID nu.
            #2953 (#2193.59) — le libellé OUVRE le besoin : un objet source
            cité par son nom sans pouvoir l'ouvrir est du texte mort. */}
        {compact ? null : (
          <>
            <Line label={t('overview.originOpportunity')}>
              {mission.opportunityLabel && mission.opportunity_id ? (
                <Link to="/projects/$id" params={{ id: mission.opportunity_id }} className="hover:underline">
                  {mission.opportunityLabel}
                </Link>
              ) : (
                (mission.opportunityLabel ?? <UnknownValue reason={t('table.originOpportunityUnknown')} />)
              )}
            </Line>
          </>
        )}
        {/* #2953 (#2193.48) — même patron que le besoin d'origine juste
            au-dessus, sur `submission_id` cette fois : ligne rendue SEULEMENT
            quand un positionnement est lié — un « aucun » nu sur un champ
            secondaire, que la majorité des missions ne portent pas,
            ajouterait du bruit que le besoin d'origine, lui, justifie déjà. */}
        {mission.submission_id ? (
          <Line label={t('overview.originSubmission')}>
            {mission.submissionLabel ? (
              <Link to="/submissions/$id" params={{ id: mission.submission_id }} className="hover:underline">
                {mission.submissionLabel}
              </Link>
            ) : (
              <UnknownValue reason={t('table.originSubmissionUnknown')} />
            )}
          </Line>
        ) : null}
        {compact ? null : (
          <>
            <Line label={t('overview.startedOn')}>
              {startedOn ?? <UnknownValue reason={t('table.startedOnUnknown')} />}
            </Line>
            <Line label={t('overview.endsOn')}>
              {/* Une mission sans fin le DIT : c'est elle qui échappe aux fenêtres
              J-60 / J-30, donc celle qu'on ne relance jamais à temps. */}
              {endsOn ?? t('noEndDate')}
            </Line>
            {/* #2191.17 / #2191.18 — REPRIS du besoin au handoff, quand le rôle
            d'origine est certain. `undefined` (API antérieure au champ) et
            `null` (non repris) rendent la MÊME absence nommée. */}
            <Line label={t('overview.remotePreference')}>
              {mission.remote_preference ? (
                t(`table.remoteKinds.${mission.remote_preference}`)
              ) : (
                <UnknownValue reason={t('table.remotePreferenceUnknown')} />
              )}
            </Line>
            <Line label={t('overview.location')}>
              {mission.location ?? <UnknownValue reason={t('table.locationUnknown')} />}
            </Line>
          </>
        )}
      </Box>

      {/* #2953 (#2193.17/.18) — L'OBJECTIF ET LE PÉRIMÈTRE. Aucune source ne
          les REPREND (contrairement à `location`/`remote_preference`
          juste au-dessus) : ce sont deux champs SAISIS sur la fiche, par le
          même formulaire de réparation que le contact de facturation
          (`PATCH /delivery/missions/:id`, `useUpdateMission`). */}
      <MissionObjectivePerimeterFields mission={mission} compact={compact} />

      {mission.contract_kind !== 'forfait' && !prepOnTop ? (
        <MissionMonthPreparationBlock missionId={mission.id} />
      ) : null}

      <Box className="space-y-2 border-t border-border pt-4">
        <Text element="p" size="sm" weight="medium">
          {t('overview.risks')}
        </Text>
        {!risksComputed ? (
          // « Aucun risque » serait un verdict conclu d'un silence : le calcul
          // sort tôt sur tout statut autre qu'en cours ou en démarrage.
          <UnknownValue reason={t('table.risksNotComputed')} />
        ) : risks.length === 0 ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('table.noRisk')}
          </Text>
        ) : (
          <Box display="flex" className="flex-wrap items-center gap-1">
            {risks.map(risk => (
              <Badge key={risk} variant="warning">
                {t(`table.riskKinds.${risk}`)}
              </Badge>
            ))}
          </Box>
        )}
      </Box>

      <MissionTrackingSection missionId={mission.id} />
    </Box>
  )
}

/**
 * #2953 (#2193.17/.18) — L'OBJECTIF ET LE PÉRIMÈTRE, ÉDITABLES SUR LA FICHE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FORMULAIRE ET PAS UN TREIZIÈME DÉDIÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `useUpdateMission` (`mission-panel.api.ts`) est déjà générique — il écrit
 * indifféremment les dates, la société porteuse ou le contact de facturation
 * (voir son docblock) — et ce sont ces DEUX champs de plus qu'il écrit ici,
 * jamais une route neuve.
 *
 * `initialObjective`/`initialPerimeter` servent de repère : ne rien y toucher
 * ne doit renvoyer NI l'un NI l'autre, sinon rouvrir le formulaire sans y
 * toucher effacerait un champ saisi par un autre — même règle que
 * `PartnerQualifyForm` (#2316.34, `TabPartners.tsx`).
 */
function MissionObjectivePerimeterFields({ mission, compact = false }: { mission: MissionView; compact?: boolean }) {
  const { t } = useTranslation('missions')
  const update = useUpdateMission(mission.id)
  const [editing, setEditing] = useState(false)
  const initialObjective = mission.objective ?? ''
  const initialPerimeter = mission.perimeter ?? ''
  const [objective, setObjective] = useState(initialObjective)
  const [perimeter, setPerimeter] = useState(initialPerimeter)

  if (!editing) {
    return (
      <Box className="space-y-2">
        {/* Dans le dossier (`compact`), l'objectif et le périmètre se LISENT dans la carte d'identité : ici ne
            reste que le geste qui les modifie (une donnée vit à un seul endroit, GA-26). */}
        {compact ? null : (
          <>
            <Line label={t('overview.objective')}>
              {mission.objective ?? <UnknownValue reason={t('table.objectiveUnknown')} />}
            </Line>
            <Line label={t('overview.perimeter')}>
              {mission.perimeter ?? <UnknownValue reason={t('table.perimeterUnknown')} />}
            </Line>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setObjective(initialObjective)
            setPerimeter(initialPerimeter)
            setEditing(true)
          }}
        >
          {t('overview.editObjectivePerimeter')}
        </Button>
      </Box>
    )
  }

  return (
    <Box className="space-y-2 rounded-md border border-border p-3">
      <label className="block">
        <Text size="xs" color="text-muted-foreground">
          {t('overview.objective')}
        </Text>
        <Textarea
          aria-label={t('overview.objectiveAria')}
          value={objective}
          onChange={event => setObjective(event.target.value)}
          className="mt-1 min-h-[3rem] w-full"
        />
      </label>
      <label className="block">
        <Text size="xs" color="text-muted-foreground">
          {t('overview.perimeter')}
        </Text>
        <Textarea
          aria-label={t('overview.perimeterAria')}
          value={perimeter}
          onChange={event => setPerimeter(event.target.value)}
          className="mt-1 min-h-[3rem] w-full"
        />
      </label>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={update.isPending}
          onClick={() => {
            const trimmedObjective = objective.trim()
            const trimmedPerimeter = perimeter.trim()
            const body: { objective?: string | null; perimeter?: string | null } = {}
            // Untouché → AUCUNE clé : la fiche garde ce qu'elle avait.
            if (trimmedObjective !== initialObjective.trim()) body.objective = trimmedObjective || null
            if (trimmedPerimeter !== initialPerimeter.trim()) body.perimeter = trimmedPerimeter || null
            if (Object.keys(body).length === 0) {
              setEditing(false)
              return
            }
            update.mutate(body, { onSuccess: () => setEditing(false) })
          }}
        >
          {t('overview.saveObjectivePerimeter')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setEditing(false)}>
          {t('overview.cancelObjectivePerimeter')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * #2953 (#2193.25-30) — LE SUIVI : points client, points consultant,
 * décisions, problèmes, besoins adjacents, actions — tout ce qui se note au
 * fil d'une mission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRANCHÉ SANS LOUIS — UN FIL, PAS SIX LISTES
 * ─────────────────────────────────────────────────────────────────────────
 * #2193 décrit six catégories. Les fabriquer en six colonnes dédiées serait
 * le défaut que la doctrine nomme ailleurs : « UN formulaire générique, pas
 * treize dédiés » (#1950.15, `c75_plan_duplication_edition_generique`). Le
 * fil polymorphe existe déjà — `notes` (`entityType`/`entityId`), qui porte
 * DÉJÀ `mission` dans `PROVENANCE_ENTITY_TYPES` et dans
 * `NOTE_TARGET_TABLES` (`notes.service.ts`) côté serveur — SANS AUCUN
 * appelant web pour les missions (`NotesPanel` sert déjà `account`,
 * `contact` et `consultant`). Même défaut n°1 que partout dans ce dépôt : du
 * code juste, calculé, testé, que personne n'appelle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SECTION, PAS UN SIXIÈME ONGLET
 * ─────────────────────────────────────────────────────────────────────────
 * `MissionDetailTabs.tsx` documente déjà la décision : « la fiche a déjà
 * CINQ onglets… le nombre d'onglets ne bouge pas, sur AUCUNE largeur » (voir
 * l'entête de `TermsTab`, D200). Le Suivi rejoint donc Synthèse — le même
 * onglet qui porte déjà le pouls de la mission (`MissionFeedbackSection`) —
 * plutôt que d'ouvrir un sixième onglet que ce fichier interdit en toutes
 * lettres.
 */
function MissionTrackingSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { user } = useSession()
  return (
    <Box className="space-y-3 border-t border-border pt-4">
      <Text element="p" size="sm" weight="medium">
        {t('overview.tracking.title')}
      </Text>
      <NotesPanel entityType="mission" entityId={missionId} currentUserId={user?.id} />
    </Box>
  )
}

/**
 * #2412 — le double pouls de satisfaction d'une mission active.
 *
 * Deux rails SÉPARÉS (#2412.1) — jamais fusionnés en un score, jamais une
 * moyenne entre eux : `MissionFeedbackService.rails()` les rend déjà triés,
 * ce composant ne fait qu'afficher. Un rail sans entrée dit « pas encore
 * d'avis » (#2412.8 lu à l'envers : l'absence n'est pas moins vraie que la
 * divergence) — jamais un score à 0 (doctrine « on n'affiche pas ce qu'on n'a
 * pas »).
 *
 * Le GESTE d'ajout est gouverné par `records:write`, MIROIR du serveur
 * (`@RequirePermission('records:write')`, `delivery.controller.ts`) — même
 * convention que `MissionInvoiceConnectorPanel` (`canWriteFinance`) : sans ce
 * droit, on retire le bouton, pas l'information (H25).
 */
function MissionFeedbackSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { team } = useTeam()
  const canWrite = team ? hasPermission(team.workspace.role, 'records:write') : false
  const { data, isLoading, isError } = useMissionFeedback(missionId)
  const submit = useSubmitMissionFeedback(missionId)
  const [rail, setRail] = useState<MissionFeedbackRail>('client')
  const [note, setNote] = useState('')
  const [isPrivateNote, setIsPrivateNote] = useState(false)
  // #2408.16 — le niveau est OPTIONNEL : `null` = note libre, lue « non mesuré ».
  const [level, setLevel] = useState<MissionSatisfactionLevel | null>(null)

  const onSubmit = () => {
    const trimmed = note.trim()
    if (!trimmed) return
    submit.mutate(
      { rail, note: trimmed, private: isPrivateNote, ...(level ? { level } : {}) },
      {
        onSuccess: () => {
          setNote('')
          setIsPrivateNote(false)
          setLevel(null)
        },
      },
    )
  }

  return (
    <Box className="space-y-3 border-t border-border pt-4">
      <Text element="p" size="sm" weight="medium">
        {t('overview.feedback.title')}
      </Text>

      {isLoading ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('overview.feedback.loadError')}
        </Text>
      ) : (
        <Box className="grid gap-3 sm:grid-cols-2">
          <MissionFeedbackRailList
            title={t('overview.feedback.clientRail')}
            items={data?.client ?? []}
            emptyLabel={t('overview.feedback.empty')}
          />
          <MissionFeedbackRailList
            title={t('overview.feedback.consultantRail')}
            items={data?.consultant ?? []}
            emptyLabel={t('overview.feedback.empty')}
          />
        </Box>
      )}

      {canWrite ? (
        <Box className="space-y-2 border-t border-border pt-3">
          <Box display="flex" className="flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={rail === 'client' ? 'black' : 'outline'}
              onClick={() => setRail('client')}
            >
              {t('overview.feedback.clientRail')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={rail === 'consultant' ? 'black' : 'outline'}
              onClick={() => setRail('consultant')}
            >
              {t('overview.feedback.consultantRail')}
            </Button>
          </Box>
          {/* #2408.16 — trois crans DÉCLARÉS, un second clic retire le niveau. */}
          <Box
            display="flex"
            role="group"
            aria-label={t('satisfaction.levelLabel')}
            className="flex-wrap items-center gap-2"
          >
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('satisfaction.levelLabel')}
            </Text>
            {MISSION_SATISFACTION_LEVELS.map(value => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={level === value ? 'black' : 'outline'}
                aria-pressed={level === value}
                onClick={() => setLevel(current => (current === value ? null : value))}
              >
                {t(`satisfaction.levels.${value}`)}
              </Button>
            ))}
          </Box>
          <Textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('overview.feedback.notePlaceholder')}
            aria-label={t('overview.feedback.notePlaceholder')}
            className="min-h-[72px]"
          />
          <Box display="flex" className="items-center justify-between gap-3">
            <Box display="flex" className="items-center gap-2">
              <Checkbox
                id="mission-feedback-private"
                checked={isPrivateNote}
                onCheckedChange={value => setIsPrivateNote(value === true)}
              />
              <Text element="label" size="xs" color="text-muted-foreground" htmlFor="mission-feedback-private">
                {t('overview.feedback.privateLabel')}
              </Text>
            </Box>
            <Button
              size="sm"
              variant="black"
              disabled={note.trim().length === 0}
              isLoading={submit.isPending}
              loadingText={t('common:states.saving')}
              onClick={onSubmit}
            >
              {t('overview.feedback.submit')}
            </Button>
          </Box>
        </Box>
      ) : (
        // H25 — le droit manque : on retire le GESTE, pas l'information, même
        // convention que le panneau de facturation connectée juste au-dessus.
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('overview.feedback.noWriteRight')}
        </Text>
      )}
    </Box>
  )
}

function MissionFeedbackRailList({
  title,
  items,
  emptyLabel,
}: {
  title: string
  items: MissionFeedbackItem[]
  emptyLabel: string
}) {
  const { t } = useTranslation('missions')
  return (
    <Box className="space-y-1.5">
      <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
        {title}
      </Text>
      {items.length === 0 ? (
        // Absence ≠ 0 (#2412.8, doctrine « on n'affiche pas ce qu'on n'a pas ») :
        // un rail sans entrée le DIT, il ne rend jamais un score à zéro.
        <Text element="p" size="xs" color="text-muted-foreground">
          {emptyLabel}
        </Text>
      ) : (
        <Box className="space-y-1.5">
          {items.map(item => (
            <Box key={item.id} className="rounded-md border border-border p-2">
              <Text element="p" size="xs">
                {item.note}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground">
                {/* #2408.16 — le niveau déclaré, quand il y en a un ; sinon rien (jamais « moyen »). */}
                {item.level ? `${t(`satisfaction.badges.${item.level}`)} · ` : null}
                {formatDateTime(item.createdAt)}
                {/* #2412.6 — la visibilité est un FAIT affiché, jamais déduit
                 *  de l'absence du badge privé : chaque entrée porte l'un des
                 *  deux badges, jamais un silence entre les deux. */}
                {' · '}
                {item.private ? t('overview.feedback.privateBadge') : t('overview.feedback.teamBadge')}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

/** #3547 — l'équipe côté client : les noms d'abord, puis le nombre, sinon « non renseignée ». */
/**
 * #3547 (X66) — LE MODE DE RÉALISATION, lu ET changeable sur la ligne
 * « Réalisation » : un forfait staffé offre le geste (« Avec consultants »), un
 * forfait encadré dit son rôle et son équipe. Hors forfait, aucune ligne : le
 * mode encadré n'y existe pas (le serveur le refuse). Le formulaire est celui de
 * l'assistant de besoin (`SupervisedForfaitFields`, un seul endroit — GA-26).
 */
function DeliveryModeLines({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const update = useUpdateMission(mission.id)
  const supervisedLabel = supervisedForfaitLabel(mission)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SupervisedForfaitDraft>(() => draftOfMission(mission))
  if (!supervisedLabel && mission.contract_kind !== 'forfait') return null

  const save = () => {
    update.mutate(missionModeUpdateOf(draft, mission), { onSuccess: () => setEditing(false) })
  }

  return (
    <>
      <Line label={t('overview.deliveryMode')}>
        <Box display="flex" className="flex-wrap items-baseline justify-end gap-x-2">
          <span>{supervisedLabel ?? t('overview.deliveryModeStaffed')}</span>
          {!editing && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto px-1 pointer-coarse:min-h-11 pointer-coarse:px-2"
              onClick={() => {
                setDraft(draftOfMission(mission))
                setEditing(true)
              }}
            >
              {t('overview.changeDeliveryMode')}
            </Button>
          )}
        </Box>
      </Line>
      {supervisedLabel ? (
        <Line label={t('overview.clientTeam')}>
          <ClientTeamValue mission={mission} />
        </Line>
      ) : null}
      {editing && (
        <Box className="space-y-2">
          <SupervisedForfaitFields
            value={draft}
            onChange={patch => setDraft(current => ({ ...current, ...patch }))}
            idPrefix={`mission-${mission.id}`}
          />
          <Box display="flex" className="justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => setEditing(false)}
            >
              {t('overview.cancelDeliveryMode')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={update.isPending}
              onClick={save}
            >
              {t('overview.saveDeliveryMode')}
            </Button>
          </Box>
        </Box>
      )}
    </>
  )
}

function ClientTeamValue({ mission }: { mission: MissionView }) {
  // « Non renseignée » plutôt que « Non mesuré » : c'est un champ SAISI ou non, pas une mesure.
  return clientTeamLabel(mission)
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box display="flex" className="items-baseline justify-between gap-3">
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Box className="min-w-0 text-right">
        <Text element="span" size="sm">
          {children}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Théo missions-dossier — « Équipe & suite » : les personnes affectées, puis les retours de mission (client /
 * consultant), puis « Après la mission ». Les retours vivaient dans la Synthèse ; ils rejoignent l'équipe.
 */
function StaffingTab({ missionId }: { missionId: string }) {
  return (
    <Box className="space-y-5">
      <StaffingAssignments missionId={missionId} />
      <MissionFeedbackSection missionId={missionId} />
    </Box>
  )
}

function StaffingAssignments({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data: assignments, isError } = useMissionAssignments(missionId)

  if (isError) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('staffing.loadError')}
      </Text>
    )
  }
  if (!assignments || assignments.length === 0) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('staffing.empty')}
      </Text>
    )
  }
  return (
    <Box className="space-y-1">
      {assignments.map(assignment => {
        // La date de fin d'une affectation, dans la langue de l'app. `null`
        // quand elle est illisible : elle rejoint alors « sans fin connue »,
        // qui est la vérité — pas une date de remplissage.
        const until = formatDate(assignment.endsOn)
        return (
          <Box
            key={assignment.id}
            display="flex"
            className="items-center justify-between gap-2 rounded-md border border-border p-2"
          >
            <Text element="span" size="xs" weight="medium">
              {assignment.consultantName ?? t('staffing.unknownTalent')}
            </Text>
            {/* #2407.6 — le statut PROPRE de l'affectation, distinct du badge de
                la mission (decisions §9). Absent = rien d'affiché, jamais deviné. */}
            {assignment.status ? (
              <Badge variant="outline">{t(`staffing.assignmentStatus.${assignment.status}`)}</Badge>
            ) : null}
            <Text element="span" size="xs" color="text-muted-foreground">
              {/* Une affectation sans fin est dite SANS FIN, jamais complétée par
                  une date : ce serait promettre une disponibilité que personne
                  n'a annoncée. */}
              {assignment.loadPercent} %
              {until ? ` · ${t('staffing.until', { date: until })}` : ` · ${t('staffing.openEnded')}`}
            </Text>
            {/* #2407.4 (suite) — consentement, documents, risques DÉCLARÉS.
                Absents, ils DISENT « non renseigné » — jamais silencieux :
                un champ tu ne se distingue pas d'un champ qui n'existe pas. */}
            <AssignmentDeclarations assignment={assignment} />
          </Box>
        )
      })}
      {/* Théo C missions-dossier.N3 — où va le consultant ensuite. */}
      <Box className="pt-3">
        <MissionAfterBlock consultants={assignments} />
      </Box>
    </Box>
  )
}

/**
 * #2407.4 (suite) — consentement, documents, risques DÉCLARÉS d'une
 * affectation. Trois lignes, chacune « non renseigné(e) » quand absente
 * (`UnknownValue`, jamais un champ qui disparaît silencieusement).
 */
function AssignmentDeclarations({
  assignment,
}: {
  assignment: Pick<
    MissionAssignment,
    'consentGiven' | 'consentDate' | 'documentsExpected' | 'documentsReceived' | 'declaredRisks'
  >
}) {
  const { t } = useTranslation('missions')
  const consentLabel =
    assignment.consentGiven === true && assignment.consentDate
      ? t('staffing.consentGiven', { date: formatDate(assignment.consentDate) })
      : assignment.consentGiven === false && assignment.consentDate
        ? t('staffing.consentDeclined', { date: formatDate(assignment.consentDate) })
        : null
  return (
    <Box className="w-full space-y-0.5 border-t border-border pt-1">
      <Line label={t('staffing.consent')}>
        {consentLabel ?? <UnknownValue reason={t('staffing.consentUnknown')} />}
      </Line>
      <Line label={t('staffing.documentsExpected')}>
        {assignment.documentsExpected ?? <UnknownValue reason={t('staffing.documentsUnknown')} />}
      </Line>
      <Line label={t('staffing.documentsReceived')}>
        {assignment.documentsReceived ?? <UnknownValue reason={t('staffing.documentsUnknown')} />}
      </Line>
      <Line label={t('staffing.risks')}>
        {assignment.declaredRisks ?? <UnknownValue reason={t('staffing.risksUnknown')} />}
      </Line>
    </Box>
  )
}

/**
 * Les six champs de REMPLACEMENT du contrat, recopiés depuis ce qui est en base.
 *
 * ⚠️ C'est le régime historique de `PUT /delivery/missions/:id/terms` : un champ
 * ABSENT y vaut `null`, donc tout geste qui écrit un seul de ces six doit
 * recopier les cinq autres — sans quoi enregistrer un coût remettrait le canal,
 * le bon de commande papier et le préavis à « non renseigné ». La recopie
 * existait déjà, écrite trois fois à la main ; elle vit maintenant ici, une
 * fois, parce que trois copies d'une même règle divergent.
 *
 * ⚠️ Ce que cette fonction ne rend PAS est aussi important que ce qu'elle rend :
 * ni `requiresPo` ni `partnerCommissionDailyCents`. Ces deux-là sont en FUSION —
 * leur SILENCE vaut « inchangé ». Les recopier ici rouvrirait exactement la
 * course que la fusion existe pour fermer.
 */
function replacedFields(
  terms: MissionCommercialTerms | null | undefined,
): Omit<UpsertCommercialTermsInput, 'requiresPo' | 'partnerCommissionDailyCents'> {
  return {
    loadedDailyCostCents: terms?.loadedDailyCostCents ?? null,
    channel: terms?.channel ?? 'unknown',
    poNumber: terms?.poNumber ?? null,
    billingCadence: terms?.billingCadence ?? null,
    noticeDays: terms?.noticeDays ?? null,
    notes: terms?.notes ?? null,
  }
}

/** Les deux canaux où le coût réel d'une journée ne tient PAS dans le seul coût
 *  chargé — c'est la règle de `trueDailyCostCents`, pas une préférence d'écran. */
function needsCommission(channel: MissionCommercialTerms['channel']): boolean {
  return channel === 'partner' || channel === 'subcontracting'
}

/** Centimes → euros pour l'affichage d'une saisie. `null` reste vide : « 0 »
 *  dirait « le partenaire ne prend rien », qui est une AUTRE réponse. */
function centsToEuroText(cents: number | null): string {
  return cents === null ? '' : String(Math.round(cents / 100))
}

/** Jours → texte pour l'affichage d'une saisie. `null`/`undefined` restent
 *  vides — un « 0 » se lirait comme un volume connu et nul, une AUTRE réponse
 *  que « non renseigné ». Décimal : les demi-journées existent. */
function daysToText(days: number | null | undefined): string {
  return days === null || days === undefined ? '' : String(days)
}

/**
 * Les conditions commerciales — trois états DISTINCTS, et c'est tout l'intérêt :
 *
 *  - **pas le droit** (`canReadFinance: false`) — l'écran le dit, il n'affiche
 *    pas un vide qui se lirait « rien de renseigné » ;
 *  - **le droit, rien de saisi** — le coût chargé se saisit à la main, et
 *    l'écran invite à le faire ;
 *  - **le droit et le coût** — la marge s'affiche, négative comprise. Une
 *    mission à perte doit se voir : c'est exactement l'information cherchée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX SAISIES QUI MANQUAIENT (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * `requiresPo` et `partnerCommissionDailyCents` étaient acceptés par la route
 * depuis le lot précédent — schéma, DTO, service, SQL, semis de démonstration —
 * et **aucun écran ne les exposait**. Conséquences mesurables : le bloqueur
 * « bon de commande exigé et absent » ne pouvait se déclencher qu'en
 * démonstration, et la marge des missions passées par un intermédiaire restait
 * surévaluée du montant même qu'on cherche à mesurer.
 *
 * Les deux champs sont en FUSION, et la fiche le tient à la lettre : le geste
 * qui coche la case parle de la case et se TAIT sur la commission ; le geste
 * qui enregistre la commission se tait sur la case. Un champ VIDÉ part en
 * `null` — la valeur qui efface — et jamais en `undefined`, qui ne dirait rien
 * et laisserait la commission en base sans plus aucun moyen de la retirer.
 */
/**
 * LA BARRE DE CONSOMMATION — ce qu'il reste d'un bon de commande, et
 * l'alerte d'anticipation à {@link PO_AMENDMENT_ALERT_PERCENT} % (PDF-06
 * §1.3, PDF-07 §2.6).
 *
 * ⚠️ Ce fichier NE PORTE PLUS sa propre version : il montait ce même rendu en
 * DOUBLE, et le second exemplaire (`PoConsumptionBar.tsx`, monté par le
 * panneau de planification) a reçu l'alerte d'anticipation le 01/09/2026 sans
 * que celui-ci suive — loi 4 du tome 7 violée EN PRATIQUE, deux mirroirs qui
 * ne disaient plus la même chose de la même mission. `PoConsumptionBar`
 * couvre les mêmes trois états qu'ici, PLUS le seuil et « Demander
 * l'avenant » ; il est donc monté directement, et la copie locale a disparu.
 */
function TermsTab({ missionId, contractKind }: { missionId: string; contractKind: ContractKind }) {
  const { t } = useTranslation('missions')
  const { data: terms, isError } = useMissionTerms(missionId)
  const setTerms = useSetMissionTerms(missionId)
  const [cost, setCost] = useState('')
  /**
   * Le brouillon de la commission. `null` = « personne n'a touché au champ »,
   * et l'affichage retombe alors sur ce qui est EN BASE.
   *
   * ⚠️ La distinction n'est pas cosmétique : une chaîne vide est une SAISIE
   * (« efface »), et l'initialiser à `''` ferait afficher un champ vide au-dessus
   * d'une commission enregistrée le temps que la requête revienne.
   */
  const [commissionDraft, setCommissionDraft] = useState<string | null>(null)
  /**
   * Les brouillons du bon de commande — même régime que la commission :
   * `null` = « personne n'a touché au champ », et l'affichage retombe alors
   * sur ce qui est EN BASE. Quatre champs, un seul geste d'enregistrement :
   * ils décrivent le MÊME bon de commande.
   */
  const [poNumberDraft, setPoNumberDraft] = useState<string | null>(null)
  const [poIssuedOnDraft, setPoIssuedOnDraft] = useState<string | null>(null)
  const [poAmountDraft, setPoAmountDraft] = useState<string | null>(null)
  const [poVolumeDraft, setPoVolumeDraft] = useState<string | null>(null)
  // #2566.2 — même régime que les trois brouillons juste au-dessus.
  const [poValidUntilDraft, setPoValidUntilDraft] = useState<string | null>(null)
  // #2953 (#2193.39) — le brouillon du préavis, même régime que la commission
  // et le bon de commande : `null` = personne n'a touché au champ.
  const [noticeDaysDraft, setNoticeDaysDraft] = useState<string | null>(null)

  if (isError) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('finance.loadError')}
      </Text>
    )
  }

  // Les relevés et la facturation de CETTE mission (30/08/2026) — calculées
  // UNE fois, rendues dans les DEUX branches ci-dessous. `GET
  // /delivery/timesheets` et `GET /delivery/invoice-readiness` sont deux
  // routes SANS permission déclarée : elles vivent donc AVANT la porte
  // `finance:read` qui suit, pas derrière — voir l'entête du fichier.
  const missionReadSections = (
    <MissionFinanceQueryScope>
      <MissionTimesheetsSection missionId={missionId} />
      <MissionInvoiceReadinessSection missionId={missionId} />
      {/* #2953 (#2193.41-43) — CRA, facturation, paiement : les TROIS écrans
          existent déjà (`/missions/cra`, `/missions/facturation`,
          `/missions/encaissements`) et aucun des deux `missionReadSections`
          ci-dessus ne dit COMMENT y aller depuis CETTE mission — même
          reformulation que le registre du 16/09/2026 pour ces trois points :
          « lien depuis l'onglet Finance du dossier, aucun choix produit ne
          bloque ». Même porte que les deux sections juste au-dessus : SANS
          droit financier déclaré, la liste (le lien) reste légitime, seul le
          MONTANT l'exige. */}
      <MissionFinanceQuickLinks />
    </MissionFinanceQueryScope>
  )

  if (terms && !terms.canReadFinance) {
    // « Pas le droit » se DIT. Un vide se lirait « rien de renseigné », ce qui
    // est une autre information. Mais ce refus ne porte QUE sur le coût
    // chargé et la marge — pas sur les deux sections au-dessus, légitimes
    // pour tout membre.
    return (
      <Box className="space-y-2">
        {missionReadSections}
        <Text size="xs" color="text-muted-foreground">
          {t('finance.noAccess')}
        </Text>
      </Box>
    )
  }

  const channel = terms?.terms?.channel ?? 'unknown'
  const storedCommission = terms?.terms?.partnerCommissionDailyCents ?? null
  const commission = commissionDraft ?? centsToEuroText(storedCommission)
  const base = replacedFields(terms?.terms)

  /** Un seul chemin d'écriture pour la commission — la saisie et l'effacement
   *  passent par lui, et `null` y est une VALEUR, jamais une absence. */
  const saveCommission = (cents: number | null) =>
    setTerms.mutate({ ...base, partnerCommissionDailyCents: cents }, { onSuccess: () => setCommissionDraft(null) })

  // Les QUATRE champs du bon de commande, affichés depuis leur brouillon ou —
  // à défaut de saisie en cours — depuis ce qui est EN BASE.
  const poNumber = poNumberDraft ?? terms?.terms?.poNumber ?? ''
  const poIssuedOn = poIssuedOnDraft ?? terms?.terms?.poIssuedOn ?? ''
  const poAmount = poAmountDraft ?? centsToEuroText(terms?.terms?.poAmountCents ?? null)
  const poVolume = poVolumeDraft ?? daysToText(terms?.terms?.poVolumeDays ?? null)
  // #2566.2 — la date de validité, même régime que les trois autres.
  const poValidUntil = poValidUntilDraft ?? terms?.terms?.poValidUntil ?? ''
  // #2953 (#2193.39) — le préavis, même repli que le volume du bon de
  // commande juste au-dessus : un `0` saisi reste un `0`, l'absence reste vide.
  const noticeDays = noticeDaysDraft ?? daysToText(terms?.terms?.noticeDays ?? null)

  /**
   * Enregistre le bon de commande — numéro, date, montant et volume, en un seul
   * geste : les quatre décrivent le MÊME bon de commande.
   *
   * ⚠️ `poNumber` est un champ de REMPLACEMENT (voir l'entête du fichier) : il
   * voyage déjà dans `base`, et cette fonction le REMPLACE par le brouillon
   * pour que le numéro devienne enfin saisissable — jusqu'ici il n'était que
   * recopié. Les trois autres sont en FUSION (`upsertCommercialTermsSchema`) :
   * chaîne vide efface (`null`), sinon la valeur saisie part telle quelle.
   */
  const savePo = () => {
    const trimmedNumber = poNumber.trim()
    const trimmedDate = poIssuedOn.trim()
    const trimmedValidUntil = poValidUntil.trim()
    const amountRaw = poAmount.trim()
    const volumeRaw = poVolume.trim()

    let amountCents: number | null = null
    if (amountRaw.length > 0) {
      const euros = Number(amountRaw.replace(',', '.'))
      if (!Number.isFinite(euros) || euros < 0) return
      amountCents = Math.round(euros * 100)
    }

    let volumeDays: number | null = null
    if (volumeRaw.length > 0) {
      const days = Number(volumeRaw.replace(',', '.'))
      if (!Number.isFinite(days) || days < 0) return
      volumeDays = days
    }

    setTerms.mutate(
      {
        ...base,
        poNumber: trimmedNumber.length === 0 ? null : trimmedNumber,
        poIssuedOn: trimmedDate.length === 0 ? null : trimmedDate,
        poValidUntil: trimmedValidUntil.length === 0 ? null : trimmedValidUntil,
        poAmountCents: amountCents,
        poVolumeDays: volumeDays,
      },
      {
        onSuccess: () => {
          setPoNumberDraft(null)
          setPoIssuedOnDraft(null)
          setPoValidUntilDraft(null)
          setPoAmountDraft(null)
          setPoVolumeDraft(null)
        },
      },
    )
  }

  return (
    <Box className="space-y-2">
      {missionReadSections}
      {/* #2415.9 — un forfait n'a pas de relevé, il se facture aux jalons
          (voir l'entête d'`OverviewTab`). Cette lecture porte `finance:read`
          (contrairement aux deux sections juste au-dessus) : elle vit APRÈS
          le retour anticipé `!terms.canReadFinance`, jamais dans
          `missionReadSections`. */}
      {contractKind === 'forfait' ? <MissionBillingSection missionId={missionId} /> : null}
      {/* #2420 — le moteur de marge REMPLACE le bloc historique quand la réponse
          le porte : un seul endroit dit la marge, avec son état, ses sources,
          sa période et ce qu'elle n'inclut pas. Le bloc d'origine reste pour
          une réponse d'avant le moteur. */}
      {terms?.marginEngine ? (
        <MissionMarginEngine missionId={missionId} engine={terms.marginEngine} />
      ) : terms?.margin ? (
        <Box className="space-y-1 border-t border-border pt-3">
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Badge variant={terms.margin.amountCents >= 0 ? 'success' : 'warning'}>
              {t('finance.margin', { percent: terms.margin.percent })}
            </Badge>
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('finance.marginAmount', { value: Math.round(terms.margin.amountCents / 100) })}
            </Text>
            {/* La marge dit ce qu'elle inclut (30/08/2026) : ce NOYAU ne compte
                jamais les frais, et le dit maintenant à côté de lui — sinon un
                chiffre complet et un chiffre partiel se ressemblent. */}
            <Text element="span" size="xs" color="text-muted-foreground">
              ({t('finance.marginNote')})
            </Text>
          </Box>
          {/* La vue COMPLÉMENTAIRE, montrée seulement quand elle est calculable
              — jamais un pourcentage fabriqué sur des frais non amortissables. */}
          {terms.marginWithExpenses ? (
            <Box display="flex" className="flex-wrap items-center gap-2">
              <Badge variant={terms.marginWithExpenses.amountCents >= 0 ? 'success' : 'warning'}>
                {t('finance.marginWithExpenses', { percent: terms.marginWithExpenses.percent })}
              </Badge>
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('finance.marginWithExpensesAmount', {
                  value: Math.round(terms.marginWithExpenses.amountCents / 100),
                })}
              </Text>
            </Box>
          ) : terms.expensesTotalCents !== null && terms.expensesTotalCents > 0 ? (
            // Des frais existent mais n'ont pas pu être amortis (pas de date de
            // début) : le DIRE plutôt que les laisser disparaître en silence.
            // `!== null` et non `?? 0` : ici `null` ne veut jamais dire « zéro
            // frais » — sur cette branche du droit financier, il ne peut même
            // pas arriver (D45), et le confondre avec un vrai zéro serait
            // exactement le repli que GA-19 existe pour empêcher.
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('finance.expensesUnamortized', { value: Math.round(terms.expensesTotalCents / 100) })}
            </Text>
          ) : null}
        </Box>
      ) : (
        <Text size="xs" color="text-muted-foreground">
          {t('finance.notMeasured')}
        </Text>
      )}

      <Box display="flex" className="items-center gap-2">
        <Input
          type="number"
          min={0}
          value={cost}
          onChange={event => setCost(event.target.value)}
          placeholder={t('finance.costPlaceholder')}
          aria-label={t('finance.costLabel')}
          className="max-w-[200px]"
        />
        <Button
          variant="outline"
          size="sm"
          isLoading={setTerms.isPending}
          disabled={cost.trim().length === 0}
          onClick={() => {
            const euros = Number.parseInt(cost, 10)
            if (!Number.isFinite(euros) || euros < 0) return
            // Les cinq autres champs de remplacement sont RECOPIÉS : enregistrer
            // un coût ne doit pas remettre le chemin de la mission à « non
            // renseigné » — c'est la moitié du calcul de marge par canal qui
            // disparaîtrait à chaque saisie.
            setTerms.mutate({ ...base, loadedDailyCostCents: euros * 100 }, { onSuccess: () => setCost('') })
          }}
        >
          {t('finance.save')}
        </Button>
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('finance.costHint')}
      </Text>

      {/* #2420 — la source du coût et sa décomposition. Remontée à chaque
          nouvelle version des conditions : ses brouillons partent de la base. */}
      <MissionCostSourceForm
        key={terms?.terms?.updatedAt ?? 'none'}
        terms={terms?.terms ?? null}
        saving={setTerms.isPending}
        onSave={patch => setTerms.mutate({ ...base, ...patch })}
      />

      {/* Le CANAL, saisi et jamais déduit : un partenaire connu sur le compte ne
          dit pas que CETTE mission est passée par lui, et un canal deviné
          produirait l'écart de marge sur lequel on lance un chantier de
          référencement d'un an. */}
      <Box display="flex" className="items-center gap-2">
        <SelectField
          ariaLabel={t('finance.channelLabel')}
          value={channel}
          onChange={next =>
            setTerms.mutate({
              ...base,
              channel: next as MissionCommercialTerms['channel'],
            })
          }
          options={(['direct', 'partner', 'subcontracting', 'unknown'] as const).map(option => ({
            value: option,
            label: t(`finance.channels.${option}`),
          }))}
          className="min-w-0 max-w-full"
        />
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('finance.channelHint')}
        </Text>
      </Box>

      {/* #2953 (#2193.39) — LE PRÉAVIS, en jours : la route l'acceptait déjà
          (`noticeDays`, `replacedFields` juste au-dessus) et le RECOPIAIT à
          chaque écriture — sans qu'aucun écran ne le rende SAISISSABLE. Même
          patron que le CANAL juste au-dessus : un champ de REMPLACEMENT,
          jamais en fusion. */}
      <Box display="flex" className="items-center gap-2">
        <Input
          type="number"
          min={0}
          max={365}
          value={noticeDays}
          onChange={event => setNoticeDaysDraft(event.target.value)}
          placeholder={t('finance.noticeDaysPlaceholder')}
          aria-label={t('finance.noticeDaysLabel')}
          className="max-w-[150px]"
        />
        <Button
          variant="outline"
          size="sm"
          isLoading={setTerms.isPending}
          onClick={() => {
            const raw = noticeDays.trim()
            // ⚠️ VIDE ⇒ `null`, la valeur qui EFFACE — même régime que la
            // commission et le bon de commande juste en dessous.
            if (raw.length === 0)
              return setTerms.mutate({ ...base, noticeDays: null }, { onSuccess: () => setNoticeDaysDraft(null) })
            const days = Number.parseInt(raw, 10)
            if (!Number.isFinite(days) || days < 0 || days > 365) return
            setTerms.mutate({ ...base, noticeDays: days }, { onSuccess: () => setNoticeDaysDraft(null) })
          }}
        >
          {t('finance.noticeDaysSave')}
        </Button>
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('finance.noticeDaysHint')}
        </Text>
      </Box>

      {/* LE BON DE COMMANDE EXIGÉ — une case, et le geste qui la coche ne parle
          QUE d'elle. `false` n'est pas un « on ne sait pas » déguisé : c'est la
          valeur que porte la colonne, et le contrat l'assume. Cocher déclenche
          le bloqueur « bon de commande exigé et absent » sur l'écran de
          facturation tant que le numéro n'est pas saisi — c'est toute la raison
          d'être du champ. */}
      <Box display="flex" className="items-start gap-2 border-t border-border pt-3">
        <Checkbox
          id="mission-requires-po"
          className="mt-0.5"
          checked={terms?.terms?.requiresPo === true}
          disabled={setTerms.isPending}
          onCheckedChange={value => setTerms.mutate({ ...base, requiresPo: value === true })}
        />
        <Box className="min-w-0">
          <Text element="label" size="xs" htmlFor="mission-requires-po">
            {t('finance.requiresPoLabel')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.requiresPoHint')}
          </Text>
        </Box>
      </Box>

      {/* LE BON DE COMMANDE — numéro, date, montant, volume, et ce qu'il en
          reste. Le numéro EXISTAIT déjà, recopié en lecture seule ; il devient
          ici enfin saisissable, aux côtés des trois termes qui manquaient pour
          répondre à « combien reste-t-il ? ». */}
      <Box className="space-y-2 border-t border-border pt-3">
        <Text element="p" size="sm" weight="medium">
          {t('finance.po.title')}
        </Text>
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Input
            type="text"
            value={poNumber}
            onChange={event => setPoNumberDraft(event.target.value)}
            placeholder={t('finance.po.numberPlaceholder')}
            aria-label={t('finance.po.numberLabel')}
            className="max-w-[180px]"
          />
          <Input
            type="date"
            value={poIssuedOn}
            onChange={event => setPoIssuedOnDraft(event.target.value)}
            aria-label={t('finance.po.issuedOnLabel')}
            className="max-w-[170px]"
          />
          {/* #2566.2 — jusqu'à quand ce bon de commande couvre. Sans elle,
              l'écran de facturation ne peut jamais dire qu'une mission longue a
              dépassé son bon de commande en cours de route. */}
          <Input
            type="date"
            value={poValidUntil}
            onChange={event => setPoValidUntilDraft(event.target.value)}
            aria-label={t('finance.po.validUntilLabel')}
            className="max-w-[170px]"
          />
          <Input
            type="number"
            min={0}
            value={poAmount}
            onChange={event => setPoAmountDraft(event.target.value)}
            placeholder={t('finance.po.amountPlaceholder')}
            aria-label={t('finance.po.amountLabel')}
            className="max-w-[150px]"
          />
          <Input
            type="number"
            min={0}
            step="0.5"
            value={poVolume}
            onChange={event => setPoVolumeDraft(event.target.value)}
            placeholder={t('finance.po.volumePlaceholder')}
            aria-label={t('finance.po.volumeLabel')}
            className="max-w-[130px]"
          />
          <Button variant="outline" size="sm" isLoading={setTerms.isPending} onClick={savePo}>
            {t('finance.po.save')}
          </Button>
        </Box>
        <PoConsumptionBar terms={terms?.terms} />
      </Box>

      {/* LA COMMISSION D'INTERMÉDIATION — la seconde moitié du coût réel d'une
          journée sur `partner` et `subcontracting`. Elle ne s'affiche QUE là :
          sur une mission en direct, le champ n'aurait aucun sens et sa présence
          inviterait à le remplir. */}
      {needsCommission(channel) ? (
        <Box className="space-y-2 border-t border-border pt-3">
          <Box display="flex" className="items-center gap-2">
            <Input
              type="number"
              min={0}
              max={10_000}
              value={commission}
              onChange={event => setCommissionDraft(event.target.value)}
              placeholder={t('finance.commissionPlaceholder')}
              aria-label={t('finance.commissionLabel')}
              className="max-w-[200px]"
            />
            <Button
              variant="outline"
              size="sm"
              isLoading={setTerms.isPending}
              onClick={() => {
                const raw = commission.trim()
                // ⚠️ VIDE ⇒ `null`, la valeur qui EFFACE — jamais `undefined`,
                // qui voudrait dire « je ne parle pas de ce champ » et laisserait
                // la commission en base sans plus aucun moyen de la retirer.
                if (raw.length === 0) return saveCommission(null)
                const euros = Number(raw.replace(',', '.'))
                if (!Number.isFinite(euros) || euros < 0 || euros > 10_000) return
                // ZÉRO est une réponse : un partenaire qui ne prend rien, ça
                // existe, et ce n'est pas la même chose que « on ne sait pas ».
                return saveCommission(Math.round(euros * 100))
              }}
            >
              {t('finance.commissionSave')}
            </Button>
          </Box>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.commissionHint')}
          </Text>
        </Box>
      ) : storedCommission !== null ? (
        /* Une commission restée sur une mission repassée en direct n'est PAS
           décorative : `trueDailyCostCents` l'ajoute au coût chargé quel que
           soit le canal. La cacher laisserait un chiffre agir sans que personne
           ne puisse le voir. On ne l'efface pas non plus tout seul — une
           écriture silencieuse sur une saisie humaine ne se fait pas ici. */
        <Box className="space-y-2 border-t border-border pt-3">
          <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
            {t('finance.commissionStale', { value: Math.round(storedCommission / 100) })}
          </Text>
          <Button variant="outline" size="sm" isLoading={setTerms.isPending} onClick={() => saveCommission(null)}>
            {t('finance.commissionClear')}
          </Button>
        </Box>
      ) : null}

      <ExpensesSection missionId={missionId} />
      <SupplierInvoicesSection missionId={missionId} />
    </Box>
  )
}

/**
 * #3709 (recette 07/10 soir) — « Préparer la facture du mois » + le champ bon
 * de commande vivaient seulement dans l'onglet Conditions/Finance, derrière le
 * rang d'une lecture que personne n'ouvrait sur une régie. Ils vivent
 * désormais dans la SYNTHÈSE de toute mission facturée AU TEMPS (régie, AT) :
 * un forfait se facture aux jalons, il n'a ni TJM ni relevé à préparer.
 */
function MissionMonthPreparationBlock({ missionId }: { missionId: string }) {
  return (
    <MissionFinanceQueryScope>
      {/* #2563/#2566/#2567 — « Préparer la facture de <mois> » : le mois
          précédent sert de modèle, le contrôle du bon de commande se voit, et
          la création du brouillon (la porte ci-dessus) reste un geste distinct. */}
      <MissionMonthPreparation
        missionId={missionId}
        connectorSlot={prep => (
          <InvoiceConnectorGate
            missionId={missionId}
            periodMonth={prep.periodMonth}
            missionLabel={prep.missionLabel}
            accountName={prep.accountName}
            legalEntityName={prep.legalEntityName}
            days={prep.days}
            dailyRateCents={prep.dailyRateCents}
            preparedAmountCents={prep.amountCents}
            poNumber={prep.poNumber}
            canReadFinance
            readyToSend={prep.readinessState === 'ready'}
          />
        )}
      />
    </MissionFinanceQueryScope>
  )
}

/**
 * Un `QueryClient` LOCAL, réservé aux sections de lecture ci-dessous.
 *
 * ⚠️ Elles sont les SEULES de ce fichier à appeler `useQuery` directement —
 * tout le reste passe par les hooks de `'../api'`, montés au-dessus d'un
 * `QueryClientProvider` d'APPLICATION que les tests de cette fiche mockent
 * entièrement (`vi.mock('../api', …)`) et ne fournissent donc jamais. Un
 * `useQuery` nu planterait alors avec « No QueryClient set » — pas seulement
 * dans `MissionDetailTabs.test.tsx`, mais dans tout autre test qui monte cette
 * fiche sans le savoir (`MissionDetailSheet.test.tsx`, hors du périmètre de ce
 * lot). Un client LOCAL, créé une fois par montage, rend ces sections
 * indépendantes de ce qui les héberge, au lieu de présupposer un
 * `QueryClientProvider` qu'elles ne contrôlent pas.
 */
function MissionFinanceQueryScope({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * Le mois COURANT, en `YYYY-MM`, calculé en UTC. (30/08/2026, D781)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS LE MOIS PRÉCÉDENT — LE DÉFAUT DU 30/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Sans `month` explicite, `TimesheetsService.month` et
 * `InvoiceReadinessService.list` retombent tous deux sur `previousMonth(now)`
 * — un choix ÉCRIT et volontaire, pas un oubli : « le 5 du mois, la question
 * n'est pas où en est le mois en cours, mais qu'est-ce qui bloque encore le
 * mois qu'on aurait dû facturer » (`timesheets.service.ts`,
 * `invoice-readiness.service.ts`). Ce raisonnement est JUSTE pour
 * `/missions/cra` et `/missions/facturation` — les écrans du rituel mensuel —
 * et cette fonction ne le défait PAS : ces deux routes gardent leur défaut
 * serveur quand personne ne précise de mois.
 *
 * Il ne tient plus ICI. Les deux sections ci-dessous vivent dans la fiche
 * d'UNE mission, en LECTURE SEULE (voir leurs entêtes), pour répondre à une
 * question différente : « comment va CETTE mission, maintenant » — pas
 * « qu'est-ce qui reste à clôturer sur le mois qu'on vient de finir ». Un mois
 * précédent qui précède le démarrage de la mission ne répond à AUCUNE des deux
 * questions : c'est exactement ce qui a été mesuré à l'œil le 30/08/2026 — une
 * mission commencée le 06/08 affichant « 2026-07 », un mois où elle n'existait
 * pas, alors que le mois courant avait, lui, des données.
 *
 * Le mois COURANT reste la question qui a un sens quel que soit le jour du
 * mois où la fiche s'ouvre — y compris pour une mission qui vient de démarrer
 * CE MOIS-CI (D783) : le mois courant est alors le SEUL mois où elle a jamais
 * existé, et la requête serveur (`m.started_on <= fin de mois`) la rendra.
 * Une mission pas encore commencée ou déjà finie continue de rendre la liste
 * vide, avec sa raison déjà NOMMÉE par `readiness.emptyWhy` /
 * `finance.timesheets.emptyWhy` — ce n'est pas un cas à traiter ici.
 */
function currentMonthIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * #2953 (#2193.41-43) — TROIS LIENS, jamais trois écrans réécrits ici.
 *
 * `/missions/cra`, `/missions/facturation` et `/missions/encaissements`
 * traitent déjà le CRA, la facturation et le paiement — sur TOUTES les
 * missions de l'espace. Cette fiche n'a besoin que de dire OÙ ALLER pour
 * CETTE mission : ni les filtrer par mission (les trois routes n'ont pas ce
 * paramètre — hors périmètre de ce lot), ni en refaire une lecture ici,
 * ce que `MissionTimesheetsSection`/`MissionInvoiceReadinessSection`
 * font déjà juste au-dessus.
 */
function MissionFinanceQuickLinks() {
  const { t } = useTranslation('missions')
  return (
    <Box display="flex" className="flex-wrap items-center gap-x-4 gap-y-1">
      <Link to="/missions/cra" className="text-sm text-[var(--bellum-text-accent)] hover:underline">
        {t('finance.quickLinks.cra')}
      </Link>
      <Link to="/missions/facturation" className="text-sm text-[var(--bellum-text-accent)] hover:underline">
        {t('finance.quickLinks.billing')}
      </Link>
      <Link to="/missions/encaissements" className="text-sm text-[var(--bellum-text-accent)] hover:underline">
        {t('finance.quickLinks.payments')}
      </Link>
    </Box>
  )
}

/**
 * Les relevés d'activité, resserrés sur CETTE mission (30/08/2026).
 *
 * `timesheetMonthQuerySchema.missionId` existait déjà dans le contrat, et le
 * SQL de `TimesheetsService.month` le lisait déjà — seul le web ne le passait
 * pas. Pas de hook dans `'../api'` pour ça : `useTimesheetMonth` ne connaît que
 * le mois, et ce lot reste hors du périmètre qui l'étendrait ; cette section
 * parle donc à `apiFetch` directement, comme un petit nombre d'écrans du dépôt.
 *
 * Lecture SEULE, à dessein : expliquer un écart, valider ou rejeter un relevé
 * restent les gestes de `/missions/cra`, l'écran du 5 du mois. Cette section
 * MONTRE, elle ne gère pas — c'est tout ce que le manque mesuré demandait.
 *
 * ⚠️ `month` est passé EXPLICITEMENT — voir `currentMonthIso` juste au-dessus
 * pour la raison (D781) : sans lui, cette requête retomberait sur le mois
 * précédent du service, pensé pour un AUTRE écran.
 */
function useMissionTimesheets(missionId: string) {
  const month = currentMonthIso()
  return useQuery({
    queryKey: ['missions', missionId, 'timesheets-of-mission', month] as const,
    queryFn: () =>
      apiFetch<{ month: string; items: TimesheetLine[] }>({
        path: `/delivery/timesheets?${new URLSearchParams({ missionId, month }).toString()}`,
      }),
  })
}

function MissionTimesheetsSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data, isError } = useMissionTimesheets(missionId)

  return (
    <Box className="space-y-2">
      <Text element="p" size="sm" weight="medium">
        {t('cra.title')}
      </Text>
      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('cra.errorTitle')}
        </Text>
      ) : !data?.items || data.items.length === 0 ? (
        // `data?.items` et non `!data` seul : une réponse SANS la clé attendue
        // (une forme plus ancienne que ce code, ou — en test — le mock global
        // `apiFetch` qui résout `{}` par défaut) ne doit jamais faire planter
        // sur `.length` d'un `undefined`. L'état vide REPREND celui de
        // `/missions/facturation` (voir plus bas) : ce qui manque, NOMMÉ, pas
        // un tableau simplement vide.
        <Box>
          <Text size="xs" color="text-muted-foreground">
            {t('finance.timesheets.empty')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('finance.timesheets.emptyWhy')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-1">
          {data.items.map(line => (
            <Box
              key={`${line.missionId}-${line.consultantId ?? 'none'}-${line.periodMonth}`}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <Box display="flex" className="min-w-0 items-center gap-2">
                <Text element="span" size="xs" weight="medium">
                  {line.consultantName ?? t('cra.noConsultant')}
                </Text>
                <Badge variant="secondary">{t(`cra.states.${line.status}`)}</Badge>
              </Box>
              <Text element="span" size="xs" color="text-muted-foreground">
                {/* « Aucun relevé » et « zéro jour » ne se corrigent pas de la
                    même façon — même distinction que sur `/missions/cra`. */}
                {line.days === null ? '—' : t('cra.days', { count: line.days })}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

/**
 * Une variante de badge par état de facturation. DUPLIQUÉE depuis
 * `InvoiceReadinessPanel.tsx` — celle-ci n'exporte pas la sienne, et le
 * périmètre de fichiers de ce lot n'inclut pas cet écran. Les DEUX valeurs
 * doivent rester identiques ; les faire diverger romprait la loi 4 du tome 7
 * (« rien n'apparaît deux fois sous la même forme avec un contenu différent »).
 */
const READINESS_STATE_VARIANT: Readonly<
  Record<InvoiceReadiness['state'], 'warning' | 'success' | 'secondary' | 'outline'>
> = {
  blocked: 'warning',
  ready: 'success',
  invoiced: 'secondary',
  not_due: 'secondary',
  // #2197.41 — contour, jamais le badge PLEIN réservé à ce qui est PROUVÉ.
  invoiced_declared: 'outline',
}

/**
 * La facturation, resserrée sur CETTE mission (30/08/2026).
 *
 * `invoiceReadinessQuerySchema` a gagné un `missionId` optionnel — un
 * changement de CONTRAT sur un schéma `.strict()`. Ses deux appelants
 * (`InvoiceReadinessController`, qui ne fait que transmettre `query`, et
 * `InvoiceReadinessService.list`, qui lit le nouveau champ là où il l'attend)
 * l'acceptent sans autre modification.
 *
 * Même choix que la section des relevés : lecture SEULE, `apiFetch` direct
 * (pas de hook mission-scopé dans `'../api'`), et hors de la porte
 * `finance:read` — voir l'entête du fichier.
 *
 * ⚠️ `month` est passé EXPLICITEMENT, comme pour les relevés — voir
 * `currentMonthIso` (D781) : sans lui, cette requête retomberait sur le mois
 * PRÉCÉDENT du service, un défaut pensé pour `/missions/facturation`, pas pour
 * la fiche d'une mission.
 */
function useMissionInvoiceReadiness(missionId: string) {
  const month = currentMonthIso()
  return useQuery({
    queryKey: ['missions', missionId, 'readiness-of-mission', month] as const,
    queryFn: () =>
      apiFetch<{ items: InvoiceReadiness[]; month: string; canReadFinance: boolean }>({
        path: `/delivery/invoice-readiness?${new URLSearchParams({ missionId, month }).toString()}`,
      }),
  })
}

function MissionInvoiceReadinessSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data, isError } = useMissionInvoiceReadiness(missionId)
  // `?.` sur `items` LUI-MÊME : une réponse SANS cette clé (forme plus
  // ancienne, ou en test le mock global `apiFetch` qui résout `{}`) rend
  // `data` truthy tout en laissant `items` `undefined` — indexer `[0]` dessus
  // planterait plutôt que de tomber sur l'état vide.
  const item = data?.items?.[0] ?? null
  // Défaut FERMÉ (`=== true`), pas `?? true` — même garde que
  // `InvoiceReadinessPanel` : une réponse plus ancienne que ce code ne porte
  // pas encore le champ, et un défaut ouvert afficherait des montants à qui
  // n'y a pas droit pendant la fenêtre de déploiement.
  const canReadFinance = data?.canReadFinance === true
  const disputed = item ? isDisputeOpen(item) : false

  return (
    <Box className="space-y-2">
      {/* Le mois passe par `formatMonth` (D782, `lib/locale.ts`) — jamais
          l'ISO brut que rendait `data?.month` seul : « 2026-07 » n'est lisible
          par personne d'autre qu'une machine, et chaque AUTRE date de cette
          fiche (démarrage, fin, affectations) passe déjà par un formateur de
          `lib/locale.ts`. Gardé par GA-207. */}
      <Text element="p" size="sm" weight="medium">
        {t('readiness.title', { month: formatMonth(data?.month) ?? '' })}
      </Text>
      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('readiness.loadError')}
        </Text>
      ) : !item ? (
        // L'état vide MODÈLE du dépôt (`/missions/facturation`) : « rien à
        // surveiller » n'est pas la même chose que « il n'y a rien à voir » —
        // c'est la question qui ne se pose pas ce mois-ci, et elle se dit.
        <Box>
          <Text size="xs" color="text-muted-foreground">
            {t('readiness.empty')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('readiness.emptyWhy')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-1">
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Badge variant={READINESS_STATE_VARIANT[item.state]}>{t(`readiness.states.${item.state}`)}</Badge>
            {disputed ? <Badge variant="danger">{t('readiness.disputed')}</Badge> : null}
          </Box>
          {item.blockers.length > 0 ? (
            <Box display="flex" className="flex-wrap gap-1">
              {item.blockers.map(blocker => (
                <Badge key={blocker} variant="outline">
                  {t(`readiness.blockers.${blocker}`)}
                </Badge>
              ))}
            </Box>
          ) : null}
          {/* #2566.2 — le blocage NOMME son owner : redemander l'écran sans
              dire à QUI ferait passer le blocage pour une fatalité plutôt que
              pour un geste que quelqu'un de précis peut faire. Affiché pour le
              blocage « bon de commande », le seul qui le nomme dans ce lot. */}
          {item.blockers.includes('po_period_mismatch') && item.ownerName ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('readiness.poBlockerOwner', { name: item.ownerName })}
            </Text>
          ) : null}
          {/* #2563.1 — période, jours, TJM, montant : la préparation que le
              client demande à voir. Le TJM sort SANS `finance:read` (comme le
              reste du dépôt le fait déjà pour le prix de vente), donc il
              s'affiche même quand le montant, lui, est rédigé. */}
          <Text element="p" size="xs" color="text-muted-foreground">
            {item.days === null ? t('readiness.noTimesheet') : t('readiness.days', { count: item.days })}
            {item.dailyRateCents != null
              ? ` × ${t('readiness.rate', { value: Math.round(item.dailyRateCents / 100) })}`
              : ''}
            {/* Le droit ET la valeur — même rempart que `InvoiceReadinessPanel` :
                le serveur vide déjà le montant sans `finance:read`. */}
            {canReadFinance && item.preparedAmountCents !== null
              ? ` = ${t('readiness.amount', { value: Math.round(item.preparedAmountCents / 100) })}`
              : ''}
          </Text>
          {!canReadFinance ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('readiness.financeHidden')}
            </Text>
          ) : null}
          {/* #2565.9 — la PORTE : #2565 avait écrit la route, aucun écran ne
              l'appelait (`git grep invoice-connector -- apps/web` rendait
              ZÉRO). Le geste vit ICI, sur la fiche de CETTE mission, là où
              « Facturation — <mois> » affiche déjà le statut et ses
              bloqueurs (#2566) — pas sur `/missions/facturation`, qui reste
              volontairement sans écriture (REVENUE PROTECTION,
              `InvoiceReadinessPanel.tsx`). */}
          <InvoiceConnectorGate
            missionId={missionId}
            periodMonth={item.periodMonth}
            missionLabel={item.missionLabel}
            accountName={item.accountName}
            legalEntityName={item.legalEntityName ?? null}
            days={item.days}
            dailyRateCents={item.dailyRateCents ?? null}
            preparedAmountCents={item.preparedAmountCents}
            poNumber={item.poNumber ?? null}
            canReadFinance={canReadFinance}
            readyToSend={item.state === 'ready'}
          />
        </Box>
      )}
    </Box>
  )
}

/**
 * #2415.9 — les jalons DÉCLARÉS d'un forfait (`GET
 * /delivery/missions/:id/billing`, `MissionBillingService.read`, backend
 * livré par #2417.3). Contrat partagé `MissionBillingRead` (`@bellum/contracts`,
 * GA-26) : ce hook ne revalide rien, il type la même forme que le serveur
 * construit.
 */
function useMissionBilling(missionId: string) {
  return useQuery({
    queryKey: ['missions', missionId, 'billing'] as const,
    queryFn: () => apiFetch<MissionBillingRead>({ path: `/delivery/missions/${missionId}/billing` }),
  })
}

function MissionBillingSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data, isError } = useMissionBilling(missionId)

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text element="p" size="sm" weight="medium">
        {t('billing.title')}
      </Text>
      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('billing.loadError')}
        </Text>
      ) : !data?.milestones || data.milestones.length === 0 ? (
        // Même modèle que les relevés et la facturation juste au-dessus :
        // l'absence est NOMMÉE, jamais une liste simplement vide.
        <Box>
          <Text size="xs" color="text-muted-foreground">
            {t('billing.empty')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('billing.emptyWhy')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-1">
          {data.milestones.map(milestone => (
            <Box
              key={milestone.id}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <Text element="span" size="xs" weight="medium">
                {milestone.label}
              </Text>
              <Box display="flex" className="items-center gap-2">
                <Text element="span" size="xs" color="text-muted-foreground">
                  {formatDate(milestone.dueOn) ?? milestone.dueOn}
                </Text>
                <Text element="span" size="xs">
                  {t('billing.amount', { value: Math.round(milestone.amountCents / 100) })}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

/**
 * #2565.9 — l'outil qui reçoit l'écriture facture, vu depuis l'écran. MIROIR
 * du même prédicat côté serveur (`InvoiceConnectorWriteController.
 * connectedInvoicingProvider`, `apps/api/src/modules/invoice-connector/
 * invoice-connector-write.controller.ts`) : la famille `admin_docs` du
 * registre, PLUS Odoo par son identifiant (catalogué CRM, pas `admin_docs`).
 * Les deux doivent rester identiques — sans ça, l'écran nommerait un outil
 * différent de celui qui reçoit réellement l'écriture (GA-44 : jamais un nom
 * deviné, jamais un fournisseur à NOUS — seul l'outil que l'ESPACE a branché).
 */
function connectedInvoicingTool(tools: readonly ConnectedClientTool[]): ConnectedClientTool | null {
  return tools.find(tool => tool.family === 'admin_docs' || tool.provider === 'odoo') ?? null
}

/**
 * #2565.9 — LA PORTE, côté écran : prévisualiser puis valider la création
 * d'une facture PRÉPARÉE chez l'outil de gestion branché.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS MOTS DISTINCTS (doctrine, `invoice-connector-write.ts`) — CET écran
 * ne les confond jamais : `created` = la demande existe, RIEN n'est parti ;
 * `sent` = l'appel est parti, la réponse n'est pas là ; `invoiced` = le
 * connecteur a RÉPONDU avec une référence. Bellum SUIT le financier, il ne
 * comptabilise pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN TIMEOUT N'EST PAS UN ÉCHEC
 * ─────────────────────────────────────────────────────────────────────────
 * `unknown` arrête la reprise : AUCUN bouton n'est rendu dans cette branche —
 * seul un humain qui a vérifié dans l'outil connecté peut trancher. `failed`,
 * lui, est REJOUABLE (rien n'est jamais parti) : le bouton réapparaît, sous
 * son libellé tutoyé (« Réessaie », jamais « Réessayez »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE EST UN CLIC EXPLICITE, JAMAIS UN ENVOI AU MONTAGE
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier clic ouvre une prévisualisation FIGÉE (mission, compte, mois,
 * montant préparatoire) ; seul le clic sur « Valider », dans la boîte, envoie
 * réellement `POST /delivery/invoice-connector/send`. Aucun outil branché ⇒
 * la réponse du serveur (« aucun outil de gestion connecté ») s'affiche TELLE
 * QUELLE, sur l'écran — jamais un état inventé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2565.10 — CE QUI PART EST UN BROUILLON, ET L'ÉCRAN LE DIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier adaptateur branché (Odoo, `odoo-draft-invoice.port.ts`) dépose
 * un BROUILLON de facture client — jamais validé, jamais envoyé. La
 * prévisualisation dit donc ce qui sera ÉCRIT (client, ligne jours × TJM,
 * montant HT) et que l'utilisateur le valide LUI-MÊME dans son outil :
 * « Bellum n'émet aucune facture » reste vrai, il prépare un brouillon.
 * En DÉMONSTRATION (craft rule n°9), le geste s'ouvre à l'identique mais le
 * bouton « Valider » n'existe pas : la boîte dit que la démo n'écrit dans
 * aucun outil, et aucune requête d'écriture ne part.
 *
 * Le mois n'est proposé QUE si la préparation est prête (`readyToSend`) : un
 * bouton qui échouerait à coup sûr contre `invoice-readiness` (mois bloqué ou
 * non dû) n'est pas montré. L'état d'une écriture DÉJÀ tentée, lui, reste
 * visible quel que soit l'état de préparation courant — il ne s'invente pas
 * en silence.
 */
function InvoiceConnectorGate({
  missionId,
  periodMonth,
  missionLabel,
  accountName,
  legalEntityName,
  days,
  dailyRateCents,
  preparedAmountCents,
  poNumber,
  canReadFinance,
  readyToSend,
}: {
  missionId: string
  /** `YYYY-MM-01` — même forme que `sendInvoiceConnectorWriteSchema.periodMonth`,
   *  jamais tronquée : contrairement aux mutations de lecture de
   *  `InvoiceReadinessPanel`, cette route ne prend PAS `YYYY-MM`. */
  periodMonth: string
  missionLabel: string | null
  accountName: string | null
  /** #2197.29 — l'ENTITÉ qui émet (`InvoiceReadiness.legalEntityName`), déjà
   *  sa propre colonne du tableau (#2197.9) mais absente de CETTE
   *  prévisualisation : la société facturante manquait au premier des huit
   *  champs que la préparation doit montrer avant le dépôt. `null` = aucun
   *  rattachement, jamais une raison sociale inventée. */
  legalEntityName: string | null
  /** #2565.10 — la LIGNE écrite : jours × TJM. `null` = non renseigné. */
  days: number | null
  dailyRateCents: number | null
  preparedAmountCents: number | null
  /** #2197.34 — le bon de commande EN COURS (`InvoiceReadiness.poNumber`),
   *  pour le nommer dans les RÉFÉRENCES de la prévisualisation, comme le
   *  docblock du contrat le prévoyait déjà. `null` = non renseigné, jamais
   *  une valeur inventée. */
  poNumber: string | null
  canReadFinance: boolean
  readyToSend: boolean
}) {
  const { t } = useTranslation('missions')
  const demo = useIsDemo()
  const queryClient = useQueryClient()
  // H25 (#2565.10) — MIROIR du droit exigé côté SERVEUR sur la route
  // d'écriture (`@RequirePermission('finance:write')`,
  // `invoice-connector-write.controller.ts`) : même convention que
  // `FinanceScreen.tsx` (`canEditTarget`). Un bouton qui promet un geste
  // impossible est une fausse affordance — sans ce droit, il ne se rend pas.
  const { team } = useTeam()
  const canWriteFinance = team ? hasPermission(team.workspace.role, 'finance:write') : false
  const queryKey = ['missions', missionId, 'invoice-connector', periodMonth] as const
  const { data: write, isError: writeError } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<InvoiceConnectorWriteRequestView | null>({
        path: `/delivery/invoice-connector/${missionId}/${periodMonth}`,
      }),
  })
  const { tools } = useConnectedCapabilities()
  const tool = connectedInvoicingTool(tools)
  const toolName = tool?.name ?? t('readiness.connector.toolGeneric')

  const [previewOpen, setPreviewOpen] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: () =>
      apiFetch<InvoiceConnectorWriteRequestView>({
        path: '/delivery/invoice-connector/send',
        method: 'POST',
        body: { missionId, periodMonth },
      }),
    onSuccess: result => {
      setSendError(null)
      setPreviewOpen(false)
      queryClient.setQueryData(queryKey, result)
    },
    onError: (error: Error) => {
      // #2565.9 — « Aucun outil branché = un refus honnête, pas un écran
      // vide » : le message du serveur s'affiche TEL QUEL, jamais reformulé
      // ni remplacé par un texte générique — c'est lui qui nomme la vraie
      // raison (« aucun outil de gestion connecté », « une tentative
      // précédente est SANS RÉPONSE »…).
      setSendError(error.message || t('readiness.connector.sendError'))
      setPreviewOpen(false)
    },
  })

  if (writeError) {
    return (
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('readiness.connector.loadError')}
      </Text>
    )
  }

  const state = write?.state ?? null
  // #2565.9 — GARDE-FOU : `unknown` et `created`/`sent` ne rendent AUCUN
  // bouton, dans AUCUNE branche ci-dessous — c'est la preuve que ce composant
  // ne propose jamais de reprise automatique sur une écriture dont la réponse
  // s'est perdue.
  const canAttempt = (state === null || state === 'failed') && readyToSend

  return (
    <Box className="space-y-1">
      {state === 'invoiced' ? (
        <Badge variant="secondary">
          {t('readiness.connector.invoiced', { reference: write?.invoiceReference ?? '', tool: toolName })}
        </Badge>
      ) : state === 'unknown' ? (
        <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
          {t('readiness.connector.unknown')}
        </Text>
      ) : state === 'created' || state === 'sent' ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.connector.inProgress')}
        </Text>
      ) : null}

      {state === 'failed' && write?.detail ? (
        <Text element="p" size="xs" className="text-[var(--danger-soft-text)]">
          {t('readiness.connector.failedDetail', { detail: write.detail })}
        </Text>
      ) : null}

      {canAttempt ? (
        canWriteFinance ? (
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
            {state === 'failed' ? t('readiness.connector.retry') : t('readiness.connector.cta', { tool: toolName })}
          </Button>
        ) : (
          // H25 — on retire le GESTE, pas l'information : même convention
          // que `RexScreen.tsx` (`!canWrite`) — la raison de l'absence de
          // bouton se lit à sa place, jamais un champ silencieusement caché.
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('readiness.connector.noWriteRight')}
          </Text>
        )
      ) : null}

      {sendError ? (
        <Text element="p" role="alert" size="xs" className="text-[var(--danger-soft-text)]">
          {sendError}
        </Text>
      ) : null}

      {previewOpen ? (
        <Dialog open onOpenChange={open => !open && setPreviewOpen(false)}>
          <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('readiness.connector.previewTitle')}</DialogTitle>
              <DialogDescription>{t('readiness.connector.previewHint', { tool: toolName })}</DialogDescription>
            </DialogHeader>
            <Box className="space-y-1">
              {/* #2197.29 — l'ENTITÉ, en tête de la prévisualisation comme la
                  spécification l'ordonne : même libellé et même absence que
                  la colonne « Société facturante » du tableau (#2197.9), un
                  réglage vivant à un seul endroit (GA-26). */}
              <ConnectorPreviewLine
                label={t('readiness.table.legalEntity')}
                value={legalEntityName ?? t('readiness.table.legalEntityUnknown')}
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewMission')}
                value={missionLabel ?? t('unknownMission')}
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewAccount')}
                value={accountName ?? t('unknownAccount')}
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewMonth')}
                value={formatMonth(periodMonth.slice(0, 7)) ?? periodMonth}
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewLine')}
                value={
                  days !== null && dailyRateCents !== null
                    ? t('readiness.connector.lineValue', { days, rate: formatCents(dailyRateCents) })
                    : t('readiness.connector.lineUnknown')
                }
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewAmount')}
                value={
                  !canReadFinance
                    ? t('readiness.table.financeHiddenShort')
                    : preparedAmountCents !== null
                      ? formatCents(preparedAmountCents)
                      : t('readiness.connector.amountUnknown')
                }
              />
              <ConnectorPreviewLine
                label={t('readiness.connector.previewReference')}
                value={poNumber ?? t('readiness.connector.previewReferenceUnknown')}
              />
            </Box>
            {/* #2814 — les pièces jointes de la facture PRÉPARÉE (bon de
                commande signé, relevé, PV) : rangées par mission et par mois,
                jamais envoyées d'ici. Le dialogue n'est ouvert qu'avec
                `finance:write`, donc la lecture (`finance:read`) est acquise. */}
            <InvoiceAttachments
              missionId={missionId}
              periodMonth={periodMonth}
              canWrite={canWriteFinance}
              demo={demo}
            />
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('readiness.connector.previewTaxes', { tool: toolName })}
            </Text>
            {demo ? (
              <Text element="p" role="status" size="xs" weight="medium">
                {t('readiness.connector.demoNotice')}
              </Text>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
                {t('readiness.connector.cancel')}
              </Button>
              {/* #2565.10 — en démonstration, AUCUN bouton d'écriture : la
                  démo montre ce qui partirait, elle n'écrit dans aucun outil. */}
              {demo ? null : (
                <Button disabled={send.isPending} onClick={() => send.mutate()}>
                  {t('readiness.connector.confirm')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Box>
  )
}

function ConnectorPreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" className="items-center justify-between gap-2">
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="span" size="xs" weight="medium">
        {value}
      </Text>
    </Box>
  )
}

/**
 * Les FRAIS d'une mission (30/08/2026) — la ligne que la marge ignorait.
 *
 * Monté seulement quand on est déjà PASSÉ la porte `finance:read` de
 * `TermsTab` (son retour anticipé au-dessus) : un montant de frais est un coût,
 * il se garde comme le coût chargé.
 *
 * Édition volontairement MINIMALE : le montant, seul champ que
 * `MissionExpensesService.update` protège (« une correction humaine gagne
 * toujours »). Libellé et date ne se corrigent pas ici — une ligne mal saisie
 * se refait, elle se garde d'être un second formulaire complet pour un besoin
 * qui n'existe pas encore.
 */
function ExpensesSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data: expenses, isError } = useMissionExpenses(missionId)
  const createExpense = useCreateMissionExpense(missionId)
  const updateExpense = useUpdateMissionExpense(missionId)

  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  const canAdd = label.trim().length > 0 && amount.trim().length > 0 && date.trim().length > 0

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text element="p" size="sm" weight="medium">
        {t('finance.expenses.title')}
      </Text>

      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('finance.expenses.loadError')}
        </Text>
      ) : !expenses || expenses.length === 0 ? (
        <Text size="xs" color="text-muted-foreground">
          {t('finance.expenses.empty')}
        </Text>
      ) : (
        <Box className="space-y-1">
          {expenses.map(expense => {
            const editingThis = editingId === expense.id
            return (
              <Box
                key={expense.id}
                display="flex"
                className="items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <Box className="min-w-0">
                  <Text element="span" size="xs" weight="medium">
                    {expense.label}
                  </Text>
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {formatDate(expense.expenseDate) ?? expense.expenseDate}
                  </Text>
                </Box>
                {editingThis ? (
                  <Box display="flex" className="items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={editAmount}
                      onChange={event => setEditAmount(event.target.value)}
                      aria-label={t('finance.expenses.amountLabel')}
                      className="max-w-[100px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={updateExpense.isPending}
                      onClick={() => {
                        const euros = Number(editAmount.replace(',', '.'))
                        if (!Number.isFinite(euros) || euros <= 0) return
                        updateExpense.mutate(
                          { expenseId: expense.id, input: { amountCents: Math.round(euros * 100) } },
                          { onSuccess: () => setEditingId(null) },
                        )
                      }}
                    >
                      {t('finance.expenses.save')}
                    </Button>
                  </Box>
                ) : (
                  <Box display="flex" className="items-center gap-2">
                    <Text element="span" size="xs">
                      {formatCents(expense.amountCents)}
                    </Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(expense.id)
                        setEditAmount(String(Math.round(expense.amountCents / 100)))
                      }}
                    >
                      {t('finance.expenses.edit')}
                    </Button>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      <Box display="flex" className="flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={event => setLabel(event.target.value)}
          placeholder={t('finance.expenses.labelPlaceholder')}
          aria-label={t('finance.expenses.labelLabel')}
          className="max-w-[200px]"
        />
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder={t('finance.expenses.amountPlaceholder')}
          aria-label={t('finance.expenses.amountLabel')}
          className="max-w-[120px]"
        />
        <Input
          type="date"
          value={date}
          onChange={event => setDate(event.target.value)}
          aria-label={t('finance.expenses.dateLabel')}
          className="max-w-[160px]"
        />
        <Button
          variant="outline"
          size="sm"
          isLoading={createExpense.isPending}
          disabled={!canAdd}
          onClick={() => {
            const euros = Number(amount.replace(',', '.'))
            if (!Number.isFinite(euros) || euros <= 0) return
            createExpense.mutate(
              { label: label.trim(), amountCents: Math.round(euros * 100), expenseDate: date },
              {
                onSuccess: () => {
                  setLabel('')
                  setAmount('')
                  setDate('')
                },
              },
            )
          }}
        >
          {t('finance.expenses.add')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * Les deux scores de la mission — et JAMAIS un score nu.
 * `ScoreBlock` porte la discipline (lot MISSIONS-A, « aucun score en points ») : le niveau et chaque axe en MOTS,
 * ce qui n'a pas pu
 * être évalué est NOMMÉ (pas compté), et sous trois axes évaluables il n'y a
 * pas de note. Ce n'est PAS une probabilité — aucun de ces axes n'est calibré
 * contre un résultat observé.
 *
 * Un 403 (« pas `finance:read` ») ne se rend pas comme « aucun score » : la
 * seconde phrase enverrait chercher une donnée manquante qui ne manque pas.
 */
function ScoresTab({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data, isLoading, isError } = useMissionScores(missionId)

  if (isLoading) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('scores.noAccess')}
      </Text>
    )
  }

  return (
    <Box className="space-y-4">
      <ScoreBlock title={t('scores.riskTitle')} score={data?.risk ?? null} tone="risk" />
      <ScoreBlock title={t('scores.opportunityTitle')} score={data?.opportunity ?? null} tone="opportunity" />
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('scores.hint')}
      </Text>
      {/* Théo C missions-dossier.A5 / N7 — la dérive de CETTE mission (ex-/missions/suivi) et, à défaut,
          l'état vide qui dit ce qu'il ne sait pas. */}
      <MissionDriftPanel missionId={missionId} />
    </Box>
  )
}

/**
 * Point propre du lot MISSIONS-A (23/10) — « AUCUN SCORE EN POINTS ». La note du service (0-100) se lit en
 * MOTS : un tiers par niveau. Le seuil est une convention de LECTURE (la donnée ne change pas) ; il vit ici,
 * à un seul endroit.
 */
const SCORE_LEVEL_BOUNDS = { low: 34, high: 67 } as const
type ScoreLevel = 'low' | 'medium' | 'high'

function scoreLevel(value: number): ScoreLevel {
  if (value >= SCORE_LEVEL_BOUNDS.high) return 'high'
  if (value >= SCORE_LEVEL_BOUNDS.low) return 'medium'
  return 'low'
}

function ScoreBlock({
  title,
  score,
  tone,
}: {
  title: string
  score: MissionScore | null
  /** Un risque élevé alerte, une opportunité élevée réjouit : la couleur dit l'état, jamais le chiffre. */
  tone: 'risk' | 'opportunity'
}) {
  const { t } = useTranslation('missions')
  const level = score?.score == null ? null : scoreLevel(score.score)
  const variant =
    level === null ? 'secondary' : level === 'high' ? (tone === 'risk' ? 'warning' : 'success') : 'secondary'
  return (
    <section aria-label={title} className="space-y-2 rounded-card border border-border p-4">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="h3" size="sm" weight="medium">
          {title}
        </Text>
        {level ? <Badge variant={variant}>{t(`scores.level.${level}`)}</Badge> : null}
      </Box>
      {score && score.score !== null ? (
        <ul className="space-y-1">
          {score.evaluated.map(entry => (
            <li key={entry.axis}>
              <Text element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('scores.axisLevel', {
                  axis: t(`scores.axes.${entry.axis}`),
                  level: t(`scores.levelLower.${scoreLevel(entry.value)}`),
                })}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <UnknownValue reason={t('scores.notComputed')} />
      )}
      {/* Un axe non évaluable est NOMMÉ : il ne vaut pas « faible », il n'a pas pu être lu. */}
      {score && score.notEvaluable.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('scores.notEvaluable', {
            axes: score.notEvaluable.map(axis => t(`scores.axes.${axis}`)).join(', '),
          })}
        </Text>
      ) : null}
    </section>
  )
}

/**
 * Les FACTURES ENTRANTES d'un sous-traitant (30/08/2026) — distinctes de la
 * facturation CLIENT.
 *
 * Comme `ExpensesSection`, monté seulement une fois passée la porte
 * `finance:read` de `TermsTab`. Le STATUT se change par un `<select>` : c'est
 * un cycle de vie, pas une valeur qu'une correction humaine dispute — pas
 * d'arbitrage de provenance ici, contrairement au montant.
 */
function SupplierInvoicesSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data: invoices, isError } = useSupplierInvoices(missionId)
  const createInvoice = useCreateSupplierInvoice(missionId)
  const setStatus = useSetSupplierInvoiceStatus(missionId)

  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')

  const canAdd = reference.trim().length > 0 && amount.trim().length > 0 && date.trim().length > 0

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text element="p" size="sm" weight="medium">
        {t('finance.supplierInvoices.title')}
      </Text>

      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('finance.supplierInvoices.loadError')}
        </Text>
      ) : !invoices || invoices.length === 0 ? (
        <Text size="xs" color="text-muted-foreground">
          {t('finance.supplierInvoices.empty')}
        </Text>
      ) : (
        <Box className="space-y-1">
          {invoices.map(invoice => (
            <Box
              key={invoice.id}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <Box className="min-w-0">
                <Text element="span" size="xs" weight="medium">
                  {invoice.reference}
                </Text>
                <Text element="p" size="xs" color="text-muted-foreground">
                  {formatDate(invoice.invoiceDate) ?? invoice.invoiceDate}
                </Text>
              </Box>
              <Box display="flex" className="items-center gap-2">
                <Text element="span" size="xs">
                  {formatCents(invoice.amountCents)}
                </Text>
                <SelectField
                  ariaLabel={t('finance.supplierInvoices.statusLabel')}
                  value={invoice.status}
                  onChange={next => setStatus.mutate({ invoiceId: invoice.id, status: next as SupplierInvoiceStatus })}
                  options={SUPPLIER_INVOICE_STATUSES.map(status => ({
                    value: status,
                    label: t(`finance.supplierInvoices.statuses.${status}`),
                  }))}
                  disabled={setStatus.isPending}
                  className="min-w-0 max-w-full"
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box display="flex" className="flex-wrap items-center gap-2">
        <Input
          value={reference}
          onChange={event => setReference(event.target.value)}
          placeholder={t('finance.supplierInvoices.referencePlaceholder')}
          aria-label={t('finance.supplierInvoices.referenceLabel')}
          className="max-w-[200px]"
        />
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder={t('finance.supplierInvoices.amountPlaceholder')}
          aria-label={t('finance.supplierInvoices.amountLabel')}
          className="max-w-[120px]"
        />
        <Input
          type="date"
          value={date}
          onChange={event => setDate(event.target.value)}
          aria-label={t('finance.supplierInvoices.dateLabel')}
          className="max-w-[160px]"
        />
        <Button
          variant="outline"
          size="sm"
          isLoading={createInvoice.isPending}
          disabled={!canAdd}
          onClick={() => {
            const euros = Number(amount.replace(',', '.'))
            if (!Number.isFinite(euros) || euros <= 0) return
            createInvoice.mutate(
              { reference: reference.trim(), amountCents: Math.round(euros * 100), invoiceDate: date },
              {
                onSuccess: () => {
                  setReference('')
                  setAmount('')
                  setDate('')
                },
              },
            )
          }}
        >
          {t('finance.supplierInvoices.add')}
        </Button>
      </Box>
    </Box>
  )
}
