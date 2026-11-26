/**
 * #1944.21 — PERF : PAS DE BLOCAGE DU FIL SUR UN LOGO OU UNE SOURCE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le risque nommé par #1944.21 est un `<img>` (ou un fond CSS distant) qui
 * charge en réseau AVANT le texte de la réponse, ce qui gèlerait le fil sur
 * une connexion lente. Mesuré par balayage le 24/09/2026 (lot L4) : AUCUN
 * `<img>`, `background-image`/`backgroundImage` distant, ni `<Image>` dans
 * TOUT `features/chat` — les « logos/sources » d'une réponse (`ReplyCard`,
 * `ConnectedToolsStrip`) sont rendus en TEXTE (nom de domaine/d'outil), jamais
 * en image. Structurellement, rien ne peut y bloquer le rendu du texte sur un
 * chargement d'image, puisqu'aucune image ne s'y charge.
 *
 * Cette garde FIGE ce fait : si une image apparaît un jour dans ce dossier
 * (favicon de source, logo d'outil connecté), elle doit porter `loading="lazy"`
 * — sinon elle réintroduit exactement le risque que #1944.21 décrit. Elle ne
 * prouve PAS l'inverse : un chargement RÉSEAU LENT plus large (streaming,
 * police, police web) reste hors de son champ — voir #1944.23, qui reste
 * `retenu`, preuve ÉCRAN requise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CHAT_SRC = join(__dirname)

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(tsx|ts)$/.test(entry) || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

const FILES = sourceFiles(CHAT_SRC)
const IMG_TAG = /<(?:img|Image)[\s>][^>]*>?/g
const CSS_BACKGROUND_IMAGE = /background(?:Image)?\s*[:=].*url\(/i

/** Une balise image ne bloque pas le fil si elle porte `loading="lazy"` (#1944.21). */
function blockingImages(code: string): string[] {
  const tags = code.match(IMG_TAG) ?? []
  const eager = tags.filter(tag => !/loading=["{']*lazy/.test(tag))
  return CSS_BACKGROUND_IMAGE.test(code) ? [...eager, 'background-image'] : eager
}

describe('#1944.21 — aucune image ne peut bloquer le rendu du fil de chat', () => {
  it('lit bien des fichiers réels (garde-fou du garde-fou)', () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('sait dire NON : une image sans loading="lazy", ou un fond CSS distant, est refusée', () => {
    expect(blockingImages('<img src={x} alt="" />')).toHaveLength(1)
    expect(blockingImages('<Image src={x} alt="" />')).toHaveLength(1)
    expect(blockingImages("style={{ backgroundImage: 'url(x)' }}")).toHaveLength(1)
    expect(blockingImages('<img\n  src={x}\n  alt=""\n  loading="lazy"\n/>')).toEqual([])
  })

  it('aucun `<img>`/`<Image>` sans loading="lazy" ni fond CSS distant dans `features/chat`', () => {
    const offenders = FILES.filter(file => {
      const code = readFileSync(file, 'utf8')
      return blockingImages(code).length > 0
    }).map(file => file.replace(CHAT_SRC, 'features/chat'))
    expect(offenders, 'une image apparue ici doit porter loading="lazy" (#1944.21)').toEqual([])
  })
})
