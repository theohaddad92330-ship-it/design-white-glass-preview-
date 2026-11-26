import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3680 (reste de #3680.1/.2, épopée #3777) — DEUX ARTICLES SUR LE MÊME
 * ÉVÉNEMENT NE SONT PAS DEUX SIGNAUX.
 *
 * `distinctWatchEvents` (`apps/web/src/features/accounts/model/watchEvents.ts`)
 * fusionne deux signaux qui partagent la même catégorie, la même date, et le
 * même texte normalisé (`watchEventKey`) — un doublon de dépêche n'est pas un
 * second événement. Avant ce lot, aucun compte démo n'exerçait ce chemin : la
 * fusion restait un code juste que la salle ne pouvait jamais montrer.
 *
 * Cette garde ne réimporte pas `distinctWatchEvents` (le web ne se lit pas
 * depuis l'API, GA-07) : elle verrouille les TROIS prémisses exactes dont la
 * fusion dépend, directement sur les données semées — casser l'une d'elles
 * doit la faire rougir.
 */
describe('couverture démo — deux articles sur le même événement (Société Générale)', () => {
  const sg = DEMO_DOSSIERS[0]!.account
  const [first, second] = sg.recent_signals.filter(signal => signal.id === 's1' || signal.id === 's6')

  it('Société Générale est bien le compte lu (ordre verrouillé par ailleurs)', () => {
    expect(DEMO_DOSSIERS[0]?.account.company_name).toBe('Société Générale')
  })

  it('porte deux signaux (s1, s6) de même catégorie, même date, même texte — la clé exacte de watchEventKey', () => {
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second!.type).toBe(first!.type)
    expect(second!.date).toBe(first!.date)
    expect(second!.signal).toBe(first!.signal)
  })

  it('mais une source et un id DIFFÉRENTS — sinon ce ne serait pas deux articles, un seul relu deux fois', () => {
    expect(second!.id).not.toBe(first!.id)
    expect(second!.source).not.toBe(first!.source)
  })

  it('aucun des deux signaux n’est « undated » — un signal non daté ne fusionne jamais (watchEventKey)', () => {
    expect(first!.date?.trim()).toBeTruthy()
    expect(second!.date?.trim()).toBeTruthy()
  })
})
