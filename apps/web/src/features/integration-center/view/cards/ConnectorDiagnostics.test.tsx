import type { ConnectedTool } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'
import { PreConsent } from './PreConsent'

/**
 * Le défaut trouvé en recette live le 21/08/2026, et il a mis tout l'écran
 * `/integrations` par terre — pas dégradé, ÉCRASÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FENÊTRE DE DÉPLOIEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le web se déploie sur Vercel en une minute, l'API sur Railway en dix. Pendant
 * cette fenêtre, le navigateur exécute du code NEUF contre une réponse ANCIENNE.
 * `capabilities` venait d'être ajouté au contrat comme champ obligatoire ; il
 * n'était donc pas dans la réponse, et `tool.capabilities.length` levait
 * « Cannot read properties of undefined ».
 *
 * Rien ne pouvait l'attraper : le contrat déclare le champ obligatoire, mais
 * `apiFetch` type par ASSERTION — il ne valide aucune réponse. Le type ment, et
 * le compilateur ne voit rien. C'est le même mécanisme que le défaut « même nom,
 * forme différente » du PDF 1.
 *
 * La règle que ces tests gardent : **tout champ AJOUTÉ à une réponse d'API se
 * lit avec un repli côté web.**
 */

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

/** La forme que l'API rendait AVANT le déploiement : pas de `capabilities`. */
function legacyTool(): ConnectedTool {
  const tool = {
    provider: 'gmail',
    family: 'email',
    display_name: 'Gmail',
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    capability_state: 'operational',
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
  }
  // Volontairement converti : c'est EXACTEMENT ce que faisait `apiFetch` en
  // production, et c'est ce qui rendait le défaut invisible au compilateur.
  return tool as unknown as ConnectedTool
}

describe('le panneau de diagnostic survit à une réponse d’API d’AVANT le déploiement', () => {
  it('ne plante pas quand `capabilities` est absent', () => {
    expect(() => wrap(<ConnectorDiagnostics tool={legacyTool()} />)).not.toThrow()
  })

  it('ne rend rien plutôt que d’afficher des boutons inertes', () => {
    const { container } = wrap(<ConnectorDiagnostics tool={legacyTool()} />)
    expect(container.textContent).toBe('')
  })

  it('affiche les capacités quand elles sont là', () => {
    const tool: ConnectedTool = {
      ...legacyTool(),
      capabilities: [
        {
          key: 'read',
          state: 'scope_missing',
          scope_required: ['https://www.googleapis.com/auth/gmail.readonly'],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: null,
          last_error_at: null,
        },
      ],
    }
    wrap(<ConnectorDiagnostics tool={tool} />)
    // La portée NOMMÉE : c'est ce qui dit à l'opérateur quoi déclarer chez le
    // fournisseur avant qu'une reconnexion serve à quelque chose.
    expect(screen.getByText(/gmail\.readonly/)).toBeTruthy()
  })
})

/**
 * #2383.1 — LES SEPT NIVEAUX DE CAPACITÉ (L0-L6), EXPOSÉS PAR ACTION.
 *
 * `capability.level` était calculé côté service (`tool-capabilities.ts`,
 * `tool-registry.service.ts`) sans qu'aucun écran ne le lise. `.optional()`
 * au contrat, comme `coverage_period`/`latency`/`beta` : une réponse
 * d'AVANT le déploiement de ce champ ne doit ni planter, ni afficher un
 * niveau inventé.
 */
describe('#2383.1 — le niveau de capacité (L0-L6) de chaque action', () => {
  it('affiche le niveau quand l’API le porte', () => {
    const tool: ConnectedTool = {
      ...legacyTool(),
      capabilities: [
        {
          key: 'send',
          state: 'operational',
          scope_required: [],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: null,
          last_error_at: null,
          level: 'l5_send_confirmed',
        },
      ],
    }
    wrap(<ConnectorDiagnostics tool={tool} />)
    expect(screen.getByText('Envoi confirmé')).toBeTruthy()
  })

  it('ne montre rien quand une réponse d’AVANT le déploiement de ce champ ne le porte pas', () => {
    const tool: ConnectedTool = {
      ...legacyTool(),
      capabilities: [
        {
          key: 'read',
          state: 'operational',
          scope_required: [],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: null,
          last_error_at: null,
        },
      ],
    }
    wrap(<ConnectorDiagnostics tool={tool} />)
    // Aucun des sept libellés de niveau ne doit apparaître par défaut.
    expect(screen.queryByText('Consultation')).toBeNull()
  })
})

/**
 * #1444 / #1447 — deux champs chargés depuis le premier jour et jamais rendus.
 *
 * `last_error_code` disait POURQUOI une capacité est dégradée, et la ligne
 * affichait « Dégradé » sans un mot. Un badge sans sa raison envoie chercher la
 * panne partout sauf là où elle est : c'est exactement ce que ce panneau existe
 * pour corriger, et il l'avait gardé chez lui.
 *
 * `last_sync` est la dernière activité RÉELLE sur la connexion.
 * ⚠️ Aucune des deux ne s'estime : `null` ⇒ aucune ligne. Une heure de synchro
 * devinée est pire que pas d'heure du tout — c'est celle-là qu'on croit.
 */
describe('#1444 / #1447 — ce que le registre charge et que l’écran taisait', () => {
  const dégradée = (over: Record<string, unknown> = {}) =>
    ({
      ...legacyTool(),
      capabilities: [
        {
          key: 'read',
          state: 'degraded',
          scope_required: [],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: 'provider_api_disabled',
          last_error_at: '2026-09-02T10:15:00.000Z',
          ...over,
        },
      ],
    }) as ConnectedTool

  it('dit POURQUOI la capacité est dégradée, et quand', () => {
    wrap(<ConnectorDiagnostics tool={dégradée()} />)
    expect(screen.getByTestId('capability-last-error').textContent).toMatch(/éteint côté fournisseur/)
  })

  it('dit la raison même sans date — jamais une date devinée', () => {
    wrap(<ConnectorDiagnostics tool={dégradée({ last_error_at: null })} />)
    expect(screen.getByTestId('capability-last-error').textContent).toMatch(/éteint côté fournisseur/)
  })

  it('ne dit rien quand aucune erreur n’a été enregistrée — un silence n’est pas un verdict', () => {
    wrap(<ConnectorDiagnostics tool={dégradée({ last_error_code: null, last_error_at: null })} />)
    expect(screen.queryByTestId('capability-last-error')).toBeNull()
  })

  it('affiche la dernière activité réelle de la connexion', () => {
    const tool = { ...dégradée(), last_sync: '2026-09-03T08:00:00.000Z' } as ConnectedTool
    wrap(<ConnectorDiagnostics tool={tool} />)
    expect(screen.getByTestId('connector-last-sync')).toBeTruthy()
  })

  it('SYNC-C.6 — un CRM dit sa synchro dans sa note de périmètre : la carte n’a qu’UNE date', () => {
    const tool = { ...dégradée(), last_sync: '2026-09-03T08:00:00.000Z' } as ConnectedTool
    wrap(<ConnectorDiagnostics tool={tool} hideLastSync />)
    expect(screen.queryByTestId('connector-last-sync')).toBeNull()
  })

  it('n’invente aucune heure de synchro quand le registre n’en a pas', () => {
    wrap(<ConnectorDiagnostics tool={dégradée()} />)
    expect(screen.queryByTestId('connector-last-sync')).toBeNull()
  })
})

/**
 * #2261.8 / #2261.13 / #2261.16 — trois champs CALCULÉS par le registre et
 * jamais rendus. `packages/contracts/src/schemas/tool-registry.ts` les
 * déclare REQUIS + nullable précisément pour que l'absence se DISE — la
 * recette écran du 18/09/2026 a cherché « période couverte », « latence » et
 * « bêta » en plein texte sur `/integrations` et n'a rien trouvé : le contrat
 * était juste, calculé, testé, et personne ne l'appelait.
 *
 * Chaque champ a son cas « valeur présente » et son cas `null` — un axe non
 * mesuré se NOMME (GA-18/GA-19), il ne disparaît jamais silencieusement.
 */
describe('#2261.8 / #2261.13 / #2261.16 — le manifeste des outils se lit à l’écran', () => {
  const avecManifeste = (over: Partial<ConnectedTool> = {}) =>
    ({
      ...legacyTool(),
      capabilities: [
        {
          key: 'read',
          state: 'operational',
          scope_required: [],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: null,
          last_error_at: null,
        },
      ],
      coverage_period: null,
      latency: null,
      beta: null,
      ...over,
    }) as ConnectedTool

  it('dit la période couverte quand le fournisseur la déclare', () => {
    const tool = avecManifeste({ coverage_period: { fr: 'les 12 derniers mois', en: 'the last 12 months' } })
    wrap(<ConnectorDiagnostics tool={tool} />)
    expect(screen.getByTestId('connector-coverage-period').textContent).toMatch(/les 12 derniers mois/)
  })

  it('nomme l’absence de période couverte plutôt que de la taire', () => {
    wrap(<ConnectorDiagnostics tool={avecManifeste()} />)
    expect(screen.getByTestId('connector-coverage-period').textContent).toMatch(/non précisée/)
  })

  it('distingue une latence DÉCLARÉE d’une latence MESURÉE', () => {
    const declared = avecManifeste({
      latency: {
        source: 'declared',
        value: { fr: 'quelques secondes', en: 'a few seconds' },
        as_of: '2026-09-01T00:00:00.000Z',
      },
    })
    const { unmount } = wrap(<ConnectorDiagnostics tool={declared} />)
    const declaredText = screen.getByTestId('connector-latency').textContent ?? ''
    expect(declaredText).toMatch(/quelques secondes/)
    unmount()

    const measured = avecManifeste({
      latency: {
        source: 'measured',
        value: { fr: 'quelques secondes', en: 'a few seconds' },
        as_of: '2026-09-01T00:00:00.000Z',
      },
    })
    wrap(<ConnectorDiagnostics tool={measured} />)
    const measuredText = screen.getByTestId('connector-latency').textContent ?? ''
    expect(measuredText).toMatch(/quelques secondes/)
    // Ne s'affichent jamais de la même façon : source déclarée ≠ source mesurée.
    expect(measuredText).not.toBe(declaredText)
  })

  it('nomme l’absence de latence plutôt que de la taire (outil non connecté / hors périmètre)', () => {
    wrap(<ConnectorDiagnostics tool={avecManifeste()} />)
    expect(screen.getByTestId('connector-latency').textContent).toMatch(/non communiquée/)
  })

  // #2261.13 (décision Louis 19/09) — un outil CONNECTÉ et éligible ne rend
  // plus jamais `null` muet : soit une mesure réelle, soit sa raison.
  it('#2261.13 (19/09) — affiche une mesure RÉELLE avec sa fenêtre et son échantillon, jamais une valeur de doc', () => {
    const tool = avecManifeste({
      latency: {
        source: 'measured',
        value: { fr: '~12 min', en: '~12 min' },
        as_of: '2026-09-19T12:00:00.000Z',
        window_days: 7,
        sample_count: 42,
      },
    })
    wrap(<ConnectorDiagnostics tool={tool} />)
    const text = screen.getByTestId('connector-latency').textContent ?? ''
    expect(text).toMatch(/12 min/)
    expect(text).toMatch(/7/)
    expect(text).toMatch(/42/)
  })

  it('#2261.13 (19/09) — « non mesuré » NOMME sa raison, jamais le même texte que « inconnu »', () => {
    const tool = avecManifeste({
      latency: {
        source: 'not_measured',
        reason: {
          fr: 'Pas assez de synchronisations réelles pour mesurer.',
          en: 'Not enough real synchronizations to measure.',
        },
      },
    })
    wrap(<ConnectorDiagnostics tool={tool} />)
    const text = screen.getByTestId('connector-latency').textContent ?? ''
    expect(text).toMatch(/Pas assez de synchronisations réelles/)
    // Distinct du texte générique « non communiquée » rendu pour `null`.
    expect(text).not.toMatch(/non communiquée/)
  })

  it('nomme la fonctionnalité en bêta déclarée par le fournisseur', () => {
    const tool = avecManifeste({ beta: { beta: true, feature: { fr: 'recherche assistée', en: 'assisted search' } } })
    wrap(<ConnectorDiagnostics tool={tool} />)
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/recherche assistée/)
  })

  it('nomme un statut bêta inconnu plutôt que de le taire — jamais traité comme stable', () => {
    wrap(<ConnectorDiagnostics tool={avecManifeste()} />)
    expect(screen.getByTestId('connector-beta').textContent).toMatch(/non communiqué/)
  })

  it('reste muet sur les trois champs quand l’API ne les a pas encore envoyés (fenêtre de déploiement)', () => {
    // Repli défensif comme `capabilities ?? []` : un champ non ENCORE ajouté à
    // la réponse ne doit jamais s'afficher comme « non précisée » — ce serait
    // une AFFIRMATION sur une réponse qu'on n'a pas reçue.
    const stale = { ...avecManifeste() } as Record<string, unknown>
    delete stale.coverage_period
    delete stale.latency
    delete stale.beta
    wrap(<ConnectorDiagnostics tool={stale as ConnectedTool} />)
    expect(screen.queryByTestId('connector-coverage-period')).toBeNull()
    expect(screen.queryByTestId('connector-latency')).toBeNull()
    expect(screen.queryByTestId('connector-beta')).toBeNull()
  })
})

/**
 * #2207.5 — LES PERMISSIONS ACCORDÉES, PAS SEULEMENT CELLES QUI MANQUENT.
 *
 * Le panneau affichait déjà `missingScope` (la portée qu'il FAUT redonner),
 * jamais `tool.scopes` (ce que le fournisseur a RÉELLEMENT accordé). Un
 * opérateur qui voit « il manque X » sans jamais voir « il a déjà Y » ne peut
 * pas vérifier ce que la connexion couvre déjà.
 */
describe('#2207.5 — les permissions accordées se lisent, pas seulement celles qui manquent', () => {
  const avecCapacite = (over: Partial<ConnectedTool> = {}) =>
    ({
      ...legacyTool(),
      capabilities: [
        {
          key: 'read',
          state: 'operational',
          scope_required: [],
          last_proof_at: null,
          last_proof_sample: null,
          last_error_code: null,
          last_error_at: null,
        },
      ],
      ...over,
    }) as ConnectedTool

  it('nomme les portées accordées quand le registre en porte', () => {
    const tool = avecCapacite({ scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'calendar.events'] })
    wrap(<ConnectorDiagnostics tool={tool} />)
    const text = screen.getByTestId('connector-granted-scopes').textContent ?? ''
    expect(text).toMatch(/gmail\.readonly/)
    expect(text).toMatch(/calendar\.events/)
  })

  it('n’affiche rien quand aucune portée n’est accordée — jamais une liste vide affirmée', () => {
    wrap(<ConnectorDiagnostics tool={avecCapacite({ scopes: [] })} />)
    expect(screen.queryByTestId('connector-granted-scopes')).toBeNull()
  })

  it('survit à une réponse d’AVANT le déploiement du champ (`scopes` absent)', () => {
    const stale = { ...avecCapacite() } as Record<string, unknown>
    delete stale.scopes
    expect(() => wrap(<ConnectorDiagnostics tool={stale as ConnectedTool} />)).not.toThrow()
    expect(screen.queryByTestId('connector-granted-scopes')).toBeNull()
  })
})

describe('le pré-consentement survit lui aussi', () => {
  it('ne plante pas sur un outil sans `capabilities`', () => {
    expect(() =>
      wrap(
        <PreConsent
          tools={[legacyTool()]}
          name="Un outil"
          onCancel={() => {}}
          onConfirm={() => {}}
          connecting={false}
        />,
      ),
    ).not.toThrow()
  })
})

describe('#4189.2 / #4184.4 (18/10) — la dernière synchro ne dépend pas des capacités décomposées', () => {
  it('Salesforce (aucune capacité décomposée) montre quand même sa dernière synchro, sans bouton inerte', () => {
    const tool = { ...legacyTool(), provider: 'salesforce', last_sync: '2026-10-17T08:30:00.000Z' }
    wrap(<ConnectorDiagnostics tool={tool as ConnectedTool} />)
    expect(screen.getByTestId('connector-last-sync')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
