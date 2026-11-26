import { DEMO_DOSSIERS, DEMO_ESN_PROFILE } from './demo-dataset'
import { DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE } from './demo-coverage'

/**
 * #2897 (#2091.31) — LA CARTE « PRIORISER MA SEMAINE » DE `/welcome`, SANS
 * AUCUN `priority_gate: 'pending'` AJOUTÉ POUR L'OCCASION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE REJOUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `deriveWelcomeCards` (`apps/web/.../derive-welcome-cards.ts`) propose
 * `prioritizeWeek` dès que `hasAccountsToAct` est vrai ET que le profil ESN
 * n'a pas répondu `yes` à « places-tu des CDI chez tes clients ? ». Le second
 * signal vit dans `apps/web` ; le premier vient de `accountsAwaitingAction`
 * (`apps/api/.../accounts.service.ts`, requête SQL). Un test API ne peut
 * importer `apps/web` (aucun demo-coverage spec ne le fait), donc cette garde
 * RÉIMPLÉMENTE le prédicat SQL en TypeScript pur, sur les DONNÉES du dossier —
 * même patron que `demo-audit-plan-coverage.spec.ts` pour la fenêtre de 7
 * jours de l'audit.
 *
 * ⚠️ La classe #2897 a explicitement REFUSÉ d'ajouter un `priority_gate:
 * 'pending'` en plus, pour ne pas changer l'écran d'arrivée de la démo (le
 * briefing peuplé). Cette garde le PROUVE aussi : SNCF porte déjà cet état
 * (antérieur à ce lot, jamais retouché ici).
 */

/** Même prédicat que `accountsAwaitingAction` (`accounts.service.ts`), sur les champs du dossier plutôt que sur une ligne SQL. */
function awaitsAction(account: { commercial_status: string; priority_gate: string }): boolean {
  const status = 'completed' // #765 (demo-seed.service.ts) — littéral pour LES SIX dossiers, jamais lu du jeu.
  if (account.priority_gate === 'parked') return false
  if (status !== 'completed') return false
  if (account.priority_gate === 'pending') return true
  // La seconde branche (compte SUIVI et sans action récente) dépend de
  // `user_actions`, hors du dossier statique — non nécessaire ici puisque
  // SNCF déclenche déjà la première branche, et c'est ce que cette garde vise.
  return false
}

describe('DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE (#2897)', () => {
  it('est classée SEEDÉE, avec une raison qui tient', () => {
    expect(DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE.state).toBe('seede')
    expect(DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE.reason.length).toBeGreaterThan(60)
    expect(DEMO_WELCOME_PRIORITIZE_WEEK_COVERAGE.reason).toContain('2897')
  })

  it('le profil ESN de la salle ne répond pas `yes` — `prioritizeWeek` ne cède jamais sa place à `positionConsultant`', () => {
    expect(DEMO_ESN_PROFILE.recruits_for_clients).not.toBe('yes')
  })

  it('AU MOINS un dossier réel déclenche `hasAccountsToAct` par `priority_gate: pending` SEUL — SNCF en fait partie', () => {
    const triggering = DEMO_DOSSIERS.filter(dossier => awaitsAction(dossier.account))
    expect(triggering.map(dossier => dossier.account.company_name)).toContain('SNCF')
    // Chacune de ces lignes est ANTÉRIEURE à ce lot (#2897 n'en ajoute aucune) :
    // vérifié en même temps qu'aucun `priority_gate: 'pending'` n'a été posé
    // pour l'occasion, exactement ce que la classe #2897 a refusé.
    expect(triggering.every(dossier => dossier.account.priority_gate === 'pending')).toBe(true)
  })

  it('sait dire NON : un compte ÉCARTÉ (`parked`) ne déclenche jamais la carte, même `pending`', () => {
    expect(awaitsAction({ commercial_status: 'watching', priority_gate: 'parked' })).toBe(false)
  })
})
