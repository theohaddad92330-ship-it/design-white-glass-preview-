import { ServiceUnavailableException } from '@nestjs/common'
import type { OAuthAccessLevel } from '@bellum/contracts'

/**
 * Google Workspace OAuth configuration, read from the environment. The whole
 * feature is a no-op until these are set — mirrors HubSpot / Salesforce / the
 * other optional integrations: no key ⇒ the endpoints report "not configured"
 * (the Réglages › Intégrations card stays "bientôt disponible") and ZERO network
 * calls are made.
 *
 * Register an OAuth 2.0 Client (console.cloud.google.com › APIs & Services ›
 * Credentials › OAuth client ID › Web application), enable the Calendar, Gmail
 * and Drive APIs, then set:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   = <API_PUBLIC_URL>/google/callback  (must match the
 *                           authorized redirect URI registered on the client)
 *   GOOGLE_SCOPES         (optional) space-separated; the default below is the
 *                           `read_write` level. Narrow it to disable a capability.
 *                           The `read` level keeps only its READ scopes out of
 *                           this list (#2078.22).
 */

// Les portées Google, UNE fois — `google.service.ts` les lit d'ici pour dériver
// les capacités accordées (elles y étaient recopiées, et deux copies divergent).
export const GOOGLE_SCOPE = {
  // Écriture / action (les trois capacités d'origine, dont la lecture Drive).
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  driveReadonly: 'https://www.googleapis.com/auth/drive.readonly',
  // Lecture + brouillon + export (ajout additif — un utilisateur connecté avant
  // cet élargissement garde son accord plus étroit ; les capacités se dérivent
  // des portées RÉELLEMENT accordées, donc les nouvelles restent grisées tant
  // qu'il ne s'est pas reconnecté).
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose',
  spreadsheets: 'https://www.googleapis.com/auth/spreadsheets',
  // Socle exécutif (méta-analyses besoins, 03/08/2026) : la réponse d'absence et
  // la signature réelle vivent dans les réglages de la boîte, les libellés dans
  // leur propre portée. Deux portées SENSIBLES, pas restreintes — elles ne
  // donnent accès ni au corps des messages ni à leur modification.
  gmailSettingsBasic: 'https://www.googleapis.com/auth/gmail.settings.basic',
  gmailLabels: 'https://www.googleapis.com/auth/gmail.labels',
  /**
   * `gmail.modify` — la portée qui permet d'APPLIQUER une étiquette et d'archiver.
   *
   * Elle est RESTREINTE chez Google : l'accorder donne aussi le droit de SUPPRIMER
   * du courrier, et elle impose une revue de sécurité annuelle. Elle n'est donc
   * PAS dans le défaut, et le code d'étiquetage vit derrière la capacité qu'elle
   * ouvre : sans elle, l'écran dit que la fonction est éteinte plutôt que
   * d'échouer au clic.
   *
   * Arbitrage Louis du 03/08 : « coder maintenant, portée opt-in par espace ».
   * L'opérateur qui a obtenu la validation Google ajoute la portée à
   * `GOOGLE_SCOPES` ; ses utilisateurs se reconnectent, et la capacité s'allume
   * d'elle-même — la même mécanique que `gmail.readonly` de la couche zéro.
   */
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
} as const

/**
 * #2078.22 — LA MATRICE D'AUTORISATION : deux niveaux nommés, chacun sa liste.
 *
 * Avant, une connexion demandait TOUJOURS le lot complet — envoyer du courrier,
 * écrire des brouillons, créer des évènements — même pour qui ne voulait que
 * laisser Laura lire ses échanges. Le niveau `read` ne demande que ce qui se
 * LIT ; `read_write` y ajoute ce qui ÉCRIT, et reste le défaut historique.
 *
 * `gmail.settings.basic` et `gmail.labels` sont rangées en ÉCRITURE : elles
 * permettent de modifier la réponse d'absence et de créer des libellés, et le
 * fournisseur ne les décline pas en lecture seule.
 *
 * ⚠️ Toute portée absente de la liste de lecture est traitée comme une ÉCRITURE
 * — y compris une portée qu'un opérateur ajouterait demain. L'inverse serait
 * dangereux : une nouvelle portée se glisserait dans le niveau lecture.
 */
const GOOGLE_READ_SCOPES: readonly string[] = [
  GOOGLE_SCOPE.gmailReadonly,
  GOOGLE_SCOPE.calendarReadonly,
  GOOGLE_SCOPE.driveReadonly,
]
const GOOGLE_WRITE_SCOPES: readonly string[] = [
  GOOGLE_SCOPE.calendarEvents,
  GOOGLE_SCOPE.gmailSend,
  GOOGLE_SCOPE.gmailCompose,
  GOOGLE_SCOPE.spreadsheets,
  GOOGLE_SCOPE.gmailSettingsBasic,
  GOOGLE_SCOPE.gmailLabels,
]

const DEFAULT_SCOPES = [...GOOGLE_READ_SCOPES, ...GOOGLE_WRITE_SCOPES].join(' ')

function scopeTokens(scope: string | null | undefined): string[] {
  return (scope ?? '').split(/\s+/).filter(Boolean)
}

/**
 * Les portées à demander pour un niveau — #2078.22.
 *
 * `read_write` rend la liste configurée telle quelle (`GOOGLE_SCOPES` ou le
 * défaut) : rien ne change pour qui se connectait déjà. `read` n'en garde QUE
 * les portées de lecture : une liste d'opérateur ne peut pas faire entrer une
 * écriture dans le niveau lecture. Une liste sans aucune portée de lecture rend
 * ce niveau impossible, et on le dit plutôt que d'envoyer une demande vide.
 */
export function googleScopesForLevel(config: GoogleConfig, level: OAuthAccessLevel): string {
  if (level === 'read_write') return config.scopes
  const read = scopeTokens(config.scopes).filter(scope => GOOGLE_READ_SCOPES.includes(scope))
  if (read.length === 0) {
    throw new ServiceUnavailableException('La connexion en lecture seule n’est pas disponible sur ce serveur.')
  }
  return read.join(' ')
}

/**
 * Le niveau d'une connexion, lu dans les portées que le fournisseur a RENDUES —
 * #2078.23. Une seule portée hors de la liste de lecture suffit à dire
 * `read_write`. Une connexion dont on ignore les portées n'a pas de niveau
 * (`null`) : elle n'est pas « en lecture », on ne sait pas.
 */
export function googleAccessLevelOf(scope: string | null | undefined): OAuthAccessLevel | null {
  const granted = scopeTokens(scope)
  if (granted.length === 0) return null
  return granted.some(entry => !GOOGLE_READ_SCOPES.includes(entry)) ? 'read_write' : 'read'
}

/**
 * The single SPA origin the OAuth callback redirects the browser back to.
 * `FRONTEND_URL` may be a comma-separated list during a domain migration — the
 * OAuth redirect needs exactly one URL, so take the first non-empty entry.
 */
export function frontendOrigin(): string {
  const first = (process.env['FRONTEND_URL'] ?? '')
    .split(',')
    .map(origin => origin.trim())
    .find(Boolean)
  return first || 'http://localhost:3000'
}

export type GoogleConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** The `read_write` level's scopes (the historical full set). */
  scopes: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readGoogleConfig(): GoogleConfig | null {
  const clientId = process.env['GOOGLE_CLIENT_ID']?.trim()
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['GOOGLE_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env['GOOGLE_SCOPES']?.trim() || DEFAULT_SCOPES,
    frontendUrl: frontendOrigin(),
  }
}
