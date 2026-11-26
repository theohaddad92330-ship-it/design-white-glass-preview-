import { ConflictException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { importContentFingerprint, type DryRunReport } from '@bellum/contracts'
import type { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { ImportService, type ImportRowWriter, type ImportWriteOutcome } from './import.service'

/**
 * La reprise d'un import interrompu — angle mort n°6 du tome 8 §33.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT AVANT CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `writeSession` appelait `markApplied` À LA FIN. Une exception à la ligne
 * 4 000 sur 17 000 remontait au contrôleur en 500, et :
 *  · les 4 000 lignes restaient en base sans qu'aucune colonne le dise ;
 *  · l'instantané, construit dans une variable LOCALE du writer, était perdu
 *    avec la pile — donc l'annulation devenait impossible ;
 *  · `created_count` gardait son défaut `0`, et l'écran affichait « 0 créé »
 *    pour un import qui en avait créé 4 000 ;
 *  · relancer redoublonnait tout ce qui n'a pas de clé (un contact sans
 *    adresse : `writeContacts` ne dédoublonne que par e-mail).
 *
 * Trois exigences, dans l'ordre du chantier : **savoir** où ça s'est arrêté,
 * **relancer sans doublonner**, **ne rien perdre de ce qui a été écrit**.
 */

const WS = 'ws-1'
const CONTENT = ['Societe;Siren', ...Array.from({ length: 10 }, (_, i) => `Acme ${i};10000000${i}`)].join('\n')
const FINGERPRINT = importContentFingerprint(CONTENT)

type Saved = Partial<ImportSessionEntity>

function makeService(session: Partial<ImportSessionEntity>) {
  const row: Partial<ImportSessionEntity> = {
    id: 's-1',
    workspace_id: WS,
    source: 'accounts_only',
    object_type: 'account',
    mapping: { columns: { Societe: 'company', Siren: 'siren' }, ignored: [], disabledRules: [] },
    created_count: 0,
    updated_count: 0,
    snapshot: null,
    processed_rows: null,
    total_rows: null,
    failed_at_row: null,
    resume_outcome: null,
    content_fingerprint: null,
    ...session,
  }
  const saved: Saved[] = []
  const sessions = {
    findOne: jest.fn(async () => row),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Saved) => {
      // La sauvegarde MUTE la ligne, comme TypeORM : sans cela, une reprise
      // relirait l'état d'avant le point de contrôle et le test passerait au
      // vert sur un chemin qui n'existe pas.
      Object.assign(row, value)
      saved.push({ ...value })
      return row
    }),
    update: jest.fn(async () => undefined),
    find: jest.fn(async () => []),
  } as unknown as Repository<ImportSessionEntity>
  return { service: new ImportService(sessions), sessions, saved, row }
}

/** Un writer qui s'arrête à la ligne demandée, comme une base qui lâche. */
function writerStoppingAt(stopRow: number | null, error: unknown): ImportRowWriter {
  return {
    async writeAccounts(input) {
      return runRows(input, stopRow, error)
    },
    async writeContacts(input) {
      return runRows(input, stopRow, error)
    },
    async writeProjects(input) {
      return runRows(input, stopRow, error)
    },
    async writeNeeds(input) {
      return runRows(input, stopRow, error)
    },
    async writeTalents(input) {
      return runRows(input, stopRow, error)
    },
    async writeMissions(input) {
      return runRows(input, stopRow, error)
    },
  }
}

async function runRows(
  input: {
    rows: readonly Record<string, unknown>[]
    startAt: number
    checkpoint?: (progress: ImportWriteOutcome) => Promise<void>
  },
  stopRow: number | null,
  error: unknown,
): Promise<ImportWriteOutcome> {
  const { dispatchFailureOutcome } = await import('@bellum/contracts')
  let created = 0
  let processedRows = input.startAt
  const snapshot: { id: string; created: boolean; fields: Record<string, unknown> }[] = []
  for (let index = input.startAt; index < input.rows.length; index += 1) {
    if (stopRow !== null && index === stopRow) {
      return {
        created,
        updated: 0,
        skippedUnknownCompany: 0,
        snapshot,
        processedRows,
        failure: {
          row: index,
          outcome: dispatchFailureOutcome(error),
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
    snapshot.push({ id: `a-${index}`, created: true, fields: {} })
    created += 1
    processedRows = index + 1
    // Un point de contrôle par ligne : le test veut voir que le service PERSISTE
    // pendant l'écriture, pas seulement à la fin.
    await input.checkpoint?.({ created, updated: 0, skippedUnknownCompany: 0, snapshot, processedRows, failure: null })
  }
  return { created, updated: 0, skippedUnknownCompany: 0, snapshot, processedRows, failure: null }
}

/** Une connexion jamais établie : rien n'est parti, la ligne est REJOUABLE. */
const NEVER_LEFT = Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
/** Une requête partie sans réponse : on NE SAIT PAS si la ligne a été écrite. */
const IN_FLIGHT = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })

describe('1. SAVOIR où l’import s’est arrêté, et pourquoi', () => {
  it('enregistre le point de reprise au lieu de perdre la session', async () => {
    const { service, row } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    const outcome = await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, NEVER_LEFT))

    expect(outcome.stopped).toMatchObject({ atRow: 4, totalRows: 10, outcome: 'failed' })
    expect(row.state).toBe('partial')
    expect(row.processed_rows).toBe(4)
    expect(row.total_rows).toBe(10)
    expect(row.failed_at_row).toBe(4)
    expect(row.resume_outcome).toBe('failed')
  })

  it('garde les COMPTEURS de ce qui a été écrit — « 0 créé » serait un mensonge', async () => {
    const { service, row } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, NEVER_LEFT))
    expect(row.created_count).toBe(4)
  })

  it('garde l’INSTANTANÉ — sans lui l’annulation est impossible', async () => {
    // C'est le défaut le plus grave du chemin d'avant : la garde du scénario
    // « un import détruit trois ans de données CRM » était inatteignable dans
    // le cas exact pour lequel elle a été écrite.
    const { service, row } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, NEVER_LEFT))
    expect(row.snapshot).toHaveLength(4)
  })

  it('persiste PENDANT l’écriture, pas seulement à la fin', async () => {
    // Un point de reprise posé uniquement à la fin ne survit à rien : c'est
    // précisément la fin qui n'arrive pas.
    const { service, saved } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, NEVER_LEFT))
    const intermediate = saved.filter(entry => entry.processed_rows !== null && entry.processed_rows !== undefined)
    expect(intermediate.length).toBeGreaterThan(1)
  })
})

describe('2. RELANCER sans doublonner', () => {
  it('reprend APRÈS la dernière ligne durable, jamais depuis le début', async () => {
    // La seule clé de déduplication sûre : (session d'import + numéro de ligne).
    // Jamais une ressemblance de noms — on PROPOSE une fusion, on ne fusionne pas.
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'failed',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
      snapshot: Array.from({ length: 4 }, (_, i) => ({ id: `a-${i}`, created: true, fields: {} })),
    })
    const seen: number[] = []
    const writer: ImportRowWriter = {
      async writeAccounts(input) {
        seen.push(input.startAt)
        return runRows(input, null, NEVER_LEFT)
      },
      async writeContacts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeProjects(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeNeeds(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeTalents(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeMissions(input) {
        return runRows(input, null, NEVER_LEFT)
      },
    }
    const outcome = await service.writeSession('u-1', WS, 's-1', CONTENT, writer)
    expect(seen).toEqual([4])
    // 4 déjà créés + 6 repris = 10, et pas 14.
    expect(outcome.created).toBe(10)
    expect(outcome.resumedFromRow).toBe(4)
  })

  it('CUMULE l’instantané au lieu de le remplacer', async () => {
    // Le remplacer perdrait les 4 000 premiers objets pour l'annulation — le
    // motif « `raw_analysis` remplacé, pas fusionné » transposé à l'import.
    const { service, row } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      resume_outcome: 'failed',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
      snapshot: Array.from({ length: 4 }, (_, i) => ({ id: `a-${i}`, created: true, fields: {} })),
    })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, NEVER_LEFT))
    expect(row.snapshot).toHaveLength(10)
    expect(row.state).toBe('applied')
  })

  it('REFUSE de sauter des lignes d’un AUTRE fichier', async () => {
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      resume_outcome: 'failed',
      content_fingerprint: importContentFingerprint('un tout autre fichier'),
    })
    await expect(service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, NEVER_LEFT))).rejects.toThrow(
      /pas le même fichier/,
    )
  })

  it('REFUSE quand aucune empreinte n’a été enregistrée — « inconnu » n’est pas « le même »', async () => {
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      resume_outcome: 'failed',
      content_fingerprint: null,
    })
    await expect(service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, NEVER_LEFT))).rejects.toThrow(
      /ne peux pas prouver/,
    )
  })

  it('REFUSE quand on ignore combien de lignes ont été écrites', async () => {
    // « On ne sait pas » n'est pas « zéro ». Reprendre à 0 redoublonnerait.
    const { service } = makeService({
      state: 'partial',
      processed_rows: null,
      content_fingerprint: FINGERPRINT,
    })
    await expect(service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, NEVER_LEFT))).rejects.toThrow(
      /ne sais pas/,
    )
  })
})

describe('3. UN TIMEOUT N’EST PAS UN ÉCHEC — `unknown` ARRÊTE la reprise', () => {
  it('classe une requête partie sans réponse en `unknown`', async () => {
    const { service, row } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, IN_FLIGHT))
    expect(row.resume_outcome).toBe('unknown')
  })

  it('classe une connexion jamais établie en `failed` — `UND_ERR_CONNECT_TIMEOUT` n’est PAS un timeout', async () => {
    const { service, row } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT })
    await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(4, NEVER_LEFT))
    expect(row.resume_outcome).toBe('failed')
  })

  it('REFUSE la reprise automatique après un `unknown`, en NOMMANT la ligne', async () => {
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
    })
    await expect(service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, IN_FLIGHT))).rejects.toThrow(
      /ligne 5/,
    )
  })

  it('accepte la reprise quand un HUMAIN a tranché — « reprendre à cette ligne »', async () => {
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
    })
    const seen: number[] = []
    const writer: ImportRowWriter = {
      async writeAccounts(input) {
        seen.push(input.startAt)
        return runRows(input, null, NEVER_LEFT)
      },
      async writeContacts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeProjects(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeNeeds(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeTalents(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeMissions(input) {
        return runRows(input, null, NEVER_LEFT)
      },
    }
    await service.writeSession('u-1', WS, 's-1', CONTENT, writer, { resumeFrom: 4 })
    expect(seen).toEqual([4])
  })

  it('accepte « reprendre APRÈS cette ligne » — l’autre moitié du choix humain', async () => {
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
    })
    const seen: number[] = []
    const writer: ImportRowWriter = {
      async writeAccounts(input) {
        seen.push(input.startAt)
        return runRows(input, null, NEVER_LEFT)
      },
      async writeContacts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeProjects(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeNeeds(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeTalents(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeMissions(input) {
        return runRows(input, null, NEVER_LEFT)
      },
    }
    await service.writeSession('u-1', WS, 's-1', CONTENT, writer, { resumeFrom: 5 })
    expect(seen).toEqual([5])
  })

  it('REFUSE un point de reprise arbitraire — le choix humain a DEUX réponses, pas mille', async () => {
    // Accepter n'importe quel entier laisserait sauter 3 000 lignes par une
    // requête forgée, et personne ne s'en apercevrait.
    const { service } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
    })
    await expect(
      service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, IN_FLIGHT), { resumeFrom: 0 }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('5. La ligne ABANDONNÉE ne disparaît plus — `report.errors`', () => {
  // Avant ce correctif : une ligne partie sans réponse, que l'utilisateur
  // choisit de SAUTER plutôt que de rejouer, ne laissait AUCUNE trace une fois
  // l'import terminé — ni écrite, ni comptée en échec, ni comptée nulle part.
  const REPORT: DryRunReport = {
    rowsRead: 10,
    creations: 10,
    updates: 0,
    overwrittenFields: 0,
    duplicates: [],
    skipped: [],
    mappedColumns: ['Societe', 'Siren'],
    ignoredColumns: [],
    missingRequiredColumns: [],
    withoutLegalBasis: 0,
    truncated: false,
    errors: [],
    sensitiveColumns: [],
    possibleDuplicates: [],
  }

  it('range la ligne sautée dans `report.errors`, avec son numéro de ligne et sa raison', async () => {
    const { service, row } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
      error: 'socket hang up',
      report: REPORT,
    })
    const writer: ImportRowWriter = {
      async writeAccounts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeContacts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeProjects(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeNeeds(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeTalents(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeMissions(input) {
        return runRows(input, null, NEVER_LEFT)
      },
    }
    // « Sauter la ligne 5 » — resumeFrom = ligne incertaine (4) + 1.
    const outcome = await service.writeSession('u-1', WS, 's-1', CONTENT, writer, { resumeFrom: 5 })

    expect(outcome.report?.errors).toEqual([{ row: 5, message: 'socket hang up' }])
    // Retirée de `creations` : elle n'a pas été écrite, elle ne doit pas être
    // comptée comme si elle l'avait été — sinon elle compterait deux fois.
    expect(outcome.report?.creations).toBe(9)
    // LA PREUVE : la somme des seaux reste égale au nombre de lignes lues.
    const sum =
      (outcome.report?.creations ?? 0) +
      (outcome.report?.updates ?? 0) +
      (outcome.report?.skipped.length ?? 0) +
      (outcome.report?.errors.length ?? 0)
    expect(sum).toBe(outcome.report?.rowsRead)
    // Et ça SURVIT à la fin de l'import : `markApplied` ne réinitialise pas
    // `report`, et c'est précisément ce qui permettait à la ligne de
    // disparaître avant ce correctif.
    expect(row.state).toBe('applied')
    expect(row.report?.errors).toEqual([{ row: 5, message: 'socket hang up' }])
  })

  it('n’ajoute RIEN quand la ligne incertaine est REJOUÉE avec succès — ce n’est pas un échec', async () => {
    const { service, row } = makeService({
      state: 'partial',
      processed_rows: 4,
      total_rows: 10,
      failed_at_row: 4,
      resume_outcome: 'unknown',
      content_fingerprint: FINGERPRINT,
      created_count: 4,
      report: REPORT,
    })
    const writer: ImportRowWriter = {
      async writeAccounts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeContacts(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeProjects(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeNeeds(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeTalents(input) {
        return runRows(input, null, NEVER_LEFT)
      },
      async writeMissions(input) {
        return runRows(input, null, NEVER_LEFT)
      },
    }
    // « Réécrire la ligne 5 » — resumeFrom = la ligne incertaine elle-même.
    const outcome = await service.writeSession('u-1', WS, 's-1', CONTENT, writer, { resumeFrom: 4 })
    expect(outcome.report?.errors).toEqual([])
    expect(row.report?.errors).toEqual([])
  })

  it('n’ajoute RIEN sur un premier passage sans incident — `errors` reste vide, pas absent', async () => {
    const { service } = makeService({ state: 'simulated', content_fingerprint: FINGERPRINT, report: REPORT })
    const outcome = await service.writeSession('u-1', WS, 's-1', CONTENT, writerStoppingAt(null, NEVER_LEFT))
    expect(outcome.report?.errors).toEqual([])
    expect(outcome.report?.creations).toBe(10)
  })
})

describe('4. La simulation n’EFFACE pas le point de reprise', () => {
  it('enregistre l’empreinte et le nombre de lignes du fichier', async () => {
    const { service, row } = makeService({ state: 'draft', source: 'accounts_only', object_type: 'account' })
    await service.simulate(WS, 's-1', { content: CONTENT })
    expect(row.content_fingerprint).toBe(FINGERPRINT)
    expect(row.total_rows).toBe(10)
  })

  it('ne DÉGRADE pas `partial` en `simulated` — l’import a écrit, et ça reste vrai', async () => {
    // Re-simuler après une interruption est le bon geste : la base a changé.
    // Mais repasser l'état à `simulated` effacerait le seul signal qui dit que
    // 4 000 lignes sont déjà là, et le bouton d'annulation disparaîtrait.
    const { service, row } = makeService({
      state: 'partial',
      source: 'accounts_only',
      object_type: 'account',
      processed_rows: 4,
      content_fingerprint: FINGERPRINT,
    })
    await service.simulate(WS, 's-1', { content: CONTENT })
    expect(row.state).toBe('partial')
    expect(row.processed_rows).toBe(4)
  })

  it('ne RÉÉCRIT pas l’empreinte d’une session qui a déjà écrit', async () => {
    // Sinon il suffirait de re-simuler avec un autre fichier pour que la reprise
    // saute 4 000 lignes du mauvais.
    const { service, row } = makeService({
      state: 'partial',
      source: 'accounts_only',
      object_type: 'account',
      processed_rows: 4,
      content_fingerprint: FINGERPRINT,
    })
    await service.simulate(WS, 's-1', { content: 'Societe;Siren\nAutre;999999999' })
    expect(row.content_fingerprint).toBe(FINGERPRINT)
  })
})

// #2732.1 (recette prod 31/10) — « une ligne refusée est NOMMÉE avec sa raison, jamais un silence ».
describe('#2732.1 — une ligne refusée à l’écriture rejoint le rapport, numéro et motif en clair', () => {
  it('une société inconnue sort des créations et entre dans `errors`, nommée', async () => {
    const content = ['Societe;Role', 'Inconnue SA;Dev', 'Acme;Archi'].join('\n')
    const { service, row } = makeService({
      state: 'simulated',
      source: 'missions',
      object_type: 'mission',
      mapping: { columns: { Societe: 'company', Role: 'role' }, ignored: [], disabledRules: [] },
      content_fingerprint: importContentFingerprint(content),
      report: { creations: 2, updates: 0, errors: [], duplicates: [], skipped: [], rowsRead: 2 } as never,
    })
    const writer = {
      ...writerStoppingAt(null, NEVER_LEFT),
      async writeMissions() {
        return {
          created: 1,
          updated: 0,
          skippedUnknownCompany: 1,
          rejected: [{ row: 1, reason: 'unknown_company' as const, detail: 'Inconnue SA' }],
          snapshot: [{ id: 'm-1', created: true, fields: {} }],
          processedRows: 2,
          failure: null,
        }
      },
    }
    const outcome = await service.writeSession('u-1', WS, 's-1', content, writer)
    expect(outcome.created).toBe(1)
    expect(outcome.rejected).toHaveLength(1)
    const report = (row.report ?? {}) as { creations: number; errors: { row: number; message: string }[] }
    expect(report.creations).toBe(1)
    expect(report.errors).toEqual([
      { row: 1, message: expect.stringMatching(/Inconnue SA.*n’existe pas encore dans ton espace/) },
    ])
  })
})
