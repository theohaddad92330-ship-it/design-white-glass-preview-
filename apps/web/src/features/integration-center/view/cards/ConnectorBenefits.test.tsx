import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ConnectedTool } from '@bellum/contracts'
import fr from '@/i18n/locales/fr/integrationCenter.json'
import en from '@/i18n/locales/en/integrationCenter.json'
import { ConnectorBenefits } from './ConnectorBenefits'
import { connectorActions } from './connector-benefits'

/**
 * #1443 — la carte dit ce que le registre l'autorise à faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME DE CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une DÉCLARATION PAR CLÉ, dont la preuve se lit sur le disque — pas une liste
 * de mots. Le catalogue serveur est la source ; chacun des jetons qu'il déclare
 * doit avoir une phrase en FR **et** en EN. Une liste de mots aurait raté
 * exactement ce qui se produit ici : ce sont des VERBES (`send_to_signature`,
 * `read_consultants`) qu'on ajoute au catalogue, pas des noms propres, et un
 * jeton neuf serait passé sans un bruit — soit affiché brut à l'écran, soit
 * silencieusement sauté, c'est-à-dire une promesse perdue.
 */

const tool = (over: Partial<ConnectedTool> = {}): ConnectedTool =>
  ({
    provider: 'demo',
    family: 'crm',
    display_name: 'Demo',
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    capability_state: 'operational',
    capabilities: [],
    ...over,
  }) as ConnectedTool

/** Les jetons que le catalogue SERVEUR déclare, lus sur le disque. */
function catalogActions(): string[] {
  // Ancré sur CE fichier : le cwd d'un run vitest est la racine du dépôt, pas
  // `apps/web` — un chemin relatif lirait à côté, et l'assertion de non-vide
  // plus bas est là pour l'attraper.
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', '..')
  const source = readFileSync(join(repo, 'apps/api/src/modules/tool-registry/tool-catalog.ts'), 'utf8')

  const tokens = new Set<string>()
  for (const block of source.matchAll(/allowed_actions:\s*\[([^\]]*)\]/g)) {
    for (const token of (block[1] ?? '').matchAll(/'([a-z_]+)'/g)) tokens.add(token[1] as string)
  }
  return [...tokens].sort()
}

describe('#1443 — chaque action autorisée a une phrase, dans les deux langues', () => {
  const actions = catalogActions()

  it('lit le catalogue serveur, et il n’est pas vide', () => {
    // LA GARDE LIT QUELQUE CHOSE : un chemin faux, une regex qui n'accroche
    // rien, et tout ce qui suit serait vert sur une liste vide.
    expect(actions.length).toBeGreaterThan(20)
    expect(actions).toContain('export_contact')
  })

  it.each([
    ['fr', fr as Record<string, unknown>],
    ['en', en as Record<string, unknown>],
  ])('%s : aucun jeton du catalogue n’est sans phrase', (_lang, catalogue) => {
    const phrases = (catalogue['toolActions'] ?? {}) as Record<string, string>
    expect(actions.filter(action => !phrases[action])).toEqual([])
  })

  it('sait dire NON — un jeton neuf sans phrase est vu', () => {
    const phrases: Record<string, string> = { export_contact: 'Envoyer un contact vers cet outil' }
    expect(['export_contact', 'send_smoke_signal'].filter(a => !phrases[a])).toEqual(['send_smoke_signal'])
  })
})

describe('#1443 — ce que la carte rend', () => {
  it('n’affiche JAMAIS un jeton machine', () => {
    render(<ConnectorBenefits tools={[tool({ allowed_actions: ['export_contact'] })]} />)
    expect(screen.queryByText(/export_contact/)).not.toBeInTheDocument()
    expect(screen.getByText(/Envoyer un contact vers cet outil/)).toBeInTheDocument()
  })

  it('dédoublonne les lignes de registre d’une même carte', () => {
    // Une carte porte parfois trois lignes sous un seul consentement.
    const actions = connectorActions([
      tool({ provider: 'a', allowed_actions: ['search_files', 'read_file'] }),
      tool({ provider: 'b', allowed_actions: ['search_files'] }),
    ])
    expect(actions).toEqual(['search_files', 'read_file'])
  })

  it('laisse tomber ce qu’on ne sait pas nommer, plutôt que de l’afficher brut', () => {
    expect(connectorActions([tool({ allowed_actions: ['export_contact', 'wat'] })])).toEqual(['export_contact'])
  })

  it('ne promet rien quand le registre n’autorise rien', () => {
    const { container } = render(<ConnectorBenefits tools={[tool()]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne promet rien quand le champ manque — le web se déploie avant l’API', () => {
    const ancien = { ...tool(), allowed_actions: undefined } as unknown as ConnectedTool
    expect(connectorActions([ancien])).toEqual([])
  })
})

describe('#2078.14 — l’outil branché et ce que Bellum bâtit dessus ne se mélangent pas', () => {
  it('un agenda lisible débloque le calcul de conflits, sous SON propre intitulé', () => {
    render(<ConnectorBenefits tools={[tool({ allowed_actions: ['list_events'] })]} />)
    // Le bloc du connecteur dit ce que l'outil autorise…
    expect(screen.getByText(/Ce que cet outil branché m’autorise à faire/)).toBeInTheDocument()
    // …et le second dit ce qui est NOTRE calcul, sans le faire passer pour une
    // action du connecteur (c'est tout l'objet de #1443, respecté autrement).
    expect(screen.getByTestId('connector-built-on-top')).toBeInTheDocument()
    expect(screen.getByText(/Détecter les conflits entre tes rendez-vous/)).toBeInTheDocument()
  })

  it('sans l’accès requis, le second bloc n’existe pas — pas un titre vide', () => {
    render(<ConnectorBenefits tools={[tool({ allowed_actions: ['export_contact'] })]} />)
    expect(screen.queryByTestId('connector-built-on-top')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ce que je bâtis par-dessus/)).not.toBeInTheDocument()
  })

  it('ne nomme AUCUN éditeur — le nom de l’outil branché vit dans l’entête de la carte (D354)', () => {
    const { container } = render(<ConnectorBenefits tools={[tool({ allowed_actions: ['list_events'] })]} />)
    const text = container.textContent ?? ''
    expect(text.length).toBeGreaterThan(30)
    for (const vendor of ['Google', 'Microsoft', 'Outlook', 'Gmail', 'Apollo', 'Anthropic']) {
      expect(text).not.toContain(vendor)
    }
  })
})
