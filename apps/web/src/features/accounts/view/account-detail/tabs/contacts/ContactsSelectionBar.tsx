import type { Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { CalendarPlus, Download, ListChecks, Sparkles, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { useAddContactsToPlan } from '@/features/contacts/hooks/useAddContactsToPlan'
import { useAssignContacts } from '@/features/contacts/hooks/useAssignContacts'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { planBulkEnrichment } from '@/features/contacts/lib/enrichBilling'
import { bulkEnrichmentSummaryOf, type BulkEnrichmentOutcome } from '@/features/contacts/lib/enrichSummary'
import {
  AssignSelectionMenu,
  type ContactAssignTarget,
} from '@/features/contacts/view/contacts-list/ContactSelectionPanel'
import { CreateSequenceDialog } from '@/features/outreach/view/CreateSequenceDialog'
import { CrmPushDialog } from '@/features/crm/view/CrmPushDialog'
import { downloadCSV, generateCSV } from '@/lib/export-csv'
import { useDataExit } from '@/lib/data-exit'
import { buildPlanViewData } from '../plan/planViewData'

type ContactsSelectionBarProps = {
  /** Les contacts cochés, tels que le dossier les porte. */
  selectedContacts: readonly Contact[]
  /** Nom du compte — clé de repli de l'enrichissement et nom du fichier exporté. */
  accountCompanyName: string
  /**
   * R15-9 (recette du 15/09/2026, prod `5ca597d5a`) — CE QUE LE GESTE RETIENT,
   * ET SON NOM.
   *
   * Elle s'appelait `visibleCount` et son libellé disait « les 2027 contacts
   * AFFICHÉS », sous une liste qui en rendait 116 : un export CSV ou une
   * attribution serait parti sur deux mille personnes dont l'utilisateur en
   * avait vu cent seize. Le geste, lui, était juste — il porte sur ce que les
   * FILTRES retiennent, pas sur ce que l'écran rend. Le nom et le libellé le
   * disent maintenant tous les deux.
   */
  matchingCount: number
  onSelectAllMatching: () => void
  onClear: () => void
  /** #2123.80 — le dossier, pour préremplir l'objectif de la séquence. */
  rawAnalysis?: Record<string, unknown>
  /** #4188 — le compte de la fiche : « ce compte et ces contacts, je les envoie ». */
  accountId?: string
}

/** Le nombre de fonctions nommées dans l'audience préremplie. */
const AUDIENCE_TITLES_MAX = 3

type SequencePrefill = {
  source: 'account'
  objective?: string
  persona?: string
  channels?: ('email' | 'linkedin' | 'phone')[]
}

/**
 * #2123.80 — ce que le dossier sait de la séquence à préparer, et rien de plus.
 *
 *  - l'objectif : celui de la première phase du plan qui en porte un ;
 *  - l'audience : les fonctions des contacts cochés, dans l'ordre de sélection ;
 *  - les canaux : ceux que la sélection permet réellement.
 *
 * Une donnée absente n'est pas posée — aucun objectif générique, aucune
 * fonction devinée. Le compte, lui, part comme nom de la séquence.
 */
function sequencePrefill(
  contacts: readonly Contact[],
  rawAnalysis: Record<string, unknown> | undefined,
): SequencePrefill {
  const prefill: SequencePrefill = { source: 'account' }
  const objective = rawAnalysis
    ? buildPlanViewData(rawAnalysis)
        .planWeeks.map(week => week.objective?.trim() ?? '')
        .find(Boolean)
    : undefined
  if (objective) prefill.objective = objective
  const titles = [...new Set(contacts.map(contact => contact.title?.trim() ?? '').filter(Boolean))]
  if (titles.length > 0) prefill.persona = titles.slice(0, AUDIENCE_TITLES_MAX).join(', ')
  const channels = (['email', 'linkedin', 'phone'] as const).filter(channel =>
    contacts.some(contact =>
      Boolean(channel === 'email' ? contact.email : channel === 'linkedin' ? contact.linkedin_url : contact.phone),
    ),
  )
  if (channels.length > 0) prefill.channels = [...channels]
  return prefill
}

/**
 * #2120.71-75 (+ .43) — AGIR SUR PLUSIEURS CONTACTS DU DOSSIER À LA FOIS.
 *
 * Le portefeuille `/contacts` avait déjà ces gestes (`ContactSelectionPanel`) ;
 * l'onglet Contacts du dossier, où l'on travaille UN compte, n'en avait aucun :
 * enrichir, exporter, attribuer, verser au plan ou préparer une séquence se
 * faisait contact par contact. Cette barre les rend, et ne REFAIT rien :
 *
 *  · enrichir → la porte `planBulkEnrichment` (le contrat décide qui part) et le
 *    même dialogue d'annonce ; le coût maximum est écrit SUR le bouton, donc
 *    connu avant le clic, et un lot sans rien de facturable ne se propose pas
 *    (« Rien à enrichir », jamais « 0 crédit ») ;
 *  · exporter → `generateCSV`, le format d'export de contacts existant ;
 *  · attribuer → `useAssignContacts` et les membres RÉELS de l'espace ;
 *  · ajouter au plan → `useAddContactsToPlan`, le chemin unique ;
 *  · préparer une séquence → `CreateSequenceDialog`, la fenêtre de l'écran
 *    Séquences. Une étape de séquence PRÉPARE, elle n'envoie jamais
 *    (`outreach.service.ts`, « RÈGLE ABSOLUE ») : c'est le commercial qui envoie.
 */
export function ContactsSelectionBar({
  selectedContacts,
  accountCompanyName,
  matchingCount,
  onSelectAllMatching,
  onClear,
  rawAnalysis,
  accountId,
}: ContactsSelectionBarProps) {
  const { t } = useTranslation('accountOrg')
  const { t: tContacts } = useTranslation('contacts')
  const enrichMutation = useEnrichContact()
  const { data: members = [] } = useWorkspaceMembers()
  const assignMutation = useAssignContacts()
  const addToPlanMutation = useAddContactsToPlan()
  // #2081.14 — l'export CSV de la sélection est une SORTIE de données : masqué
  // quand la règle d'espace le réserve aux administrateurs.
  const dataExit = useDataExit()
  // Le lot EXACT que le dialogue chiffre ; `null` = dialogue fermé.
  const [pendingEnrich, setPendingEnrich] = useState<readonly Contact[] | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [sequenceOpen, setSequenceOpen] = useState(false)
  const [crmPushOpen, setCrmPushOpen] = useState(false)
  const { t: tCrm } = useTranslation('crm')

  const count = selectedContacts.length
  // #2120.71 — l'annonce est calculée sur la sélection AVANT le clic.
  const plan = planBulkEnrichment(selectedContacts)

  /**
   * Le seul chemin qui débite : il ne part que du lot confirmé. Les notifications
   * individuelles sont coupées (`silent`) et UNE seule, agrégée, dit combien
   * trouvés, combien sans résultat, combien en échec — même bilan que
   * l'enrichissement de masse du portefeuille (`ContactContent.tsx`).
   */
  const runEnrichment = async (contactsToEnrich: readonly Contact[]) => {
    setEnriching(true)
    // #2297.48 — même ventilation PAR CHAMP que `ContactContent.tsx` (GA-26 :
    // un seul endroit décide comment compter un lot).
    const outcomes: BulkEnrichmentOutcome[] = []
    let failed = 0
    try {
      for (const contact of contactsToEnrich) {
        try {
          const enriched = await enrichMutation.mutateAsync({ contact, accountCompanyName, silent: true })
          outcomes.push({
            email: enriched.email,
            phone: enriched.phone,
            last_enrichment_result: enriched.last_enrichment_result,
          })
        } catch {
          // Compté, jamais avalé : un échec n'est pas « aucun résultat ».
          failed += 1
        }
      }
    } finally {
      setEnriching(false)
    }
    const summary = bulkEnrichmentSummaryOf(outcomes, failed)
    toast.message(tContacts('bulkEnrich.title', { count: contactsToEnrich.length }), {
      description: [
        tContacts('bulkEnrich.emailsFound', { count: summary.emailsFound }),
        tContacts('bulkEnrich.phonesFound', { count: summary.phonesFound }),
        summary.identitiesToConfirm > 0
          ? tContacts('bulkEnrich.identitiesToConfirm', { count: summary.identitiesToConfirm })
          : null,
        tContacts('bulkEnrich.withoutResult', { count: summary.withoutResult }),
        summary.failed > 0 ? tContacts('bulkEnrich.failed', { count: summary.failed }) : null,
        // « Fait » ne porte jamais preuve d'envoi — Laura prépare, elle n'envoie
        // jamais. Constante, jamais une mesure : elle ne peut qu'être 0.
        tContacts('bulkEnrich.sent'),
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  // #2120.72 — le format d'export de contacts existant ; la société est celle
  // du dossier (une ligne de compte ne porte pas `company_name`).
  const exportSelection = () => {
    if (!dataExit.grant) return
    const rows = selectedContacts.map(contact => ({ ...contact, company_name: accountCompanyName }))
    const company =
      accountCompanyName
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'dossier'
    downloadCSV(generateCSV(rows), t('contactsTab.selection.exportFilename', { company }), dataExit.grant)
  }

  const assignSelection = (target: ContactAssignTarget) => {
    assignMutation.mutate({
      contactIds: selectedContacts.map(contact => contact.id),
      assignedTo: target?.userId ?? null,
      ...(target ? { assigneeName: target.name } : {}),
    })
  }

  return (
    <div
      role="region"
      aria-label={t('contactsTab.selection.barAria')}
      className="space-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold" className="mr-auto">
          {tContacts('selection.count', { count })}
        </Text>
        {matchingCount > count ? (
          <Button type="button" size="sm" variant="ghost" onClick={onSelectAllMatching}>
            {t('contactsTab.selection.selectAllMatching', { count: matchingCount })}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" icon={Trash2} onClick={onClear}>
          {tContacts('selection.clear')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {plan.billableContacts.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Sparkles}
            isLoading={enriching}
            onClick={() => setPendingEnrich(plan.billableContacts)}
          >
            {tContacts('selection.enrichNow')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={Sparkles}
            disabled
            title={tContacts('selection.nothingBillableDescription')}
          >
            {tContacts('selection.nothingBillable')}
          </Button>
        )}
        {dataExit.allowed ? (
          <Button type="button" size="sm" variant="outline" icon={Download} onClick={exportSelection}>
            {t('contactsTab.selection.export')}
          </Button>
        ) : null}
        {/* #4188 — « ce compte et ces contacts, je les envoie sur mon CRM » : une SORTIE de données. */}
        {dataExit.allowed ? (
          <Button type="button" size="sm" variant="outline" icon={Upload} onClick={() => setCrmPushOpen(true)}>
            {tCrm('push.sendAccount')}
          </Button>
        ) : null}
        <AssignSelectionMenu
          inline
          members={members}
          currentAssignee={null}
          pending={assignMutation.isPending}
          onAssign={assignSelection}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={CalendarPlus}
          isLoading={addToPlanMutation.isPending}
          loadingText={tContacts('selection.plan.adding')}
          onClick={() => addToPlanMutation.mutate(selectedContacts)}
        >
          {tContacts('selection.plan.trigger')}
        </Button>
        <Button type="button" size="sm" variant="outline" icon={ListChecks} onClick={() => setSequenceOpen(true)}>
          {tContacts('selection.sequence.trigger')}
        </Button>
      </div>

      {/* #2120.43 — la proposition d'ajout ne vaut jamais envoi. */}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('contactsTab.selection.sequenceHint')}
      </Text>

      {/* #2120.71 — la porte d'annonce, montée DANS ce module (GA-49). Montée
          seulement sur un lot non vide : « 0 crédit » n'existe pas ici. */}
      {pendingEnrich !== null ? (
        <EnrichConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setPendingEnrich(null)
          }}
          count={pendingEnrich.length}
          // #2297.25/#2297.26 — les exclusions se lisent sur la SÉLECTION de
          // départ, pas sur `pendingEnrich` (déjà filtré à ce stade).
          excluded={plan.excluded}
          onConfirm={() => {
            void runEnrichment(pendingEnrich)
          }}
        />
      ) : null}

      {/* Montée à l'ouverture seulement : la fenêtre charge la base de contacts
          de l'espace, requête inutile tant qu'on ne prépare pas de séquence. */}
      {crmPushOpen ? (
        <CrmPushDialog
          open
          onOpenChange={setCrmPushOpen}
          selection={{ accountIds: accountId ? [accountId] : [], contactIds: selectedContacts.map(c => c.id) }}
        />
      ) : null}
      {sequenceOpen ? (
        <CreateSequenceDialog
          open
          onOpenChange={setSequenceOpen}
          // #2123.80 — PRÉREMPLI : le compte (nom), l'audience et l'objectif
          // (contexte), et les messages (le brouillon e-mail de chaque contact,
          // `null` = aucun brouillon écrit — jamais confondu avec « non chargé »).
          initialName={accountCompanyName}
          campaignContext={sequencePrefill(selectedContacts, rawAnalysis)}
          initialContacts={selectedContacts.map(contact => ({
            id: contact.id,
            full_name: contact.full_name,
            title: contact.title ?? null,
            email: contact.email ?? null,
            excluded_at: contact.excluded_at ?? null,
            email_message: contact.email_message ?? null,
            assigned_to: contact.assigned_to ?? null,
          }))}
        />
      ) : null}
    </div>
  )
}
