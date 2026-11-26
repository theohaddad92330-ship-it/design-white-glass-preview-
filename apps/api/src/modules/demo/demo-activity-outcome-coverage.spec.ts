import { CALL_OUTCOMES, callOutcomeSchema } from '@bellum/contracts'
import { DEMO_ACTIVITIES } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE L'ISSUE D'APPEL (N11-B, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `activities.call_outcome` n'ajoute AUCUNE table : la garde par table de
 * `demo-coverage.spec.ts` classe déjà `activities` SEEDÉE et reste donc verte,
 * qu'une ligne porte une issue ou non. Le trou constaté le 30/08/2026 : le
 * type `DemoActivity` n'avait même pas de champ `outcome`, et le seul appel de
 * la salle (SNCF, « Point sur le besoin publié ») s'affichait pour toujours « Issue non
 * renseignée » — un état qui existe déjà par ailleurs, donc invisible en tant
 * que capacité neuve.
 *
 * ⚠️ Les DEUX moitiés comptent, comme partout ailleurs dans ce dépôt : un appel
 * qui montre son issue, et un qui ne la montre PAS — sinon `TimelinePanel`
 * n'a jamais l'occasion d'écrire « Issue non renseignée », qui est la moitié
 * du produit qui dit ce qu'il ignore.
 */
describe('parité démo — l’issue d’un appel', () => {
  it('la garde LIT quelque chose — au moins un appel existe dans le jeu', () => {
    const calls = DEMO_ACTIVITIES.filter(activity => activity.kind === 'call')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('au moins un appel porte une issue DÉCLARÉE, valide au contrat', () => {
    const withOutcome = DEMO_ACTIVITIES.filter(activity => activity.kind === 'call' && activity.outcome != null)
    expect(withOutcome.length).toBeGreaterThan(0)
    for (const activity of withOutcome) {
      expect(callOutcomeSchema.safeParse(activity.outcome).success).toBe(true)
    }
  })

  it('au moins un appel reste SANS issue — « non renseignée » doit pouvoir se voir', () => {
    const withoutOutcome = DEMO_ACTIVITIES.filter(activity => activity.kind === 'call' && activity.outcome == null)
    expect(withoutOutcome.length).toBeGreaterThan(0)
  })

  it('aucune activité NON-appel ne porte d’issue — le contrat l’interdit, le jeu ne le tente pas', () => {
    const misplaced = DEMO_ACTIVITIES.filter(activity => activity.kind !== 'call' && activity.outcome != null)
    expect(misplaced).toEqual([])
  })

  it('la garde sait dire NON — une valeur inventée serait vue', () => {
    expect(callOutcomeSchema.safeParse('answered_happily').success).toBe(false)
    expect(CALL_OUTCOMES.includes('answered_happily' as (typeof CALL_OUTCOMES)[number])).toBe(false)
  })
})

/**
 * #2984 — le consentement déclaratif et le brouillon de suivi, SEEDÉS —
 * `DemoSeedService` sérialise `callDebrief` tel quel (`activity.callDebrief
 * ?? null`), donc rien ne les affiche si aucune ligne du jeu ne les porte
 * explicitement (mémoire : « une classification de couverture affirme, la
 * garde ne vérifie pas »).
 */
describe('parité démo — #2984 consentement et brouillon de suivi', () => {
  it('au moins un appel porte recordingConsent', () => {
    const withConsent = DEMO_ACTIVITIES.filter(
      activity => activity.kind === 'call' && activity.callDebrief?.recordingConsent === true,
    )
    expect(withConsent.length).toBeGreaterThan(0)
  })

  it('au moins un appel porte un brouillon de suivi, jamais vide', () => {
    const withDraft = DEMO_ACTIVITIES.filter(
      activity => activity.kind === 'call' && activity.callDebrief?.followUpDraft,
    )
    expect(withDraft.length).toBeGreaterThan(0)
    for (const activity of withDraft) {
      expect(activity.callDebrief?.followUpDraft?.body.trim()).not.toBe('')
    }
  })
})
