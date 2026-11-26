import { DECISION_GATES, GATE_DECISIONS, PROJECT_STAGES, SUBMISSION_STAGES, type Activity } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { timelineEventTitle } from './timelineEvent'

/**
 * #2124.68 — l'objet d'une ligne d'historique se lit, il ne se déchiffre pas.
 *
 * Le `t` de ces tests rend la CLÉ demandée : c'est ce qui permet de vérifier
 * QUELLE clé le module va chercher, sans dépendre du contenu des catalogues
 * (qui est tenu, lui, par `i18n/enum-keys.test.ts`). Le test qui compte est le
 * dernier : aucune sortie ne contient jamais une clé `snake_case` brute.
 */
const t = (key: string): string => key

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    kind: 'email',
    source: 'mailbox',
    direction: 'outbound',
    subject: 'Deux profils conformité',
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt: '2026-09-14T19:02:00.000Z',
    durationSeconds: null,
    accountId: 'acc-1',
    contactId: null,
    projectId: null,
    linkReason: 'manual',
    userId: null,
    authorName: null,
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: '2026-09-14T19:02:00.000Z',
    ...overrides,
  }
}

describe('timelineEventTitle', () => {
  it('ne rend JAMAIS la ligne mesurée en production le 14/09/2026', () => {
    // `account_priority — accept`, section « Historique & preuves » de THALES.
    const title = timelineEventTitle(
      activity({
        kind: 'gate_decision',
        source: 'system',
        direction: 'internal',
        subject: 'account_priority — accept',
      }),
      t,
    )
    // Le `t` de ce fichier rend la clé demandée : ce qui compte ici est que
    // les deux moitiés passent par le CATALOGUE, et non que l'objet brut
    // ressorte tel que la base le porte.
    expect(title).toBe('gates.account_priority — gateDecisions.accept')
    expect(title).not.toBe('account_priority — accept')
  })

  it.each(DECISION_GATES)('%s passe par le catalogue, pas par sa clé', gate => {
    const title = timelineEventTitle(
      activity({ kind: 'gate_decision', source: 'system', direction: 'internal', subject: `${gate} — refuse` }),
      t,
    )
    expect(title).toBe(`gates.${gate} — gateDecisions.refuse`)
  })

  it.each(GATE_DECISIONS)('la décision %s passe par le catalogue', decision => {
    expect(
      timelineEventTitle(
        activity({
          kind: 'gate_decision',
          source: 'system',
          direction: 'internal',
          subject: `erp_write — ${decision}`,
        }),
        t,
      ),
    ).toBe(`gates.erp_write — gateDecisions.${decision}`)
  })

  it('NOMME une porte que cette version ne connaît pas, au lieu de rendre sa clé', () => {
    // Le repli est un filet : la CI casse par ailleurs (enum-keys), mais un
    // client sur une version ancienne ne doit pas lire `gate_de_demain`.
    const title = timelineEventTitle(
      activity({
        kind: 'gate_decision',
        source: 'system',
        direction: 'internal',
        subject: 'gate_de_demain — decide_de_demain',
      }),
      t,
    )
    expect(title).toBe('gates.unknown — gateDecisions.unknown')
  })

  it('retombe sur la NATURE quand l’objet d’une décision n’a pas la forme attendue', () => {
    expect(
      timelineEventTitle(
        activity({ kind: 'gate_decision', source: 'system', direction: 'internal', subject: 'account_priority' }),
        t,
      ),
    ).toBe('kinds.gate_decision')
  })

  it('traduit l’étape d’un mouvement de projet et garde le nom du projet', () => {
    expect(
      timelineEventTitle(
        activity({ kind: 'stage_change', source: 'system', direction: 'outbound', subject: 'Refonte SI — won' }),
        t,
      ),
    ).toBe('Refonte SI — projects:stage.states.won')
  })

  it('coupe sur le DERNIER séparateur — un projet peut en porter un dans son nom', () => {
    expect(
      timelineEventTitle(
        activity({
          kind: 'stage_change',
          source: 'system',
          direction: 'outbound',
          subject: 'Refonte SI — phase 2 — negotiation',
        }),
        t,
      ),
    ).toBe('Refonte SI — phase 2 — projects:stage.states.negotiation')
  })

  it('traduit l’étape d’un positionnement et garde le nom du profil', () => {
    expect(
      timelineEventTitle(
        activity({ kind: 'task', source: 'system', direction: 'outbound', subject: 'Marie Dupont — submitted' }),
        t,
      ),
    ).toBe('Marie Dupont — submissions:stages.submitted')
  })

  // #2196.31 — la pose et l'annulation d'une exception de relevé se LISENT
  // au journal de la mission : la mission et le mois gardés, la clé traduite.
  it('#2196.31 — traduit la pose et l’annulation d’une exception de relevé', () => {
    const marked = activity({
      kind: 'workflow',
      source: 'system',
      direction: 'internal',
      subject: 'Run plateforme · 2026-07 — timesheet_not_applicable',
    })
    expect(timelineEventTitle(marked, t)).toBe('Run plateforme · 2026-07 — timesheetException.timesheet_not_applicable')
    const revoked = activity({
      kind: 'workflow',
      source: 'system',
      direction: 'internal',
      subject: 'Run plateforme · 2026-07 — timesheet_not_applicable_revoked',
    })
    expect(timelineEventTitle(revoked, t)).toBe(
      'Run plateforme · 2026-07 — timesheetException.timesheet_not_applicable_revoked',
    )
  })

  it('#2196.31 — ne réécrit PAS un autre objet de flux de travail qui porterait un séparateur', () => {
    const other = activity({ kind: 'workflow', source: 'system', direction: 'internal', subject: 'Relance — étape 2' })
    expect(timelineEventTitle(other, t)).toBe('Relance — étape 2')
  })

  it('NOMME une étape inconnue plutôt que de rendre sa clé', () => {
    expect(
      timelineEventTitle(
        activity({
          kind: 'stage_change',
          source: 'system',
          direction: 'outbound',
          subject: 'Refonte SI — etape_neuve',
        }),
        t,
      ),
    ).toBe('Refonte SI — stages.unknown')
  })

  it('ne réécrit PAS le texte d’un humain — une tâche garde son intitulé', () => {
    // Deux émetteurs écrivent des activités `task` : les tâches (`internal`,
    // objet saisi par la personne) et les positionnements (`outbound`). Une
    // tâche dont l'intitulé contient un tiret cadratin reste intacte.
    expect(
      timelineEventTitle(
        activity({ kind: 'task', source: 'system', direction: 'internal', subject: 'Rappeler Marie — interview' }),
        t,
      ),
    ).toBe('Rappeler Marie — interview')
  })

  it('ne touche pas à l’objet d’un e-mail capturé', () => {
    expect(timelineEventTitle(activity(), t)).toBe('Deux profils conformité')
  })

  it('nomme la nature quand il n’y a pas d’objet du tout', () => {
    expect(timelineEventTitle(activity({ kind: 'crm_lookup', subject: null }), t)).toBe('kinds.crm_lookup')
  })

  it('aucune sortie ne laisse fuir une clé machine', () => {
    // Le test de POPULATION : toutes les formes d'objet système que les trois
    // émetteurs savent écrire, et la garantie qu'aucune ne rend un identifiant
    // `snake_case` nu. Ici `t` rend une PHRASE, jamais la clé — c'est la sortie
    // telle qu'un commercial la lit qu'on inspecte.
    const humanise = (key: string): string => (key.includes('.') ? 'un libellé humain' : key)
    const cases: Activity[] = [
      ...DECISION_GATES.flatMap(gate =>
        GATE_DECISIONS.map(decision =>
          activity({
            kind: 'gate_decision',
            source: 'system',
            direction: 'internal',
            subject: `${gate} — ${decision}`,
          }),
        ),
      ),
      activity({
        kind: 'gate_decision',
        source: 'system',
        direction: 'internal',
        subject: 'gate_de_demain — decide_de_demain',
      }),
      ...PROJECT_STAGES.map(stage =>
        activity({ kind: 'stage_change', source: 'system', direction: 'outbound', subject: `Refonte SI — ${stage}` }),
      ),
      ...SUBMISSION_STAGES.map(stage =>
        activity({ kind: 'task', source: 'system', direction: 'outbound', subject: `Marie Dupont — ${stage}` }),
      ),
    ]
    for (const item of cases) {
      const title = timelineEventTitle(item, humanise)
      expect(title, item.subject ?? '').not.toMatch(/[a-z0-9]+_[a-z0-9]+/)
    }
  })
})
