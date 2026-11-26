import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { userAnglesApi, type UserAngle } from './user-angles'

type MyAnglesPickerProps = {
  /** Pose le texte de l'angle choisi dans le composer — ne génère ni n'envoie rien. */
  onUseAngle: (content: string) => void
}

/**
 * #4739 (retour Bedros × Adel, 28/10) — « Mes angles » : les angles que le commercial écrit lui-même, sauvegardés,
 * retrouvés à chaque « Contacter » à côté des angles calculés (jamais mélangés : un angle à soi n'est pas une
 * preuve du produit). Choisir un angle pose son texte dans le composer : le copilote prépare, le commercial envoie.
 *
 * UN formulaire générique pour créer ET modifier (doctrine c75), pas un éditeur dédié par geste.
 * « Retirer » archive côté serveur ; une absence de réponse se dit, elle ne s'invente pas.
 */
export function MyAnglesPicker({ onUseAngle }: MyAnglesPickerProps) {
  const { t } = useTranslation('engagement')
  const [open, setOpen] = useState(false)
  const [angles, setAngles] = useState<UserAngle[] | null>(null)
  const [failed, setFailed] = useState(false)
  // `null` = formulaire fermé ; `{ angle: null }` = nouvel angle ; `{ angle }` = modification.
  const [editing, setEditing] = useState<{ angle: UserAngle | null } | null>(null)
  const panelId = useId()

  const load = useCallback(() => {
    setFailed(false)
    userAnglesApi
      .list()
      .then(list => setAngles(list))
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (open && angles === null) load()
  }, [open, angles, load])

  const archive = (angle: UserAngle) =>
    userAnglesApi
      .archive(angle.id)
      .then(() => setAngles(current => (current ?? []).filter(item => item.id !== angle.id)))
      .catch(() => setFailed(true))

  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="light"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="h-auto gap-1.5"
      >
        {t('composer.myAngles.toggle')}
        <ChevronDown aria-hidden="true" className={open ? 'size-3.5 rotate-180' : 'size-3.5'} />
      </Button>
      {open ? (
        <div id={panelId} className="mt-2 space-y-2">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('composer.myAngles.hint')}
          </Text>
          {failed ? (
            <Text size="xs" role="alert" className="text-[var(--bellum-text-secondary)]">
              {t('composer.myAngles.error')}
            </Text>
          ) : null}
          {angles && angles.length === 0 && !failed ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('composer.myAngles.none')}
            </Text>
          ) : null}
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {(angles ?? []).map(angle => (
              <li key={angle.id} className="flex items-start gap-1 rounded-md border border-[var(--bellum-border)] p-1">
                <button
                  type="button"
                  onClick={() => {
                    onUseAngle(angle.content)
                    setOpen(false)
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-md p-1.5 text-left hover:bg-[var(--bellum-bg-lighter)]"
                >
                  <span className="block text-sm font-medium text-[var(--bellum-text-primary)]">{angle.title}</span>
                  <span className="line-clamp-2 text-xs text-[var(--bellum-text-secondary)]">{angle.content}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-11 shrink-0 p-0"
                  aria-label={t('composer.myAngles.edit', { title: angle.title })}
                  onClick={() => setEditing({ angle })}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-11 shrink-0 p-0"
                  aria-label={t('composer.myAngles.remove', { title: angle.title })}
                  onClick={() => void archive(angle)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="light"
            size="sm"
            className="min-h-11 gap-1.5"
            onClick={() => setEditing({ angle: null })}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('composer.myAngles.new')}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <UserAngleDialog
          angle={editing.angle}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            setAngles(current => {
              const list = current ?? []
              return list.some(item => item.id === saved.id)
                ? list.map(item => (item.id === saved.id ? saved : item))
                : [saved, ...list]
            })
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** Le formulaire générique : créer (angle absent) ou modifier/renommer (angle présent) — le même. */
function UserAngleDialog({
  angle,
  onClose,
  onSaved,
}: {
  angle: UserAngle | null
  onClose: () => void
  onSaved: (saved: UserAngle) => void
}) {
  const { t } = useTranslation('engagement')
  const [title, setTitle] = useState(angle?.title ?? '')
  const [content, setContent] = useState(angle?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const valid = title.trim() !== '' && content.trim() !== ''

  const save = () => {
    if (!valid || saving) return
    setSaving(true)
    setFailed(false)
    const input = { title: title.trim(), content: content.trim() }
    const request = angle ? userAnglesApi.update(angle.id, input) : userAnglesApi.create(input)
    request.then(onSaved).catch(() => {
      setFailed(true)
      setSaving(false)
    })
  }

  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {angle ? t('composer.myAngles.form.editTitle') : t('composer.myAngles.form.newTitle')}
          </DialogTitle>
          <DialogDescription>{t('composer.myAngles.form.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault()
            save()
          }}
        >
          <label className="grid gap-1.5 text-xs text-[var(--bellum-text-muted)]">
            {t('composer.myAngles.form.title')}
            <Input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-xs text-[var(--bellum-text-muted)]">
            {t('composer.myAngles.form.content')}
            <Textarea value={content} maxLength={2000} rows={5} onChange={event => setContent(event.target.value)} />
          </label>
          {failed ? (
            <Text size="xs" role="alert" className="text-[var(--bellum-text-secondary)]">
              {t('composer.myAngles.error')}
            </Text>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
              {t('composer.myAngles.form.cancel')}
            </Button>
            <Button type="submit" variant="black" className="min-h-11" disabled={!valid || saving}>
              {t('composer.myAngles.form.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
