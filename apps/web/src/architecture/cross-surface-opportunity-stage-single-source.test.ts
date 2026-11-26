/**
 * GA-403 — LE STATUT (STAGE) D'UNE OPPORTUNITÉ SE LIT, IL NE SE RECALCULE
 * JAMAIS PAR SURFACE (#3423.3, retour bêta du 30/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE, ET CE QU'ELLE COUVRE VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * #3423 demande que « la même opportunité possède le même statut dans Pipe,
 * Besoins et Compte ». Vérifié avant d'écrire : « Besoins » (`/projects/needs`,
 * `ProjectNeedsPanel.tsx`, `open-needs.ts`) porte le statut d'un BESOIN
 * (`projectNeedStatusSchema` — matching/en cours/pourvu…), un champ DISTINCT du
 * STADE (`stage`) d'une OPPORTUNITÉ (`ProjectReadRow.stage`, ouvert/gagné/perdu…
 * — `project.ts`, `OPEN_PIPELINE_STAGES`/`CLOSED_STAGES`). Un besoin n'a pas de
 * stade d'opportunité et une opportunité n'a pas de statut de besoin : cette
 * garde couvre donc les DEUX surfaces où le STADE d'une opportunité est
 * effectivement affiché — Pipe (`PipelineBoard.tsx`) et Compte (l'onglet
 * Opportunités, `TabProjects.tsx` — #3714 : la tête « À regarder en premier » et son `accountTopOpportunities.ts` ont été retirées) — jamais une troisième lecture
 * de `Besoins` qui n'existe pas pour ce champ précis.
 *
 * Les deux surfaces lisent `ProjectReadRow.stage` (même type partagé,
 * `@bellum/contracts`) et les DEUX vocabulaires fermés du même fichier
 * (`OPEN_PIPELINE_STAGES` / `CLOSED_STAGES`) — jamais une classification
 * locale (par exemple déduire « gagné » d'un montant positif, ou une seconde
 * liste de stades recopiée).
 *
 * ⚠️ Elle retire les commentaires avant de lire — sinon ce docblock la ferait
 * échouer elle-même.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PIPELINE_BOARD_FILE = join(__dirname, '..', 'features', 'projects', 'view', 'PipelineBoard.tsx')
const ACCOUNT_OPPORTUNITIES_FILE = join(
  __dirname,
  '..',
  'features',
  'accounts',
  'view',
  'account-detail',
  'tabs',
  'TabProjects.tsx',
)

const SURFACE_FILES = [PIPELINE_BOARD_FILE, ACCOUNT_OPPORTUNITIES_FILE]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function read(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

/**
 * Un second moteur ressemblerait à une déduction du stade depuis le montant ou
 * une autre donnée (`amount > 0 ? 'won' : ...`) plutôt qu'à une LECTURE de
 * `.stage`, ou à une liste de stades recopiée localement (`['won', 'lost', …]`)
 * au lieu d'un import de `@bellum/contracts`.
 */
function amountDerivedStagePattern(): RegExp {
  return /amount\s*[><=]+.{0,30}['"](won|lost|gagn|perdu)/i
}

describe('GA-403 — la garde LIT vraiment quelque chose', () => {
  it('les deux fichiers surveillés existent et ne sont pas vides', () => {
    for (const file of SURFACE_FILES) {
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('savoir dire NON : le motif détecte bien un texte empoisonné qui déduit le stade du montant', () => {
    const poisoned = `const stage = project.amount > 0 ? 'won' : 'open'`
    expect(amountDerivedStagePattern().test(poisoned)).toBe(true)
  })
})

describe('GA-403 — le stade d’une opportunité se LIT sur le champ canonique, jamais recalculé par surface', () => {
  it('Pipe lit `project.stage` et le vocabulaire partagé, il ne le déduit pas du montant', () => {
    const source = read(PIPELINE_BOARD_FILE)
    expect(source).toMatch(/\.stage\b/)
    expect(source).toMatch(/from ['"]@bellum\/contracts['"]/)
    expect(source).toMatch(/OPEN_PIPELINE_STAGES|isPipelineStage/)
    expect(source).not.toMatch(amountDerivedStagePattern())
  })

  it('Compte (onglet Opportunités) lit `row.stage` et `INTAKE_STAGES` partagé, il ne le déduit pas du montant', () => {
    const source = read(ACCOUNT_OPPORTUNITIES_FILE)
    expect(source).toMatch(/\.stage\b/)
    expect(source).toMatch(/INTAKE_STAGES/)
    expect(source).toMatch(/from ['"]@bellum\/contracts['"]/)
    expect(source).not.toMatch(amountDerivedStagePattern())
  })

  it('aucune des deux surfaces ne déduit localement le stade depuis le montant', () => {
    for (const file of SURFACE_FILES) {
      const source = read(file)
      expect(source, `${file} semble déduire le stade depuis le montant`).not.toMatch(amountDerivedStagePattern())
    }
  })
})
