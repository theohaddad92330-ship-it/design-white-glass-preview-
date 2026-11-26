import { Box, Button, Input, Text } from '@bellum/ui'
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Un champ de fiche corrigeable sur place.
 *
 * Jusqu'ici une fiche était en lecture seule : une erreur de collecte restait
 * affichée jusqu'au run suivant, qui la reproduisait. Personne ne signale une
 * erreur qu'il ne peut pas réparer — c'est pour ça que le premier geste d'un
 * CRM est de pouvoir corriger ce qu'on voit.
 *
 * Deux détails qui comptent :
 *  - une valeur absente s'affiche « Non renseigné » en gris et reste
 *    cliquable ; un blanc muet se lit comme un bug d'affichage ;
 *  - vider le champ est autorisé et enregistre bien un effacement — l'humain
 *    est le seul à pouvoir dire « cette information est fausse ».
 */
export function EditableField({
  label,
  value,
  displayValue,
  onSave,
  isSaving,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  label: string
  value: string | null | undefined
  /**
   * #3850.4 — ce qui se LIT quand le champ est fermé (ex. téléphone en
   * international lisible), SANS changer ce qui s'ÉDITE ni ce qui se SAUVE :
   * `value` reste la forme stockée, reprise telle quelle dans le brouillon à
   * l'ouverture. Par défaut, identique à `value`.
   */
  displayValue?: string | null
  /** Rend la nouvelle valeur, ou `null` quand l'utilisateur vide le champ. */
  onSave: (next: string | null) => void
  isSaving?: boolean
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'url'
  disabled?: boolean
}) {
  const { t } = useTranslation('crm')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  const commit = () => {
    const next = draft.trim()
    const current = (value ?? '').trim()
    if (next !== current) onSave(next === '' ? null : next)
    setEditing(false)
  }

  if (editing) {
    return (
      <Box className="space-y-1">
        <Text element="span" size="xs" color="text-muted-foreground">
          {label}
        </Text>
        {/* #3702 — mesuré en prod le 10/10 : le champ Nom en édition faisait 61 px
            dans un parent de 141 px (deux boutons de 36 px à sa droite). Le champ prend
            la ligne entière (`basis-full`, `min-w-0`), les boutons passent dessous. */}
        <Box display="flex" className="flex-wrap items-center gap-1">
          <Input
            className="min-w-0 basis-full"
            autoFocus
            type={type}
            value={draft}
            placeholder={placeholder}
            aria-label={label}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                setDraft(value ?? '')
                setEditing(false)
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={commit}
            aria-label={t('field.confirm')}
            disabled={isSaving}
          >
            <Check className="size-4" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => {
              setDraft(value ?? '')
              setEditing(false)
            }}
            aria-label={t('field.cancel')}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box className="space-y-1">
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Box display="flex" className="items-center gap-2">
        <Text size="sm" color={value ? undefined : 'text-muted-foreground'}>
          {(value ? (displayValue ?? value) : value) || t('field.empty')}
        </Text>
        {disabled ? null : (
          <Button
            variant="ghost"
            size="icon"
            // #2598.4 bis — décision Louis 20/09/2026 : affordance de correction
            // PERMANENTE, partout. L'ancien `opacity-0 pointer-coarse:opacity-100
            // group-hover:… focus-visible:…` cachait le crayon par défaut et ne le
            // révélait que sous pointeur grossier, au survol souris ou au focus —
            // or `pointer-coarse:` dépend d'une détection de pointeur qui ment sur
            // certains hybrides (trackpad tactile, stylet). Le repère de
            // modification est maintenant toujours à l'écran, sans condition.
            //
            // #2598.4 — réfuté en production le 20/09 : mesuré `width = height =
            // 36px`, sans survol, sur six boutons (fiche contact) et dix (fiche
            // compte LVMH). Le variant `icon` partagé (`packages/ui`) ne porte un
            // plancher tactile de 44px QUE `pointer-coarse:` (GA-30 : « une
            // tablette pointée à la souris n'en a pas besoin ») — correct pour un
            // bouton parmi d'autres, faux pour LE geste de correction d'une fiche,
            // seul sur son champ. `min-h-11 min-w-11` ci-dessous l'étend SANS
            // condition de pointeur : c'est la ZONE cliquable qui grandit (`min-*`
            // l'emporte sur la taille de base `size-9` du variant), jamais le
            // crayon dessiné (`size-3.5` plus bas, inchangé) — la densité visuelle
            // de la fiche ne bouge pas au repos.
            className="min-h-11 min-w-11"
            onClick={() => setEditing(true)}
            aria-label={t('field.edit', { field: label })}
            title={t('field.edit', { field: label })}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        )}
      </Box>
    </Box>
  )
}
