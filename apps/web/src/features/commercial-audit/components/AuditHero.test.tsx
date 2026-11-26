import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileContext, ProfileContextRevisionSummary } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { buildCommercialAudit } from '../lib/build-audit'
import { AUDIT_STALE_AFTER_DAYS } from '../lib/audit-freshness'
import { AuditHero } from './AuditHero'

const { exportAuditPdf } = await import('@/lib/audit-pdf/export')
const { apiFetch } = await import('@/lib/api')

// `AuditHero` lit l'horloge réelle (`new Date()`), et `renderWithRouter`
// (TanStack Router) n'aime pas les fake timers (ses propres effets internes
// restent alors en attente) — les dates sont donc calculées depuis
// `Date.now()` plutôt que depuis une horloge simulée.

/** Une date à N jours dans le passé, au format ISO. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const CONTEXT: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
}

function revisionAt(daysOld: number): ProfileContextRevisionSummary[] {
  return [{ version: 1, schema_version: 1, created_at: daysAgo(daysOld), was_last_validated: false }]
}

// #2084.14 — l'écran distingue « l'audit a une date » (toujours vrai,
// `hero.updatedAt`) de « l'audit est ANCIEN » (au-delà du seuil,
// `AUDIT_STALE_AFTER_DAYS`) : seul le second doit proposer le geste de
// reconfiguration existant. Ni horloge ni déclenchement automatique — la
// bannière ne fait que NOMMER l'état, le clic reste un choix humain.
describe("AuditHero — #2084.14 l'audit ancien se nomme avec sa date, jamais un jugement", () => {
  it('audit récent : aucune bannière « ancien », aucun geste de reconfiguration proposé', async () => {
    const audit = buildCommercialAudit(CONTEXT, revisionAt(10), null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)

    // TanStack Router monte de façon asynchrone : on attend un élément
    // TOUJOURS présent avant de vérifier une absence, sinon l'absence est
    // vraie pour la mauvaise raison (rien n'a encore rendu).
    await screen.findByRole('link', { name: /Corriger une information/i })
    expect(screen.queryByText(/Cet audit date du/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Revoir mes réponses/i })).not.toBeInTheDocument()
  })

  it("audit sans instantané (jamais généré) : aucune bannière « ancien » — `unknown` n'est pas une fausse fraîcheur", async () => {
    const audit = buildCommercialAudit(CONTEXT, [], null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)

    await screen.findByRole('link', { name: /Corriger une information/i })
    expect(screen.queryByText(/Cet audit date du/)).not.toBeInTheDocument()
  })

  it('audit ancien (≥ seuil) : la bannière dit la DATE, pas un jugement, et propose le geste existant', async () => {
    const audit = buildCommercialAudit(CONTEXT, revisionAt(AUDIT_STALE_AFTER_DAYS + 5), null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)

    expect(await screen.findByText(/Cet audit date du/)).toBeInTheDocument()
    // Jamais un mot de jugement (« dépassé », « périmé », « mauvais ») —
    // seulement le fait daté.
    expect(screen.queryByText(/dépassé|périmé/i)).not.toBeInTheDocument()

    const cta = screen.getByRole('link', { name: /Revoir mes réponses/i })
    expect(cta).toHaveAttribute('href', '/settings/profile')
  })
})

/**
 * #2090.35 / #2074.9 — « Exporter en PDF », TOUJOURS VISIBLE avec les trois
 * autres actions (Corriger / Demander à Laura / Voir les sources). Tranché
 * par Louis 22/09 soir (decisions-louis-22-09-soir.md §5) : un document PDF
 * DÉDIÉ (`@react-pdf/renderer`), pas `window.print()` — ce test garde
 * seulement le CÂBLAGE (le clic appelle `exportAuditPdf`) ; le contenu du
 * document est gardé par `audit-pdf/__tests__/AuditPdfDocument.test.tsx`.
 */
describe('AuditHero — #2090.35 / #2074.9 export PDF', () => {
  it('le clic sur « Exporter en PDF » déclenche le téléchargement du document dédié', async () => {
    const user = userEvent.setup()
    const audit = buildCommercialAudit(CONTEXT, revisionAt(10), null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)

    const button = await screen.findByRole('button', { name: /Exporter en PDF/i })
    await user.click(button)

    expect(vi.mocked(exportAuditPdf)).toHaveBeenCalledTimes(1)
  })
})

/**
 * #2075.24 / #2075.27 / #2075.28 — LE RELAIS APRÈS VALIDATION traverse
 * `AuditHero` jusqu'à `ValidateContextStatus` : ce test garde le CÂBLAGE
 * (les deux props arrivent bien), le contenu détaillé (question réelle,
 * lien réel) est gardé par `ValidateContextStatus.test.tsx`.
 */
describe('AuditHero — #2075.24/.27/.28 le relais après validation traverse le composant', () => {
  it('après le clic sur Valider, transmet la suggestion de compte et la priorité de la semaine au relais', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    const user = userEvent.setup()
    const audit = buildCommercialAudit(CONTEXT, revisionAt(10), null, null)
    renderWithRouter(
      <AuditHero
        audit={audit}
        validatedAt={null}
        firstAnalysisSuggestions={[{ companyName: 'Société Générale', sector: 'Banque', reason: 'secteur cible' }]}
        weeklyPriorityAction="Combien de secteurs vises-tu vraiment ?"
      />,
    )

    await user.click(await screen.findByRole('button', { name: 'Valider' }))

    expect(await screen.findByRole('link', { name: /Société Générale/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Laura/ })).toBeInTheDocument()
  })
})
