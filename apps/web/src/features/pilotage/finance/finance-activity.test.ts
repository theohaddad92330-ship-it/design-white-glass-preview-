import { describe, expect, it } from 'vitest'
import {
  FINANCE_ACTIVITY_KINDS,
  FINANCE_ACTIVITY_MAX,
  FINANCE_ACTIVITY_NOT_DATED,
  financeActivity,
} from './finance-activity'

const NOW = new Date('2026-08-31T12:00:00.000Z')

/** La forme MINIMALE que `financeActivity` lit d'un dossier ADV. Écrite ici
 *  plutôt qu'exportée du module : un type qui ne sert qu'à son test n'a pas à
 *  élargir la surface publique du module (règle knip du dépôt). */
type DossierOverride = {
  missionId?: string
  kind?: 'start' | 'renewal'
  startedOn?: string | null
  missionLabel?: string | null
  accountName?: string | null
}

const dossier = (over: DossierOverride = {}) => ({
  missionId: 'm-1',
  kind: 'start' as const,
  startedOn: '2026-08-30' as string | null,
  missionLabel: 'Ingénieur DevOps' as string | null,
  accountName: 'Lacoste' as string | null,
  ...over,
})

type LineOverride = {
  timesheetId?: string | null
  missionId?: string
  missionLabel?: string | null
  accountName?: string | null
  consultantName?: string | null
  validatedByClientAt?: string | null
  rejectedAt?: string | null
}

const line = (over: LineOverride = {}) => ({
  timesheetId: 't-1' as string | null,
  missionId: 'm-1',
  missionLabel: 'Ingénieur DevOps' as string | null,
  accountName: 'Lacoste' as string | null,
  consultantName: 'Nadia' as string | null,
  validatedByClientAt: null as string | null,
  rejectedAt: null as string | null,
  ...over,
})

describe('l’activité récente — ce qu’elle montre', () => {
  it('rend les trois événements DATÉS, du plus récent au plus ancien', () => {
    const { shown } = financeActivity(
      {
        adv: [dossier({ startedOn: '2026-08-20' })],
        timesheets: [
          line({ timesheetId: 't-a', validatedByClientAt: '2026-08-30T09:00:00.000Z' }),
          line({ timesheetId: 't-b', rejectedAt: '2026-08-25T09:00:00.000Z' }),
        ],
      },
      NOW,
    )
    expect(shown.map(item => item.kind)).toEqual(['timesheet_validated', 'timesheet_rejected', 'mission_started'])
    expect(shown[0]?.subject).toBe('Ingénieur DevOps — Lacoste — Nadia')
  })

  it('montre un refus ET une validation sur le même relevé — on archive, on ne supprime pas', () => {
    const { shown } = financeActivity(
      {
        timesheets: [line({ rejectedAt: '2026-08-10T09:00:00.000Z', validatedByClientAt: '2026-08-20T09:00:00.000Z' })],
      },
      NOW,
    )
    expect(shown).toHaveLength(2)
    expect(new Set(shown.map(item => item.id)).size).toBe(2)
  })

  it('plafonne à cinq et ANNONCE ce qu’elle replie', () => {
    const timesheets = Array.from({ length: 8 }, (_, index) =>
      line({ timesheetId: `t-${index}`, validatedByClientAt: `2026-08-${String(index + 10)}T09:00:00.000Z` }),
    )
    const { shown, hidden } = financeActivity({ timesheets }, NOW)
    expect(shown).toHaveLength(FINANCE_ACTIVITY_MAX)
    expect(hidden).toBe(3)
  })

  /**
   * L'UNION COMPLÈTE — la destination de « voir toute l'activité » (01/09/2026).
   *
   * Le bouton n'avait aucun lien : « aucun écran ne montre l'union de ces trois
   * événements ». La destination était pourtant déjà là, calculée et triée —
   * elle était simplement JETÉE après le plafond de cinq.
   */
  it('rend AUSSI l’union complète, dans le même ordre, sans rien perdre', () => {
    const timesheets = Array.from({ length: 8 }, (_, index) =>
      line({ timesheetId: `t-${index}`, validatedByClientAt: `2026-08-${String(index + 10)}T09:00:00.000Z` }),
    )
    const { shown, all, hidden } = financeActivity({ timesheets }, NOW)
    // Le compte replié n'est pas une opinion : c'est exactement ce que l'union
    // porte en plus. Deux comptes qui divergeraient feraient dire « 3 autres »
    // à une liste qui en montrerait cinq.
    expect(all).toHaveLength(shown.length + hidden)
    // Le MÊME ordre : la liste dépliée n'est pas un second tri, sinon
    // « voir tout » réordonnerait les cinq lignes qu'on regardait.
    expect(all.slice(0, FINANCE_ACTIVITY_MAX)).toEqual(shown)
  })

  it('l’union ne fabrique RIEN de plus que la bande : mêmes refus, même population', () => {
    // Un renouvellement (échéance future) et une date illisible restent dehors
    // des DEUX listes — « voir tout » ne doit pas être une porte dérobée vers
    // ce que la bande refuse de montrer.
    const { all } = financeActivity(
      {
        adv: [dossier({ kind: 'renewal', startedOn: '2026-08-01' }), dossier({ startedOn: 'pas-une-date' })],
        timesheets: [line({ validatedByClientAt: '2026-08-20T09:00:00.000Z' })],
      },
      NOW,
    )
    expect(all.map(item => item.kind)).toEqual(['timesheet_validated'])
  })
})

describe('l’activité récente — ce qu’elle REFUSE de montrer', () => {
  it('écarte un RENOUVELLEMENT : une échéance future n’a pas « eu lieu »', () => {
    const { shown } = financeActivity({ adv: [dossier({ kind: 'renewal' })] }, NOW)
    expect(shown).toEqual([])
  })

  it('écarte un événement POSTÉRIEUR à maintenant — un plan n’est pas une activité', () => {
    const { shown } = financeActivity({ adv: [dossier({ startedOn: '2026-09-15' })] }, NOW)
    expect(shown).toEqual([])
  })

  it('écarte une date ILLISIBLE plutôt que de la ramener à maintenant ou à 1970', () => {
    // Les deux replis existent dans la nature et sont pires que l'absence :
    // l'un met un vieil événement en tête de bande, l'autre le range en 1970.
    const { shown } = financeActivity(
      { adv: [dossier({ startedOn: 'bientôt' })], timesheets: [line({ validatedByClientAt: '' })] },
      NOW,
    )
    expect(shown).toEqual([])
  })

  it('un sujet inconnu vaut `null`, jamais un tiret ni un « Sans nom »', () => {
    const { shown } = financeActivity(
      { timesheets: [line({ missionLabel: null, accountName: null, consultantName: '  ' })] },
      NOW,
    )
    // Aucune date de validation ici : rien à montrer, donc la ligne ne sort pas.
    expect(shown).toEqual([])

    const withDate = financeActivity(
      {
        timesheets: [
          line({
            missionLabel: null,
            accountName: null,
            consultantName: null,
            validatedByClientAt: '2026-08-20T09:00:00.000Z',
          }),
        ],
      },
      NOW,
    )
    expect(withDate.shown[0]?.subject).toBeNull()
  })

  it('une lecture ABSENTE ne fabrique aucun événement', () => {
    expect(financeActivity({ adv: null, timesheets: null }, NOW)).toEqual({ shown: [], all: [], hidden: 0 })
    expect(financeActivity({}, NOW)).toEqual({ shown: [], all: [], hidden: 0 })
  })
})

describe('la garde LIT quelque chose', () => {
  it('nomme les trois événements datables ET les deux qui ne le sont pas', () => {
    // Sans ce registre, la prochaine personne croit à un oubli et recode une
    // source pour « facture envoyée » — qui n'existera jamais, puisque le
    // produit n'émet aucune facture (reconfirmé par Louis le 31/08/2026).
    expect([...FINANCE_ACTIVITY_KINDS]).toEqual(['mission_started', 'timesheet_validated', 'timesheet_rejected'])
    expect([...FINANCE_ACTIVITY_NOT_DATED]).toEqual(['invoice_sent', 'payment_received'])
  })
})
