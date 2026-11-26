import { useConversationContextMode } from '../useConversationContextMode'
import { ContextModePicker } from './ContextModePicker'

/**
 * #2451 / #2453 — LE SÉLECTEUR « CONTEXTE DE TRAVAIL », sous le composeur de Laura.
 *
 * Il dit ce que Laura a le droit d'utiliser pour personnaliser CE fil : Mon
 * activité (défaut), Mission ponctuelle, Neutre. Il n'écrit rien : ni profil, ni
 * préférence, ni requête — le mode part avec chaque tour et c'est le service IA
 * qui retire les couches (`apps/ia/app/services/context_mode.py`).
 *
 * #2451.1 — la LISTE et son habillage (popover / feuille du bas) vivent dans
 * `ContextModePicker`, le composant unique que montent aussi Analyser et
 * Découvrir (`SurfaceContextChip`) ; ce sélecteur-ci n'ajoute que la mémoire
 * PAR FIL (`contextModeStore`) et le défaut d'espace.
 *
 * Il ne vit que là où un TOUR va partir (#2451.3) : sous la saisie, jamais sur
 * une fiche déjà calculée.
 */
export function ContextModeSelector({
  conversationId,
  disabled,
}: {
  conversationId: string | null
  disabled?: boolean
}) {
  const { current, choose } = useConversationContextMode(conversationId)
  return <ContextModePicker value={current} onChange={choose} disabled={disabled || !conversationId} />
}
