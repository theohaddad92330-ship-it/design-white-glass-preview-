import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1985 — « supprime cette ligne laura, elle est inutile et prend de la place
 * pour rien ».
 *
 * Le retour pointait `PageHeader.tsx:165` — le `<header>` LUI-MÊME, pas son
 * contenu. Or ce fichier n'appartient pas à `/chat` : il est rendu par
 * `CustomerPageContent`, que **17 fichiers de route** et **55 fichiers d'écran**
 * traversent (mesuré le 14/09/2026). Le retirer là où le doigt s'est posé aurait
 * décapité tout le produit à partir d'un retour qui visait UN écran.
 *
 * Ce qui était vrai, c'est la redite : sur `/chat`, cette barre écrivait
 * « Laura » 48 px au-dessus de l'entête du fil, qui écrit « Laura ». Loi 4 du
 * tome 7. Le correctif borné est donc côté APPELANT — `/chat` saute l'entête
 * partagée (`skipHeader`) et dessine la sienne — et il a été livré par #1906.7
 * le 13/09/2026 à 10 h 24, huit minutes après le clic de Louis sur un build de
 * 10 h 04. Cette garde existe pour que ni la redite ni le retrait global ne
 * reviennent : elle tient les DEUX côtés de la décision.
 *
 * ⚠️ Elle lit des sources sans les modifier. Les prédicats sont appliqués deux
 * fois — au source réel, et à une reconstitution du code d'avant, qui doit être
 * refusée. Une garde qui ne sait pas dire non ne garde rien.
 */
const WEB_SRC = join(__dirname, '..', '..')
const CHAT_ROUTE = join(WEB_SRC, 'routes', 'chat', 'index.tsx')

/** Ce qui ferait réapparaître la ligne « Laura » au-dessus du fil. */
function duplicatedChrome(chatRoute: string): string[] {
  const offences: string[] = []
  if (!/skipHeader=\{/.test(chatRoute)) offences.push('/chat rend de nouveau l’entête de page partagée')
  if (!/contentClassName=\{/.test(chatRoute)) offences.push('/chat ne demande plus la pleine page')
  return offences
}

function routesReachingTheSharedHeader(): { total: string[]; skipping: string[] } {
  const dir = join(WEB_SRC, 'routes')
  const total: string[] = []
  const skipping: string[] = []
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.tsx')) {
        const source = readFileSync(full, 'utf8')
        if (!source.includes('CustomerPage')) continue
        total.push(full)
        if (/skipHeader=\{/.test(source)) skipping.push(full)
      }
    }
  }
  walk(dir)
  return { total, skipping }
}

describe('#1985 — la ligne « Laura » part de /chat, et de /chat SEULEMENT', () => {
  it('/chat dessine sa propre chrome et saute l’entête partagée', () => {
    expect(duplicatedChrome(readFileSync(CHAT_ROUTE, 'utf8'))).toEqual([])
  })

  it('sait dire NON : la coque d’avant, qui répétait « Laura », est refusée', () => {
    expect(duplicatedChrome("<CustomerPage pageTitle={t('chat.pageTitle')}>")).toHaveLength(2)
  })

  it('l’entête partagée reste rendue partout ailleurs — le retrait n’a pas débordé', () => {
    const { total, skipping } = routesReachingTheSharedHeader()
    // La garde LIT quelque chose : sans corpus, tout ce qui suit serait vide et vert.
    expect(total.length).toBeGreaterThanOrEqual(15)
    // Deux écrans pleine page seulement : le copilote et la recherche.
    expect(skipping.length).toBeLessThanOrEqual(3)
    expect(total.length - skipping.length).toBeGreaterThanOrEqual(12)
    const content = readFileSync(join(WEB_SRC, 'components', 'page', 'CustomerPageContent.tsx'), 'utf8')
    expect(content).toContain('<PageHeader')
  })
})
