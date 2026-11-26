import { outcomesForTargetKind } from '@bellum/contracts'
import type { MyPlanAction } from '@bellum/contracts'
import { Box, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CallbackDateDialog } from './CallbackDateDialog'
import { AccountFactLines } from '@/components/account/AccountFactLines'
import { useDeclareSent } from '@/features/contacts/hooks/useDeclareSent'
import { useCompleteRelance } from '../hooks/useCompleteRelance'
import { useMyActionsCount } from '../hooks/useMyActionsCount'

/**
 * #1409 (rouvert), #2114.46/.57 — MES RELANCES, DANS LE CENTRE D'ACTIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE LISTE REPREND, ET POURQUOI ELLE EST ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle porte le geste qui vivait sur `MyRelancesCard`, dans le cockpit
 * personnel : marquer une relance FAITE. Le cockpit personnel porte le RECUL
 * (#1404) — « est-ce que je travaille correctement mon portefeuille » — et un
 * geste daté n'y avait rien à faire ; le Centre d'actions est « une seule
 * maison pour toutes les décisions humaines », ce que #1508 a déjà écrit pour
 * les écritures CRM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GESTES, DEUX BOUTONS FRÈRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Un bouton dans un bouton n'est pas du HTML valide, et le conteneur ne porte
 * aucun `onClick` (GA-35). Le rond « fait » écrit ; l'autre ouvre le plan du
 * compte, qui lit. Les mélanger ferait marquer faite une relance qu'on voulait
 * seulement relire.
 *
 * ⚠️ Aucune date INVENTÉE. `due_date` peut être `null` — une action sans
 * échéance est une vraie réponse, pas une donnée manquante à remplir — et la
 * ligne le DIT au lieu d'afficher une date d'aujourd'hui.
 */

/** `YYYY-MM-DD` → date courte localisée, ou la valeur brute si elle est illisible. */
function formatDue(due: string, locale: string): string {
  const date = new Date(due)
  return Number.isNaN(date.getTime()) ? due : date.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
}

/**
 * #4418.1 — « Marquer envoyé » : la relance vise un CONTACT et un canal d'écrit (e-mail, LinkedIn). Un appel, une réunion
 * ou une action sans contact visé n'ont rien à déclarer : le geste ne s'y montre pas.
 */
function declarableChannel(action: MyPlanAction): 'email' | 'linkedin' | null {
  if (action.target?.kind !== 'contact') return null
  return action.channel === 'email' || action.channel === 'linkedin' ? action.channel : null
}

/**
 * #4418.1 — le geste DÉCLARATIF, frère du rond « fait » (jamais imbriqué, GA-35). Le commercial a envoyé lui-même ;
 * Bellum n'envoie rien et ne peut pas le vérifier. Le serveur planifie J+3 / J+6 / J+9 depuis le jour déclaré
 * (« Fait » ne porte jamais de preuve d'envoi — Louis 21/09). Aucune date n'est passée : jamais une date inventée.
 */
function MarkSentButton({ contactId, channel }: { contactId: string; channel: 'email' | 'linkedin' }) {
  const { t } = useTranslation('actions')
  const declare = useDeclareSent(contactId)
  if (declare.isSuccess) {
    return (
      <Text size="xs" className="shrink-0 px-2 text-muted-foreground" data-testid="relance-sent-declared">
        {t('center.relances.markSentDone')}
      </Text>
    )
  }
  return (
    <button
      type="button"
      disabled={declare.isPending}
      title={t('center.relances.markSentTooltip')}
      onClick={() => declare.mutate({ channel })}
      className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--bellum-border)] px-2 text-xs font-medium text-[var(--bellum-text-secondary)] hover:border-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:opacity-50"
    >
      {t('center.relances.markSent')}
    </button>
  )
}

function RelanceRow({ action }: { action: MyPlanAction }) {
  const { t, i18n } = useTranslation('actions')
  const complete = useCompleteRelance()
  const pending = complete.isPending && complete.variables?.id === action.id
  const sentChannel = declarableChannel(action)
  // #3416.2b — « À rappeler » demande d'abord la date (facultative).
  const [callbackOpen, setCallbackOpen] = useState(false)

  return (
    <Box
      display="flex"
      className="group items-center gap-2 rounded-lg pr-2 transition-colors hover:bg-[var(--bellum-surface-2)]"
      data-slot="my-relance-row"
    >
      {/* #2396.2/.5/.6 — une complétion manuelle exige l'issue choisie ; le
          serveur la refuse sinon. Le sous-menu propose les issues adaptées au
          type d'action visée. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          aria-label={t('center.relances.done', { label: action.label })}
          className="ml-2 flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-border)] text-transparent transition-colors hover:border-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <Check className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {outcomesForTargetKind(action.target?.kind ?? null).map(outcome => (
            <DropdownMenuItem
              key={outcome}
              onSelect={() =>
                outcome === 'callback_scheduled' ? setCallbackOpen(true) : complete.mutate({ id: action.id, outcome })
              }
            >
              {t(`outcome.${outcome}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CallbackDateDialog
        open={callbackOpen}
        onOpenChange={setCallbackOpen}
        onConfirm={callbackDate => complete.mutate({ id: action.id, outcome: 'callback_scheduled', callbackDate })}
      />
      {/* #3720.6 (retour bêta SKAIZen, Laura, 22/09) — « impossible d'ouvrir
          dans un nouvel onglet depuis … la création d'action ». La ligne
          naviguait par `onClick` + `navigate()` sur un `<button>`, sans
          `href` : clic droit, ctrl/cmd-clic et clic molette ne proposaient
          rien. Même correctif que #2719 (ContactTableRow) : un vrai
          `<Link>` rend ces gestes natifs au navigateur. */}
      <Link
        to="/accounts/$id"
        params={{ id: action.account_id }}
        search={{ tab: 'plan' }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        <Box className="min-w-0 flex-1">
          <Text size="sm" weight="medium" className="truncate text-foreground">
            {action.label}
          </Text>
          <Text size="xs" className="truncate text-muted-foreground">
            {action.company_name ?? t('center.relances.companyFallback')}
          </Text>
          {/* #4072.2 — l'historique d'échanges (date · destinataire · sujet, jamais le
              corps) et les faits récents : on relance en connaissance de cause. */}
          {action.history && action.history.exchanges.length > 0 ? (
            <AccountFactLines facts={action.history.exchanges} withLinks={false} />
          ) : null}
          {action.history && action.history.recent_facts.length > 0 ? (
            <AccountFactLines facts={action.history.recent_facts} withLinks={false} />
          ) : null}
        </Box>
        <span className="shrink-0 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {action.due_date
            ? formatDue(action.due_date, i18n.language === 'en' ? 'en-GB' : 'fr-FR')
            : t('center.relances.noDue')}
        </span>
      </Link>
      {/* #4418.1 — « Marquer envoyé » : déclaratif, planifie J+3 / J+6 / J+9. */}
      {sentChannel && action.target ? <MarkSentButton contactId={action.target.id} channel={sentChannel} /> : null}
    </Box>
  )
}

export function MyRelancesList({
  actions,
  loading,
  overdueOnly = false,
}: {
  actions: MyPlanAction[]
  loading: boolean
  /** #2717 — un vide FILTRÉ (« en retard ») n'est pas le vide ABSOLU : le
   *  message le dit, sinon un zéro filtré se lit comme « rien à faire ». */
  overdueOnly?: boolean
}) {
  const { t } = useTranslation('actions')
  // #4418.1 — la liste est coupée à 200 lignes par le serveur : si le total en dépasse ce qu'on montre, on le DIT.
  const total = useMyActionsCount(overdueOnly).data?.open
  const hidden = total !== undefined && total > actions.length ? total - actions.length : 0

  if (loading) {
    // « En cours de lecture » n'est pas « aucune » : annoncer un vide qu'on n'a
    // pas encore mesuré ferait croire qu'il n'y a rien à faire.
    return (
      <Text size="sm" className="text-muted-foreground">
        {t('center.relances.loading')}
      </Text>
    )
  }

  if (actions.length === 0) {
    return (
      <Text size="sm" className="text-muted-foreground">
        {t(overdueOnly ? 'center.relances.emptyOverdue' : 'center.relances.empty')}
      </Text>
    )
  }

  return (
    <Box className="space-y-1">
      {hidden > 0 ? (
        <Text size="xs" className="text-muted-foreground" role="status">
          {t('center.relances.truncated', { shown: actions.length, total, hidden })}
        </Text>
      ) : null}
      {actions.map(action => (
        <RelanceRow key={action.id} action={action} />
      ))}
    </Box>
  )
}
