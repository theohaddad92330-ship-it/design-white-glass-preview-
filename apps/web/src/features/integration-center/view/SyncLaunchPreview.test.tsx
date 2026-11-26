import type { ConnectedTool } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SyncLaunchPreview } from './SyncLaunchPreview'

function tool(over: Partial<ConnectedTool> = {}): ConnectedTool {
  return {
    provider: 'hubspot',
    family: 'crm',
    display_name: 'HubSpot',
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
    capability_state: 'operational',
    capabilities: [],
    ...over,
  }
}

/**
 * #2207.20 — le PÉRIMÈTRE affiché avant de lancer : quel compte connecté est
 * en jeu, nommé, pas seulement « ça va lire des trucs ».
 */
describe('#2207.20 — SyncLaunchPreview affiche le périmètre', () => {
  it('nomme le connecteur dans le titre et dans le périmètre', () => {
    render(<SyncLaunchPreview name="HubSpot" onCancel={() => {}} onLaunch={() => {}} launching={false} />)
    expect(screen.getByText(/Avant de synchroniser HubSpot/)).toBeInTheDocument()
    expect(screen.getByText(/ton compte HubSpot connecté/)).toBeInTheDocument()
  })

  it('« Synchroniser » appelle `onLaunch`, « Plus tard » appelle `onCancel`', () => {
    const onLaunch = vi.fn()
    const onCancel = vi.fn()
    render(<SyncLaunchPreview name="Notion" onCancel={onCancel} onLaunch={onLaunch} launching={false} />)
    screen.getByRole('button', { name: 'Synchroniser' }).click()
    expect(onLaunch).toHaveBeenCalled()
    screen.getByRole('button', { name: 'Plus tard' }).click()
    expect(onCancel).toHaveBeenCalled()
  })
})

/**
 * #2207.21 — la PÉRIODE couverte, déclarée par le connecteur, jamais devinée.
 * `coverage_period` est REQUIS au contrat (`null` = déclaration connue comme
 * absente) — l'écran le dit toujours, jamais silencieusement.
 */
describe('#2207.21 — SyncLaunchPreview affiche la période couverte', () => {
  it('affiche la période DÉCLARÉE quand le connecteur la porte', () => {
    render(
      <SyncLaunchPreview
        name="HubSpot"
        tool={tool({ coverage_period: { fr: 'les 12 derniers mois', en: 'the last 12 months' } })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText(/Période couverte : les 12 derniers mois/)).toBeInTheDocument()
  })

  it('dit explicitement « non précisée » — jamais silencieux — quand la période est inconnue', () => {
    render(
      <SyncLaunchPreview
        name="HubSpot"
        tool={tool({ coverage_period: null })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText(/Période couverte : non précisée/)).toBeInTheDocument()
  })

  it('sans outil identifié (ex. `google`, plusieurs surfaces), la période reste explicite', () => {
    render(<SyncLaunchPreview name="Google Workspace" onCancel={() => {}} onLaunch={() => {}} launching={false} />)
    expect(screen.getByText(/Période couverte : non précisée/)).toBeInTheDocument()
  })
})

/**
 * #2207.22 — les OBJETS lus, en langage clair (jamais le jeton machine brut
 * sans traduction connue, et jamais une ligne à zéro : doctrine « on
 * n'affiche pas ce qu'on n'a pas », version LISTE).
 */
describe('#2207.22 — SyncLaunchPreview affiche les objets lus', () => {
  it('traduit chaque jeton `data_types.reads` en langage clair', () => {
    render(
      <SyncLaunchPreview
        name="HubSpot"
        tool={tool({ data_types: { reads: ['contacts', 'companies', 'deals'], writes: [] } })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText('· contacts')).toBeInTheDocument()
    expect(screen.getByText('· entreprises')).toBeInTheDocument()
    expect(screen.getByText('· affaires')).toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne ni titre quand il n'y a rien à lister — jamais une section vide", () => {
    render(
      <SyncLaunchPreview
        name="Notifications sortantes"
        tool={tool({ data_types: { reads: [], writes: ['notifications'] } })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.queryByText('Ce qui sera lu :')).not.toBeInTheDocument()
  })

  it("sans outil identifié, aucune section « objets » ne s'affiche", () => {
    render(<SyncLaunchPreview name="Google Workspace" onCancel={() => {}} onLaunch={() => {}} launching={false} />)
    expect(screen.queryByText('Ce qui sera lu :')).not.toBeInTheDocument()
  })
})

/**
 * #2207.23 — la DURÉE estimée, toujours affichée (fait unique, contrairement
 * à la liste des objets) : « non précisée » n'est jamais silencieuse.
 */
describe('#2207.23 — SyncLaunchPreview affiche la durée estimée', () => {
  it('affiche la durée DÉCLARÉE quand le connecteur la porte', () => {
    render(
      <SyncLaunchPreview
        name="HubSpot"
        tool={tool({ sync_duration_estimate: { fr: 'quelques minutes', en: 'a few minutes' } })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText('Durée estimée : quelques minutes')).toBeInTheDocument()
  })

  it('dit explicitement « non précisée » quand la durée est inconnue', () => {
    render(
      <SyncLaunchPreview
        name="Notion"
        tool={tool({ sync_duration_estimate: null })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText('Durée estimée : non précisée')).toBeInTheDocument()
  })

  it('sans outil identifié, la durée reste explicite', () => {
    render(<SyncLaunchPreview name="Google Workspace" onCancel={() => {}} onLaunch={() => {}} launching={false} />)
    expect(screen.getByText('Durée estimée : non précisée')).toBeInTheDocument()
  })
})

/** #2207.24 — le COÛT, toujours affiché (fait unique, comme la durée). */
describe('#2207.24 — SyncLaunchPreview affiche le coût', () => {
  it('affiche le coût DÉCLARÉ quand le connecteur le porte', () => {
    render(
      <SyncLaunchPreview
        name="HubSpot"
        tool={tool({ cost_model: { fr: 'inclus dans ton abonnement', en: 'included in your plan' } })}
        onCancel={() => {}}
        onLaunch={() => {}}
        launching={false}
      />,
    )
    expect(screen.getByText('Coût : inclus dans ton abonnement')).toBeInTheDocument()
  })

  it('dit explicitement « non précisé » quand le coût est inconnu', () => {
    render(
      <SyncLaunchPreview name="Notion" tool={tool({})} onCancel={() => {}} onLaunch={() => {}} launching={false} />,
    )
    expect(screen.getByText('Coût : non précisé')).toBeInTheDocument()
  })

  it('sans outil identifié, le coût reste explicite', () => {
    render(<SyncLaunchPreview name="Google Workspace" onCancel={() => {}} onLaunch={() => {}} launching={false} />)
    expect(screen.getByText('Coût : non précisé')).toBeInTheDocument()
  })
})
