import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SKILL_SOURCES } from '@bellum/contracts'
import type { Consultant } from '@bellum/contracts'
import { chooseOption, optionValues, selectedValue } from '@/test/select'

/**
 * LE NIVEAU **ET LA SOURCE** D'UNE COMPÉTENCE (PDF-02 §3.2, l. 218).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET CE QUI NE MANQUAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La source EXISTAIT partout sauf là où on la pose : quatre valeurs au contrat,
 * une contrainte SQL qui les tient, une puce qui les affiche, une fiche qui les
 * affiche, et un tri du vivier qui fait remonter `mission` en premier. Le seul
 * chemin d'écriture du produit écrivait `'declared'` EN DUR.
 *
 * Deux des quatre valeurs — « confirmé en entretien » et « vu en mission » —
 * étaient donc montrées et impossibles à produire. C'est la forme la plus chère
 * du défaut : elle ne casse rien, elle se découvre en réunion.
 *
 * ⚠️ Ce que ces tests ne demandent PAS : que le formulaire d'enregistrement
 * saisisse le niveau et la source compétence par compétence. Il est court à
 * dessein — « un formulaire qui demande tout reste vide » — et il ANNONCE déjà
 * ce qui sera enregistré (« niveau inconnu, source déclaré »). Ce qui manquait
 * était le geste d'APRÈS, et le chemin pour l'atteindre.
 */

const upsertMutate = vi.fn()

vi.mock('../talent-api', () => ({
  useTalentSkills: () => ({ data: [], isLoading: false, isError: false }),
  useTalentExperiences: () => ({ data: [] }),
  useTalentDocuments: () => ({ data: [], isError: false }),
  useUpsertTalentSkill: () => ({ mutate: upsertMutate, isPending: false }),
  useRemoveTalentSkill: () => ({ mutate: vi.fn() }),
  useValidateTalentSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTalentDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveTalentDocument: () => ({ mutate: vi.fn() }),
}))

const { TalentSkillsDialog } = await import('./TalentSkillsDialog')

const TALENT = { id: 'c-1', full_name: 'Nadia Berrada' } as unknown as Consultant

beforeEach(() => {
  upsertMutate.mockReset()
})
afterEach(cleanup)

function open() {
  render(<TalentSkillsDialog talent={TALENT} open onOpenChange={() => undefined} />)
}

/** Le `<select>` de la source, retrouvé par son NOM accessible — un champ qu'on
 *  ne peut nommer ne s'annonce pas non plus à un lecteur d'écran. */
function sourceSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: /source/i })
}

describe('la source d’une compétence se SAISIT', () => {
  it('offre les quatre sources du contrat, et pas trois', async () => {
    open()
    // La garde LIT : sans cette assertion, une liste vidée passerait au vert.
    expect(SKILL_SOURCES.length).toBe(4)
    const options = await optionValues(sourceSelect())
    expect(options).toEqual([...SKILL_SOURCES])
  })

  it('part sur « déclaré » — une preuve ne se pose pas d’un clic distrait', async () => {
    open()
    expect(await selectedValue(sourceSelect())).toBe('declared')
  })

  it('ENVOIE la source choisie — c’était `declared` en dur', async () => {
    open()
    fireEvent.change(screen.getByRole('textbox', { name: /^Compétence$/ }), { target: { value: 'Kubernetes' } })
    await chooseOption(sourceSelect(), 'interview')
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }))

    expect(upsertMutate).toHaveBeenCalledTimes(1)
    const [payload] = upsertMutate.mock.calls[0] as [{ skill: string; source: string; level: string }]
    expect(payload.skill).toBe('Kubernetes')
    expect(payload.source).toBe('interview')
  })

  it('sait dire NON — sans choix, la source envoyée reste « déclaré »', () => {
    // Le NON de la règle précédente : si le champ ne pilotait rien, le test
    // au-dessus passerait AUSSI avec une valeur en dur. Celui-ci le distingue.
    open()
    fireEvent.change(screen.getByRole('textbox', { name: /^Compétence$/ }), { target: { value: 'Terraform' } })
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }))

    const [payload] = upsertMutate.mock.calls[0] as [{ source: string }]
    expect(payload.source).toBe('declared')
  })

  it('n’envoie rien sur un libellé vide — une compétence sans nom n’existe pas', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }))
    expect(upsertMutate).not.toHaveBeenCalled()
  })

  it('DIT ce que la source engage, au moment où on la choisit', () => {
    open()
    // La phrase, pas le libellé de l'option : « vu en mission » apparaît AUSSI
    // dans la liste déroulante, et un test qui les confondrait passerait au
    // vert sur une aide de saisie absente.
    expect(screen.getByText(/pas le niveau, qu’un client vérifie/i)).toBeTruthy()
  })
})
