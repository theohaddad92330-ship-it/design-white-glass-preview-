import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EsnAnswers } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const downloadBlob = vi.fn()
vi.mock('@/lib/pdf-download', () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/onboarding/components/ProfileQuestionnaireDialog', () => ({
  ProfileQuestionnaireDialog: () => <div role="dialog" aria-label="Questionnaire" />,
}))

const { ProfileFramingHeader } = await import('./ProfileFramingHeader')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  downloadBlob.mockReset()
})

/** Théo D settings-espace.R1 / N2 — l'en-tête du profil : audit, export du cadrage, questionnaire. */
describe('ProfileFramingHeader', () => {
  it('porte les trois gestes du cadrage, « Voir mon audit » menant à Ce que Laura a compris', () => {
    render(<ProfileFramingHeader answers={{ esn_name: 'Altaïs Conseil' } as EsnAnswers} />)

    expect(screen.getByRole('heading', { level: 1, name: /profil de travail/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir mon audit' })).toHaveAttribute('href', '/settings/profile/audit')
    expect(screen.getByRole('button', { name: 'Exporter mon cadrage' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Continuer le questionnaire' })).toBeInTheDocument()
  })

  it('« Exporter mon cadrage » télécharge le JSON des seules réponses données', async () => {
    render(<ProfileFramingHeader answers={{ esn_name: 'Altaïs Conseil' } as EsnAnswers} />)
    await userEvent.click(screen.getByRole('button', { name: 'Exporter mon cadrage' }))

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(filename).toMatch(/^cadrage-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = JSON.parse(await blob.text()) as { themes: { answers: Record<string, unknown> }[] }
    expect(parsed.themes[0]?.answers).toEqual({ esn_name: 'Altaïs Conseil' })
  })

  it('NON : sans aucune réponse, l’export est inactif et le compte le dit — jamais « 0 réponse »', () => {
    render(<ProfileFramingHeader answers={{} as EsnAnswers} />)
    expect(screen.getByRole('button', { name: 'Exporter mon cadrage' })).toBeDisabled()
    expect(screen.getByText('Aucune réponse renseignée pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByText(/^0 réponse/)).not.toBeInTheDocument()
  })

  it('« Continuer le questionnaire » ouvre le questionnaire existant, sans le monter avant', async () => {
    render(<ProfileFramingHeader answers={{ esn_name: 'Altaïs Conseil' } as EsnAnswers} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuer le questionnaire' }))
    expect(screen.getByRole('dialog', { name: 'Questionnaire' })).toBeInTheDocument()
  })
})

/**
 * #4818.1 — le cadrage par thème (`ThemeQuestionCard`, `AnswerStatusSelect`) était juste et testé, mais RIEN ne
 * l'amenait à l'écran d'un compte dont l'onboarding est terminé : `/onboarding` le renvoie chez Laura. Le chemin de
 * RELECTURE part du profil, vers le catalogue des thèmes, et la route d'arrivée existe.
 */
describe('#4818.1 — le chemin de relecture du cadrage', () => {
  it('« Relire mon cadrage par thème » mène au catalogue des thèmes', () => {
    render(<ProfileFramingHeader answers={{ esn_name: 'Altaïs Conseil' } as EsnAnswers} />)
    expect(screen.getByRole('link', { name: 'Relire mon cadrage par thème' })).toHaveAttribute(
      'href',
      '/onboarding/themes',
    )
  })

  it('NON : si la route d’arrivée disparaît de l’arbre, ce test échoue', () => {
    const tree = readFileSync(resolve(process.cwd(), 'src/routeTree.gen.ts'), 'utf8')
    expect(tree).toContain("path: '/onboarding/themes/'")
    expect(tree).toContain("path: '/onboarding/themes/$themeId'")
  })
})
