import { Box, Button, MOTION, Text } from '@bellum/ui'
import type { UiState } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Lock,
  PlugZap,
  PuzzleIcon,
  SearchX,
  ShieldQuestion,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * L'ÉTAT D'UN ÉCRAN, RENDU — PDF 1 §2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucun écran ne rend un tableau vide sans état déclaré. » La dérivation vit
 * dans `@bellum/contracts` (`resolveScreenState`) et se teste en 3 ms ; ce
 * fichier est la moitié VISIBLE de la règle, celle sans laquelle le contrat
 * serait du code juste que personne n'appelle.
 *
 * Ce qu'elle rend impossible, écran par écran :
 *  - confondre « rien n'a jamais existé » et « un filtre a produit du vide » —
 *    le premier appelle une CRÉATION, le second un FILTRE, et GA-106 a mesuré
 *    en production un écran qui proposait de dépenser 8 crédits pour un
 *    problème dont la sortie était de retirer un filtre ;
 *  - écrire « données incomplètes » : `partial` NOMME ce qui manque ;
 *  - écrire « une erreur est survenue » : `error` NOMME le geste de reprise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne remplace pas les bandeaux d'ACCÈS (`ROUTE_ACCESS_STATES`) : ceux-là
 * disent qu'on ne peut pas entrer, celle-ci ce qu'on trouve une fois entré.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCESSIBILITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `error` est annoncé (`role="alert"`) ; les neuf autres passent par une région
 * polie (`role="status"`), qui n'interrompt pas la lecture en cours. Le geste
 * est TOUJOURS un `<button>` ou un `<Link>` — jamais un `<div onClick>` (GA-35).
 */

/** Une icône par état. Le `Record` est EXHAUSTIF : ajouter un onzième état sans
 *  lui donner d'icône ne compile pas. */
const ICONS: Readonly<Record<UiState, LucideIcon>> = {
  loading: Loader2,
  // Deux icônes DIFFÉRENTES, comme les deux messages : un bac vide n'est pas
  // une recherche sans résultat, et l'œil le voit avant de lire.
  empty_never: Inbox,
  empty_true: SearchX,
  partial: PuzzleIcon,
  stale: Clock,
  no_integration: PlugZap,
  permission: Lock,
  approval_required: ShieldQuestion,
  error: AlertTriangle,
  success: CheckCircle2,
}

/**
 * La couleur de l'icône, par état.
 *
 * Elle passe par un jeton `*-soft-text` et jamais par la couleur sémantique
 * brute : `--bellum-warning` fait 9,47:1 en sombre et 1,84:1 en clair, et une
 * ligne illisible ne prévient personne (D79).
 */
const TONES: Readonly<Record<UiState, string>> = {
  loading: 'text-[var(--bellum-text-muted)]',
  empty_never: 'text-[var(--bellum-text-muted)]',
  empty_true: 'text-[var(--bellum-text-muted)]',
  partial: 'text-[var(--warning-soft-text)]',
  stale: 'text-[var(--warning-soft-text)]',
  no_integration: 'text-[var(--info-soft-text)]',
  permission: 'text-[var(--bellum-text-muted)]',
  approval_required: 'text-[var(--info-soft-text)]',
  error: 'text-[var(--danger-soft-text)]',
  success: 'text-[var(--success-soft-text)]',
}

type ScreenStateActionProp = {
  label: string
  /** Une destination interne. Exclusif avec `onClick`. */
  to?: string
  onClick?: () => void
}

type ScreenStateProps = {
  state: UiState
  /**
   * Le titre de CET écran. Absent, on retombe sur le nom générique de l'état.
   *
   * Il existe parce que « Accès réservé » en dit plus que « Pas ton
   * périmètre » sur un journal d'activité : la source demande des messages
   * différents PAR ÉCRAN, pas un gabarit unique.
   */
  title?: string
  /**
   * Le message de CET écran. Absent, on retombe sur le message générique de
   * l'état — jamais sur un code, jamais sur un blanc.
   *
   * ⚠️ Sur `empty_never` et `empty_true`, le passer est fortement recommandé :
   * §2.4 exige que les deux aient des messages différents SUR CHAQUE ÉCRAN, et
   * un défaut partagé dit « aucun élément » deux fois.
   */
  message?: string
  /** Ce qui manque, NOMMÉ. Obligatoire de fait sur `partial`. */
  detail?: string | null
  action?: ScreenStateActionProp | null
  className?: string
}

export function ScreenState({ state, title, message, detail, action, className }: ScreenStateProps) {
  const { t } = useTranslation('screenState')
  const Icon = ICONS[state]
  const isError = state === 'error'

  return (
    <motion.div
      initial={MOTION.reveal.initial}
      animate={MOTION.reveal.animate}
      transition={MOTION.reveal.transition}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-screen-state={state}
      className={className}
    >
      <Box display="flex" className="flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon size={28} aria-hidden="true" className={`${TONES[state]} ${state === 'loading' ? 'animate-spin' : ''}`} />
        {/* Le NOM de l'état, lisible. C'est lui qui distingue à l'œil « jamais
            alimenté » de « filtré » avant même qu'on lise la phrase. */}
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {title ?? t(`states.${state}.title`)}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {message ?? t(`states.${state}.description`)}
        </Text>
        {detail ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {detail}
          </Text>
        ) : null}
        {action ? <ScreenStateActionButton action={action} /> : null}
      </Box>
    </motion.div>
  )
}

/** Le geste. Un `<Link>` quand il mène quelque part, un `<button>` sinon — dans
 *  les deux cas tabulable, avec une cible d'au moins 44 px au doigt (GA-30). */
function ScreenStateActionButton({ action }: { action: ScreenStateActionProp }) {
  if (action.to) {
    return (
      <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
        <Link to={action.to}>{action.label}</Link>
      </Button>
    )
  }
  return (
    <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}
