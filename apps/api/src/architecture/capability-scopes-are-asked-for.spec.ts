import { readGoogleConfig } from '../modules/google/google-config'
import { readMicrosoftConfig } from '../modules/microsoft/microsoft-config'
import { TOOL_CAPABILITIES } from '../modules/tool-registry/tool-capabilities'

/**
 * UNE CAPACITÉ NE PEUT PAS EXIGER UNE PORTÉE QUE PERSONNE NE DEMANDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `tool-capabilities.ts` déclare que Microsoft 365 sait « chercher dans ton
 * espace documentaire », et que ce geste exige `Files.Read.All`. Le produit
 * l'implémente vraiment : `MicrosoftService.searchFiles`,
 * `fetchFileForAttachment`, `MicrosoftClient.searchFiles`, et jusqu'au test de
 * connecteur `microsoft:search` que l'opérateur peut déclencher depuis l'écran
 * Intégrations.
 *
 * Mais `Files.Read.All` n'est dans AUCUNE portée demandée : ni dans
 * `DEFAULT_SCOPES`, ni ailleurs. Un utilisateur qui connecte son compte ne
 * l'accorde donc jamais, `hasScope(granted, FILES_READ_SCOPE)` est faux pour
 * tout le monde, et `searchFiles` rend `[]` — silencieusement, pour toujours.
 * C'est le défaut n°1 du dépôt sous une nouvelle forme : **du code juste, testé,
 * que rien ne peut appeler.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ DÉCIDÉ, ET POURQUOI CE N'EST PAS « AJOUTER LA PORTÉE »
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ajouter au défaut serait le geste évident, et il serait mauvais. Chez
 * Microsoft Graph, `Files.Read.All` n'est PAS l'équivalent de `drive.readonly`
 * côté Google : elle porte sur TOUT ce que l'utilisateur peut atteindre dans le
 * tenant (OneDrive ET SharePoint), et beaucoup de tenants la placent derrière un
 * consentement d'administrateur. La mettre dans le défaut ferait donc tomber la
 * connexion ENTIÈRE — messagerie et agenda compris, qui marchent aujourd'hui —
 * derrière l'accord d'un administrateur, pour une capacité secondaire. Le
 * moindre privilège et le fait de ne pas casser ce qui marche disent la même
 * chose : elle reste **opt-in par l'opérateur**, via `MICROSOFT_SCOPES`.
 *
 * C'est exactement le motif déjà retenu pour `GMAIL_MODIFY_SCOPE`
 * (`google-config.ts`), portée RESTREINTE chez Google, hors du défaut, que
 * l'opérateur ajoute quand il a obtenu la validation ; ses utilisateurs se
 * reconnectent et la capacité s'allume d'elle-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * La décision était écrite dans un COMMENTAIRE, et un commentaire ne fait
 * échouer aucune CI. Ce que la garde impose est l'invariant : **toute portée
 * exigée par une capacité déclarée est soit demandée par défaut, soit NOMMÉE
 * ici comme opt-in avec sa raison.** Les deux issues restent ouvertes, aucune
 * n'est silencieuse — ce qui devient impossible, c'est la troisième : une
 * capacité qui exige une portée dont plus personne ne sait qu'elle manque.
 *
 * Ajouter une capacité en oubliant sa portée fait donc rougir la CI, et
 * l'auteur doit trancher explicitement : je la demande, ou je l'inscris comme
 * opt-in en disant pourquoi.
 */

/**
 * Les portées exigées par une capacité et volontairement HORS du défaut.
 *
 * Une entrée ici est une décision, pas une dérogation de confort : elle dit que
 * la capacité restera éteinte (`scope_missing` à l'écran, ce que le produit
 * affiche déjà) jusqu'à ce qu'un opérateur ajoute la portée et que
 * l'utilisateur se reconnecte.
 */
const OPT_IN_SCOPES: Record<string, { provider: string; reason: string }> = {
  'Files.Read.All': {
    provider: 'microsoft',
    reason:
      'Portée à l’échelle du tenant (OneDrive + SharePoint), fréquemment soumise au ' +
      'consentement d’un administrateur. Dans le défaut, elle mettrait la connexion ' +
      'entière — messagerie et agenda inclus — derrière cet accord, pour une capacité ' +
      'secondaire. Ajoutée par l’opérateur via MICROSOFT_SCOPES ; même motif que ' +
      'GMAIL_MODIFY_SCOPE côté Google.',
  },
}

/** Les portées réellement demandées, lues par le VRAI lecteur de configuration. */
function defaultScopesFor(provider: string): Set<string> {
  const previous = { ...process.env }
  try {
    // Les trois clés obligatoires, sinon `readXConfig()` rend `null` (no-op sans
    // clé). On ne touche JAMAIS à `*_SCOPES` : c'est le défaut qu'on veut lire.
    process.env['MICROSOFT_CLIENT_ID'] = 'guard'
    process.env['MICROSOFT_CLIENT_SECRET'] = 'guard'
    process.env['MICROSOFT_REDIRECT_URI'] = 'https://guard.invalid/callback'
    process.env['GOOGLE_CLIENT_ID'] = 'guard'
    process.env['GOOGLE_CLIENT_SECRET'] = 'guard'
    process.env['GOOGLE_REDIRECT_URI'] = 'https://guard.invalid/callback'
    delete process.env['MICROSOFT_SCOPES']
    delete process.env['GOOGLE_SCOPES']

    const config = provider === 'microsoft' ? readMicrosoftConfig() : readGoogleConfig()
    if (!config) return new Set()
    return new Set(config.scopes.split(/\s+/).filter(Boolean))
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
  }
}

/** Les fournisseurs dont les portées se comparent : ceux qui ont un défaut lisible. */
const OAUTH_PROVIDERS = ['google', 'microsoft'] as const

/**
 * Le fournisseur OAuth derrière une clé de `TOOL_CAPABILITIES`. Gmail, Google
 * Agenda et Google Drive sont trois entrées du catalogue pour UNE connexion.
 */
function oauthProviderOf(key: string): (typeof OAUTH_PROVIDERS)[number] | null {
  if (key === 'microsoft') return 'microsoft'
  if (key === 'gmail' || key === 'google-calendar' || key === 'google-drive') return 'google'
  return null
}

describe('Une capacité déclarée n’exige jamais une portée que personne ne demande', () => {
  it('LIT vraiment : le catalogue de capacités et les deux défauts sont peuplés', () => {
    // Preuve anti-garde-borgne n°1 — sans corpus, tout ce qui suit passerait à vide.
    const declared = Object.entries(TOOL_CAPABILITIES)
    expect(declared.length).toBeGreaterThan(3)

    const withOauth = declared.filter(([key]) => oauthProviderOf(key) !== null)
    expect(withOauth.length).toBeGreaterThanOrEqual(4)

    for (const provider of OAUTH_PROVIDERS) {
      const scopes = defaultScopesFor(provider)
      expect(scopes.size).toBeGreaterThan(2)
    }

    // Et les capacités concernées exigent bien des portées à comparer.
    const allScopes = withOauth.flatMap(([, caps]) => caps.flatMap(c => [...c.scopes]))
    expect(allScopes.length).toBeGreaterThan(8)
  })

  it('sait dire NON : une portée inventée, ni demandée ni inscrite, est refusée', () => {
    // Preuve anti-garde-borgne n°2 — on exerce la comparaison, pas une intention.
    const asked = defaultScopesFor('microsoft')
    const invented = 'Directory.ReadWrite.All'
    expect(asked.has(invented)).toBe(false)
    expect(OPT_IN_SCOPES[invented]).toBeUndefined()

    // La portée réellement opt-in, elle, est absente du défaut ET inscrite : c'est
    // la seule façon de passer.
    expect(asked.has('Files.Read.All')).toBe(false)
    expect(OPT_IN_SCOPES['Files.Read.All']?.provider).toBe('microsoft')
    expect(OPT_IN_SCOPES['Files.Read.All']?.reason.length).toBeGreaterThan(80)
  })

  it('chaque portée exigée est soit demandée par défaut, soit inscrite comme opt-in', () => {
    const missing: string[] = []

    for (const [catalogKey, capabilities] of Object.entries(TOOL_CAPABILITIES)) {
      const provider = oauthProviderOf(catalogKey)
      if (!provider) continue
      const asked = defaultScopesFor(provider)

      for (const capability of capabilities) {
        for (const scope of capability.scopes) {
          if (asked.has(scope)) continue
          if (OPT_IN_SCOPES[scope]?.provider === provider) continue
          missing.push(`${catalogKey}.${capability.key} exige « ${scope} », que personne ne demande`)
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('aucune portée inscrite comme opt-in n’a discrètement rejoint le défaut', () => {
    // L'inverse compte aussi : une entrée devenue obsolète ferait croire qu'une
    // capacité est éteinte alors qu'elle est allumée. On archive, on ne ment pas.
    for (const [scope, { provider }] of Object.entries(OPT_IN_SCOPES)) {
      expect(defaultScopesFor(provider).has(scope)).toBe(false)
    }
  })
})
