import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3717.7 — LE CAS « DÉJÀ EN TÊTE », EN DÉMONSTRATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PlanAttackSummary` (apps/web) n'affiche « Première action » en entier QUE
 * si elle diffère, texte exact (casse/espaces ignorés), du premier élément de
 * « Prochaines actions » (`measurePlanListOverlap`, apps/web). Recette 08/10 :
 * sur Société Générale, « Première action » ne répétait aucune phrase — le cas
 * ne se déclenchait jamais en salle. Cette garde compare les deux CHAÎNES du
 * jeu de données (web et API ne partagent pas de module ici, donc pas d'import
 * croisé : la comparaison texte, elle, est triviale et stable).
 */
describe('parité démo — « Déjà en tête » (#3717.7)', () => {
  it('Société Générale : `immediate_action` répète, mot pour mot, la première « prochaine action »', () => {
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    expect(sg).toBeDefined()
    const raw = sg!.account.raw_analysis as { immediate_action?: string; nextActions?: { label: string }[] }
    const normalize = (value: string) => value.trim().toLowerCase()
    expect(raw.immediate_action).toBeTruthy()
    expect(raw.nextActions?.[0]?.label).toBeTruthy()
    expect(normalize(raw.immediate_action!)).toBe(normalize(raw.nextActions![0].label))
  })
})
