import type { Account } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { i18n } from '@/i18n'
import { AccountDetailHeroPrimaryAction } from './AccountDetailHeroPrimaryAction'

// #2130.55 / #2130.56 — le double de `trackActionStarted` : le GESTE, jamais
// l'identifiant du compte cliqué (même garantie que `TabPartners.telemetry`).
const tracker = vi.hoisted(() => ({ trackActionStarted: vi.fn() }))
vi.mock('@/lib/product-tracker', () => tracker)

/**
 * #2117.6, .25-30 — UN TEST PAR ÉTAT DU HERO.
 *
 * `heroPrimaryAction.test.ts` prouve la DÉCISION (quel champ décide de quel
 * état) ; ce fichier prouve le RENDU — qu'un compte dans cet état fait
 * réellement apparaître ce bouton-là, et un seul. Sans lui, les cinq entrées
 * du registre seraient cinq contrats sans écran, exactement le défaut n°1 du
 * dépôt.
 *
 * ⚠ Le rendez-vous vient de l'agenda connecté : sans session (le harnais rend
 * `user: null`), `useGoogleStatus` est coupé et aucune requête ne part. L'état
 * `meeting-booked` se prouve donc en simulant la réponse du hook — c'est la
 * seule entrée du tableau que le compte seul ne porte pas.
 */
const { meeting } = vi.hoisted(() => ({ meeting: vi.fn() }))
vi.mock('./useAccountNextMeeting', () => ({ useAccountNextMeeting: () => meeting() }))

const base = {
  id: '00000000-0000-0000-0000-0000000000aa',
  company_name: 'ACME Corp',
  website: null,
  siren: null,
  status: 'completed',
  commercial_status: 'opportunity',
  priority_gate: 'prioritised',
  raw_analysis: null,
} as unknown as Account

function renderAction(
  overrides: Partial<Account> = {},
  props: { showSecondary?: boolean; fullWidth?: boolean; onTabChange?: (tab: 'plan' | 'veille') => void } = {},
) {
  return renderWithRouter(
    <AccountDetailHeroPrimaryAction account={{ ...base, ...overrides } as Account} {...props} />,
    '/accounts/test-id',
  )
}

/** Les libellés des cinq gestes principaux, dans la langue du test. */
const LABELS = {
  analyzeAccount: /Analyser le compte/i,
  finishAnalysis: /Terminer l.analyse/i,
  preparePlan: /Préparer le plan/i,
  continueNextAction: /Continuer la prochaine action/i,
  prepareMeeting: /Préparer le rendez-vous/i,
  seeChanges: /Voir ce qui a changé/i,
} as const

/** Aucun AUTRE geste principal que celui attendu — un seul bouton, pas cinq. */
function expectOnly(kept: keyof typeof LABELS) {
  for (const [name, pattern] of Object.entries(LABELS)) {
    if (name === kept) continue
    expect(screen.queryByRole('button', { name: pattern }), name).not.toBeInTheDocument()
  }
}

beforeEach(async () => {
  meeting.mockReset().mockReturnValue(null)
  tracker.trackActionStarted.mockClear()
  await i18n.changeLanguage('fr')
})

describe('AccountDetailHeroPrimaryAction — une action principale, celle de l’état', () => {
  it('#4459.1 — jamais analysé (Découvrir ou import du CRM) → « Analyser le compte », et rien d’autre', async () => {
    for (const status of ['prospect', 'imported'] as const) {
      const { unmount } = renderAction({ status })
      expect(await screen.findByRole('button', { name: LABELS.analyzeAccount }), status).toBeInTheDocument()
      expectOnly('analyzeAccount')
      unmount()
    }
  })

  it('#2117.25 — analyse incomplète → « Terminer l’analyse », et rien d’autre', async () => {
    renderAction({ status: 'analyzing' })

    expect(await screen.findByRole('button', { name: LABELS.finishAnalysis })).toBeInTheDocument()
    expectOnly('finishAnalysis')
  })

  it('#2117.26 — dossier complet sans prochaine action → « Préparer le plan »', async () => {
    renderAction()

    expect(await screen.findByRole('button', { name: LABELS.preparePlan })).toBeInTheDocument()
    expectOnly('preparePlan')
  })

  it('#2446.15 — « Préparer le plan » passe par onTabChange (une seule écriture de l’onglet, GA-26)', async () => {
    const onTabChange = vi.fn()
    renderAction({}, { onTabChange })

    await userEvent.click(await screen.findByRole('button', { name: LABELS.preparePlan }))

    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('plan')
  })

  it('#2117.27 — plan actif → « Continuer la prochaine action »', async () => {
    renderAction({ raw_analysis: { immediate_action: 'Appeler le DSI' } })

    expect(await screen.findByRole('button', { name: LABELS.continueNextAction })).toBeInTheDocument()
    expectOnly('continueNextAction')
  })

  it('ce composant ne rend QUE des boutons — la phrase du plan a quitté la rangée rigide', async () => {
    // Le défaut du 14/09/2026 : la phrase qui nomme la prochaine action était
    // rendue ici, sous le bouton. Ce composant vit dans la rangée d'actions du
    // hero, qui porte `shrink-0` — un texte sans borne de longueur y fixait une
    // largeur plancher de 1 628 px pour un parent de 1 174, et écrasait la
    // colonne d'identité à 0 px. Elle vit maintenant dans
    // `AccountDetailHeroNextAction`, et ce test échoue si elle revient.
    renderAction({ raw_analysis: { immediate_action: 'Appeler le DSI' } })

    expect(await screen.findByRole('button', { name: LABELS.continueNextAction })).toBeInTheDocument()
    expect(screen.queryByText(/Appeler le DSI/)).not.toBeInTheDocument()
  })

  it('#2117.28 — rendez-vous posé → « Préparer le rendez-vous »', async () => {
    meeting.mockReturnValue({ id: 'evt-1', summary: 'Point ACME', start: '2026-09-20T09:00:00Z' })
    renderAction({ raw_analysis: { immediate_action: 'Appeler le DSI' } })

    expect(await screen.findByRole('button', { name: LABELS.prepareMeeting })).toBeInTheDocument()
    expectOnly('prepareMeeting')
  })

  it('#2117.29 — compte en veille → « Voir ce qui a changé »', async () => {
    renderAction({ commercial_status: 'watching' })

    expect(await screen.findByRole('button', { name: LABELS.seeChanges })).toBeInTheDocument()
    expectOnly('seeChanges')
  })

  it('#2117.29 — une porte « mis de côté » met aussi le compte en veille', async () => {
    renderAction({ priority_gate: 'parked' })

    expect(await screen.findByRole('button', { name: LABELS.seeChanges })).toBeInTheDocument()
  })

  it('#2117.30 — « Demander à Laura » est visible en clair dans TOUS les états, jamais sous « … »', async () => {
    for (const overrides of [{ status: 'prospect' }, {}, { commercial_status: 'watching' }] as Partial<Account>[]) {
      const { unmount } = renderAction(overrides)
      expect(await screen.findByRole('button', { name: /Demander à/i })).toBeInTheDocument()
      unmount()
    }
  })

  it('sait dire NON : le geste principal n’est jamais rendu DEUX fois', async () => {
    // Le défaut que ce test attrape : rendre les cinq boutons et n'en masquer
    // que quatre en CSS — deux gestes principaux se disputeraient le regard
    // (#2116.42), et la garde du registre ne le verrait pas (elle lit la
    // source, pas le rendu).
    renderAction({ priority_gate: 'parked', raw_analysis: { immediate_action: 'Appeler le DSI' } })

    await waitFor(() => expect(screen.getByRole('button', { name: LABELS.seeChanges })).toBeInTheDocument())
    const principaux = screen
      .getAllByRole('button')
      .filter(button =>
        /dossier\.hero\.(finishAnalysis|preparePlan|continueNextAction|prepareMeeting|seeChanges)/.test(
          button.getAttribute('data-cta') ?? '',
        ),
      )
    expect(principaux).toHaveLength(1)
  })
})

/**
 * #2130.55 / #2130.56 — LE GESTE PRINCIPAL DU HERO, ET « DEMANDER À LAURA »,
 * ÉMETTENT.
 *
 * Les cinq boutons principaux sont mutuellement exclusifs (un seul rendu à la
 * fois) : un unique nom d'action agrégé (`primary_action_clicked`) suffit,
 * jamais lequel des cinq états l'a produit — l'écran suffit à le retrouver.
 * « Demander à Laura » est un geste DISTINCT (`laura_opened_from_account`),
 * jamais confondu avec le principal (#2117.30, il reste secondaire).
 */
describe('AccountDetailHeroPrimaryAction — télémétrie (#2130.55, #2130.56)', () => {
  it('#2130.55 — le geste principal émet primary_action_clicked, agrégé par écran', async () => {
    renderAction({ status: 'analyzing' })

    await userEvent.click(await screen.findByRole('button', { name: LABELS.finishAnalysis }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('primary_action_clicked', '/accounts/$id')
  })

  it('#2130.55 — même émission quel que soit LEQUEL des cinq états est actif', async () => {
    renderAction({ commercial_status: 'watching' })

    await userEvent.click(await screen.findByRole('button', { name: LABELS.seeChanges }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('primary_action_clicked', '/accounts/$id')
  })

  it('#2130.56 — « Demander à Laura » émet laura_opened_from_account, jamais primary_action_clicked', async () => {
    renderAction({ status: 'analyzing' })

    await userEvent.click(await screen.findByRole('button', { name: /Demander à/i }))

    expect(tracker.trackActionStarted).toHaveBeenCalledWith('laura_opened_from_account', '/accounts/$id')
    expect(tracker.trackActionStarted).not.toHaveBeenCalledWith('primary_action_clicked', expect.anything())
  })
})

/**
 * #2117.84 — RECETTE IPHONE DU 25/09 : LE HERO MOBILE VEUT UNE SEULE ACTION
 * PLEINE LARGEUR, « DEMANDER À {{COPILOT}} » REJOIGNANT LA RANGÉE COMPACTE.
 *
 * `AccountDetailHero.tsx` sur mobile rend ce composant SANS le secondaire
 * (`showSecondary={false}`) et pleine largeur (`fullWidth`), puis rend
 * « Demander à Laura » lui-même, en icône, dans sa rangée compacte — sinon le
 * hero porterait deux fois le même geste (loi 4 du tome 7). Desktop continue
 * d'appeler ce composant SANS ces props (défauts `true`/`false`) : rendu
 * inchangé, prouvé par les suites au-dessus qui ne les passent jamais.
 */
describe('AccountDetailHeroPrimaryAction — #2117.84 showSecondary / fullWidth (mobile)', () => {
  it('showSecondary={false} — « Demander à Laura » ne se rend plus ICI', async () => {
    renderAction({ status: 'analyzing' }, { showSecondary: false })

    expect(await screen.findByRole('button', { name: LABELS.finishAnalysis })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Demander à/i })).not.toBeInTheDocument()
  })

  it('fullWidth — le bouton principal porte la classe pleine largeur', async () => {
    renderAction({ status: 'analyzing' }, { fullWidth: true })

    const button = await screen.findByRole('button', { name: LABELS.finishAnalysis })
    expect(button.className).toContain('w-full')
  })

  it('sans les props (appel du bureau) — les deux boutons restent, aucun n’est pleine largeur', async () => {
    renderAction({ status: 'analyzing' })

    const primary = await screen.findByRole('button', { name: LABELS.finishAnalysis })
    expect(primary.className).not.toContain('w-full')
    expect(screen.getByRole('button', { name: /Demander à/i })).toBeInTheDocument()
  })
})
