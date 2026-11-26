import { z } from 'zod'

/**
 * La durée de vie d'un lien de réinitialisation généré par le back-office.
 *
 * ## Deux échéances, et une seule fait foi
 *
 * Notre lien porte sa propre échéance, SIGNÉE — c'est ce qui empêche quelqu'un
 * de rallonger la validité en changeant le paramètre dans l'URL. Mais le jeton
 * lui-même est échangé chez Supabase (`verifyOtp`), qui applique SA propre
 * expiration (`MAILER_OTP_EXP`, une heure par défaut).
 *
 * ⚠️ **La plus COURTE des deux gagne, toujours.** Promettre 48 heures pendant
 * que le projet Supabase en accorde une produirait le pire lien possible : notre
 * écran l'accepte, l'utilisateur saisit son mot de passe, et Supabase refuse à
 * l'échange. Il aurait mieux valu annoncer une heure.
 *
 * D'où `clampResetTtl` : la durée demandée est RAMENÉE au plafond réel, et
 * l'appelant apprend qu'elle l'a été. Un back-office qui affiche « valable
 * jusqu'à » doit afficher la vérité, pas l'intention.
 *
 * Pour porter la durée maximale, il faut aussi la poser côté Supabase
 * (Authentication › Sign In / Providers › Email › « Email OTP expiration ») et
 * déclarer la même valeur dans `SUPABASE_OTP_EXP_SECONDS`. Sans quoi le plafond
 * ramène tout.
 */

const HOUR_MS = 60 * 60 * 1000

/**
 * Le plafond de la PLATEFORME Supabase : 86 400 secondes, soit 24 heures.
 *
 * ⚠️ Ce n'est pas un réglage de projet, c'est une limite du produit — le tableau
 * de bord refuse toute valeur supérieure (« Must be no more than 86400 »).
 * Mesuré le 25/08 en essayant précisément de poser 48 heures.
 *
 * C'est pour cela qu'aucun choix ne dépasse 24 h ci-dessous : proposer 48 heures
 * ou 7 jours reviendrait à offrir une durée qui ne pourra JAMAIS être honorée.
 * L'écrêtage l'annoncerait honnêtement à chaque génération, mais un choix
 * systématiquement corrigé est une case qui ne fait rien.
 */
export const SUPABASE_OTP_EXP_CEILING_MS = 24 * HOUR_MS

/** Les durées proposées au back-office, de la plus courte à la plus longue. */
export const RESET_LINK_TTL_CHOICES = [
  { key: '1h', ms: HOUR_MS },
  { key: '6h', ms: 6 * HOUR_MS },
  { key: '12h', ms: 12 * HOUR_MS },
  { key: '24h', ms: 24 * HOUR_MS },
] as const
export type ResetLinkTtlKey = (typeof RESET_LINK_TTL_CHOICES)[number]['key']

export const resetLinkTtlKeySchema = z.enum(['1h', '6h', '12h', '24h'])

/**
 * Le défaut : 24 heures — le maximum que Supabase autorise.
 *
 * Louis avait demandé 48 heures ; la plateforme les refuse (voir
 * `SUPABASE_OTP_EXP_CEILING_MS`). On prend donc le plus long qui EXISTE plutôt
 * que d'annoncer une durée corrigée à chaque génération.
 *
 * Un lien de back-office se transmet à la main — message, appel, réunion — et la
 * personne l'ouvre quand elle peut. Quinze minutes, la durée du flux e-mail en
 * libre-service, obligeaient l'opérateur à regénérer un lien à chaque fois que
 * quelqu'un ne répondait pas dans l'heure.
 *
 * Le jeton reste à USAGE UNIQUE : c'est lui qui porte la sécurité, pas la
 * fenêtre. Un lien consommé ne vaut plus rien, quelle que soit son échéance.
 */
export const DEFAULT_RESET_LINK_TTL: ResetLinkTtlKey = '24h'

/** La durée d'un choix, en millisecondes. */
export function resetTtlMs(key: ResetLinkTtlKey): number {
  return RESET_LINK_TTL_CHOICES.find(choice => choice.key === key)?.ms ?? SUPABASE_OTP_EXP_CEILING_MS
}

export type ClampedTtl = {
  /** Ce qui est réellement accordé. */
  readonly ms: number
  /** La durée demandée a-t-elle été rabotée par le plafond ? */
  readonly clamped: boolean
}

/**
 * Ramène une durée demandée au plafond réellement accordé par Supabase.
 *
 * `ceilingMs` non renseigné ou absurde (≤ 0) ⇒ on n'invente PAS de plafond et la
 * durée demandée passe telle quelle. Deviner une limite ferait raccourcir des
 * liens sans raison sur un projet correctement configuré — et le sens de
 * l'erreur compte : un lien trop court se regénère, un lien qui ment coûte un
 * aller-retour avec quelqu'un de bloqué.
 */
export function clampResetTtl(requestedMs: number, ceilingMs?: number | null): ClampedTtl {
  if (typeof ceilingMs !== 'number' || !Number.isFinite(ceilingMs) || ceilingMs <= 0) {
    return { ms: requestedMs, clamped: false }
  }
  return ceilingMs < requestedMs ? { ms: ceilingMs, clamped: true } : { ms: requestedMs, clamped: false }
}
