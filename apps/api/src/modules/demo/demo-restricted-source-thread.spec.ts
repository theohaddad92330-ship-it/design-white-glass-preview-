import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { persistedChatContext } from '@bellum/contracts'
import { DEMO_RESTRICTED_SOURCE_COVERAGE } from './demo-coverage'
import { DEMO_RESTRICTED_SOURCE_THREAD } from './demo-dataset'

/**
 * #3775.a (lot M12, 09/10) — la ligne orange « un collègue qui ouvre ce lien
 * pourra le lire » (`ShareConversation`, `share.restrictedSourceNotice`) ne
 * s'observait qu'avec une messagerie personnelle connectée : aucune salle de
 * démonstration n'en a. La salle sème un fil DATÉ dont la réponse cite une
 * source marquée personnelle À L'ÉCRITURE — le cas exact que la ligne protège
 * (« un extrait déjà écrit n'est pas protégé par la fermeture de sa source »).
 * Sait dire NON : un contexte que la liste blanche rejette, une source non
 * marquée, ou une constante que le semis n'appelle pas, fait rougir la garde.
 */
type DemoSource = { kind: string; label: string; as_of: string | null; restricted?: boolean }
const sources: readonly DemoSource[] = DEMO_RESTRICTED_SOURCE_THREAD.context.sources

describe('#3775.a — un fil démo qui cite une source personnelle', () => {
  it('passe la SEULE porte d’écriture du contexte (`persistedChatContext`) et garde le drapeau', () => {
    const context = persistedChatContext(DEMO_RESTRICTED_SOURCE_THREAD.context)
    expect(context).not.toBeNull()
    expect(context?.sources.some(source => source.restricted === true)).toBe(true)
  })

  it('la source marquée est d’une famille PERSONNELLE (messagerie), jamais un fournisseur nommé', () => {
    const restricted = sources.filter(source => source.restricted)
    expect(restricted.map(source => source.kind)).toEqual(['email'])
    for (const source of restricted) expect(source.label).not.toMatch(/gmail|outlook|google|microsoft/i)
  })

  it('sait dire NON : un contexte sans drapeau ne déclencherait pas la ligne', () => {
    const unmarked = {
      ...DEMO_RESTRICTED_SOURCE_THREAD.context,
      sources: sources.map(({ restricted: _restricted, ...rest }) => rest),
    }
    expect(persistedChatContext(unmarked)?.sources.some(source => source.restricted === true)).toBe(false)
  })

  it('la réponse ne recopie aucun corps de message (doctrine : le corps ne sort jamais)', () => {
    expect(DEMO_RESTRICTED_SOURCE_THREAD.answer).not.toMatch(/[«"]/)
  })

  it('est réellement écrit par le semis et classé « seedé » dans la couverture', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_RESTRICTED_SOURCE_THREAD')
    expect(DEMO_RESTRICTED_SOURCE_COVERAGE.state).toBe('seede')
  })
})
