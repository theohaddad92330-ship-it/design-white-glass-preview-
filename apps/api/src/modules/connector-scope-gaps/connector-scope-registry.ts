import { readGoogleConfig, googleAccessLevelOf, googleScopesForLevel } from '../google/google-config'
import { readHubspotConfig } from '../crm/crm-config'
import { readMicrosoftConfig } from '../microsoft/microsoft-config'
import { readPipedriveConfig } from '../pipedrive/pipedrive-config'
import { ZOHO_SCOPES } from '../zoho/zoho-config'

/** Les connecteurs dont le jeton RENDRE ses portées — les seuls où l'écart se mesure. */
export const SCOPE_GAP_PROVIDERS = ['hubspot', 'pipedrive', 'zoho', 'google', 'microsoft'] as const
export type ScopeGapProvider = (typeof SCOPE_GAP_PROVIDERS)[number]

/**
 * Les portées que les fournisseurs n'écrivent PAS dans la réponse du jeton : elles servent le
 * protocole (rafraîchissement, identité), pas une fonction. Les compter manquantes alerterait à
 * tort, à chaque connexion.
 */
const PROTOCOL_SCOPES = new Set(['oauth', 'offline_access', 'openid', 'profile', 'email', 'refresh_token'])

export function withoutProtocolScopes(scopes: readonly string[]): string[] {
  return scopes.filter(scope => !PROTOCOL_SCOPES.has(scope.toLowerCase()))
}

type ScopeGapConnector = {
  /** L'outil du CLIENT, nommé tel quel à l'écran (autorisé : c'est son outil, pas notre fournisseur). */
  label: string
  /** Où vivent les connexions de ce connecteur. */
  table: 'crm_connections' | 'google_connections' | 'microsoft_connections'
  /** Le filtre `provider` de la table (les CRM partagent `crm_connections`). */
  providerValue: string
  /**
   * Les portées que l'app demande AUJOURD'HUI, ou `null` quand ce serveur ne sait pas (connecteur
   * non configuré, niveau inconnu) — alors on ne compare pas.
   * `grantedScope` : les portées stockées, pour les connecteurs dont la demande dépend du niveau.
   */
  requested: (grantedScope?: string | null) => string | null
  /** La fonction que chaque portée ouvre, dite à l'utilisateur. */
  features: Record<string, string>
}

export const SCOPE_GAP_CONNECTORS: Record<ScopeGapProvider, ScopeGapConnector> = {
  hubspot: {
    label: 'HubSpot',
    table: 'crm_connections',
    providerValue: 'hubspot',
    requested: () => readHubspotConfig()?.scopes ?? null,
    features: {
      'crm.objects.contacts.read': 'la lecture des contacts',
      'crm.objects.contacts.write': 'l’envoi de contacts',
      'crm.objects.companies.read': 'la lecture des entreprises',
      'crm.objects.companies.write': 'l’envoi d’entreprises',
      'crm.objects.owners.read': 'la lecture des propriétaires d’affaires',
      'crm.objects.deals.read': 'la lecture des affaires',
      'crm.objects.deals.write': 'la proposition de stade sur une affaire',
    },
  },
  pipedrive: {
    label: 'Pipedrive',
    table: 'crm_connections',
    providerValue: 'pipedrive',
    requested: () => readPipedriveConfig()?.scopes || null,
    features: {},
  },
  zoho: {
    label: 'Zoho CRM',
    table: 'crm_connections',
    providerValue: 'zoho',
    requested: () => ZOHO_SCOPES.join(' '),
    features: {
      'ZohoCRM.modules.accounts.ALL': 'les comptes',
      'ZohoCRM.modules.contacts.ALL': 'les contacts',
      'ZohoCRM.modules.deals.READ': 'la lecture des affaires',
      'ZohoCRM.modules.tasks.CREATE': 'la création de tâches',
      'ZohoCRM.modules.notes.CREATE': 'la création de notes',
      'ZohoCRM.users.READ': 'la lecture des propriétaires',
    },
  },
  google: {
    label: 'Google',
    table: 'google_connections',
    providerValue: 'google',
    requested: grantedScope => {
      const config = readGoogleConfig()
      const level = googleAccessLevelOf(grantedScope)
      if (!config || !level) return null
      try {
        return googleScopesForLevel(config, level)
      } catch {
        return null
      }
    },
    features: {},
  },
  microsoft: {
    label: 'Microsoft 365',
    table: 'microsoft_connections',
    providerValue: 'microsoft',
    requested: () => readMicrosoftConfig()?.scopes ?? null,
    features: {
      'Mail.Send': 'l’envoi d’e-mails',
      'Mail.ReadWrite': 'la boîte de réception et les brouillons',
      'MailboxSettings.ReadWrite': 'la réponse d’absence',
      'Calendars.ReadWrite': 'l’agenda',
    },
  },
}

export function isScopeGapProvider(value: string): value is ScopeGapProvider {
  return (SCOPE_GAP_PROVIDERS as readonly string[]).includes(value)
}
