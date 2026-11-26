import type { IssueProgress } from './github-issue.service'
import { creationLabels, reportStatusOf } from './report-status'

/**
 * #1960.10 — CE QUE L'AUTEUR LIT DE L'ÉTAT DE SON SIGNALEMENT.
 *
 * Le ticket sait ce qui a été FAIT ; l'auteur n'a jamais vu le ticket. Cette
 * traduction est la seule : un écran qui la referait à sa façon dirait un jour
 * « corrigé » là où celle-ci dit « fermé sans suite ».
 */
function progress(over: Partial<IssueProgress> = {}): IssueProgress {
  return {
    state: 'open',
    stateReason: null,
    assigned: false,
    labels: ['beta-feedback', 'feedback:bug'],
    humanComment: false,
    ...over,
  }
}

describe('#1960.10 — reportStatusOf', () => {
  describe('ouvert', () => {
    it('sans personne dessus → reçu', () => {
      expect(reportStatusOf(progress())).toBe('received')
    })

    it('attribué à quelqu’un → en cours', () => {
      expect(reportStatusOf(progress({ assigned: true }))).toBe('in_progress')
    })

    it('étiqueté par quelqu’un (une étiquette que la création ne pose pas) → en cours', () => {
      expect(reportStatusOf(progress({ labels: ['beta-feedback', 'feedback:bug', 'lot-12'] }))).toBe('in_progress')
    })

    it('une réponse humaine dans le fil → en cours', () => {
      expect(reportStatusOf(progress({ humanComment: true }))).toBe('in_progress')
    })

    it('rouvert → en cours (quelqu’un y est revenu)', () => {
      expect(reportStatusOf(progress({ stateReason: 'REOPENED' }))).toBe('in_progress')
    })

    // ⚠️ La garde sait dire NON : les étiquettes que la CRÉATION pose ne sont pas
    // un tri. Sans cette exclusion, chaque signalement serait « en cours » dès
    // la seconde où il part — et plus rien ne serait jamais « reçu ».
    it('les étiquettes posées À LA CRÉATION ne comptent pas comme une prise en main', () => {
      for (const labels of [
        creationLabels('bug', false),
        creationLabels('metier', true),
        creationLabels('autre', true),
      ]) {
        expect({ labels, status: reportStatusOf(progress({ labels })) }).toEqual({ labels, status: 'received' })
      }
    })
  })

  describe('fermé', () => {
    it('comme résolu → corrigé', () => {
      expect(reportStatusOf(progress({ state: 'closed', stateReason: 'COMPLETED' }))).toBe('fixed')
    })

    it('comme non prévu → fermé sans suite', () => {
      expect(reportStatusOf(progress({ state: 'closed', stateReason: 'NOT_PLANNED' }))).toBe('closed_unresolved')
    })

    it('comme doublon → fermé sans suite (CE ticket n’a pas été corrigé)', () => {
      expect(reportStatusOf(progress({ state: 'closed', stateReason: 'DUPLICATE' }))).toBe('closed_unresolved')
    })

    // NON : une fermeture dont on ne connaît pas la raison n'est pas une
    // correction. « Corrigé » par défaut serait la promesse la plus chère à tenir.
    it('sans raison connue → état indisponible, jamais « corrigé » par défaut', () => {
      expect(reportStatusOf(progress({ state: 'closed', stateReason: null, assigned: true }))).toBeNull()
    })
  })

  // NON : « non mesuré » n'est pas un état. Un ticket qu'on n'a pas pu lire
  // n'est pas « reçu » — le dire ferait croire qu'il attend alors qu'il est
  // peut-être corrigé depuis une semaine.
  it('ticket illisible → état indisponible, jamais « reçu » par défaut', () => {
    expect(reportStatusOf(null)).toBeNull()
    expect(reportStatusOf(undefined)).toBeNull()
  })
})

describe('#1960.10 — creationLabels, la seule liste des étiquettes de création', () => {
  it('rend ce que la création pose, retour client et retour d’opérateur', () => {
    expect(creationLabels('bug', false)).toEqual(['beta-feedback', 'feedback:bug'])
    expect(creationLabels('bug', true)).toEqual(['beta-feedback', 'feedback:bug', 'beta-backoffice'])
  })
})
