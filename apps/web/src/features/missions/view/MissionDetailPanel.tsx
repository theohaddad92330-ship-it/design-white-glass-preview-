import {
  clientToolName,
  formatPhoneForDisplay,
  missionRiskSeverity,
  selectableEntities,
  type MissionAssignment,
  type MissionRisk,
  type MissionRiskSeverity,
} from '@bellum/contracts'
import { Badge, Box, Button, Input, MOTION, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ExternalLink, Mail, Phone, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { appLocale, formatDate } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { useLegalEntities } from '@/features/legal-entities/api'
import { useAssign, useMissionAssignments, useMissionTerms, useUnassign, type MissionView } from '../api'
import {
  useAccountContacts,
  useMissionPanel,
  useResolveMissionRisk,
  useSetCraContact,
  useSetClientManager,
  type LinkedCrmDeal,
  type MissionDeliveryContact,
  type MissionEntitySummary,
  useUpdateMission,
} from './mission-panel.api'
import { PoConsumptionBar } from './PoConsumptionBar'

/**
 * LE PANNEAU LATÉRAL DE PLANIFICATION — « Mission sélectionnée » (PDF-22 §7,
 * l.112-124 : « à garder — le diagramme temporel avec sa ligne "aujourd'hui",
 * les pastilles de qualité de donnée au-dessus de la liste de travail, la
 * barre "28/50 jours" du bon de commande, les trois contacts (consultant,
 * chargé d'affaires, celui qui valide le relevé), les conditions de
 * règlement, la prochaine étape avec son niveau d'impact »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * La maquette source montre quatre onglets — Détails · Documents · Activité ·
 * Tâches. Seul « Détails » a une donnée réelle derrière lui dans ce dépôt :
 * « Documents » n'existe nulle part (aucune table, aucun stockage de fichier
 * par mission), et « Tâches » n'est pas un domaine — la seule chose qui s'en
 * approche est CE panneau, la prochaine étape suggérée. Construire deux
 * onglets vides aurait été le genre d'écran qui promet une capacité que le
 * produit n'a pas ; ce panneau rend donc UN contenu, sans chrome d'onglets
 * qui ne mènerait nulle part. « Activité » existe déjà, ailleurs : c'est
 * l'onglet « Historique » du dossier complet, un clic plus loin.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉUTILISE, ET CE QU'IL N'A PAS RECALCULÉ
 * ─────────────────────────────────────────────────────────────────────────
 *  - `useMissionTerms` (`api.ts`) — coût chargé, marge, bon de commande,
 *    facturation. Le MÊME hook que `MissionDetailTabs`, jamais une seconde
 *    lecture des conditions commerciales (GA-83, GA-26).
 *  - `missionRiskSeverity` (`@bellum/contracts`) — la prochaine étape se lit
 *    sur `mission.risks`, DÉJÀ servi par `GET /delivery/missions` et DÉJÀ
 *    rédigé selon le droit financier du lecteur ; ce panneau ne recalcule
 *    aucun risque, il pose seulement la SÉVÉRITÉ (#2411.8, épopée #2881)
 *    dessus.
 *  - `PoConsumptionBar` (`PoConsumptionBar.tsx`) — le MÊME composant que
 *    `MissionDetailTabs.tsx` monte désormais lui aussi (01/09/2026) ; voir sa
 *    doc pour l'historique de la copie qu'il portait avant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE SEUL CHAMP FINANCIER GARDÉ EST LE TJM FREELANCE, PAS LE TJM CLIENT
 * ─────────────────────────────────────────────────────────────────────────
 * `mission.daily_rate` (le TJM VENDU) n'est délibérément PAS derrière
 * `finance:read` ailleurs dans le produit (`mission.ts`, doctrine D43 et
 * suivantes : « deux relectures indépendantes l'ont signalé comme une fuite,
 * mesuré FAUX les deux fois — le prix de VENTE est visible, ce sont les
 * ENTRÉES de la marge qui se gardent »). Ce panneau suit cette règle déjà
 * éprouvée plutôt que de la rouvrir : le TJM client s'affiche toujours, le
 * TJM freelance (= `loadedDailyCostCents`, ce qu'on PAIE) suit le même droit
 * que le reste des conditions commerciales.
 */
export function MissionDetailPanel({ mission, onClose }: { mission: MissionView; onClose: () => void }) {
  const { t } = useTranslation('missions')
  const { t: tp } = useTranslation('accountMissions')

  const panel = useMissionPanel(mission.id)
  const terms = useMissionTerms(mission.id)
  const resolveRisk = useResolveMissionRisk(mission.id)

  const risks = mission.risks ?? []
  const primaryRisk: MissionRisk | undefined = risks[0]
  // Un simple mappage sur le risque déjà calculé : pas de raison de le
  // mémoïser, `missionRiskSeverity` ne fait qu'une lecture de table.
  const severity = missionRiskSeverity(risks)

  return (
    <motion.div
      key={mission.id}
      {...MOTION.reveal}
      role="region"
      aria-label={tp('planningPanel.title')}
      // ⚠️ Pas de `overflow-y-auto` ICI : le panneau flotte dans le flux normal
      // de la page, qui porte SEULE le défilement vertical. Deux conteneurs
      // défilants imbriqués — la page et ce panneau — sont exactement le piège
      // qu'une frise horizontale À CÔTÉ d'un panneau latéral tend.
      className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4 md:w-96 md:shrink-0"
    >
      <Box display="flex" className="items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text element="p" size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
            {tp('planningPanel.title')}
          </Text>
          <Text element="h2" size="lg" weight="semibold" className="truncate">
            {mission.label || t('planning.unnamedMission')}
          </Text>
          <Box display="flex" className="items-center gap-2">
            <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]" className="truncate">
              {mission.accountName ?? t('unknownAccount')}
            </Text>
            <Badge variant="secondary">{t(`status.${mission.status}`)}</Badge>
          </Box>
        </Box>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={tp('planningPanel.close')}
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </Box>

      {/* #2194.32 — « Renseigner la date » : n'apparaît QUE si une date
          manque. `updateMissionRequestSchema` porte déjà `startedOn`/`endsOn`
          (mission.ts:1006-1007, le chemin « compléter la fiche »/#1518) ;
          aucun écran ne l'appelait pour les dates. */}
      <MissionDatesSection tp={tp} mission={mission} />

      <EntitySection tp={tp} entity={panel.data?.entity} isLoading={panel.isLoading} />

      <CrmDealSection tp={tp} deal={panel.data?.crmDeal} />

      <FinanceSection tp={tp} mission={mission} terms={terms.data} isLoading={terms.isPending} />

      <ContactsSection tp={tp} mission={mission} panel={panel.data} />

      <StaffingSection missionId={mission.id} />

      <NextStepSection
        tp={tp}
        risk={primaryRisk}
        severity={severity}
        missionId={mission.id}
        onResolve={risk => resolveRisk.mutate(risk)}
        resolving={resolveRisk.isPending}
      />

      <Box className="border-t border-border pt-3">
        <Button asChild size="sm" variant="outline" className="gap-1.5 pointer-coarse:min-h-11">
          <Link to="/missions/$id" params={{ id: mission.id }}>
            <ExternalLink className="size-4" aria-hidden />
            {tp('planningPanel.openDossier')}
          </Link>
        </Button>
      </Box>
    </motion.div>
  )
}

type T = (key: string, options?: Record<string, unknown>) => string

function SectionTitle({ children }: { children: string }) {
  return (
    <Text element="h3" size="sm" weight="semibold">
      {children}
    </Text>
  )
}

function EntitySection({
  tp,
  entity,
  isLoading,
}: {
  tp: T
  entity: MissionEntitySummary | null | undefined
  isLoading: boolean
}) {
  return (
    <Box className="space-y-1 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <SectionTitle>{tp('planningPanel.entity.title')}</SectionTitle>
      {isLoading ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {tp('planningPanel.finance.loading')}
        </Text>
      ) : !entity ? (
        <UnknownValue reason={tp('planningPanel.entity.unknownName')} />
      ) : (
        <Box className="space-y-0.5">
          <Text element="p" size="sm" weight="medium">
            {entity.name}
          </Text>
          {entity.address ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {entity.address}
            </Text>
          ) : (
            <UnknownValue reason={tp('planningPanel.entity.unknownAddress')} />
          )}
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {tp('planningPanel.entity.siren')} ·{' '}
            {entity.siren ?? (
              <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                {tp('planningPanel.entity.unknownSiren')}
              </Text>
            )}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * #2194.36 — MODIFIER UNE AFFECTATION DEPUIS LE PLANNING.
 *
 * `useAssign`/`assignmentInputSchema` existaient déjà (`api.ts`, `staffing.ts`)
 * — zéro écran ne les appelait ; seule la fiche complète LISAIT les
 * affectations (`MissionDetailTabs.tsx`, `StaffingTab`), jamais ce panneau, et
 * aucun des deux n'offrait de geste pour les CHANGER.
 *
 * Il n'existe aucune route de MISE À JOUR d'une affectation — `PUT
 * assignments` (`useAssign`) insère toujours une ligne. « Modifier » se
 * compose donc en RETIRANT l'ancienne (`useUnassign`, silencieux : ce n'est
 * jamais le geste que l'utilisateur voit finir) puis en RECRÉANT avec les
 * valeurs éditées (`useAssign`, qui porte le seul toast). Seuls le taux de
 * charge et les dates sont éditables ici ; tout le reste de l'affectation
 * (taux journalier, lieu, mode, consentement, documents, risques déclarés)
 * VOYAGE SANS PERTE vers la ligne recréée — sauf `dailyRateCents`, dont la clé
 * même est absente sans `finance:read` (jamais `null`, qui se lirait « aucun
 * taux saisi ») : la recopier telle quelle, `undefined` inclus, est ce qui
 * évite qu'un utilisateur sans droit finance efface silencieusement un taux
 * qu'il ne peut même pas voir.
 */
function StaffingSection({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { t: tc } = useTranslation('common')
  const { data: assignments, isError } = useMissionAssignments(missionId)
  const unassign = useUnassign(missionId)
  const assign = useAssign(missionId)

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <SectionTitle>{t('staffing.title')}</SectionTitle>
      {isError ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('staffing.loadError')}
        </Text>
      ) : !assignments || assignments.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('staffing.empty')}
        </Text>
      ) : (
        <Box className="space-y-2">
          {assignments.map(assignment => (
            <AssignmentRow
              key={assignment.id}
              t={t}
              tc={tc}
              assignment={assignment}
              unassign={unassign}
              assign={assign}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function AssignmentRow({
  t,
  tc,
  assignment,
  unassign,
  assign,
}: {
  t: T
  tc: T
  assignment: MissionAssignment
  unassign: ReturnType<typeof useUnassign>
  assign: ReturnType<typeof useAssign>
}) {
  const [editing, setEditing] = useState(false)
  const [loadPercent, setLoadPercent] = useState(String(assignment.loadPercent))
  const [startsOn, setStartsOn] = useState(assignment.startsOn)
  const [endsOn, setEndsOn] = useState(assignment.endsOn ?? '')
  const isSaving = unassign.isPending || assign.isPending
  const until = formatDate(assignment.endsOn)

  if (!editing) {
    return (
      <Box display="flex" className="items-center justify-between gap-2 rounded-md border border-border p-2">
        <Box className="min-w-0">
          <Text element="p" size="xs" weight="medium" className="truncate">
            {assignment.consultantName ?? t('staffing.unknownTalent')}
          </Text>
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {assignment.loadPercent} %
            {until ? ` · ${t('staffing.until', { date: until })}` : ` · ${t('staffing.openEnded')}`}
          </Text>
        </Box>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 pointer-coarse:min-h-11"
          onClick={() => {
            setLoadPercent(String(assignment.loadPercent))
            setStartsOn(assignment.startsOn)
            setEndsOn(assignment.endsOn ?? '')
            setEditing(true)
          }}
        >
          {tc('actions.edit')}
        </Button>
      </Box>
    )
  }

  const loadPercentValue = Number(loadPercent)
  const canSave =
    !isSaving &&
    Number.isInteger(loadPercentValue) &&
    loadPercentValue >= 1 &&
    loadPercentValue <= 100 &&
    Boolean(startsOn) &&
    (!endsOn || endsOn >= startsOn)

  return (
    <Box className="space-y-2 rounded-md border border-border p-2">
      <Text element="p" size="xs" weight="medium" className="truncate">
        {assignment.consultantName ?? t('staffing.unknownTalent')}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Input
          type="number"
          min={1}
          max={100}
          value={loadPercent}
          aria-label={t('staffing.loadPercentLabel')}
          onChange={event => setLoadPercent(event.target.value)}
          className="w-20"
        />
        <Input
          type="date"
          value={startsOn}
          aria-label={t('staffing.startsOnLabel')}
          onChange={event => setStartsOn(event.target.value)}
          className="max-w-[150px]"
        />
        <Input
          type="date"
          value={endsOn}
          aria-label={t('staffing.endsOnLabel')}
          onChange={event => setEndsOn(event.target.value)}
          className="max-w-[150px]"
        />
      </Box>
      <Box display="flex" className="items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={() => {
            unassign.mutate(assignment.id, {
              onSuccess: () =>
                assign.mutate(
                  {
                    consultantId: assignment.consultantId,
                    loadPercent: loadPercentValue,
                    startsOn,
                    endsOn: endsOn || null,
                    // Absente sans `finance:read` (jamais `null`) — recopiée telle
                    // quelle, `undefined` inclus, voir la doc du composant.
                    ...(assignment.dailyRateCents !== undefined ? { dailyRateCents: assignment.dailyRateCents } : {}),
                    workLocation: assignment.workLocation ?? null,
                    remoteMode: assignment.remoteMode ?? null,
                    consentGiven: assignment.consentGiven ?? null,
                    consentDate: assignment.consentDate ?? null,
                    documentsExpected: assignment.documentsExpected ?? null,
                    documentsReceived: assignment.documentsReceived ?? null,
                    declaredRisks: assignment.declaredRisks ?? null,
                  },
                  { onSuccess: () => setEditing(false) },
                ),
            })
          }}
        >
          {tc('actions.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          onClick={() => setEditing(false)}
        >
          {tc('actions.cancel')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * #2561 — la vente CRM rattachée à cette mission.
 *
 * ⚠️ Sans deal rattaché (`crmDeal === null`), AUCUNE section : à la différence
 * de l'entité cliente ci-dessus, un rattachement CRM est l'exception, pas la
 * règle — la quasi-totalité des missions n'ont aucun CRM connecté. Montrer un
 * « non renseigné » permanent sur chaque fiche serait un bruit qui cesse
 * d'être lu, pour une donnée que 100 % des missions n'ont pas AUJOURD'HUI.
 *
 * ⚠️ La CORRESPONDANCE se montre, elle ne se devine pas en silence : le nom de
 * l'outil vient de `clientToolName(deal.provider)` — jamais un littéral
 * « HubSpot » écrit ici. Un fournisseur hors de `CLIENT_TOOLS` (un cache
 * laissé par une intégration retirée) ne se nomme pas : on nomme la CAPACITÉ.
 */
function CrmDealSection({ tp, deal }: { tp: T; deal: LinkedCrmDeal | null | undefined }) {
  if (!deal) return null
  const toolName = clientToolName(deal.provider)
  const amount = deal.amount == null ? null : Number(deal.amount)
  return (
    <Box className="space-y-1 border-t border-border pt-3">
      <SectionTitle>{tp('planningPanel.crmDeal.title')}</SectionTitle>
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
        {toolName
          ? tp('planningPanel.crmDeal.correspondence', { tool: toolName })
          : tp('planningPanel.crmDeal.correspondenceUnknownTool')}
      </Text>
      <Box className="space-y-0.5">
        {deal.name ? (
          <Text element="p" size="sm" weight="medium">
            {deal.name}
          </Text>
        ) : (
          <UnknownValue reason={tp('planningPanel.crmDeal.unknownName')} />
        )}
        {(deal.stageLabel ?? deal.stage) ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {deal.stageLabel ?? deal.stage}
          </Text>
        ) : (
          <UnknownValue reason={tp('planningPanel.crmDeal.unknownStage')} />
        )}
        {amount == null ? (
          <UnknownValue reason={tp('planningPanel.crmDeal.unknownAmount')} />
        ) : (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {new Intl.NumberFormat(appLocale(), {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(amount)}
          </Text>
        )}
      </Box>
    </Box>
  )
}

function FinanceSection({
  tp,
  mission,
  terms,
  isLoading,
}: {
  tp: T
  mission: MissionView
  terms: ReturnType<typeof useMissionTerms>['data']
  isLoading: boolean
}) {
  const canReadFinance = terms?.canReadFinance === true
  const freelanceRateCents = terms?.terms?.loadedDailyCostCents ?? null

  return (
    <Box className="space-y-3 border-t border-border pt-3">
      <SectionTitle>{tp('planningPanel.finance.title')}</SectionTitle>

      {/* Le TJM CLIENT — jamais gardé, voir la doc du fichier. */}
      <Row
        label={tp('planningPanel.finance.clientRate')}
        value={mission.daily_rate === null ? null : formatCents(Math.round(mission.daily_rate * 100))}
        unknown={tp('planningPanel.finance.unknownRate')}
      />

      {isLoading ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {tp('planningPanel.finance.loading')}
        </Text>
      ) : !canReadFinance ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {tp('planningPanel.finance.noAccess')}
        </Text>
      ) : (
        <>
          <Row
            label={tp('planningPanel.finance.freelanceRate')}
            value={freelanceRateCents === null ? null : formatCents(freelanceRateCents)}
            unknown={tp('planningPanel.finance.unknownRate')}
          />

          <Box className="space-y-3 border-t border-border pt-3">
            <SectionTitle>{tp('planningPanel.billing.title')}</SectionTitle>
            <Row
              label={tp('planningPanel.billing.frequency')}
              value={
                terms?.terms?.billingCadence ? tp(`planningPanel.billing.cadences.${terms.terms.billingCadence}`) : null
              }
              unknown={tp('planningPanel.finance.unknownRate')}
            />
            <PaymentTermsRow tp={tp} terms={terms?.terms} />
          </Box>

          <Box className="space-y-3 border-t border-border pt-3">
            <SectionTitle>{tp('planningPanel.po.title')}</SectionTitle>
            <Row
              label={tp('planningPanel.po.number')}
              value={terms?.terms?.poNumber ?? null}
              unknown={tp('planningPanel.po.unknownNumber')}
            />
            <Row
              label={tp('planningPanel.po.date')}
              value={formatDate(terms?.terms?.poIssuedOn ?? null)}
              unknown={tp('planningPanel.po.unknownDate')}
            />
            <Row
              label={tp('planningPanel.po.amount')}
              value={
                terms?.terms?.poAmountCents === null || terms?.terms?.poAmountCents === undefined
                  ? null
                  : formatCents(terms.terms.poAmountCents)
              }
              unknown={tp('planningPanel.po.unknownAmount')}
            />
            <PoConsumptionBar terms={terms?.terms} />
          </Box>
        </>
      )}
    </Box>
  )
}

function PaymentTermsRow({
  tp,
  terms,
}: {
  tp: T
  terms: { paymentTermsDays?: number | null; paymentTermsBasis?: string | null } | null | undefined
}) {
  const days = terms?.paymentTermsDays ?? null
  const basis = terms?.paymentTermsBasis ?? null
  if (days === null) {
    return (
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
          {tp('planningPanel.billing.paymentTerms')}
        </Text>
        <UnknownValue reason={tp('planningPanel.billing.unknownPaymentTerms')} />
      </Box>
    )
  }
  const basisLabel = basis ? tp(`planningPanel.billing.basis.${basis}`) : ''
  return (
    <Row
      label={tp('planningPanel.billing.paymentTerms')}
      value={tp('planningPanel.billing.termsValue', { count: days, basis: basisLabel })}
      unknown={tp('planningPanel.billing.unknownPaymentTerms')}
    />
  )
}

function Row({ label, value, unknown }: { label: string; value: string | null; unknown: string }) {
  return (
    <Box display="flex" className="items-center justify-between gap-2">
      <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      {value === null ? (
        <UnknownValue reason={unknown} />
      ) : (
        <Text element="span" size="sm">
          {value}
        </Text>
      )}
    </Box>
  )
}

function ContactsSection({
  tp,
  mission,
  panel,
}: {
  tp: T
  mission: MissionView
  panel:
    | {
        consultant: MissionDeliveryContact | null
        businessManager: MissionDeliveryContact | null
        craValidator: MissionDeliveryContact | null
        /** #2836 — le manager client et l'identifiant désigné. */
        clientManager: MissionDeliveryContact | null
        clientManagerContactId: string | null
        /** L'e-mail du destinataire de la facture — le panneau ne rend que lui,
         *  pas une fiche contact : c'est ce qu'il faut pour dire OÙ part la
         *  facture, et rien de plus. */
        billingRecipientEmail: string | null
      }
    | undefined
}) {
  const [changingCra, setChangingCra] = useState(false)
  const [changingClientManager, setChangingClientManager] = useState(false)
  const [changingBilling, setChangingBilling] = useState(false)

  return (
    <Box className="space-y-3 border-t border-border pt-3">
      <SectionTitle>{tp('planningPanel.contacts.title')}</SectionTitle>
      <ContactRow label={tp('planningPanel.contacts.consultant')} contact={panel?.consultant} tp={tp} />
      <ContactRow label={tp('planningPanel.contacts.businessManager')} contact={panel?.businessManager} tp={tp} />
      <Box className="space-y-1">
        <ContactRow label={tp('planningPanel.contacts.craValidator')} contact={panel?.craValidator} tp={tp} />
        {changingCra ? (
          <CraContactPicker
            tp={tp}
            mission={mission}
            currentContact={panel?.craValidator ?? null}
            onDone={() => setChangingCra(false)}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-0 pointer-coarse:min-h-11 pointer-coarse:px-2"
            onClick={() => setChangingCra(true)}
          >
            {tp('planningPanel.contacts.changeCra')}
          </Button>
        )}
      </Box>

      {/* #2836 — LE MANAGER CLIENT : chez le client, qui encadre le
          consultant. Distinct du contact CRA (qui VALIDE le relevé) : deux
          rôles, deux colonnes, deux routes. */}
      <Box className="space-y-1">
        <ContactRow label={tp('planningPanel.contacts.clientManager')} contact={panel?.clientManager} tp={tp} />
        {changingClientManager ? (
          <ClientManagerPicker
            tp={tp}
            mission={mission}
            currentContactId={panel?.clientManagerContactId ?? null}
            onDone={() => setChangingClientManager(false)}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-0 pointer-coarse:min-h-11 pointer-coarse:px-2"
            onClick={() => setChangingClientManager(true)}
          >
            {tp('planningPanel.contacts.changeClientManager')}
          </Button>
        )}
      </Box>

      {/* LE CONTACT DE FACTURATION — distinct du contact CRA, et c'est tout le
          point : l'un VALIDE le relevé, l'autre REÇOIT la facture.
          Son absence est un bloqueur nommé (`missing_billing_contact`), et
          jusqu'ici aucun écran ne savait l'écrire : la colonne n'était
          renseignée qu'à la création. Un bloqueur sans geste laisse un mois
          bloqué pour toujours. */}
      <Box className="space-y-1">
        <Box display="flex" className="items-baseline justify-between gap-2">
          <Text size="xs" color="text-muted-foreground">
            {tp('planningPanel.contacts.billingContact')}
          </Text>
          {panel?.billingRecipientEmail ? (
            <Text size="sm" className="truncate">
              {panel.billingRecipientEmail}
            </Text>
          ) : (
            <UnknownValue reason={tp('planningPanel.contacts.billingContactHint')} />
          )}
        </Box>
        {changingBilling ? (
          <BillingContactPicker tp={tp} mission={mission} onDone={() => setChangingBilling(false)} />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-auto px-0 pointer-coarse:min-h-11 pointer-coarse:px-2"
            onClick={() => setChangingBilling(true)}
          >
            {tp('planningPanel.contacts.changeBillingContact')}
          </Button>
        )}
      </Box>

      {/* #1518 — LA SOCIÉTÉ QUI PORTE LA MISSION.
          `missions.legal_entity_id` existait, le panneau Finance la LIT et le
          filtre de pilotage FILTRE dessus — son seul écrivain était le semis de
          démo. En production, déclarer une seconde société dans les Réglages ne
          servait donc à rien : rien ne pouvait y rattacher une mission.
          Le bloc ne s'affiche QUE si l'espace a plusieurs sociétés actives :
          sur un espace mono-société, ce serait un réglage sans question. */}
      <BillingEntityRow tp={tp} mission={mission} />
    </Box>
  )
}

/**
 * LES DATES DE LA MISSION — #2194.32, « Renseigner la date ».
 *
 * ⚠️ Ce bloc ne s'affiche QUE s'il a quelque chose à réparer : les deux dates
 * connues ne méritent aucune ligne (« on n'affiche pas ce qu'on n'a pas »
 * pousse aussi loin que ça — un bloc d'édition pour une donnée déjà complète
 * est un bloc qu'on ne regarde jamais). C'est le PENDANT du Gantt : une barre
 * au bord `openStart`/`openEnd` (planning.ts) ouvre ce panneau au clic, et
 * c'est ICI que la date manquante se saisit.
 *
 * `useUpdateMission` (mission-panel.api.ts) écrit déjà `startedOn`/`endsOn`
 * (`updateMissionRequestSchema`, mission.ts:1006-1007) — le chemin « compléter
 * la fiche » qui nommait `missing_start_date` sans qu'AUCUN écran ne
 * l'appelle pour les dates. Motif déjà payé dans ce dépôt : du code juste que
 * personne n'appelait.
 */
function MissionDatesSection({ tp, mission }: { tp: T; mission: MissionView }) {
  if (mission.started_on && mission.ends_on) return null
  return (
    <Box className="space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <SectionTitle>{tp('planningPanel.dates.title')}</SectionTitle>
      {!mission.started_on ? <MissionDateField tp={tp} mission={mission} field="startedOn" /> : null}
      {!mission.ends_on ? <MissionDateField tp={tp} mission={mission} field="endsOn" /> : null}
    </Box>
  )
}

/** Un champ de date à la fois — début OU fin, jamais les deux dans le même
 *  état local : chacune s'édite et s'enregistre indépendamment. */
function MissionDateField({ tp, mission, field }: { tp: T; mission: MissionView; field: 'startedOn' | 'endsOn' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const update = useUpdateMission(mission.id)
  const label = field === 'startedOn' ? tp('planningPanel.dates.startedOnLabel') : tp('planningPanel.dates.endsOnLabel')
  const unknownReason =
    field === 'startedOn' ? tp('planningPanel.dates.startedOnUnknown') : tp('planningPanel.dates.endsOnUnknown')
  const fillLabel =
    field === 'startedOn' ? tp('planningPanel.dates.fillStartedOn') : tp('planningPanel.dates.fillEndsOn')

  if (!editing) {
    return (
      <Box display="flex" className="items-center justify-between gap-2">
        <UnknownValue reason={unknownReason} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          onClick={() => setEditing(true)}
        >
          {fillLabel}
        </Button>
      </Box>
    )
  }

  return (
    <Box display="flex" className="items-center gap-2">
      <Input
        type="date"
        value={draft}
        aria-label={label}
        onChange={event => setDraft(event.target.value)}
        className="max-w-[170px]"
      />
      <Button
        type="button"
        size="sm"
        disabled={!draft || update.isPending}
        onClick={() => update.mutate({ [field]: draft }, { onSuccess: () => setEditing(false) })}
      >
        {tp('planningPanel.dates.save')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={tp('planningPanel.dates.cancel')}
        className="pointer-coarse:min-h-11"
        onClick={() => setEditing(false)}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </Box>
  )
}

/**
 * La société de l'ESN qui porte la mission — et le geste pour la changer.
 *
 * ⚠️ Elle n'est JAMAIS pré-sélectionnée, même quand il n'y en a qu'une : une
 * raison sociale apparaîtrait sur des documents où personne ne l'a mise. Le
 * retour le demandait explicitement, et le contrat le disait déjà.
 */
function BillingEntityRow({ tp, mission }: { tp: T; mission: MissionView }) {
  const [changing, setChanging] = useState(false)
  const { data } = useLegalEntities()
  const entities = data ?? []
  const current = mission.legal_entity_id ?? null
  const options = selectableEntities(entities, current)
  const update = useUpdateMission(mission.id)

  // Une seule société déclarée (ou aucune) : il n'y a pas de question à poser.
  // Sauf si la mission en porte déjà une — il faut alors pouvoir la LIRE.
  if (options.length < 2 && !current) return null

  const carried = entities.find(entity => entity.id === current) ?? null

  return (
    <Box className="space-y-1">
      <Box display="flex" className="items-baseline justify-between gap-2">
        <Text size="xs" color="text-muted-foreground">
          {tp('planningPanel.contacts.billingEntity')}
        </Text>
        {carried ? (
          <Text size="sm" className="truncate">
            {carried.name}
          </Text>
        ) : (
          <UnknownValue reason={tp('planningPanel.contacts.billingEntityHint')} />
        )}
      </Box>
      {changing ? (
        <Box display="flex" className="items-center gap-2">
          <SelectField
            size="sm"
            className="min-w-0 max-w-full flex-1"
            ariaLabel={tp('planningPanel.contacts.chooseBillingEntity')}
            value={current ?? ''}
            emptyOption={{ label: tp('planningPanel.contacts.noneOption') }}
            options={options.map(entity => ({ value: entity.id, label: entity.name }))}
            onChange={next => update.mutate({ legalEntityId: next || null }, { onSuccess: () => setChanging(false) })}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            onClick={() => setChanging(false)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </Box>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto px-0 pointer-coarse:min-h-11 pointer-coarse:px-2"
          onClick={() => setChanging(true)}
        >
          {tp('planningPanel.contacts.changeBillingEntity')}
        </Button>
      )}
    </Box>
  )
}

/**
 * Le sélecteur du contact de facturation.
 *
 * Il écrit sur la MISSION (`PATCH /delivery/missions/:id`), là où le sélecteur
 * CRA écrit `cra_contact_id` : deux rôles, deux colonnes, deux routes. Le
 * serveur refuse un contact qui n'appartient pas au compte de la mission — la
 * liste ne propose donc que les contacts de ce compte.
 */
function BillingContactPicker({ tp, mission, onDone }: { tp: T; mission: MissionView; onDone: () => void }) {
  const contacts = useAccountContacts(mission.account_id)
  const update = useUpdateMission(mission.id)
  const [billingChoice, setBillingChoice] = useState(mission.billing_contact_id ?? '')

  return (
    <Box display="flex" className="items-center gap-2">
      {/* Le natif était NON CONTRÔLÉ (`defaultValue`) : il gardait sa propre
          idée de la valeur, indépendante de la mission. `SelectField` est
          contrôlé, d'où l'état local — il porte le choix affiché pendant que
          l'écriture part, et la mission reste la source au premier rendu. */}
      <SelectField
        size="sm"
        className="min-w-0 max-w-full flex-1"
        ariaLabel={tp('planningPanel.contacts.chooseBillingContact')}
        value={billingChoice}
        disabled={contacts.isLoading}
        emptyOption={{ label: tp('planningPanel.contacts.noneOption') }}
        options={(contacts.data ?? []).map(contact => ({ value: contact.id, label: contact.full_name }))}
        onChange={next => {
          setBillingChoice(next)
          update.mutate({ billingContactId: next || null }, { onSuccess: onDone })
        }}
      />
      <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onDone}>
        <X className="size-4" aria-hidden />
      </Button>
    </Box>
  )
}

function ContactRow({
  label,
  contact,
  tp,
}: {
  label: string
  contact: MissionDeliveryContact | null | undefined
  tp: T
}) {
  return (
    <Box className="space-y-0.5">
      <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      {!contact || (!contact.name && !contact.email && !contact.phone) ? (
        <UnknownValue reason={tp('planningPanel.contacts.unknown')} />
      ) : (
        <Box className="space-y-0.5">
          {contact.name ? (
            <Text element="p" size="sm" weight="medium">
              {contact.name}
            </Text>
          ) : null}
          {contact.email ? (
            <Box display="flex" className="items-center gap-1.5">
              <Mail className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
              <a href={`mailto:${contact.email}`} className="text-sm text-[var(--bellum-text-accent)] hover:underline">
                {contact.email}
              </a>
            </Box>
          ) : null}
          {contact.phone ? (
            <Box display="flex" className="items-center gap-1.5">
              <Phone className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
              {/* #3850.4 — le lien `tel:` garde l'E.164 compact, le TEXTE visible devient international lisible. */}
              <a href={`tel:${contact.phone}`} className="text-sm text-[var(--bellum-text-accent)] hover:underline">
                {formatPhoneForDisplay(contact.phone)}
              </a>
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

function CraContactPicker({
  tp,
  mission,
  currentContact,
  onDone,
}: {
  tp: T
  mission: MissionView
  currentContact: MissionDeliveryContact | null
  onDone: () => void
}) {
  const contacts = useAccountContacts(mission.account_id)
  const setCraContact = useSetCraContact(mission.id)
  const [craChoice, setCraChoice] = useState(currentContact?.email ?? '')

  return (
    <Box display="flex" className="items-center gap-2">
      <SelectField
        size="sm"
        className="min-w-0 max-w-full flex-1"
        ariaLabel={tp('planningPanel.contacts.chooseCra')}
        value={craChoice}
        disabled={contacts.isLoading}
        emptyOption={{ label: tp('planningPanel.contacts.noneOption') }}
        options={(contacts.data ?? []).map(contact => ({ value: contact.id, label: contact.full_name }))}
        onChange={next => {
          setCraChoice(next)
          setCraContact.mutate(next || null, { onSuccess: onDone })
        }}
      />
      <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onDone}>
        <X className="size-4" aria-hidden />
      </Button>
    </Box>
  )
}

/**
 * #2836 — le sélecteur du manager client. Ne propose que les contacts du
 * compte de la mission (le serveur refuse les autres), et part de
 * l'IDENTIFIANT désigné — jamais d'un e-mail qui ne correspond à aucune option.
 */
function ClientManagerPicker({
  tp,
  mission,
  currentContactId,
  onDone,
}: {
  tp: T
  mission: MissionView
  currentContactId: string | null
  onDone: () => void
}) {
  const contacts = useAccountContacts(mission.account_id)
  const setClientManager = useSetClientManager(mission.id, mission.account_id)
  const [choice, setChoice] = useState(currentContactId ?? '')

  return (
    <Box display="flex" className="items-center gap-2">
      <SelectField
        size="sm"
        className="min-w-0 max-w-full flex-1"
        ariaLabel={tp('planningPanel.contacts.chooseClientManager')}
        value={choice}
        disabled={contacts.isLoading}
        emptyOption={{ label: tp('planningPanel.contacts.noneOption') }}
        options={(contacts.data ?? []).map(contact => ({ value: contact.id, label: contact.full_name }))}
        onChange={next => {
          setChoice(next)
          setClientManager.mutate(next || null, { onSuccess: onDone })
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="pointer-coarse:min-h-11"
        aria-label={tp('planningPanel.contacts.closePicker')}
        onClick={onDone}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </Box>
  )
}

/**
 * #2411.8 (épopée #2881) — l'échelle DÉFINITIVE à six niveaux de
 * `missionRiskSeverity`. `resolved`/`information` ne sortent jamais de
 * `missionRiskSeverity` aujourd'hui (voir son docblock, `mission.ts`) mais la
 * table reste TOTALE sur `MissionRiskSeverity` : un futur appelant qui les
 * produirait ne tomberait pas dans un trou de variante.
 */
const NEXT_STEP_SEVERITY_VARIANT: Record<MissionRiskSeverity, 'danger' | 'warning' | 'info' | 'success' | 'outline'> = {
  information: 'info',
  watch: 'outline',
  at_risk: 'warning',
  critical: 'danger',
  resolved: 'success',
  unknown: 'outline',
}

function NextStepSection({
  tp,
  risk,
  severity,
  missionId,
  onResolve,
  resolving,
}: {
  tp: T
  risk: MissionRisk | undefined
  severity: MissionRiskSeverity | null
  missionId: string
  /** #2411.11 (reste, épopée #2881) — « Marquer comme traité ». */
  onResolve: (risk: MissionRisk) => void
  resolving: boolean
}) {
  return (
    <Box className="space-y-2 rounded-md border border-border bg-[var(--bg-surface-hover)] p-3">
      <Box display="flex" className="items-center justify-between gap-2">
        <SectionTitle>{tp('planningPanel.nextStep.title')}</SectionTitle>
        {severity ? (
          <Badge variant={NEXT_STEP_SEVERITY_VARIANT[severity]}>
            {tp(`planningPanel.nextStep.severity.${severity}`)}
          </Badge>
        ) : null}
      </Box>
      {!risk ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {tp('planningPanel.nextStep.empty')}
        </Text>
      ) : (
        <>
          <Text size="sm">{tp(`planningPanel.nextStep.risks.${risk}`)}</Text>
          <Box display="flex" className="flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/missions/$id" params={{ id: missionId }}>
                {tp('planningPanel.nextStep.openCta')}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              disabled={resolving}
              onClick={() => onResolve(risk)}
            >
              {tp('planningPanel.nextStep.resolveCta')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}
