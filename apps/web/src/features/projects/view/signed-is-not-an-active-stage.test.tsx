import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1325 (3/9.2) — « Ne pas laisser "Signé" occuper en permanence une colonne
 * équivalente aux étapes actives. Créer plutôt : Pipe actif / Gagnés / Perdus. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT DÉJÀ VRAI, ET CE QUI NE L'ÉTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Dans la DONNÉE, la distinction existait : `OPEN_PIPELINE_STAGES` exclut `won`
 * des totaux, avec un commentaire qui le dit — « la colonne Signé reste VUE,
 * elle n'est plus SOMMÉE ». Additionner du gagné à du reste-à-gagner gonfle le
 * pipe, et c'est l'arbitrage du 16/08.
 *
 * À l'ÉCRAN, elle ne l'était pas : les cinq colonnes partageaient la même
 * grille, la même largeur, le même poids. Ce que l'œil lisait contredisait ce
 * que le total calculait.
 *
 * ⚠️ « Perdus / abandonnés » n'est PAS créé. `lost` et `dormant` ne sont dans
 * aucune colonne — ils sont sortis du pipe, pas rangés au bout. Leur fabriquer
 * une colonne inventerait une étape que le cycle ne porte pas.
 */
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PipelineBoard.tsx'), 'utf8')

describe('« Signé » n’est pas une étape active', () => {
  it('a un corpus à lire', () => {
    expect(source).toContain('summary.columns')
  })

  // Refonte Théo C (maquette `projects-pipeline`, AFFAIRES-E29 du 19/10) : « Gagnés devient la colonne Signé, hors
  // valeur du pipe » — le Kanban a cinq colonnes, la cinquième est celle du signé, et elle reste HORS des totaux.
  // L'intention de #1325 (le signé n'est pas une étape active) tient : ce n'est plus la mise en page qui la porte, c'est
  // la donnée (`OPEN_PIPELINE_STAGES`) et la phrase de synthèse (« jamais ajouté au pipe »).
  it('seules les étapes encore en jeu entrent dans le pipe : le signé n’est une colonne que sous condition', () => {
    expect(source).toContain('OPEN_PIPELINE_STAGES')
    // #4291.8 — le signé n'est plus une colonne du tout : il se suit dans `WonMissionTracking`.
    expect(source).not.toContain('showWon')
    expect(source).not.toContain('signedSection')
    expect(source).not.toMatch(/column\.stage === 'won'/)
    expect(source).not.toMatch(/xl:grid-cols-5/)
  })

  // #4499 (Louis 23/10) — la carte qui disait « Signé : … jamais ajouté au pipe » a quitté la page avec les trois
  // autres ; une ligne de synthèse dit « X € pipe ouvert HT ». Le signé reste À PART : la synthèse ne lit QUE le
  // total ouvert (`pipelineTotal`), jamais le signé, et la colonne Gagnée dit ses propres « X € estimés ».
  it('« Signé » reste À PART du total : la ligne de synthèse ne lit que le pipe OUVERT', () => {
    expect(source).toContain('pipelineTotal(summary)')
    const line = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PipelineSummaryLine.tsx'), 'utf8')
    expect(line).toContain('pipelineTotal(summary)')
    expect(line).not.toMatch(/signedTotal|signed_amount_cents|signed_count/)
  })

  it('sait dire NON — une synthèse qui additionnerait le signé serait refusée', () => {
    const fautive = 'const total = pipelineTotal(summary) + signedTotal(summary)'
    expect(/signedTotal|signed_amount_cents|signed_count/.test(fautive)).toBe(true)
  })

  it('n’invente AUCUNE colonne « perdus » — elles ne sont pas dans le pipe', () => {
    // `lost` et `dormant` sont hors colonnes par construction. Leur en fabriquer
    // une afficherait une étape que le cycle ne porte pas.
    expect(source).not.toMatch(/grid-cols-6/)
    expect(source).not.toContain("'lost'")
  })

  it('sait dire NON — une grille à cinq colonnes serait refusée', () => {
    const avant = '<Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">'

    expect(/xl:grid-cols-5/.test(avant)).toBe(true)
  })
})
