import type { SESSION_REVOKED_CODE } from '@bellum/contracts'

export type AuthFailureCode =
  | 'invalid_credentials'
  | 'invalid_refresh_token'
  /** Session tenue 24 h (15/09/2026) : le fournisseur d'identité n'a pas pu
   *  répondre (réseau, 5xx, 429). Rien n'est dit du jeton → 503, jamais 401. */
  | 'auth_provider_unavailable'
  | 'user_not_found'
  | 'email_taken'
  | 'signup_failed'
  | 'oauth_url_failed'
  | 'oauth_tokens_invalid'
  | 'logout_failed'
  | 'delete_failed'
  | 'otp_failed'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_throttled'
  | 'otp_max_attempts'
  | 'reset_token_invalid'
  | 'reset_token_expired'
  | 'password_update_failed'
  /** R15-7 (15/09/2026) : l'appareil a été révoqué (plafond d'appareils, ou
   *  « déconnecter cet appareil » depuis un autre). 401 qui porte ce code : le
   *  client ne relance pas de refresh et propose de se reconnecter. */
  | typeof SESSION_REVOKED_CODE

export type AuthFailure = {
  code: AuthFailureCode
  message: string
}
