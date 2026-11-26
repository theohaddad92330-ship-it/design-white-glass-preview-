import { DECISION_GATES, GATE_DECISIONS, splitTimelineSystemSubject } from '@bellum/contracts'
import { DEMO_ACTIVITIES } from './demo-dataset'

/**
 * #2124.68 — LA PARITÉ DÉMO DE L'OBJET D'UNE LIGNE SYSTÈME (craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 14/09/2026 sur le compte THALES : la section
 * « Historique & preuves » affichait `account_priority — accept`. Le catalogue
 * de libellés qui corrige ce défaut (`activities:gates.*`) ne se voit QUE sur
 * une ligne `gate_decision` — et la salle de démonstration n'en portait aucune.
 * Un prospect n'aurait donc jamais vu la moitié du produit qui garde QUI a
 * tranché.
 *
 * `demo-coverage.spec.ts` reste verte ici : elle classe des TABLES, et
 * `activities` est seedée depuis longtemps. C'est exactement le trou qu'avait
 * déjà l'issue d'appel (`demo-activity-outcome-coverage.spec.ts`) — une
 * capacité neuve DANS une table déjà couverte.
 *
 * Ce que la garde exige, et rien de plus : qu'au moins une ligne de porte
 * existe, et que son objet ait la forme RÉELLE que `DecisionGatesService.trace`
 * écrit. Y écrire une phrase française ferait passer la démonstration à côté du
 * chemin qu'elle doit exercer — l'écran ne traduirait rien, et le défaut
 * reviendrait sans que personne ne le voie.
 */
describe('parité démo — l’objet d’une ligne système de la timeline', () => {
  const gateLines = DEMO_ACTIVITIES.filter(activity => activity.kind === 'gate_decision')

  it('la garde LIT quelque chose — le jeu d’activités n’est pas vide', () => {
    expect(DEMO_ACTIVITIES.length).toBeGreaterThan(0)
    expect(DECISION_GATES.length).toBeGreaterThanOrEqual(8)
    expect(GATE_DECISIONS.length).toBe(3)
  })

  it('la salle montre au moins une porte de décision franchie', () => {
    expect(gateLines.length).toBeGreaterThan(0)
  })

  it('l’objet porte la forme RÉELLE de production, pas une phrase écrite pour la démo', () => {
    // Le rapport d'échec NOMME la ligne fautive : `expect` de jest ne prend pas
    // de message, donc c'est la valeur comparée qui doit le porter.
    const malformed = gateLines
      .map(line => ({ subject: line.subject ?? '', parts: splitTimelineSystemSubject(line.subject ?? '') }))
      .filter(
        ({ parts }) =>
          parts === null ||
          !(DECISION_GATES as readonly string[]).includes(parts.context) ||
          !(GATE_DECISIONS as readonly string[]).includes(parts.key),
      )
      .map(({ subject }) => subject)
    expect(malformed).toEqual([])
  })

  it('une porte se trace en INTERNE et s’écrit par le système — jamais une touche client', () => {
    // Décider de son portefeuille n'est pas un échange : le compter comme tel
    // ferait passer un compte pour plus travaillé qu'il ne l'est. Et `manual`
    // dirait que quelqu'un a saisi la ligne à la main, ce qui est faux.
    expect(gateLines.map(line => ({ subject: line.subject, direction: line.direction, source: line.source }))).toEqual(
      gateLines.map(line => ({ subject: line.subject, direction: 'internal', source: 'system' })),
    )
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les échanges gardent leur objet libre', () => {
    // Le témoin du cas légitime voisin : un e-mail, un appel, un rendez-vous
    // portent un objet écrit par un humain. Aucun ne doit ressembler à un
    // couple `<clé> — <clé>`, sinon l'écran le retraduirait — et aucun ne
    // s'écrit `system`.
    // #3505/#3532 — les gestes SYSTÈME (consultation CRM, action exécutée) sont
    // écrits `system` par le produit lui-même : ils ne sont pas des échanges.
    const exchanges = DEMO_ACTIVITIES.filter(
      activity => activity.kind !== 'gate_decision' && activity.kind !== 'crm_lookup' && activity.kind !== 'workflow',
    )
    expect(exchanges.length).toBeGreaterThan(0)
    expect(exchanges.filter(line => line.source !== undefined).map(line => line.subject)).toEqual([])
    const disguised = exchanges
      .map(line => ({ subject: line.subject ?? '', parts: splitTimelineSystemSubject(line.subject ?? '') }))
      .filter(({ parts }) => parts !== null && (DECISION_GATES as readonly string[]).includes(parts.context))
      .map(({ subject }) => subject)
    expect(disguised).toEqual([])
  })
})
