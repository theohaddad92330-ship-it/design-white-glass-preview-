import type { RecordLinkKind } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * #4191 (recette 2, E6) — un statut du panneau latéral se LIT dans la langue de l'utilisateur :
 * « qualified » s'écrit « Qualifié », jamais en valeur brute de base.
 *
 * Une clé par TYPE d'objet, sur les catalogues qui nomment déjà ces valeurs ailleurs dans le produit
 * (pipe, besoins, positionnements, missions, vivier) — aucune seconde traduction. Un statut que le
 * catalogue ne connaît pas rend `null` : on ne montre pas une valeur de base qu'on ne sait pas nommer.
 */
const STATUS_KEY_PREFIX: Record<RecordLinkKind, string | null> = {
  opportunity: 'projects:stage.states.',
  need: 'projects:needStatus.',
  submission: 'consultants:detail.submissionStage.',
  mission: 'missions:status.',
  consultant: 'consultants:availability.',
  account: null,
}

export function useRecordStatusLabel(): (kind: RecordLinkKind, value: string | null | undefined) => string | null {
  const { t, i18n } = useTranslation(['projects', 'consultants', 'missions'])
  return (kind, value) => {
    const prefix = STATUS_KEY_PREFIX[kind]
    if (!prefix || !value) return null
    const key = `${prefix}${value}`
    return i18n.exists(key) ? t(key) : null
  }
}
