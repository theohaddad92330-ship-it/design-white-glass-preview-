import AdmZip from 'adm-zip'
import { BadRequestException } from '@nestjs/common'
import { RAG_ZIP_MAX_DECOMPRESSED_BYTES, RAG_ZIP_MAX_ENTRIES } from '@bellum/contracts'
import { RagZipIngestService } from './rag-zip-ingest.service'
import type { IaClient, IaEnvelope } from '../ia/ia.client'

const USER = 'u0000000-0000-4000-8000-000000000001'
const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

function zipOf(files: { name: string; content: string }[]): string {
  const zip = new AdmZip()
  for (const file of files) zip.addFile(file.name, Buffer.from(file.content, 'utf8'))
  return zip.toBuffer().toString('base64')
}

function makeService(ragIngestImpl?: (input: { filename?: string }) => Promise<IaEnvelope>) {
  const ragIngest = jest.fn(
    ragIngestImpl ??
      (async (input: { filename?: string }) =>
        ({ success: true, data: { id: `doc-${input.filename}`, partial: false } }) satisfies IaEnvelope),
  )
  const ia = { ragIngest } as unknown as jest.Mocked<Pick<IaClient, 'ragIngest'>>
  return { service: new RagZipIngestService(ia as unknown as IaClient), ia, ragIngest }
}

/**
 * #2667.1 — décision Louis (QCM 21/09) : le .zip est déplié CÔTÉ SERVEUR, ses
 * entrées lisibles deviennent des pièces jointes. Chaque entrée traverse le
 * MÊME chemin qu'un dépôt unitaire (`IaClient.ragIngest`, `RagController.ingest`) —
 * ce service ne fait que réunir les octets et poser les plafonds AVANT.
 */
describe('RagZipIngestService.ingestZip', () => {
  it('ingère chaque entrée lisible et rend son id', async () => {
    const { service } = makeService()
    const fileB64 = zipOf([
      { name: 'notes.txt', content: 'bonjour' },
      { name: 'brief.md', content: '# Brief' },
    ])
    const report = await service.ingestZip(USER, WORKSPACE, fileB64)

    expect(report.total).toBe(2)
    expect(report.outcomes).toEqual(
      expect.arrayContaining([
        { status: 'ingested', file: 'notes.txt', id: 'doc-notes.txt', partial: false },
        { status: 'ingested', file: 'brief.md', id: 'doc-brief.md', partial: false },
      ]),
    )
  })

  it('transmet userId/workspaceId résolus côté serveur — jamais depuis le corps', async () => {
    const { service, ragIngest } = makeService()
    await service.ingestZip(USER, WORKSPACE, zipOf([{ name: 'notes.txt', content: 'x' }]))

    expect(ragIngest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, workspaceId: WORKSPACE, filename: 'notes.txt' }),
    )
  })

  it('ignore les répertoires et le bruit système (__MACOSX, .DS_Store)', async () => {
    const zip = new AdmZip()
    zip.addFile('dossier/', Buffer.alloc(0))
    zip.addFile('dossier/notes.txt', Buffer.from('x'))
    zip.addFile('__MACOSX/notes.txt', Buffer.from('x'))
    zip.addFile('.DS_Store', Buffer.from('x'))
    const { service } = makeService()
    const report = await service.ingestZip(USER, WORKSPACE, zip.toBuffer().toString('base64'))

    expect(report.total).toBe(1)
    expect(report.outcomes[0]?.file).toBe('dossier/notes.txt')
  })

  it('une entrée illisible N’ARRÊTE PAS le lot — son échec porte SA raison', async () => {
    const { service } = makeService(async input => {
      if (input.filename === 'corrompu.pdf') throw new BadRequestException('PDF illisible (corrompu).')
      return { success: true, data: { id: `doc-${input.filename}`, partial: false } }
    })
    const fileB64 = zipOf([
      { name: 'corrompu.pdf', content: 'pas un vrai pdf' },
      { name: 'notes.txt', content: 'x' },
    ])
    const report = await service.ingestZip(USER, WORKSPACE, fileB64)

    expect(report.total).toBe(2)
    expect(report.outcomes).toContainEqual({
      status: 'failed',
      file: 'corrompu.pdf',
      reason: 'PDF illisible (corrompu).',
    })
    expect(report.outcomes).toContainEqual({
      status: 'ingested',
      file: 'notes.txt',
      id: 'doc-notes.txt',
      partial: false,
    })
  })

  // #2431.7 / #2431.13 — deux entrées au contenu IDENTIQUE (même empreinte
  // sha256) : la seconde n'est pas ingérée une deuxième fois, et le rapport la
  // NOMME comme doublon de la première — jamais écartée en silence.
  it('une entrée identique à une autre est nommée DOUBLON, pas ingérée deux fois', async () => {
    const { service, ragIngest } = makeService()
    const fileB64 = zipOf([
      { name: 'cv.txt', content: 'Jeanne Dupont, architecte' },
      { name: 'copie/cv (1).txt', content: 'Jeanne Dupont, architecte' },
      { name: 'notes.txt', content: 'autre chose' },
    ])
    const report = await service.ingestZip(USER, WORKSPACE, fileB64)

    expect(ragIngest).toHaveBeenCalledTimes(2)
    expect(report.total).toBe(3)
    // L'ordre des entrées est celui de l'archive : l'une ou l'autre copie est
    // la « première », l'autre est nommée doublon d'ELLE.
    const duplicates = report.outcomes.filter(outcome => outcome.status === 'duplicate')
    expect(duplicates).toHaveLength(1)
    const pair = duplicates[0]?.status === 'duplicate' ? [duplicates[0].file, duplicates[0].duplicateOf].sort() : []
    expect(pair).toEqual(['copie/cv (1).txt', 'cv.txt'])
  })

  // #2431.7 (reste) — dédoublonnage CONTRE LA BASE EXISTANTE, système différent
  // du doublon intra-archive ci-dessus : le service IA (`rag_service.ingest`,
  // via `content_hash`) reconnaît un contenu déjà présent AVANT cette archive,
  // et le rapport le NOMME distinctement (`duplicate_existing` ≠ `duplicate`).
  it('une entrée identique à un document DÉJÀ EN BASE est nommée duplicate_existing', async () => {
    const { service } = makeService(async input =>
      input.filename === 'cv.txt'
        ? { success: true, data: { id: 'doc-deja-en-base', duplicate: true } }
        : { success: true, data: { id: `doc-${input.filename}`, partial: false } },
    )
    const fileB64 = zipOf([
      { name: 'cv.txt', content: 'Jeanne Dupont, architecte' },
      { name: 'notes.txt', content: 'autre chose' },
    ])
    const report = await service.ingestZip(USER, WORKSPACE, fileB64)

    expect(report.outcomes).toEqual(
      expect.arrayContaining([
        { status: 'duplicate_existing', file: 'cv.txt', existingId: 'doc-deja-en-base' },
        { status: 'ingested', file: 'notes.txt', id: 'doc-notes.txt', partial: false },
      ]),
    )
  })

  it('sait dire NON : deux contenus différents ne sont jamais des doublons', async () => {
    const { service } = makeService()
    const report = await service.ingestZip(
      USER,
      WORKSPACE,
      zipOf([
        { name: 'a.txt', content: 'un' },
        { name: 'b.txt', content: 'deux' },
      ]),
    )
    expect(report.outcomes.every(outcome => outcome.status === 'ingested')).toBe(true)
  })

  it('archive illisible/corrompue : refusée, nommément', async () => {
    const { service } = makeService()
    await expect(service.ingestZip(USER, WORKSPACE, Buffer.from('pas un zip').toString('base64'))).rejects.toThrow(
      BadRequestException,
    )
  })

  // ── Les plafonds — chacun doit faire ROUGIR le test qui le nomme ─────────

  it('refuse EN BLOC une archive avec plus de RAG_ZIP_MAX_ENTRIES entrées, sans ingérer une seule', async () => {
    const { service, ragIngest } = makeService()
    const files = Array.from({ length: RAG_ZIP_MAX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}.txt`, content: 'x' }))
    await expect(service.ingestZip(USER, WORKSPACE, zipOf(files))).rejects.toThrow(
      new RegExp(String(RAG_ZIP_MAX_ENTRIES + 1)),
    )
    expect(ragIngest).not.toHaveBeenCalled()
  })

  it('refuse EN BLOC une archive dont le cumul décompressé dépasse le plafond, sans ingérer une seule', async () => {
    const { service, ragIngest } = makeService()
    const big = 'x'.repeat(RAG_ZIP_MAX_DECOMPRESSED_BYTES + 1)
    await expect(service.ingestZip(USER, WORKSPACE, zipOf([{ name: 'gros.txt', content: big }]))).rejects.toThrow(
      BadRequestException,
    )
    expect(ragIngest).not.toHaveBeenCalled()
  })

  it('refuse EN BLOC une entrée dont le chemin sort de l’archive (zip slip)', async () => {
    const { service, ragIngest } = makeService()
    const zip = new AdmZip()
    // adm-zip normalise certains `..` à l'ajout : on pose le nom directement
    // sur l'entrée pour reproduire fidèlement une archive fabriquée à la main.
    zip.addFile('inoffensif.txt', Buffer.from('x'))
    const entry = zip.getEntry('inoffensif.txt')
    if (entry) entry.entryName = '../../etc/passwd'
    await expect(service.ingestZip(USER, WORKSPACE, zip.toBuffer().toString('base64'))).rejects.toThrow(/passwd/)
    expect(ragIngest).not.toHaveBeenCalled()
  })

  it('refuse EN BLOC une archive imbriquée', async () => {
    const { service, ragIngest } = makeService()
    const inner = zipOf([{ name: 'x.txt', content: 'x' }])
    const zip = new AdmZip()
    zip.addFile('lot.zip', Buffer.from(inner, 'base64'))
    await expect(service.ingestZip(USER, WORKSPACE, zip.toBuffer().toString('base64'))).rejects.toThrow(/lot\.zip/)
    expect(ragIngest).not.toHaveBeenCalled()
  })

  // #2431.8 — un exécutable ou un document à macros refuse l'archive ENTIÈRE,
  // avant toute ingestion : même la pièce saine voisine n'est pas indexée.
  it('refuse EN BLOC une archive dont une entrée est chiffrée (mot de passe)', async () => {
    const { service, ragIngest } = makeService()
    const zip = new AdmZip()
    zip.addFile('notes.txt', Buffer.from('x'))
    zip.addFile('paie.pdf', Buffer.from('secret'))
    const locked = zip.getEntry('paie.pdf')
    if (locked) locked.header.flags = locked.header.flags | 1
    await expect(service.ingestZip(USER, WORKSPACE, zip.toBuffer().toString('base64'))).rejects.toThrow(
      /paie\.pdf.*mot de passe/,
    )
    expect(ragIngest).not.toHaveBeenCalled()
  })

  it.each(['outils/setup.exe', 'budget.xlsm'])('refuse EN BLOC une archive qui porte %s', async name => {
    const { service, ragIngest } = makeService()
    const b64 = zipOf([
      { name: 'cv.txt', content: 'Jeanne Dupont' },
      { name, content: 'MZ' },
    ])
    await expect(service.ingestZip(USER, WORKSPACE, b64)).rejects.toThrow(/exécutable ou un document à macros/)
    expect(ragIngest).not.toHaveBeenCalled()
  })

  it('#3623.11 — relaie la progression réelle (traitées / total) au worker', async () => {
    const { service } = makeService()
    const seen: Array<{ processed: number; total: number }> = []
    await service.ingestZip(
      USER,
      WORKSPACE,
      zipOf([
        { name: 'a.txt', content: 'a' },
        { name: 'b.txt', content: 'b' },
      ]),
      {},
      progress => {
        seen.push(progress)
      },
    )
    expect(seen).toEqual([
      { processed: 0, total: 2 },
      { processed: 1, total: 2 },
    ])
  })
})
