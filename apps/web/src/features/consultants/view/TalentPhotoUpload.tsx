import { Button, EntityAvatar } from '@bellum/ui'
import { Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TALENT_PHOTO_MAX_BYTES } from '@bellum/contracts'
import { useSetTalentPhoto } from '../talent-api'
import { talentPhotoSrc } from '../lib/talentPhoto'

/** Types acceptés — les mêmes que `talentPhotoSchema` côté serveur. */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/**
 * Le dépôt d'une photo sur la fiche d'un talent (piège n°3 du PDF-22 §01 :
 * « la colonne `photo_url` existe et s'affiche — toujours `null` en
 * pratique, aucune UI ne la pose »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CRITÈRE PROTÉGÉ (annexe III de l'EU AI Act) : la photo s'AFFICHE, point.
 * Ce composant n'envoie rien qui ressemble à un tri ou un score — il pose une
 * `photoUrl` sur la fiche via `PUT /talents/:id/photo`
 * (`TalentPhotoService`), le SEUL chemin d'écriture, tenu HORS des moteurs de
 * sélection surveillés (`protected-criteria.spec.ts`, GA-06).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE DATA URI, BORNÉE CÔTÉ CLIENT ET CÔTÉ SERVEUR
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun stockage d'objets binaires n'existe dans ce dépôt (voir
 * `talentPhotoSchema`). Le fichier est donc encodé en base64 et envoyé tel
 * quel — d'où la borne stricte : un portrait de fiche n'a besoin ni de haute
 * résolution ni de son poids d'origine.
 */
export function TalentPhotoUpload({
  talentId,
  name,
  photoUrl,
}: {
  talentId: string
  /** Sert à l'initiale de repli — jamais lu pour classer qui que ce soit ici. */
  name: string | null
  photoUrl: string | null | undefined
}) {
  const { t } = useTranslation('consultants')
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const setPhoto = useSetTalentPhoto(talentId)

  const pickFile = () => inputRef.current?.click()

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // Autorise de redéposer le MÊME fichier ensuite.
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      toast.error(t('detail.photo.badType'))
      return
    }

    setUploading(true)
    try {
      const dataUrl = await readAsDataUrl(file)
      if (dataUrl.length > TALENT_PHOTO_MAX_BYTES) {
        toast.error(t('detail.photo.tooBig'))
        return
      }
      await setPhoto.mutateAsync(dataUrl)
      toast.success(t('detail.photo.saved'))
    } catch {
      toast.error(t('detail.photo.error'))
    } finally {
      setUploading(false)
    }
  }

  const remove = () => {
    setPhoto
      .mutateAsync(null)
      .then(() => toast.success(t('detail.photo.removed')))
      .catch(() => toast.error(t('detail.photo.error')))
  }

  const busy = uploading || setPhoto.isPending

  /**
   * #1780 — PLUS D'AVATAR ICI : L'IDENTITÉ NE S'AFFICHE QU'UNE FOIS.
   *
   * Ce bloc en rendait un, l'entête de la fiche en rend un autre — deux fois la
   * même personne à cent pixels d'écart, et avec deux initiales différentes
   * puisque chacun lisait sa propre source (« NN » ici, « ? » là-bas). Le
   * composant garde ce qui n'existe qu'ici : le seul chemin d'ÉCRITURE de la
   * photo. Il est monté DANS l'entête, sous l'avatar qu'il modifie.
   */
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={pickFile}>
            <Upload className="size-3.5" />
            {photoUrl ? t('detail.photo.change') : t('detail.photo.add')}
          </Button>
          {photoUrl ? (
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy} onClick={remove}>
              <Trash2 className="size-3.5" />
              {t('detail.photo.remove')}
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          aria-label={t('detail.photo.add')}
          onChange={event => void onFileSelected(event)}
        />
      </div>
    </div>
  )
}

/** Le fichier → data URI complète (préfixe `data:image/…;base64,` compris) —
 *  c'est la forme que `talentPhotoSchema` attend. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}
