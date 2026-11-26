/**
 * GA-404 — LE SEUIL « MARGE À RISQUE » D'UNE MISSION RESTE LE MÊME PARTOUT OÙ
 * IL EST RECOPIÉ (#3423.4, retour bêta du 30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE, ET CE QU'ELLE COUVRE VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * #3423 demande que « la même mission possède les mêmes dates, marge et
 * risques » partout. `missionRisks()` (`packages/contracts/src/schemas/
 * mission.ts`) EST le moteur canonique : `margin <= 0` → `'margin_at_risk'`.
 *
 * Investigation AVANT d'écrire cette garde (ne pas supposer qu'un second
 * calcul est un bug) : `account-missions.ts::visibleMissionRisks` (Compte,
 * onglet Missions) RECOPIE ce seuil — et le docblock de la fonction dit
 * pourquoi, en toutes lettres : la route du dossier compte
 * (`GET /delivery/accounts/:id/missions`) n'envoie pas les deux entrées brutes
 * dont `missionRisks()` a besoin (`loadedDailyCostCents`, les relevés
 * d'activité) — seulement `marginPercent`, déjà calculé et rédigé
 * (`redactFinance`) côté serveur. La fonction est donc « PARTIELLE, ET
 * ASSUMÉE » (#2124.24), pas une seconde vérité par accident.
 *
 * CE QUE CETTE GARDE VÉRIFIE DONC : pas que le seuil n'est JAMAIS recopié
 * (il l'est, sciemment) — mais qu'il reste IDENTIQUE aux deux endroits. Si un
 * futur lot resserre le seuil canonique (`margin <= 0` → `margin < 2`, par
 * exemple) sans toucher `visibleMissionRisks`, la même mission afficherait
 * « à risque » sur la fiche mission et « rien à signaler » sur le Compte — la
 * seconde vérité exacte que #3423 nomme. Les dates (`startedOn`/`endsOn`)
 * n'ont pas cette garde : `TabMissions.tsx` les rend telles que l'API les
 * envoie, sans aucun seuil local à faire diverger (voir son commentaire :
 * « déjà envoyés, sans recalculer ni deviner »).
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon ce docblock, qui cite
 * le seuil qu'elle surveille, la ferait échouer elle-même.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CANONICAL_FILE = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas', 'mission.ts')
const ACCOUNT_MISSIONS_MODEL_FILE = join(__dirname, '..', 'features', 'accounts', 'model', 'account-missions.ts')
const TAB_MISSIONS_FILE = join(
  __dirname,
  '..',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'TabMissions.tsx',
)

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/** Le seuil canonique : `margin <= 0` (peu importe le nom de la variable). */
const MARGIN_AT_RISK_THRESHOLD = /margin\w*\s*<=\s*0/i

describe('GA-404 — la garde LIT vraiment quelque chose', () => {
  it('les trois fichiers surveillés existent et ne sont pas vides', () => {
    for (const file of [CANONICAL_FILE, ACCOUNT_MISSIONS_MODEL_FILE, TAB_MISSIONS_FILE]) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('savoir dire NON : le motif reconnaît bien le seuil canonique dans un texte sain', () => {
    expect(MARGIN_AT_RISK_THRESHOLD.test(`else if (margin <= 0) risks.push('margin_at_risk')`)).toBe(true)
    expect(MARGIN_AT_RISK_THRESHOLD.test(`if (margin < 5) flag()`)).toBe(false)
  })
})

describe('GA-404 — le seuil « marge à risque » recopié par le Compte reste identique au moteur canonique', () => {
  it('`missionRisks()` (canonique) pose bien le seuil `margin <= 0`', () => {
    const source = read(CANONICAL_FILE)
    expect(source).toMatch(/export function missionRisks/)
    expect(source).toMatch(MARGIN_AT_RISK_THRESHOLD)
  })

  it('`visibleMissionRisks` (Compte, #2124.24) recopie le MÊME seuil — jamais un autre', () => {
    const source = read(ACCOUNT_MISSIONS_MODEL_FILE)
    expect(source).toMatch(/export function visibleMissionRisks/)
    expect(source).toMatch(MARGIN_AT_RISK_THRESHOLD)
  })

  it('TabMissions (Compte) affiche marge et dates telles que reçues, sans seuil local à faire diverger', () => {
    const source = read(TAB_MISSIONS_FILE)
    expect(source).toMatch(/visibleMissionRisks/)
    expect(source).not.toMatch(MARGIN_AT_RISK_THRESHOLD)
  })
})
