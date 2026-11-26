import ExcelJS from 'exceljs'
import { NotFoundException } from '@nestjs/common'
import { ContextPackController } from './context-pack.controller'
import { ContextPackOriginalsService } from './context-pack-originals.service'
import { readContextPackHeaders } from './context-pack-headers'

// import-contexte Je.2 — cinq fichiers témoins, calqués sur les en-têtes du pack réel de Julien (exFabrica).
async function xlsxB64(sheets: Record<string, string[][]>): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name)
    for (const row of rows) sheet.addRow(row)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
}

const csvB64 = (text: string) => Buffer.from(text, 'utf-8').toString('base64')

function controller(resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })) {
  const workspaceContext = { resolveActiveWorkspace }
  return {
    resolveActiveWorkspace,
    ctrl: new ContextPackController(
      workspaceContext as never,
      { list: jest.fn(), record: jest.fn() } as never,
      {} as never,
    ),
  }
}

const user = { userId: 'user-1' } as never

describe('POST /import/context-pack/classify — le routeur du pack de contexte (Je.2)', () => {
  it('tiering « Entreprise ; Tier ; Secteur » (csv, point-virgule) → comptes, colonnes citées', async () => {
    const { ctrl, resolveActiveWorkspace } = controller()
    const result = await ctrl.classify(user, {
      fileName: 'Tiering comptes.csv',
      headB64: csvB64('Entreprise;Tier;Secteur\nAirbus;A;Aéronautique\n'),
    })
    expect(result).toMatchObject({ destination: 'accounts', rule: 'headers', matchedHeaders: ['Entreprise', 'Tier'] })
    // L'espace de l'APPELANT est résolu — aucun appel sans membre authentifié.
    expect(resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
  })

  it('postes « Intitulé de poste ; Niveau décideur » (xlsx, un onglet) → postes cibles', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      Postes: [
        ['Intitulé de poste', 'Niveau décideur'],
        ['DSI', '1'],
      ],
    })
    const result = await ctrl.classify(user, { fileName: 'Postes cibles.xlsx', headB64 })
    expect(result).toMatchObject({
      destination: 'target_personas',
      matchedHeaders: ['Intitulé de poste', 'Niveau décideur'],
      sheetCount: 1,
    })
  })

  it('go/no-go « Critère ; Poids ; Seuil » (xlsx) → grille de qualification', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      Grille: [
        ['Critère', 'Poids', 'Seuil'],
        ['Budget', '3', '2'],
      ],
    })
    const result = await ctrl.classify(user, { fileName: 'Go-no-go.xlsx', headB64 })
    expect(result).toMatchObject({ destination: 'qualification_grid', matchedHeaders: ['Critère', 'Poids', 'Seuil'] })
  })

  it('campagnes « Étape ; Objet ; Script » (csv) → séquences', async () => {
    const { ctrl } = controller()
    const result = await ctrl.classify(user, {
      fileName: 'Campagnes.csv',
      headB64: csvB64('Étape,Objet,Script\n1,Bonjour,Salut {prenom}\n'),
    })
    expect(result).toMatchObject({ destination: 'sequences', matchedHeaders: ['Étape', 'Objet', 'Script'] })
  })

  it('un .docx → connaissances par son extension, sans rien lire', async () => {
    const { ctrl } = controller()
    const result = await ctrl.classify(user, { fileName: 'Offre exFabrica.docx' })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'extension', allowedDestinations: ['knowledge'] })
  })

  it('un classeur à trois onglets sans onglet reconnu → connaissances, et le nombre d’onglets est rendu', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      Notes: [['Titre', 'Texte']],
      Divers: [['Machin', 'Truc']],
      Autre: [['Foo', 'Bar']],
    })
    const result = await ctrl.classify(user, { fileName: 'Pack.xlsx', headB64 })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'multi_sheet', sheetCount: 3, sheet: null })
  })

  // #4426.4 — forme du tiering réel (synthétique) : « Synthèse » libre, « Tiering 2026-2027 », « Supprimées ».
  it('#4426.4 — tiering multi-onglets → comptes, onglet « Tiering 2026-2027 » retenu, jamais « Supprimées »', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      Synthèse: [['Bilan du tiering 2026'], ['Texte libre']],
      'Tiering 2026-2027': [
        [
          'Nom de la société',
          'domain',
          'linkedinUrl',
          'Adresse du siège social',
          'Secteur d’activité',
          'Chiffre d’affaires',
          'Tiering (A, B, C)',
          'Raison du tiering',
        ],
        ['Acme', 'acme.test', '', '1 rue X', 'Industrie', '10', 'A', 'Gros budget'],
      ],
      Supprimées: [
        ['Motif de suppression', 'Nom de la société', 'Raison du tiering', 'Tiering (A, B, C)'],
        ['Doublon', 'Zorg', '', 'C'],
      ],
    })
    const result = await ctrl.classify(user, { fileName: 'Tiering.xlsx', headB64 })
    expect(result).toMatchObject({
      destination: 'accounts',
      rule: 'headers',
      sheet: 'Tiering 2026-2027',
      sheetCount: 3,
      otherSheets: [],
    })
    expect(result.matchedHeaders).toEqual(['Nom de la société', 'Tiering (A, B, C)', 'Raison du tiering'])
  })

  it('#4426.4 — plusieurs onglets reconnus : comptes > séquences > postes > grille, les autres sont listés', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      Grille: [['Critère', 'Poids']],
      Postes: [['Intitulé de poste', 'Niveau décideur']],
      Comptes: [['Entreprise', 'Tier']],
    })
    const result = await ctrl.classify(user, { fileName: 'Pack.xlsx', headB64 })
    expect(result).toMatchObject({ destination: 'accounts', sheet: 'Comptes' })
    expect(result.otherSheets).toEqual([
      { sheet: 'Postes', destination: 'target_personas' },
      { sheet: 'Grille', destination: 'qualification_grid' },
    ])
  })

  it('#4426.7 — campagnes « Campagne ; Type / Étape ; Titre / Intitulé ; Contenu » → séquences (onglet contenu)', async () => {
    const { ctrl } = controller()
    const headB64 = await xlsxB64({
      listecampagnes: [['Campagne', 'Secteur']],
      contenu: [['Campagne', 'Type / Étape', 'Titre / Intitulé', 'Contenu']],
      stats: [['Campagne', 'Envoyés']],
    })
    const result = await ctrl.classify(user, { fileName: 'Campagnes.xlsx', headB64 })
    expect(result).toMatchObject({ destination: 'sequences', sheet: 'contenu' })
  })

  it('un tableau sans contenu envoyé (trop gros pour être classé) → connaissances « illisible »', async () => {
    const { ctrl } = controller()
    const result = await ctrl.classify(user, { fileName: 'Gros.xlsx' })
    expect(result).toMatchObject({ destination: 'knowledge', rule: 'unreadable' })
  })

  it('un format hors liste est refusé en 400, jamais classé', async () => {
    const { ctrl } = controller()
    await expect(ctrl.classify(user, { fileName: 'virus.exe' })).rejects.toThrow('Format non pris en charge.')
  })

  it('un xlsx abîmé ne plante pas : en-têtes illisibles', async () => {
    await expect(readContextPackHeaders('xlsx', Buffer.from('pas un zip'))).resolves.toEqual({
      headers: null,
      sheetCount: null,
    })
  })
})

// #4422.1 — l'historique des imports de l'assistant : écrit dans l'espace de l'APPELANT, jamais celui de la requête.
describe('/import/context-pack/history (#4422.1)', () => {
  const body = {
    fileName: 'Postes.xlsx',
    destination: 'target_personas',
    status: 'done',
    imported: 12,
    skipped: 0,
    scripts: null,
    message: null,
  }

  it('enregistre le bilan dans l’espace résolu de l’appelant', async () => {
    const record = jest.fn()
    const ctrl = new ContextPackController(
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { record, list: jest.fn() } as never,
      {} as never,
    )
    await ctrl.recordHistory(user, body)
    expect(record).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({ destination: 'target_personas', imported: 12 }),
    )
  })

  it('refuse les comptes (déjà un job universel) et un compteur négatif : 400, rien d’écrit', async () => {
    const record = jest.fn()
    const ctrl = new ContextPackController(
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      { record, list: jest.fn() } as never,
      {} as never,
    )
    await expect(ctrl.recordHistory(user, { ...body, destination: 'accounts' })).rejects.toThrow()
    await expect(ctrl.recordHistory(user, { ...body, skipped: -1 })).rejects.toThrow()
    expect(record).not.toHaveBeenCalled()
  })

  it('la lecture rend l’historique de l’espace de l’appelant', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'h1' }])
    const ctrl = new ContextPackController(
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9' }) } as never,
      { record: jest.fn(), list } as never,
      {} as never,
    )
    await expect(ctrl.listHistory(user)).resolves.toEqual([{ id: 'h1' }])
    expect(list).toHaveBeenCalledWith('ws-9')
  })
})

// #4573 — l'aperçu de l'original : l'espace vient de la session, jamais de la requête ; deux tests de REFUS.
describe('GET /import/context-pack/history/:id/original-url (#4573)', () => {
  const WS_A = '11111111-1111-4111-8111-111111111111'
  const WS_B = '99999999-9999-4999-8999-999999999999'
  const IMPORT_B = '33333333-3333-4333-8333-333333333333'
  const rowB = {
    id: IMPORT_B,
    workspace_id: WS_B,
    file_name: 'Secret B.pdf',
    original_status: 'kept',
    original_storage_path: `${WS_B}/context-pack/${IMPORT_B}/Secret_B.pdf`,
    original_mime_type: 'application/pdf',
  }

  function wired() {
    // Le vrai service, sur un dépôt qui APPLIQUE le `where` : seul le seau est un double.
    const repo = {
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Object.entries(where).every(([k, v]) => (rowB as Record<string, unknown>)[k] === v) ? rowB : null,
      ),
    }
    const storage = { signedUrl: jest.fn(async () => 'https://store.test/signed') }
    const originals = new ContextPackOriginalsService(repo as never, storage as never)
    const ctrl = new ContextPackController(
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS_A }) } as never,
      { record: jest.fn(), list: jest.fn() } as never,
      originals,
    )
    return { ctrl, storage, repo }
  }

  it('REFUS (a) — l’API refuse l’URL signée d’un import d’un AUTRE espace (404, rien signé)', async () => {
    const { ctrl, storage } = wired()
    await expect(ctrl.originalUrl(user, IMPORT_B)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.signedUrl).not.toHaveBeenCalled()
  })

  it('REFUS (b) — l’id de la requête ne choisit jamais l’espace : la lecture est bornée à celui de la session', async () => {
    const { ctrl, repo, storage } = wired()
    await ctrl.originalUrl(user, IMPORT_B).catch(() => undefined)
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: IMPORT_B, workspace_id: WS_A } })
    expect(storage.signedUrl).not.toHaveBeenCalled()
  })
})
