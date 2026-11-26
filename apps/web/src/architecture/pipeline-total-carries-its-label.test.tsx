import type { PipelineSummary, ProjectRow } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// ⚠️ #1394 — l'entête de colonne du pipe porte maintenant un `Link` vers la
// liste filtrée (`?stage=`) : ce fichier a besoin d'un routeur. Le faux recopie
// le `search` DANS le `href` — un faux qui jetterait le paramètre laisserait
// passer le défaut du 28/08 : un lien juste, une recherche perdue.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search }: { children: React.ReactNode; to?: string; search?: Record<string, unknown> }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    ).toString()
    return <a href={query ? `${to ?? '#'}?${query}` : (to ?? '#')}>{children}</a>
  },
}))

const { PipelineBoard } = await import('@/features/projects/view/PipelineBoard')
const { IntakeQueueLine } = await import('@/features/projects/view/IntakeQueueLink')

/**
 * GA-134 — LA VALEUR DE TÊTE DU PIPE NE SE RENDIT JAMAIS SANS SON LIBELLÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08/2026, `/projects`, compte réel, pipe à cinq colonnes.
 * Le bandeau de tête affichait trois valeurs côte à côte :
 *
 *   « non mesuré — aucun montant saisi sur 1 projet au pipe »
 *   « 428 projets détectés à reprendre »
 *   « 222 signaux, comptés à part »
 *
 * Le FOND de la première était juste — exactement la doctrine « non mesuré
 * n'est pas zéro » (GA-18/GA-19). Mais elle était la SEULE des trois à ne
 * porter aucun libellé propre : ses deux voisines sont des phrases complètes
 * qui NOMMENT ce qu'elles comptent, quand « non mesuré » ne dit nulle part
 * qu'il s'agit de la valeur DU PIPE avant d'avoir lu la raison jusqu'au bout.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Le CORPUS existe : le libellé (`pipeline.totalLabel`) est déclaré, non
 *     vide, dans les DEUX langues — et le source de `PipelineBoard.tsx` le
 *     RÉFÉRENCE bien avant les trois branches du total (vide/non mesuré/
 *     mesuré), pas seulement dans une des trois.
 *  2. Le RENDU le confirme sur les TROIS états du total (vide, non mesuré,
 *     mesuré) : un test qui ne lirait que la source passerait au vert le jour
 *     où le libellé existe dans le fichier mais n'est branché sur AUCUNE
 *     des branches — le défaut « code juste que personne n'appelle ».
 *  3. Elle SAIT DIRE NON : la forme exacte du défaut d'origine — une valeur
 *     seule dans son groupe, sans libellé voisin — est reproduite à la main et
 *     doit être repérée.
 */

const WEB_SRC = join(__dirname, '..')
/**
 * ⚠️ LA GARDE A SUIVI LA RÈGLE, PAS L'INVERSE (#1324, 03/09/2026).
 *
 * Le libellé et les trois branches du total vivaient dans `PipelineBoard.tsx` ;
 * ils vivent maintenant dans `PipelineKpis.tsx`, la synthèse en quatre cartes.
 * La règle est mot pour mot la même — la valeur de tête du pipe ne se rend
 * jamais sans son libellé — et c'est son ADRESSE qui a changé. Laisser la garde
 * pointer l'ancien fichier l'aurait rendue verte sur du vide : elle aurait
 * cherché `t('pipeline.totalLabel')` dans un fichier qui ne le contient plus, et
 * `indexOf` rend -1, ce que le premier `expect` attrape — c'est exactement ce
 * qui s'est produit, et c'est pourquoi elle est REBRANCHÉE plutôt qu'assouplie.
 */
/*
 * ⚠️ #4499 (Louis 23/10/2026) — LA MÊME RÈGLE, UNE TROISIÈME ADRESSE. Les quatre cartes sont remplacées par UNE
 * ligne de synthèse (`PipelineSummaryLine.tsx`, « 362 000 € pipe ouvert HT · estimation non pondérée ») : la
 * garde est rebranchée sur ce fichier, et le libellé — désormais en minuscule parce qu'il SUIT le montant dans la
 * phrase — est lu dans la langue, pas recopié ici.
 */
const PIPELINE_KPIS = join(WEB_SRC, 'features', 'projects', 'view', 'PipelineSummaryLine.tsx')
const FR = join(WEB_SRC, 'i18n', 'locales', 'fr', 'projects.json')
const EN = join(WEB_SRC, 'i18n', 'locales', 'en', 'projects.json')
/** Le libellé RÉEL (FR), lu dans la langue : la garde suit le mot de l'écran, elle ne le fige pas. */
const LABEL = (JSON.parse(readFileSync(FR, 'utf8')) as { pipeline: { totalLabel: string } }).pipeline.totalLabel

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const project = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    kind: 'pain',
    label: 'Migration data lake',
    source: 'pain',
    confidence: 'high',
    stage: 'qualified',
    stage_entered_at: '2026-08-01T00:00:00.000Z',
    first_detected_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    amount_cents: null,
    ...over,
  }) as ProjectRow

/** Aucune affaire signée sur les trois jeux d'essai — pas ce que cette garde teste. */
const NOTHING_SIGNED = { signed_count: 0, signed_amount_cents: 0, signed_without_amount: 0 } as const

/** La donnée EXACTE de la recette du 30/08 : un projet au pipe, sans montant. */
const NOT_MEASURED: PipelineSummary = {
  columns: [{ stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 0, without_amount: 1 }],
  total_count: 1,
  total_amount_cents: 0,
  total_without_amount: 1,
  intake: 428,
  signals: 222,
  ...NOTHING_SIGNED,
} as PipelineSummary

const MEASURED: PipelineSummary = {
  columns: [{ stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 4_500_000, without_amount: 0 }],
  total_count: 1,
  total_amount_cents: 4_500_000,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
  ...NOTHING_SIGNED,
} as PipelineSummary

const EMPTY: PipelineSummary = {
  columns: [],
  total_count: 0,
  total_amount_cents: 0,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
  ...NOTHING_SIGNED,
} as PipelineSummary

describe('GA-134 — la garde lit bien un corpus, pas du vide', () => {
  it('le libellé du pipe existe, non vide, dans les DEUX langues', () => {
    const fr = JSON.parse(readFileSync(FR, 'utf8')) as { pipeline?: Record<string, string> }
    const en = JSON.parse(readFileSync(EN, 'utf8')) as { pipeline?: Record<string, string> }
    expect((fr.pipeline?.totalLabel ?? '').trim().length, 'pipeline.totalLabel manquant en FR').toBeGreaterThan(0)
    expect((en.pipeline?.totalLabel ?? '').trim().length, 'pipeline.totalLabel manquant en EN').toBeGreaterThan(0)
  })

  it('le source de PipelineSummaryLine.tsx référence bien ce libellé, AVANT les trois branches du total', () => {
    const source = readFileSync(PIPELINE_KPIS, 'utf8')
    const labelIndex = source.indexOf("t('pipeline.totalLabel')")
    const branchIndex = source.indexOf("total.kind === 'unmeasured'")
    expect(labelIndex, 'PipelineSummaryLine.tsx ne lit plus pipeline.totalLabel').toBeGreaterThan(-1)
    expect(branchIndex, 'la branche du total a disparu — la garde ne sait plus où regarder').toBeGreaterThan(-1)
    expect(labelIndex, 'le libellé doit précéder la branche, pas la suivre').toBeLessThan(branchIndex)
  })
})

/**
 * Un groupe « libellé + valeur » : le libellé et sa valeur vivent dans le MÊME
 * conteneur, immédiats — c'est cette proximité structurelle que le défaut
 * cassait (une valeur seule, sans frère porteur d'un nom).
 */
function labelledValue(container: HTMLElement, label: string): { group: Element; value: string } | null {
  const labelNode = within(container).queryByText(label)
  if (!labelNode) return null
  const group = labelNode.parentElement
  if (!group || group.children.length < 2) return null
  const valueNode = Array.from(group.children).find(child => child !== labelNode)
  if (!valueNode) return null
  return { group, value: valueNode.textContent ?? '' }
}

describe('GA-134 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut — une valeur seule, sans frère nommé', () => {
    // La forme d'AVANT le correctif : l'UnknownValue est un enfant UNIQUE de
    // la ligne de tête, aucun libellé ne l'accompagne.
    const faulty = document.createElement('div')
    faulty.innerHTML = '<div class="flex"><p title="raison">non mesuré — aucun montant saisi sur 1 projet</p></div>'
    expect(labelledValue(faulty, LABEL)).toBeNull()

    // La forme CORRIGÉE : le libellé et la valeur sont deux enfants du même
    // groupe.
    const fixed = document.createElement('div')
    fixed.innerHTML = `<div class="flex"><span>${LABEL}</span><p title="raison">non mesuré — aucun montant saisi sur 1 projet</p></div>`
    const found = labelledValue(fixed, LABEL)
    expect(found).not.toBeNull()
    expect(found?.value).toMatch(/non mesuré/)
  })

  it('un libellé qui ne PRÉCÈDE plus rien de mesurable est aussi refusé', () => {
    // Le libellé existe, mais seul dans son groupe — le défaut inverse : une
    // ligne qui NOMME et ne dit rien.
    const lonely = document.createElement('div')
    lonely.innerHTML = `<div class="flex"><span>${LABEL}</span></div>`
    expect(labelledValue(lonely, LABEL)).toBeNull()
  })
})

describe('GA-134 — aucune des trois valeurs du bandeau ne se rend sans son libellé', () => {
  it.each([
    ['vide — zéro est VRAI', EMPTY],
    ['non mesuré — la donnée exacte de la recette du 30/08', NOT_MEASURED],
    ['mesuré', MEASURED],
  ])('la valeur du pipe (%s) porte « pipe ouvert HT » juste à côté d’elle', (_label, summary) => {
    const { container } = render(
      <PipelineBoard summary={summary} projects={summary.total_count > 0 ? [project()] : []} onSelect={() => {}} />,
    )
    const found = labelledValue(container, LABEL)
    expect(found, 'le libellé « pipe ouvert HT » est introuvable, ou seul dans son groupe').not.toBeNull()
  })

  it('les deux voisines — intake et pistes — ne se rendent pas non plus en nombre nu', () => {
    /*
     * LA RÈGLE N'A PAS BOUGÉ, SON ADRESSE OUI (#4499, Louis 23/10/2026).
     *
     * Avant : la carte « Affaires à qualifier » du Pipeline, les pistes en metadata. Depuis la ligne de synthèse,
     * la file de qualification se lit depuis l'onglet Besoins (`IntakeQueueLine`) : la garde la suit là.
     *
     * Ce qu'elle continue d'interdire est identique : qu'un de ces deux nombres se retrouve seul, sans rien qui
     * dise ce qu'il compte. Elle le vérifie par la STRUCTURE (« 428 » a un frère nommé).
     */
    const { container } = render(<IntakeQueueLine intake={428} pistesToReview={222} />)
    const intake = labelledValue(container, 'Affaires à qualifier')
    expect(intake, '« Affaires à qualifier » est introuvable, ou son nombre est seul dans son groupe').not.toBeNull()
    expect(intake?.value).toMatch(/428/)

    // Les pistes restent une phrase complète, jamais réduites à « 222 ».
    const pistes = screen.getByText('222 pistes à revoir')
    expect(pistes.textContent).not.toBe('222')
  })

  it('NON : le Pipeline ne rend plus la carte « Affaires à qualifier » (elle vit dans l’onglet Besoins)', () => {
    const { container } = render(<PipelineBoard summary={NOT_MEASURED} projects={[project()]} onSelect={() => {}} />)
    expect(labelledValue(container, 'Affaires à qualifier')).toBeNull()
  })
})
