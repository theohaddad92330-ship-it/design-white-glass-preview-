import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApiError, extractError } from '@/lib/api-error'
import { readGraphConflict } from '@/features/accounts/view/account-detail/tabs/organigramme/corrections/orgCorrectionDraft'

/**
 * GA-113 — un 409 qui porte des DONNÉES ne se perd pas dans le transport.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * Le verrou optimiste de l'organigramme ne répond pas « conflit » : il répond
 * les deux versions ET la liste de ce qui s'est intercalé — qui, quel objet,
 * quel champ, quand (`orgGraphConflictSchema`). La spec le dit en toutes
 * lettres : « l'UI affiche une modale "modification plus récente disponible",
 * jamais un lost update silencieux ».
 *
 * **Un 409 dont on jette le corps transforme un verrou optimiste en perte de
 * saisie.** L'utilisateur voit « conflit », ne sait pas sur quoi, recharge, et
 * réécrit de mémoire une correction qu'il vient de perdre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE — LE TUYAU ENTIER, PAS SES EXTRÉMITÉS
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre maillons, dont trois vivent dans des fichiers que personne ne
 * relierait au ledger d'organigramme :
 *
 *   1. `extractError` REND le corps JSON (`details`) — il n'en gardait que
 *      `message` et `code` avant le 30/08 ;
 *   2. `apiFetch` le PASSE au constructeur d'`ApiError` ;
 *   3. `ApiError` le CONSERVE ;
 *   4. les deux écrans qui écrivent dans le ledger le RELISENT
 *      (`readGraphConflict`) au lieu de l'avaler.
 *
 * Le maillon 1 est vérifié **en exécutant le vrai code sur une vraie `Response`**
 * — pas en lisant le fichier. Une garde qui lirait `api-error.ts` resterait
 * verte si `apiFetch` cessait de passer le quatrième argument.
 */

const WEB = join(__dirname, '..')
const CORRECTIONS = join(WEB, 'features/accounts/view/account-detail/tabs/organigramme/corrections')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

const api = read(join(WEB, 'lib/api.ts'))
const drawer = read(join(CORRECTIONS, 'OrgCorrectionDrawer.tsx'))
const history = read(join(CORRECTIONS, 'OrgCorrectionsHistory.tsx'))

/** Le corps EXACT que `OrgGraphCorrectionService.conflict()` fabrique. */
const CONFLICT_BODY = {
  error: 'graph_version_mismatch',
  code: 'graph_version_mismatch',
  yours: 7,
  current: 9,
  diffSummary: '2 corrections depuis la version 7',
  intervening: [
    {
      objectType: 'person',
      objectId: 'p-marie-martin',
      field: 'title',
      by: 'Claire Dubois',
      at: '2026-08-29T09:00:00.000Z',
    },
  ],
  message: "L'organigramme a été corrigé entre-temps.",
}

function conflictResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GA-113 — le corpus n’est pas vide', () => {
  it('lit un vrai corps de conflit et les deux écrans qui écrivent', () => {
    expect(CONFLICT_BODY.intervening.length).toBeGreaterThan(0)
    expect(api.length).toBeGreaterThan(500)
    expect(drawer.length).toBeGreaterThan(500)
    expect(history.length).toBeGreaterThan(500)
  })
})

describe('GA-113 — le tuyau, exécuté de bout en bout', () => {
  it('`extractError` rend le CORPS, pas seulement la phrase', async () => {
    const { message, code, details } = await extractError(conflictResponse(CONFLICT_BODY))
    expect(message).toBe(CONFLICT_BODY.message)
    expect(code).toBe('graph_version_mismatch')
    expect(details).toMatchObject({ yours: 7, current: 9 })
  })

  it('une `ApiError` construite depuis ce corps se relit en conflit typé', async () => {
    const { message, code, details } = await extractError(conflictResponse(CONFLICT_BODY))
    const conflict = readGraphConflict(new ApiError(message, 409, code, details))
    expect(conflict).not.toBeNull()
    expect(conflict?.yours).toBe(7)
    expect(conflict?.current).toBe(9)
    expect(conflict?.intervening[0]?.by).toBe('Claire Dubois')
    expect(conflict?.intervening[0]?.field).toBe('title')
  })

  it('`apiFetch` passe bien le corps à l’erreur — le maillon invisible', () => {
    // Ce maillon-là ne peut pas s'exécuter ici (`@/lib/api` est mocké
    // globalement par la suite de tests) : on le lit, en s'assurant que le
    // quatrième argument existe. Sans lui, les deux tests ci-dessus resteraient
    // verts pendant que la production perdrait le diff.
    expect(api).toContain('const { message, code, details } = await extractError(res)')
    expect(api).toContain('new ApiError(message, res.status, code, details)')
  })

  it('les deux écrans qui écrivent dans le ledger RELISENT le conflit', () => {
    expect(drawer).toContain('readGraphConflict(')
    expect(history).toContain('readGraphConflict(')
    // Et le tiroir le REND, il ne se contente pas de le lire.
    expect(drawer).toContain('org-correction-conflict')
    expect(drawer).toContain('setConflict(versionConflict)')
  })
})

describe('GA-113 — elle sait dire NON', () => {
  it('un corps sans `details` ne produit aucun conflit', () => {
    expect(readGraphConflict(new ApiError('conflit', 409, 'graph_version_mismatch'))).toBeNull()
  })

  it('une erreur qui n’est pas un conflit de version n’en devient pas un', async () => {
    const other = await extractError(
      new Response(JSON.stringify({ message: 'Compte introuvable', code: 'not_found' }), { status: 404 }),
    )
    expect(readGraphConflict(new ApiError(other.message, 404, other.code, other.details))).toBeNull()
  })

  it('un conflit dont la base n’est PAS en avance est refusé — il serait incohérent', async () => {
    const impossible = await extractError(conflictResponse({ ...CONFLICT_BODY, current: 7 }))
    expect(readGraphConflict(new ApiError('x', 409, 'graph_version_mismatch', impossible.details))).toBeNull()
  })

  it('un corps qui n’est PAS du JSON ne fabrique pas un faux conflit', async () => {
    const html = await extractError(new Response('<html>502</html>', { status: 502 }))
    expect(html.details).toBeUndefined()
    expect(readGraphConflict(new ApiError(html.message, 502, html.code, html.details))).toBeNull()
  })
})
