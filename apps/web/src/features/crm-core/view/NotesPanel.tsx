import type { Note, NoteEntityType, NoteScopeAccount } from '@bellum/contracts'
import { Box, Button, Text, Textarea } from '@bellum/ui'
import { Pin, PinOff, StickyNote, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateNote, useDeleteNote, useGroupEntities, useNotes, useUpdateNote } from '../hooks/useNotes'

/** Id DOM pour qu'un bouton d'un autre onglet puisse amener ici. */
export const NOTES_COMPOSER_ID = 'crm-notes-composer'

/** #3688 — notes montrées d'abord : l'historique sous la carte reste dans l'écran ; le reste est à un clic. */
const VISIBLE_NOTES = 3

const draftKey = (entityType: NoteEntityType, entityId: string) => `bellum:note-draft:${entityType}:${entityId}`

/** Le stockage de session peut être refusé (mode privé) : la saisie marche alors sans mémoire. */
function readDraft(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(key: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(key, value)
    else window.sessionStorage.removeItem(key)
  } catch {
    // voir `readDraft`
  }
}

/**
 * Le fil de notes d'un objet — compte, contact, et demain projet ou mission.
 *
 * Remplace l'éditeur de note UNIQUE : une chaîne écrasée à chaque saisie faisait
 * que deux commerciaux sur la même fiche s'effaçaient l'un l'autre, et une
 * information sans date ne vaut rien (« le budget est gelé » — depuis quand ?).
 *
 * Chaque note porte son auteur et sa date. Seul l'auteur peut modifier ou
 * supprimer la sienne : un manager qui réécrit la note d'un commercial produit
 * un document que plus personne ne croit.
 */
export function NotesPanel({
  entityType,
  entityId,
  currentUserId,
}: {
  entityType: NoteEntityType
  entityId: string
  /** Sert à n'afficher les actions d'édition que sur ses propres notes. */
  currentUserId: string | undefined
}) {
  const { t, i18n } = useTranslation('crm')
  // #1088 — « il faudrait que Bellum puisse capitaliser pour enrichir. Peut-être
  // est-ce déjà le cas ? Je ne sais pas ». C'est le cas depuis ce correctif,
  // pour les notes de COMPTE seulement : elles rejoignent le bloc de traces
  // internes du prochain run. Le dire ici est la moitié du travail — une
  // fonctionnalité qu'on ne sait pas exister n'est pas utilisée.
  const hintKey = entityType === 'account' ? 'notes.sharedHintAccount' : 'notes.sharedHint'
  const { data: notes, isLoading, isError } = useNotes(entityType, entityId)
  const { data: groupEntities } = useGroupEntities(entityType, entityId)
  // #3895 — rattacher la note à d'autres entités du groupe est un geste, jamais un défaut.
  const [scopeIds, setScopeIds] = useState<string[]>([])
  const create = useCreateNote(entityType, entityId)
  const update = useUpdateNote(entityType, entityId)
  const remove = useDeleteNote(entityType, entityId)
  // #3688.9 — SAISIE NON ENREGISTRÉE PROTÉGÉE : le brouillon survit à un
  // changement de page (stockage de session), la fermeture de l'onglet demande
  // confirmation, et il n'est effacé qu'APRÈS la confirmation d'enregistrement
  // (jamais au clic : un échec réseau ne doit pas manger ce qu'on a écrit).
  const storageKey = draftKey(entityType, entityId)
  const [draft, setDraftState] = useState(() => readDraft(storageKey))
  const [showAll, setShowAll] = useState(false)
  const noteCount = notes?.length
  const setDraft = (value: string) => {
    setDraftState(value)
    writeDraft(storageKey, value)
  }
  const hasDraft = draft.trim().length > 0
  useEffect(() => {
    if (!hasDraft) return undefined
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [hasDraft])

  const submit = () => {
    const body = draft.trim()
    if (!body) return
    create.mutate(
      { body, alsoAppliesToAccountIds: scopeIds.length > 0 ? scopeIds : undefined },
      {
        onSuccess: () => {
          setDraft('')
          setScopeIds([])
        },
      },
    )
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <Box className="space-y-4">
      <Box className="space-y-2">
        <Textarea
          id={NOTES_COMPOSER_ID}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t('notes.placeholder')}
          className="min-h-[72px]"
          aria-label={t('notes.aria')}
        />
        {entityType === 'account' && groupEntities !== undefined && groupEntities.length > 0 ? (
          <fieldset className="space-y-1">
            <legend className="text-xs text-muted-foreground">{t('notes.scopeLegend')}</legend>
            {groupEntities?.map(entity => (
              <label key={entity.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scopeIds.includes(entity.id)}
                  onChange={event =>
                    setScopeIds(current =>
                      event.target.checked ? [...current, entity.id] : current.filter(id => id !== entity.id),
                    )
                  }
                />
                {entity.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        <Box display="flex" className="items-center justify-between gap-3">
          <Text element="span" size="xs" color="text-muted-foreground">
            {hasDraft ? t('notes.draftKept') : t(hintKey)}
          </Text>
          <Button
            variant="black"
            size="sm"
            disabled={draft.trim().length === 0}
            isLoading={create.isPending}
            loadingText={t('common:states.saving')}
            onClick={submit}
          >
            {t('notes.add')}
          </Button>
        </Box>
      </Box>

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        // Un échec de lecture ne doit JAMAIS se lire « aucune note ». C'est ce
        // qui est arrivé en production le 17/08 : un 403 s'affichait comme un
        // fil vide, et personne ne pouvait deviner que ses notes existaient
        // toujours mais n'étaient plus servies.
        <Box className="rounded-md border border-dashed border-destructive/40 p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('notes.loadError')}
          </Text>
        </Box>
      ) : (notes?.length ?? 0) === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('notes.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-3">
          {(showAll ? notes : notes?.slice(0, VISIBLE_NOTES))?.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              editable={Boolean(currentUserId) && note.authorId === currentUserId}
              formatDate={formatDate}
              onTogglePin={() => update.mutate({ id: note.id, pinned: !note.pinned })}
              onDelete={() => remove.mutate({ id: note.id })}
              // #3895.1 — la portée de groupe s'édite depuis la note : seulement ses propres notes de compte,
              // écrites ICI (une note héritée appartient à l'entité d'origine), quand le groupe a d'autres entités.
              scopeChoices={
                entityType === 'account' && !note.inheritedFrom && groupEntities && groupEntities.length > 0
                  ? groupEntities
                  : undefined
              }
              onSaveScope={ids => update.mutate({ id: note.id, alsoAppliesToAccountIds: ids })}
            />
          ))}
          {!showAll && noteCount !== undefined && noteCount > VISIBLE_NOTES ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              {t('notes.showAll', { count: noteCount })}
            </Button>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

function NoteRow({
  note,
  editable,
  formatDate,
  onTogglePin,
  onDelete,
  scopeChoices,
  onSaveScope,
}: {
  note: Note
  editable: boolean
  formatDate: (iso: string) => string
  onTogglePin: () => void
  onDelete: () => void
  /** Les autres entités du groupe ; absent = pas de contrôle de portée sur cette note. */
  scopeChoices?: readonly NoteScopeAccount[]
  onSaveScope: (accountIds: string[]) => void
}) {
  const { t } = useTranslation('crm')
  const PinIcon = note.pinned ? PinOff : Pin
  // #3895.1 — l'édition de la portée : cases initialisées sur ce que la note dit déjà, enregistrées d'un bloc.
  const [editingScope, setEditingScope] = useState(false)
  const [scopeDraft, setScopeDraft] = useState<string[]>([])
  const canEditScope = editable && scopeChoices !== undefined
  const openScope = () => {
    setScopeDraft((note.alsoAppliesTo ?? []).map(entity => entity.id))
    setEditingScope(true)
  }

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="items-start justify-between gap-3">
        <Box display="flex" className="items-center gap-2">
          {note.pinned ? <Pin className="size-3.5 text-muted-foreground" aria-hidden /> : null}
          <Text element="span" size="xs" weight="medium">
            {note.authorName ?? t('notes.unknownAuthor')}
          </Text>
          <Text element="span" size="xs" color="text-muted-foreground">
            {formatDate(note.createdAt)}
          </Text>
        </Box>
        {editable ? (
          <Box display="flex" className="items-center gap-1">
            {canEditScope ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={openScope}
                aria-label={t('notes.editScope')}
                title={t('notes.editScope')}
              >
                <Users className="size-3.5" aria-hidden />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onTogglePin}
              aria-label={note.pinned ? t('notes.unpin') : t('notes.pin')}
              title={note.pinned ? t('notes.unpin') : t('notes.pin')}
            >
              <PinIcon className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label={t('notes.delete')}
              title={t('notes.delete')}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </Box>
        ) : null}
      </Box>
      {note.inheritedFrom?.name ? (
        <Text size="xs" color="text-muted-foreground" className="mt-1">
          {t('notes.inheritedFrom', { name: note.inheritedFrom.name })}
        </Text>
      ) : null}
      <Text size="sm" className="mt-2 whitespace-pre-wrap">
        {note.body}
      </Text>
      {/* Le contrat donne un défaut à `alsoAppliesTo` : absent sur le fil, il ne fait tomber aucune note. */}
      {note.alsoAppliesTo?.length ? (
        <Text size="xs" color="text-muted-foreground" className="mt-2">
          {t('notes.alsoAppliesTo', { names: (note.alsoAppliesTo ?? []).map(entity => entity.name).join(', ') })}
        </Text>
      ) : null}
      {canEditScope && editingScope ? (
        <fieldset className="mt-2 space-y-1" aria-label={t('notes.scopeEditAria')}>
          <legend className="text-xs text-muted-foreground">{t('notes.scopeLegend')}</legend>
          {scopeChoices?.map(entity => (
            <label key={entity.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopeDraft.includes(entity.id)}
                onChange={event =>
                  setScopeDraft(current =>
                    event.target.checked ? [...current, entity.id] : current.filter(id => id !== entity.id),
                  )
                }
              />
              {entity.name}
            </label>
          ))}
          <Box display="flex" className="items-center gap-2">
            <Button
              variant="black"
              size="sm"
              onClick={() => {
                onSaveScope(scopeDraft)
                setEditingScope(false)
              }}
            >
              {t('notes.scopeSave')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingScope(false)}>
              {t('notes.scopeCancel')}
            </Button>
          </Box>
        </fieldset>
      ) : null}
    </Box>
  )
}

export { StickyNote as NotesIcon }
