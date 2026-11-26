import { accountNotesSource, NOTE_BODY_MAX_CHARS } from './account-notes'
import { formatInternalHistory } from './zero-layer-format'

/**
 * #1082, #1083, #1088 — « il faudrait que Bellum puisse capitaliser pour
 * enrichir. Peut-être est-ce déjà le cas ? Je ne sais pas en tout cas il
 * faudrait le faire sinon ;) ». Ce n'était pas le cas : les notes d'un compte
 * étaient stockées, affichées, et n'entraient dans AUCUN prompt.
 *
 * Elles rejoignent la couche zéro, qui est leur maison : l'annexe p8 énumère
 * « l'ATS, le Drive, les e-mails, les NOTES, les CV déjà envoyés ». Elles en
 * héritent les trois règles — rien à dire quand il n'y a rien, une source qui
 * tombe ne fait pas tomber le run, et ON CITE SANS INTERPRÉTER.
 */
describe('accountNotesSource', () => {
  const note = (body: string, over: Partial<{ createdAt: string; author: string | null }> = {}) => ({
    body,
    createdAt: over.createdAt ?? '2026-08-20T10:00:00.000Z',
    author: over.author === undefined ? 'Marie Durand' : over.author,
  })

  // #3895 — une note écrite sur une AUTRE entité du groupe qui dit valoir ici : citée avec son origine.
  it('nomme l’entité du groupe d’où vient une note rattachée, jamais comme une note d’ici', () => {
    const source = accountNotesSource([
      { ...note('Grille achats : trois devis.'), fromAccount: 'Sanofi' },
      note('Note locale.'),
    ])
    expect(source?.findings[0]?.detail).toBe('Marie Durand · note de Sanofi (même groupe)')
    expect(source?.findings[1]?.detail).toBe('Marie Durand')
  })

  it('une note rattachée sans auteur connu garde son origine sans inventer de nom', () => {
    const source = accountNotesSource([{ ...note('x', { author: null }), fromAccount: 'Sanofi' }])
    expect(source?.findings[0]?.detail).toBe('note de Sanofi (même groupe)')
  })

  it('rend null quand il n’y a aucune note', () => {
    // Pas « aucune note trouvée » : une absence injectée dans un prompt se lit
    // comme un fait établi sur le compte.
    expect(accountNotesSource([])).toBeNull()
  })

  it('cite la note telle quelle, avec son auteur et sa date', () => {
    const source = accountNotesSource([note('Le budget est gelé jusqu’en mars.')])
    expect(source?.findings[0]).toEqual({
      title: 'Le budget est gelé jusqu’en mars.',
      detail: 'Marie Durand',
      date: '2026-08-20T10:00:00.000Z',
    })
  })

  it('accepte une note sans auteur connu sans inventer de nom', () => {
    expect(accountNotesSource([note('Vu au salon.', { author: null })])?.findings[0]?.detail).toBeNull()
  })

  it('écarte une note vide', () => {
    expect(accountNotesSource([note('   ')])).toBeNull()
  })

  it('laisse à une note plus de place qu’à un nom de fichier', () => {
    // Une note est de la PROSE : la tronquer à 160 caractères comme un titre de
    // document couperait la moitié de ce que le commercial a pris le temps
    // d’écrire — c’est-à-dire précisément ce qu’on veut capitaliser.
    expect(accountNotesSource([note('x')])?.titleMaxChars).toBe(NOTE_BODY_MAX_CHARS)
    expect(NOTE_BODY_MAX_CHARS).toBeGreaterThan(160)
  })

  it('produit un bloc citable par le formateur de la couche zéro', () => {
    const block = formatInternalHistory([accountNotesSource([note('Le DSI part en avril.')])!])
    expect(block).toContain('Le DSI part en avril.')
    expect(block).toContain('Marie Durand')
    expect(block).toContain('2026-08-20')
  })

  it('respecte le budget de titre de la source', () => {
    const long = 'a'.repeat(NOTE_BODY_MAX_CHARS + 50)
    const block = formatInternalHistory([accountNotesSource([note(long)])!]) ?? ''
    const cited = block.split('\n').find(line => line.startsWith('- ')) ?? ''
    expect(cited.length).toBeLessThan(NOTE_BODY_MAX_CHARS + 60)
    expect(cited).toContain('…')
  })
})
