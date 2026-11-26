import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  FolderClosed,
  History,
  Lock,
  MessageSquare,
  PencilLine,
  Rocket,
  User,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import {
  isMemoryItemExpired,
  type MemoryItemObjectRef,
  type MemoryItemReassignableScope,
  type MemoryItemScope,
  type MemoryLedgerEntry,
} from '@bellum/contracts'
import { Badge, Box, Button, EntityAvatar, Text } from '@bellum/ui'
import { useUpdateFact } from '@/features/memory/hooks/useMemoryLedger'
import { dateInputValue, endOfDayIso, formatMemoryDate } from '@/features/memory/lib/memory-dates'
import { MemoryFactHistory } from '@/features/memory/view/MemoryFactHistory'

/** Un geste de ligne : se tabule (GA-35), porte un nom (GA-32), 44 px au doigt (GA-30). */
const GESTURE_CLASS =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-[var(--bellum-text-accent)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:cursor-not-allowed'

/**
 * #1916 — UN ÉLÉMENT ÉPINGLÉ QUI DIT POURQUOI, POUR QUI, D'OÙ, ET CE QU'IL CHANGE.
 *
 * Sur chaque ligne de la couche des faits :
 *  · le texte, la portée, la nature, le compte, l'échéance (déjà là) ;
 *  · #1916.13 / .16 — D'OÙ il vient et QUI l'a posé : « Épinglé par toi »,
 *    « Retenu d'une réponse de Laura, enregistré par Julie » ;
 *  · #1916.2 — POURQUOI il pèse : une correction passe avant tout, une note de
 *    Laura éclaire sans trancher, un élément déclaré est respecté en priorité —
 *    les trois rangs que le contexte de Laura applique (`_format_memory`) ;
 *  · #1916.18 / .24 — OÙ Laura s'en sert, ou « non utilisé par Laura
 *    aujourd'hui » quand l'échéance est passée ; rien quand l'API ne le dit pas ;
 *  · #1916.19 / .22 / .23 — modifier, dater après coup, relire l'historique.
 *
 * Chaque geste n'apparaît qu'à qui peut le faire (`canEdit`, `ownedByMe`,
 * `canForget`, calculés par le serveur, qui reste la garde) : un bouton absent
 * plutôt que grisé, qui laisserait croire à un droit qu'on n'a pas.
 */
export function MemoryFactRow({
  entry,
  onForget,
  forgetting,
  onSetScope,
  settingScope,
  businessUnitNames,
}: {
  entry: MemoryLedgerEntry
  onForget: (id: string) => void
  forgetting: boolean
  onSetScope: (id: string, scope: MemoryItemReassignableScope) => void
  /**
   * #1918.2 — identifiant de périmètre → son nom. Un périmètre se NOMME : sans
   * ce nom, la ligne d'équipe s'afficherait sans portée du tout, donc comme si
   * elle ne valait que pour son auteur.
   */
  businessUnitNames?: Record<string, string>
  settingScope: boolean
}) {
  const { t, i18n } = useTranslation('knowledge')
  const update = useUpdateFact()
  const [mode, setMode] = useState<'read' | 'text' | 'expiry'>('read')
  const [draft, setDraft] = useState(entry.text)
  const [until, setUntil] = useState(dateInputValue(entry.expiresAt))
  const [historyOpen, setHistoryOpen] = useState(false)
  const textFieldId = useId()
  const dateFieldId = useId()

  const recorded = formatMemoryDate(entry.recordedAt, i18n.language)
  const untilLabel = formatMemoryDate(entry.expiresAt, i18n.language, { utc: true })
  // #1962.22 — QUAND une note a été confirmée, à côté de QUI (`confirmedBy`).
  const confirmedLabel = formatMemoryDate(entry.confirmedAt, i18n.language)
  const expired = isMemoryItemExpired(entry.expiresAt)
  // #1916.3 / #1918.1 — jamais une portée devinée.
  // #1918.2 — un élément d'ÉQUIPE se NOMME lui aussi : sans cette branche, le
  // registre l'affichait sans portée du tout, c'est-à-dire comme s'il ne valait
  // que pour son auteur. Le nom du périmètre n'est pas ici — la ligne porte son
  // identifiant, l'écran qui les liste porte les noms.
  const scope: MemoryItemScope | null =
    entry.scope === 'user' || entry.scope === 'workspace' || entry.scope === 'business_unit' ? entry.scope : null
  // #1916.21 — seul le PROPRIÉTAIRE change la portée, et seulement entre les
  // deux portées DURABLES : on ne rattache pas après coup un élément à une
  // équipe ou à un fil (voir `MEMORY_ITEM_REASSIGNABLE_SCOPES`).
  const nextScope: MemoryItemReassignableScope | null =
    entry.ownedByMe === true && (entry.scope === 'user' || entry.scope === 'workspace')
      ? entry.scope === 'user'
        ? 'workspace'
        : 'user'
      : null
  const canEdit = entry.canEdit === true
  // #1962.19 — CONFIRMER une note de Laura non encore confirmée, sans réécrire
  // son texte. `detail` ne vaut jamais 'copilotNote' hors `origin: 'copilot'`
  // (factEntry) : le second test est une ceinture, pas une nécessité.
  const canConfirm = canEdit && entry.origin === 'copilot' && entry.detail === 'copilotNote'
  const confirmNote = () => {
    if (update.isPending) return
    update.mutate({ id: entry.id, confirm: true })
  }
  // L'historique n'existe que servi par une API qui connaît ces gestes ; une API
  // plus ancienne (sans `canEdit`) n'a pas de route à ouvrir.
  const hasHistory = entry.canEdit !== undefined

  const close = () => {
    setMode('read')
    setDraft(entry.text)
    setUntil(dateInputValue(entry.expiresAt))
  }

  const saveText = (event: FormEvent) => {
    event.preventDefault()
    const fact = draft.trim()
    if (!fact || update.isPending) return
    update.mutate({ id: entry.id, fact }, { onSuccess: () => setMode('read') })
  }

  const saveExpiry = (event: FormEvent) => {
    event.preventDefault()
    const expiresAt = endOfDayIso(until)
    if (!expiresAt || update.isPending) return
    update.mutate({ id: entry.id, expiresAt }, { onSuccess: () => setMode('read') })
  }

  return (
    <Box
      data-memory-row=""
      className="flex items-start gap-3 border-b border-[var(--bellum-border)] py-3 first:pt-0 last:border-b-0 last:pb-0"
    >
      <Box className="min-w-0 flex-1">
        {mode === 'text' ? (
          <form onSubmit={saveText} className="flex flex-col gap-2">
            <label htmlFor={textFieldId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
              {t('memoryLedger.edit.label')}
            </label>
            <textarea
              id={textFieldId}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              rows={3}
              maxLength={2000}
              className="min-h-11 w-full rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2.5 py-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            />
            <Box className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!draft.trim() || update.isPending}>
                {t('memoryLedger.edit.save')}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={close}>
                {t('memoryLedger.edit.cancel')}
              </Button>
            </Box>
          </form>
        ) : (
          <Text element="p" size="sm" className="whitespace-pre-line break-words">
            {entry.text}
          </Text>
        )}

        <Box className="mt-1 flex flex-wrap items-center gap-1.5">
          {/* #1962.5/.6/.7/.9/.10 — LA NATURE, NOMMÉE SUR LA LIGNE. Sans elle, une
              hypothèse à vérifier se lirait exactement comme un fait constaté.
              `fact` n'en porte pas : c'était la nature de TOUT élément avant
              #1962, l'écrire partout ajouterait du bruit sans rien apprendre —
              et une API qui ne sert pas la nature n'en fait pas naître une. */}
          {entry.kind && entry.kind !== 'fact' && (
            <Badge variant="outline" className="text-xs">
              {t(`memory.kind.${entry.kind}`)}
            </Badge>
          )}
          {scope && (
            <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
              {scope === 'user' ? (
                <Lock className="size-2.5" aria-hidden />
              ) : (
                <Users className="size-2.5" aria-hidden />
              )}
              {t(`memory.scope.${scope}`)}
            </Badge>
          )}
          {entry.detail && (
            <Badge variant="outline" className="text-xs">
              {/* Q1 — « Note de Laura — confirmée par Julie » ; sans confirmateur
                  connu (compte effacé), « confirmée » sans prénom deviné.
                  #1962.22 — la date s'ajoute quand elle est servie. */}
              {entry.detail === 'confirmedNote' && entry.confirmedBy
                ? t(confirmedLabel ? 'memoryLedger.detail.confirmedNoteByOn' : 'memoryLedger.detail.confirmedNoteBy', {
                    name: entry.confirmedBy.firstName,
                    date: confirmedLabel,
                  })
                : t(`memoryLedger.detail.${entry.detail}`, { defaultValue: entry.detail })}
            </Badge>
          )}
          {entry.accountId && (
            <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
              <FolderClosed className="size-2.5" aria-hidden />
              {t('memoryLedger.scopedToAccount')}
            </Badge>
          )}
          {/* #2260.7 — L'OBJET VISÉ : contact, besoin, consultant ou mission,
              nommé et cliquable vers sa fiche. Absent (la plupart des
              éléments) : aucun badge, comme `accountId` ci-dessus. */}
          {entry.object && <ObjectBadge object={entry.object} />}
          {untilLabel && (
            <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
              <CalendarClock className="size-2.5" aria-hidden />
              {expired
                ? t('memoryLedger.expiredOn', { date: untilLabel })
                : t('memoryLedger.until', { date: untilLabel })}
            </Badge>
          )}
          {recorded && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('memoryLedger.recordedAt', { date: recorded })}
            </Text>
          )}
        </Box>

        <FactProvenance entry={entry} />
        <FactSurfaces entry={entry} />
        <FactConsultations entry={entry} />

        <Box className="mt-1 flex flex-wrap items-center gap-1">
          {canConfirm && mode === 'read' && (
            <button
              type="button"
              onClick={confirmNote}
              disabled={update.isPending}
              aria-label={t('memoryLedger.confirm.aria', { text: entry.text })}
              className={GESTURE_CLASS}
            >
              <BadgeCheck className="size-3.5" aria-hidden />
              {t('memoryLedger.confirm.action')}
            </button>
          )}
          {canEdit && mode === 'read' && (
            <button
              type="button"
              onClick={() => setMode('text')}
              aria-label={t('memoryLedger.edit.aria', { text: entry.text })}
              className={GESTURE_CLASS}
            >
              <PencilLine className="size-3.5" aria-hidden />
              {t('memoryLedger.edit.action')}
            </button>
          )}
          {canEdit && mode === 'read' && (
            <button
              type="button"
              onClick={() => setMode('expiry')}
              aria-label={t(entry.expiresAt ? 'memoryLedger.expiry.changeAria' : 'memoryLedger.expiry.addAria', {
                text: entry.text,
              })}
              className={GESTURE_CLASS}
            >
              <CalendarClock className="size-3.5" aria-hidden />
              {t(entry.expiresAt ? 'memoryLedger.expiry.change' : 'memoryLedger.expiry.add')}
            </button>
          )}
          {nextScope && (
            <button
              type="button"
              onClick={() => onSetScope(entry.id, nextScope)}
              disabled={settingScope}
              aria-label={t(`memoryLedger.scopeChange.${nextScope}Aria`, { text: entry.text })}
              className={GESTURE_CLASS}
            >
              {nextScope === 'workspace' ? (
                <Users className="size-3.5" aria-hidden />
              ) : (
                <Lock className="size-3.5" aria-hidden />
              )}
              {t(`memoryLedger.scopeChange.${nextScope}`)}
            </button>
          )}
          {hasHistory && (
            <button
              type="button"
              onClick={() => setHistoryOpen(open => !open)}
              aria-expanded={historyOpen}
              aria-label={t('memoryLedger.history.aria', { text: entry.text })}
              className={GESTURE_CLASS}
            >
              <History className="size-3.5" aria-hidden />
              {t('memoryLedger.history.show')}
            </button>
          )}
        </Box>

        {mode === 'expiry' && (
          <form onSubmit={saveExpiry} className="mt-2 flex flex-wrap items-end gap-2">
            <Box className="flex flex-col gap-1">
              <label htmlFor={dateFieldId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
                {t('memoryLedger.expiry.label')}
              </label>
              <input
                id={dateFieldId}
                type="date"
                value={until}
                min={dateInputValue(new Date().toISOString())}
                onChange={event => setUntil(event.target.value)}
                className="min-h-11 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
              />
            </Box>
            <Button type="submit" size="sm" disabled={!endOfDayIso(until) || update.isPending}>
              {t('memoryLedger.expiry.save')}
            </Button>
            {entry.expiresAt && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: entry.id, expiresAt: null }, { onSuccess: () => setMode('read') })}
              >
                {t('memoryLedger.expiry.remove')}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              {t('memoryLedger.expiry.cancel')}
            </Button>
          </form>
        )}

        {historyOpen && <MemoryFactHistory id={entry.id} />}
      </Box>

      {/* #1918.7 — « Oublier » n'est offert qu'à qui en a le droit (`canForget`,
          calculé par le serveur). Champ absent (API plus ancienne) : geste gardé. */}
      {entry.canForget !== false && (
        <button
          type="button"
          onClick={() => onForget(entry.id)}
          disabled={forgetting}
          aria-label={t('memoryLedger.forgetAria', { text: entry.text })}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--bellum-text-muted)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--danger-soft-text)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:cursor-not-allowed"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </Box>
  )
}

/** #2260.7 — une icône par type d'objet visé, jamais devinée. */
const OBJECT_ICON: Record<MemoryItemObjectRef['type'], typeof User> = {
  contact: User,
  need: Briefcase,
  consultant: UserCog,
  mission: Rocket,
}

/**
 * #2260.7 — le lien vers LA fiche de l'objet visé. Une branche par type, comme
 * `PlanItemFacts.tsx#TargetLabel` (#2123.33, « l'objet visé ouvre la page qui
 * en est propriétaire ») : les quatre routes n'ont pas le même nom de
 * paramètre (`id` pour trois, `needId` pour le besoin), donc pas d'appel
 * générique sans perdre le typage du routeur.
 */
function ObjectLink({
  object,
  className,
  children,
}: {
  object: MemoryItemObjectRef
  className: string
  children: ReactNode
}) {
  if (object.type === 'contact') {
    return (
      <Link to="/contacts/$id" params={{ id: object.id }} className={className}>
        {children}
      </Link>
    )
  }
  if (object.type === 'need') {
    return (
      <Link to="/projects/needs/$needId" params={{ needId: object.id }} className={className}>
        {children}
      </Link>
    )
  }
  if (object.type === 'consultant') {
    return (
      <Link to="/consultants/$id" params={{ id: object.id }} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <Link to="/missions/$id" params={{ id: object.id }} className={className}>
      {children}
    </Link>
  )
}

/**
 * #2260.7 — L'OBJET VISÉ : contact, besoin, consultant ou mission, nommé et
 * cliquable vers sa fiche. `name: null` (identifiant hors espace, ligne
 * disparue du référentiel) le DIT plutôt que de taire le lien ou de deviner un
 * nom — « une valeur absente ne s'affiche jamais 0 ni vide-muet » — et n'ouvre
 * alors aucune page, faute d'un nom à montrer sur le lien.
 *
 * Un lien, donc une cible ≥ 44 px (GA-30, `min-h-11`) — les autres badges de
 * cette ligne sont décoratifs, celui-ci se clique.
 */
function ObjectBadge({ object }: { object: MemoryItemObjectRef }) {
  const { t } = useTranslation('knowledge')
  const Icon = OBJECT_ICON[object.type]
  if (!object.name) {
    return (
      <Badge variant="outline" className="inline-flex items-center gap-1 text-xs">
        <Icon className="size-2.5" aria-hidden />
        {t(`memoryLedger.object.notFound.${object.type}`)}
      </Badge>
    )
  }
  return (
    <ObjectLink
      object={object}
      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-xs text-[var(--bellum-text-accent)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
    >
      <Icon className="size-2.5" aria-hidden />
      {t(`memoryLedger.object.${object.type}`, { name: object.name })}
    </ObjectLink>
  )
}

/**
 * #1916.13 / #1916.16 / #1916.2 — d'où l'élément vient, qui l'a posé, et
 * pourquoi il pèse. Rien quand l'API ne sert pas l'origine : on ne devine pas
 * une provenance.
 */
function FactProvenance({ entry }: { entry: MemoryLedgerEntry }) {
  const { t } = useTranslation('knowledge')
  if (!entry.origin) return null
  const who = entry.ownedByMe ? 'Mine' : entry.author ? 'By' : ''
  // Les trois rangs du contexte de Laura : une correction domine, une note de
  // Laura jamais confirmée éclaire sans trancher, le reste est déclaré.
  // Q1 (13/09) — une note de Laura CONFIRMÉE par une personne prend le rang d'un
  // fait déclaré : sa raison le dit, son origine reste dite juste au-dessus.
  //
  // #1962.9 — une HYPOTHÈSE juste après la correction : quelle que soit son
  // origine, elle n'est pas un fait déclaré et l'écran ne doit pas promettre
  // qu'elle est « respectée en priorité » — le prompt ne le fait justement plus
  // (`_format_memory`, rang des hypothèses).
  const why =
    entry.kind === 'correction'
      ? 'correction'
      : entry.kind === 'hypothesis'
        ? 'hypothesis'
        : entry.detail === 'confirmedNote'
          ? 'confirmedNote'
          : entry.origin === 'copilot'
            ? 'copilotNote'
            : 'declared'
  return (
    <Box className="mt-1.5 flex flex-col gap-0.5">
      <Box className="flex items-center gap-1.5">
        {entry.author && <EntityAvatar name={entry.author.firstName} src={entry.author.avatarUrl} size="xs" />}
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t(`memoryLedger.source.${entry.origin}${who}`, { name: entry.author?.firstName ?? '' })}
        </Text>
      </Box>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t(`memoryLedger.why.${why}`)}
      </Text>
    </Box>
  )
}

/**
 * #1916.18 / #1916.24 — la conséquence visible. Des surfaces servies : où Laura
 * s'en sert. Un tableau VIDE : « non utilisé par Laura aujourd'hui » (la date
 * est déjà sur le badge d'échéance — elle ne se répète pas). Rien de servi : rien
 * n'est affirmé, ni usage ni non-usage.
 */
function FactSurfaces({ entry }: { entry: MemoryLedgerEntry }) {
  const { t } = useTranslation('knowledge')
  if (entry.surfaces === undefined) return null
  if (entry.surfaces.length === 0) {
    // #1916.24 — UN seul libellé : quand la trace est mesurée, c'est elle qui dit
    // ce que Laura en a fait (`FactConsultations`), plus « non utilisé aujourd'hui ».
    if (entry.consultations) return null
    return (
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t('memoryLedger.surfaces.unused')}
      </Text>
    )
  }
  return (
    <Box className="mt-1">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('memoryLedger.surfaces.label')}
      </Text>
      <ul className="list-disc pl-4 text-[var(--bellum-text-secondary)]">
        {entry.surfaces.map(surface => (
          <li key={surface}>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t(`memoryLedger.surfaces.${surface}`)}
            </Text>
          </li>
        ))}
      </ul>
      {entry.accountId && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('memoryLedger.surfaces.otherAccount')}
        </Text>
      )}
    </Box>
  )
}

/**
 * #1916.24 — la conséquence MESURÉE : dans combien de réponses que le lecteur peut
 * relire cet élément était dans le contexte envoyé à Laura, la dernière quand, et
 * un lien vers la conversation la plus récente qu'il peut ouvrir (aucun quand la
 * seule réponse est celle d'un assistant externe, qui n'est pas un fil).
 *
 * « Consulté », jamais « utilisé » : on prouve l'envoi, pas l'usage. ABSENT de la
 * ligne (API plus ancienne, lecture ratée) : rien n'est affirmé.
 */
function FactConsultations({ entry }: { entry: MemoryLedgerEntry }) {
  const { t, i18n } = useTranslation('knowledge')
  const consultations = entry.consultations
  if (!consultations) return null
  if (consultations.replies === 0) {
    return (
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t(
          isMemoryItemExpired(entry.expiresAt)
            ? 'memoryLedger.consultations.neverExpired'
            : 'memoryLedger.consultations.never',
        )}
      </Text>
    )
  }
  const date = formatMemoryDate(consultations.lastAt, i18n.language)
  const conversation = consultations.lastConversation
  return (
    <Box className="mt-1 flex flex-wrap items-center gap-x-2">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {date
          ? t('memoryLedger.consultations.count', { count: consultations.replies, date })
          : t('memoryLedger.consultations.countUndated', { count: consultations.replies })}
      </Text>
      {conversation && (conversation.conversationId || conversation.accountId) ? (
        <Link
          to="/chat"
          search={{
            accountId: conversation.accountId ?? undefined,
            conversationId: conversation.conversationId ?? undefined,
          }}
          aria-label={t('memoryLedger.consultations.openAria', { text: entry.text })}
          className={GESTURE_CLASS}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          {t('memoryLedger.consultations.open')}
        </Link>
      ) : null}
    </Box>
  )
}
