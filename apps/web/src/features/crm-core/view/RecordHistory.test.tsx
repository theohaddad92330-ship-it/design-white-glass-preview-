import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CORRECTION_SURFACE_TRACES, type RecordFieldAudit, type RecordImportMark } from '@bellum/contracts'

/**
 * #2318.7 — OÙ UNE CORRECTION EST VRAIMENT ARRIVÉE.
 *
 * Ce que cet écran rendait avant : rien sur les surfaces. Le contrat portait
 * neuf noms fixes — « la PROMESSE du produit… pas une mesure », écrit dans le
 * code — et aucun composant ne les affichait, ce qui était la seule chose
 * honnête qu'on pouvait en faire.
 *
 * Ce qu'il rend maintenant : la mesure, avec ses trois états DISTINGUABLES.
 * Cinq surfaces relisent la correction, quatre ne la relisent pas et sont
 * NOMMÉES avec leur raison. Afficher « 5 sur 9 » est plus honnête que neuf
 * promesses, et c'est la seule façon de rendre visible le NO-GO de
 * LAU-FINAL-059 — « l'ancienne information continue d'alimenter le score ou le
 * plan » — au lieu de le laisser vrai et muet.
 */

const historyData: { data: RecordFieldAudit[] | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
}
vi.mock('../hooks/useRecordEdit', () => ({
  useRecordHistory: () => historyData,
}))
// #4051 — la trace d'import se lit dans la même réponse que l'historique ; ici doublée.
const importMark: { data: RecordImportMark | null } = { data: null }
vi.mock('../hooks/useRecordImportMark', () => ({
  useRecordImportMark: () => importMark,
}))

function entry(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    entityType: 'account',
    entityId: '22222222-2222-4222-8222-222222222222',
    field: 'headquarters',
    oldValue: 'La Défense',
    newValue: 'Paris',
    source: 'human',
    actorId: '33333333-3333-4333-8333-333333333333',
    actorName: 'Louis',
    createdAt: '2026-09-18T09:00:00.000Z',
    rule: null,
    ...over,
  }
}

async function renderHistory(entries: RecordFieldAudit[]) {
  historyData.data = entries
  const { RecordHistory } = await import('./RecordHistory')
  render(<RecordHistory entityType="account" entityId="22222222-2222-4222-8222-222222222222" />)
}

describe('RecordHistory — #2318.7, les surfaces MESURÉES', () => {
  afterEach(cleanup)

  it('annonce le compte réel : les surfaces atteintes SUR neuf, jamais « neuf »', async () => {
    await renderHistory([entry()])
    const reached = CORRECTION_SURFACE_TRACES.filter(trace => trace.status === 'reached').length
    expect(screen.getByText(new RegExp(`${reached}\\D+9`))).toBeInTheDocument()
  })

  it('nomme les surfaces NON atteintes — le score et le plan ne se taisent plus', async () => {
    await renderHistory([entry()])
    expect(screen.getByText(/Score du compte/i)).toBeInTheDocument()
    expect(screen.getByText(/Plan d’action/i)).toBeInTheDocument()
    // …et la raison est écrite, pas seulement le nom.
    expect(screen.getByText(/aucune correction ne le recalcule/i)).toBeInTheDocument()
  })

  it('distingue les trois états — « relit » et « ne relit pas » ne se lisent pas pareil', async () => {
    await renderHistory([entry()])
    expect(screen.getAllByText(/relit ta correction/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ne la relit pas/i).length).toBeGreaterThan(0)
  })

  it('rend les neuf surfaces, aucune retirée parce qu’elle était difficile', async () => {
    await renderHistory([entry()])
    const items = screen.getAllByTestId('correction-surface')
    expect(items).toHaveLength(9)
  })

  // Le registre est le MÊME pour toutes les lignes du journal : le répéter sous
  // chaque correction serait la même information deux fois sous la même forme
  // (GA-26), et noierait le journal lui-même.
  it('n’affiche le panneau qu’UNE fois, même avec plusieurs corrections', async () => {
    await renderHistory([entry(), entry({ id: '44444444-4444-4444-8444-444444444444', field: 'sector' })])
    expect(screen.getAllByTestId('correction-surface')).toHaveLength(9)
  })
})

/**
 * #2318.6 — LES SEPT ÉLÉMENTS D'UNE CORRECTION, VUS SUR L'ÉCRAN.
 *
 * RÉFUTÉ EN PROD le 18/09/2026 (registre LAU-059) sur un dossier dont TOUTES
 * les entrées venaient d'une régénération IA — aucune correction HUMAINE n'y
 * existait, donc le cas nominal (auteur + source contestée) n'a jamais pu
 * être observé à l'écran. Le code livré le 18/09 (`2d3a7095b`) est pourtant
 * déjà là : ces tests le PROUVENT au niveau composant, avec le cas que la
 * recette n'a pas pu trouver — une entrée `human` avec un `actorName`, qui
 * CONTESTE une entrée antérieure sur le même champ.
 */
describe('RecordHistory — #2318.6, les sept éléments', () => {
  afterEach(cleanup)

  it('affiche l’AUTEUR (personne physique) d’une correction humaine, pas seulement la source', async () => {
    await renderHistory([entry({ source: 'human', actorName: 'Louis' })])
    expect(screen.getByText(/Louis/)).toBeInTheDocument()
  })

  it('retombe sur le libellé de la source quand il n’y a pas d’auteur physique (IA, connecteur)', async () => {
    await renderHistory([entry({ source: 'pipeline', actorId: null, actorName: null })])
    expect(screen.getByText(/Analyse/)).toBeInTheDocument()
  })

  it('nomme la SOURCE CONTESTÉE quand une entrée antérieure sur le même champ existe', async () => {
    await renderHistory([
      entry({ id: '55555555-5555-4555-8555-555555555555', source: 'human', actorName: 'Louis' }),
      entry({
        id: '66666666-6666-4666-8666-666666666666',
        source: 'pipeline',
        actorId: null,
        actorName: null,
        createdAt: '2026-09-17T09:00:00.000Z',
      }),
    ])
    // « Elle l'emporte désormais sur « Analyse {{brand}} » » — la source
    // contestée est celle de la ligne PLUS ANCIENNE sur le MÊME champ.
    expect(screen.getByText(/l’emporte désormais sur/)).toBeInTheDocument()
  })

  it('dit « rien à protéger » quand aucune entrée antérieure n’existe sur ce champ', async () => {
    await renderHistory([entry({ source: 'human', actorName: 'Louis' })])
    expect(screen.getByText(/rien fait céder/)).toBeInTheDocument()
  })

  it('dit que la correction n’empêche pas le reste de l’analyse de bouger', async () => {
    await renderHistory([entry({ source: 'human', actorName: 'Louis' })])
    expect(screen.getByText(/n’empêche pas le reste de l’analyse/)).toBeInTheDocument()
  })
})

describe('#3666.k — une lecture en échec n’est pas « aucun historique »', () => {
  afterEach(() => {
    historyData.isError = false
  })

  it('requête en échec : alerte de chargement, jamais le texte du vide', async () => {
    historyData.data = undefined
    historyData.isError = true
    const { RecordHistory } = await import('./RecordHistory')
    render(<RecordHistory entityType="account" entityId="22222222-2222-4222-8222-222222222222" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Aucun historique|Aucune correction/i)).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — requête réussie et vide : le vide s’affiche, pas d’alerte', async () => {
    historyData.data = []
    historyData.isError = false
    const { RecordHistory } = await import('./RecordHistory')
    render(<RecordHistory entityType="account" entityId="22222222-2222-4222-8222-222222222222" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// #4051 — « Importé le <date> depuis <source> » en tête de l'historique d'une fiche arrivée par un import.
describe('#4051 — la ligne « Importé le … depuis … »', () => {
  afterEach(() => {
    cleanup()
    importMark.data = null
  })

  it('une fiche importée dit QUAND et DEPUIS QUOI — le nom du fichier ou de l’outil branché', async () => {
    importMark.data = { importedAt: '2026-10-14T08:00:00.000Z', sourceKind: 'file', sourceLabel: 'export-hubspot.csv' }
    await renderHistory([entry()])
    expect(screen.getByTestId('import-mark-line')).toHaveTextContent(/Importé le .*2026.* depuis export-hubspot\.csv/)
  })

  it('même sans aucune modification, la ligne d’origine se lit', async () => {
    importMark.data = { importedAt: '2026-10-14T08:00:00.000Z', sourceKind: 'tool', sourceLabel: 'HubSpot' }
    await renderHistory([])
    expect(screen.getByTestId('import-mark-line')).toHaveTextContent(/depuis HubSpot/)
  })

  it('⚠️ SAIT DIRE NON — une fiche jamais importée n’affiche aucune origine devinée', async () => {
    importMark.data = null
    await renderHistory([entry()])
    expect(screen.queryByTestId('import-mark-line')).not.toBeInTheDocument()
  })
})
