import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_MY_REPORTS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_PURGE_USER_TABLES } from './demo-reset.service'

/**
 * #1960.10 — « et en démonstration, Mes signalements montre quoi ? »
 *
 * La garde PAR TABLE ne peut rien en dire : `beta_feedback` ne porte pas de
 * `workspace_id`, elle est purgée par l'AUTEUR (`DEMO_PURGE_USER_TABLES`), et
 * `demo-coverage.spec.ts` ne classe que les tables purgées par espace. Ce
 * fichier pose donc la question au niveau de l'ÉCRAN, sur le modèle de
 * `demo-market-review-decision-coverage.spec.ts`.
 */

const API_SRC = join(__dirname, '..', '..')
const WEB_SRC = join(API_SRC, '..', '..', 'web', 'src')
const VIEW = join(WEB_SRC, 'features', 'feedback', 'MyReportsView.tsx')
const WIDGET = join(WEB_SRC, 'features', 'feedback', 'FeedbackWidget.tsx')
const CONTROLLER = join(API_SRC, 'modules', 'feedback', 'feedback.controller.ts')

/** Les causes qui doivent être NOMMÉES dans la raison — sa nature, pas son orthographe. */
const CAUSES_QUI_DOIVENT_ETRE_NOMMEES = ['back-office', 'référence', 'refusé', 'purgé']

describe('couverture démo — « Mes signalements » (#1960.10)', () => {
  it('LIT l’écran, le widget et le contrôleur réels, pas une liste recopiée', () => {
    const view = readFileSync(VIEW, 'utf8')
    expect(view).toContain('myReportsApi.list')
    expect(view).toContain('empty_never')
    // La raison dit qu'un visiteur ne PEUT PAS signaler : c'est vrai tant que
    // la porte d'écriture refuse la démonstration ET que le widget le dit.
    expect(readFileSync(CONTROLLER, 'utf8')).toContain('isDemoWorkspace')
    expect(readFileSync(WIDGET, 'utf8')).toContain('useIsDemo')
  })

  it('classe l’écran « vide à dessein », et la raison NOMME ses causes', () => {
    expect(DEMO_MY_REPORTS_COVERAGE.state).toBe('vide_a_dessein')
    for (const cause of CAUSES_QUI_DOIVENT_ETRE_NOMMEES) {
      expect(DEMO_MY_REPORTS_COVERAGE.reason).toContain(cause)
    }
  })

  // NON : la raison d'avant disait « un visiteur peut signaler depuis la
  // démonstration ». Elle serait fausse depuis le refus — une raison périmée
  // ment sur la couverture autant qu'une table oubliée.
  it('la raison ne promet plus qu’un visiteur peut signaler', () => {
    expect(DEMO_MY_REPORTS_COVERAGE.reason).not.toMatch(/visiteur peut signaler|apparaît ici aussitôt/)
  })

  it('la décision est TENUE : le semis n’écrit aucun signalement', () => {
    expect(DEMO_SEEDED_TABLES as readonly string[]).not.toContain('beta_feedback')
    expect(readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')).not.toContain('beta_feedback')
  })

  // La salle est prêtée à des visiteurs successifs sous le MÊME utilisateur
  // propriétaire : une ligne écrite avant le refus (ou par un chemin futur) ne
  // doit jamais passer d'un visiteur au suivant.
  it('la table reste purgée à la remise à zéro de la salle', () => {
    expect(DEMO_PURGE_USER_TABLES as readonly string[]).toContain('beta_feedback')
  })
})
