import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2634.1 (24/09/2026) — « et en démonstration, « Ajouter un signal depuis
 * LinkedIn » (onglet Signaux) montre quoi ? »
 *
 * `DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE` (`demo-coverage.ts`) répond : VIDE
 * À DESSEIN, l'action se démontre EN DIRECT — semer un signal « déclaré »
 * dans les fixtures affirmerait un geste commercial qui n'a jamais eu lieu,
 * ce que la doctrine c79 (LinkedIn admis UNIQUEMENT par ce que l'utilisateur
 * apporte lui-même) interdit. Cette garde LIT le composant et l'onglet réels
 * plutôt qu'une liste recopiée à la main, et vérifie que la classification
 * colle aux fixtures.
 */

const DIALOG = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'veille',
  'DeclareLinkedInSignalDialog.tsx',
)

const TAB_SIGNAL = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'TabSignal.tsx',
)

describe('couverture démo — « Ajouter un signal depuis LinkedIn » (#2634.1)', () => {
  it('LIT le composant réel : il écrit vers `signals/declare`, jamais vers LinkedIn', () => {
    const source = readFileSync(DIALOG, 'utf8')
    expect(source).toContain('useDeclareSignals')
    expect(source).toContain("source: 'LinkedIn'")
    expect(source).toContain("entryKind: 'manual'")
    // Aucun appel réseau vers LinkedIn dans ce composant : ni `fetch`, ni
    // domaine d'API LinkedIn — seul `useDeclareSignals` (POST vers NOTRE
    // serveur) écrit quoi que ce soit.
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('api.linkedin.com')
  })

  it("LIT l'onglet réel — TabSignal monte bien le dialogue de déclaration", () => {
    const source = readFileSync(TAB_SIGNAL, 'utf8')
    expect(source).toContain('DeclareLinkedInSignalDialog')
    expect(source).toContain('accountId={account.id}')
  })

  it('classe la capacité « vide à dessein », et la raison nomme #2634.1', () => {
    expect(DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE.reason).toContain('2634.1')
    expect(DEMO_DECLARED_LINKEDIN_SIGNAL_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('AUCUN dossier de démonstration ne porte `declared_signals` — semer un geste commercial fictif serait malhonnête', () => {
    for (const dossier of DEMO_DOSSIERS) {
      const declaredSignals = (dossier.account as unknown as Record<string, unknown>).declared_signals
      expect(declaredSignals).toBeUndefined()
    }
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
  })
})
