import { SetMetadata } from '@nestjs/common'
import type { PlanFeatureKey } from '@bellum/contracts'

export const REQUIRE_FEATURE_KEY = 'bellum:require-plan-feature'

/**
 * Déclare qu'une route n'est ouverte qu'aux paliers portant cette feature.
 * Lue par {@link PlanFeatureGuard} — sans le guard dans la chaîne, l'annotation
 * ne fait RIEN (c'est le guard qui refuse, pas le décorateur).
 *
 * S'applique sur une classe (tout le contrôleur) ou sur un handler ; la valeur
 * la plus proche du handler gagne.
 */
export const RequireFeature = (feature: PlanFeatureKey) => SetMetadata(REQUIRE_FEATURE_KEY, feature)

export const REQUIRE_OPEN_TRIAL_KEY = 'bellum:require-open-trial'

/**
 * #4629.2 — déclare qu'une route COÛTE du modèle (chat, Découvrir) : un essai terminé la ferme, propriétaire compris.
 * Lue par {@link PlanFeatureGuard}, qui refuse en ÉNUMÉRANT ce qui reste ouvert (`trialLockMessage`).
 */
export const RequireOpenTrial = () => SetMetadata(REQUIRE_OPEN_TRIAL_KEY, true)
