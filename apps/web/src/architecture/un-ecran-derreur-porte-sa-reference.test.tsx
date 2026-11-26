// @vitest-environment jsdom
// Les gardes de ce dossier tournent en environnement `node` par défaut
// (`vitest.config.ts`) : celle-ci REND deux écrans, elle a donc besoin d'un
// DOM. Sans cette ligne, ses quatre tests de rendu échouaient sur
// « ReferenceError: document is not defined ».
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { CrashPage } from '@/components/organisms/crash-page'
import { TemporaryFailureScreen } from '@/components/organisms/temporary-failure-screen'
import { rememberSupportReference } from '@/lib/support-reference'

/**
 * #2442.5 — TOUTE ERREUR UTILISATEUR PORTE UNE RÉFÉRENCE SUPPORT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une panne qu'on ne peut pas RETROUVER coûte deux fois : une fois à la
 * personne, une fois à qui cherche ensuite dans les journaux sans savoir quelle
 * requête regarder. La référence est le trait d'union entre l'écran et
 * `correlation_id` — mais seulement tant que les écrans la PORTENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT — les deux moitiés, parce qu'aucune ne suffit
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Elle REND deux écrans réels et cherche la référence dans le DOM. Un test
 *     qui ne lirait que le source resterait vert sur une note devenue muette.
 *  2. Elle LIT le source des quatre écrans que `ApiErrorHandler` peut rendre
 *     (`components/error-handler.tsx`) et vérifie que chacun passe la note. Un
 *     test qui ne ferait que rendre laisserait un écran non couvert passer.
 *
 * Les quatre chemins sont ÉNUMÉRÉS, pas cherchés : un cinquième écran d'erreur
 * devra s'ajouter ici pour être couvert, ce qui est voulu — sinon la garde
 * grossirait son périmètre sans que personne ne l'ait décidé.
 */

const WEB_SRC = join(__dirname, '..')

/** Les quatre écrans vers lesquels `ApiErrorHandler` aiguille (plus la
 *  frontière d'erreur du routeur, qui rend `CrashPage`). */
const ERROR_SCREENS: readonly string[] = [
  'components/organisms/crash-page.tsx',
  'components/organisms/temporary-failure-screen.tsx',
  'components/organisms/not-found.tsx',
  'components/organisms/unauthorized.tsx',
]

/** Retire les commentaires — un docblock qui CITE la note ne doit pas tenir
 *  lieu de preuve qu'elle est branchée. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('#2442.5 — la référence support atteint vraiment l’écran', () => {
  beforeEach(() => rememberSupportReference(null))

  it('CrashPage l’affiche', () => {
    rememberSupportReference('BLM-3F2A1B4C')
    render(<CrashPage />)
    expect(screen.getByText('BLM-3F2A1B4C').textContent).toBe('BLM-3F2A1B4C')
  })

  it('TemporaryFailureScreen l’affiche', () => {
    rememberSupportReference('BLM-AAAABBBB')
    render(<TemporaryFailureScreen />)
    expect(screen.getByText('BLM-AAAABBBB').textContent).toBe('BLM-AAAABBBB')
  })

  it('SAIT DIRE NON — sans référence, l’écran ne montre AUCUNE ligne à la place', () => {
    // Le témoin de l'assertion précédente : si la note s'affichait toujours,
    // ce test verrait un tiret, un « — » ou un libellé orphelin.
    render(<CrashPage />)
    expect(screen.queryByText(/BLM-/)).toBeNull()
    expect(screen.queryByText(/Référence support/)).toBeNull()
  })

  it('SAIT DIRE NON — une référence mal formée n’atteint jamais le DOM', () => {
    rememberSupportReference('<img src=x onerror=alert(1)>')
    render(<CrashPage />)
    expect(screen.queryByText(/onerror/)).toBeNull()
  })
})

describe('#2442.5 — les quatre écrans d’erreur passent la note', () => {
  it('lit un corpus non vide — chacun des quatre fichiers existe et parle', () => {
    for (const file of ERROR_SCREENS) {
      const source = readFileSync(join(WEB_SRC, file), 'utf8')
      expect(source.length).toBeGreaterThan(200)
      expect(source).toContain('GenericProblemMessage')
    }
  })

  it('chacun passe `footer={<SupportReferenceNote />}`', () => {
    const missing = ERROR_SCREENS.filter(file => {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'))
      return !source.includes('footer={<SupportReferenceNote />}')
    })
    expect(missing).toEqual([])
  })

  it('SAIT DIRE NON — le détecteur reconnaît un écran qui ne la passe pas', () => {
    const withoutIt = stripComments(`
      export function Screen() {
        return <GenericProblemMessage title="x" principalMessage="y" firstSubText="z" />
      }
    `)
    expect(withoutIt.includes('footer={<SupportReferenceNote />}')).toBe(false)
    // …et ne se laisse pas convaincre par un commentaire qui la mentionne.
    const onlyInAComment = stripComments(`
      // footer={<SupportReferenceNote />}
      export function Screen() {
        return <GenericProblemMessage title="x" principalMessage="y" firstSubText="z" />
      }
    `)
    expect(onlyInAComment.includes('footer={<SupportReferenceNote />}')).toBe(false)
  })
})
