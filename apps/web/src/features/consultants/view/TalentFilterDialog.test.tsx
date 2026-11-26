import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TALENT_ADVANCED_FILTERS_UNAVAILABLE } from '../lib/talentAdvancedFilters'
import { TalentFilterDialog } from './TalentFilterDialog'
import { chooseOption, selectedValue } from '@/test/select'

/**
 * La modale « Filtrer mon vivier » (#4500, refonte V22) — l'ancien tiroir « Plus de
 * filtres » (manque A du 30/08, élargi le 31/08/2026 — PDF-22 §01) et les filtres
 * de la barre, réunis.
 *
 * Onze critères désormais réels côté serveur, dont deux arrivés en dernier —
 * le rayon (avec sa ville) et les années d'expérience minimum. Le registre
 * `TALENT_ADVANCED_FILTERS_UNAVAILABLE` est VIDE : plus rien à nommer comme
 * hors d'atteinte, et le bloc qui l'affichait a disparu avec lui.
 *
 * #2152.37 — `SavedTalentViews` (pied du tiroir) a SES tests dédiés
 * (`SavedTalentViews.test.tsx`) ; mocké ici comme dans `NeedsFilterDrawer`
 * (`SavedNeedViews` y est laissé réel, mais ce fichier-ci ne monte pas de
 * `QueryClientProvider`/`SessionProvider` — les trois hooks qu'il consomme
 * sont donc mockés, hors sujet pour un fichier qui mesure le TIROIR).
 */
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSavedView: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'me' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function draw(props: Partial<Parameters<typeof TalentFilterDialog>[0]> = {}) {
  const onApply = vi.fn()
  const onView = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <TalentFilterDialog
      open
      query={{ skills: [] }}
      activeView={null}
      onApply={(patch, view) => {
        onApply(patch)
        onView(view)
      }}
      onOpenChange={onOpenChange}
      {...props}
    />,
  )
  return { onApply, onView, onOpenChange }
}

describe('TalentFilterDialog — la modale « Filtrer mon vivier » (#4500)', () => {
  /**
   * #2182.54 — LA FRAÎCHEUR.
   *
   * `dormantMonths` vivait dans le contrat et en SQL depuis des mois, et
   * n'était atteignable QUE par la vue « Dormants », figée à six. On ne pouvait
   * pas demander « qui n'a pas été touché depuis un an » sans quitter l'écran.
   */
  it('#2182.54 — applique la fraîcheur en MOIS, et jamais « 0 mois »', async () => {
    cleanup()
    const { onApply } = draw()
    expect(screen.getByLabelText('Fraîcheur')).toBeInTheDocument()
    // Sans choix, le critère n'est PAS envoyé : « indifférent » est l'absence
    // du filtre, pas « contacté aujourd'hui » — qui viderait le vivier.
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ dormantMonths: undefined }))

    cleanup()
    const posed = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Fraîcheur' }), '12')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ dormantMonths: 12 }))
  })

  it('#2182.54 — rouvrir montre la fraîcheur RÉELLEMENT appliquée', async () => {
    cleanup()
    draw({ query: { skills: [], dormantMonths: 6 } })
    expect(await selectedValue(screen.getByRole('combobox', { name: 'Fraîcheur' }))).toBe('6')
    cleanup()
  })

  it('porte un contrôle pour chacun des QUATORZE critères désormais réels', () => {
    cleanup()
    draw()
    expect(screen.getByLabelText('Disponibilité déclarée')).toBeInTheDocument()
    expect(screen.getByLabelText('Séniorité')).toBeInTheDocument()
    expect(screen.getByLabelText('Ville')).toBeInTheDocument()
    expect(screen.getByLabelText('Rayon')).toBeInTheDocument()
    expect(screen.getByLabelText('TJM minimum')).toBeInTheDocument()
    expect(screen.getByLabelText('TJM maximum')).toBeInTheDocument()
    expect(screen.getByLabelText(/années d.expérience/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Langue parlée')).toBeInTheDocument()
    expect(screen.getByLabelText('CV disponible')).toBeInTheDocument()
    expect(screen.getByLabelText('En mission')).toBeInTheDocument()
    expect(screen.getByLabelText('Mode de travail')).toBeInTheDocument()
    expect(screen.getByLabelText('Dernière mission')).toBeInTheDocument()
    expect(screen.getByLabelText('Consentement')).toBeInTheDocument()
    expect(screen.getByLabelText('Complétude de fiche')).toBeInTheDocument()
  })

  /**
   * #2182.23 / #2182.53 — « SANS MISSION », distinct de la fraîcheur (contact).
   */
  it('#2182.23 / #2182.53 — applique « sans mission » en MOIS, et jamais « 0 mois »', async () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ noMissionMonths: undefined }))

    cleanup()
    const posed = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Dernière mission' }), '12')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ noMissionMonths: 12 }))
  })

  it('#2182.23 / #2182.53 — rouvrir montre « sans mission » RÉELLEMENT appliqué', async () => {
    cleanup()
    draw({ query: { skills: [], noMissionMonths: 6 } })
    expect(await selectedValue(screen.getByRole('combobox', { name: 'Dernière mission' }))).toBe('6')
    cleanup()
  })

  /** #2182.51 — LE CONSENTEMENT. */
  it('#2182.51 — applique l’état du consentement choisi', async () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ consentState: undefined }))

    cleanup()
    const posed = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Consentement' }), 'expiring')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ consentState: 'expiring' }))
  })

  /** #2182.21 — LA COMPLÉTUDE DE FICHE. */
  it('#2182.21 — applique la complétude choisie', async () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ completeness: undefined }))

    cleanup()
    const posed = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Complétude de fiche' }), 'enriched')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ completeness: 'enriched' }))
  })

  it('#2182.21 — rouvrir montre la complétude RÉELLEMENT appliquée', async () => {
    cleanup()
    draw({ query: { skills: [], completeness: 'incomplete' } })
    expect(await selectedValue(screen.getByRole('combobox', { name: 'Complétude de fiche' }))).toBe('incomplete')
    cleanup()
  })

  it('n’affiche PLUS le bloc « ce tiroir ne filtre pas encore » — le registre est vide', () => {
    cleanup()
    draw()
    expect(TALENT_ADVANCED_FILTERS_UNAVAILABLE).toEqual([])
    expect(screen.queryByText('Ce tiroir ne filtre pas encore')).not.toBeInTheDocument()
  })

  it("n'applique qu'au clic sur Appliquer — pas à chaque frappe", async () => {
    cleanup()
    const { onApply } = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Séniorité' }), 'senior')
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ seniority: 'senior', availability: undefined, zone: undefined }),
    )
  })

  it('applique les critères déjà réels le 31/08 — ville, TJM min/max, langue, CV disponible, en mission, mode de travail', async () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: 'Lyon' } })
    fireEvent.change(screen.getByLabelText('TJM minimum'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('TJM maximum'), { target: { value: '900' } })
    fireEvent.change(screen.getByLabelText('Langue parlée'), { target: { value: 'en' } })
    fireEvent.click(screen.getByLabelText('CV disponible'))
    await chooseOption(screen.getByRole('combobox', { name: 'En mission' }), 'yes')
    await chooseOption(screen.getByRole('combobox', { name: 'Mode de travail' }), 'hybride')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        zone: 'Lyon',
        minTjm: 400,
        maxTjm: 900,
        language: 'en',
        cvAvailable: true,
        onMission: 'yes',
        remotePreference: 'hybride',
      }),
    )
  })

  it('applique le rayon UNIQUEMENT avec une ville', async () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: 'Paris' } })
    await chooseOption(screen.getByRole('combobox', { name: 'Rayon' }), '50')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ zone: 'Paris', radiusKm: 50 }))
  })

  it('n’envoie JAMAIS un rayon sans ville — un rayon n’a pas de centre', async () => {
    cleanup()
    const { onApply } = draw()
    await chooseOption(screen.getByRole('combobox', { name: 'Rayon' }), '50')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ zone: undefined, radiusKm: undefined }))
  })

  it('applique les années d’expérience minimum', async () => {
    cleanup()
    const { onApply } = draw()
    // C'est un MENU (`Choice`), pas un champ saisi : `fireEvent.change` n'y
    // faisait rien depuis le passage à `SelectField`.
    await chooseOption(screen.getByRole('combobox', { name: /années d.expérience/i }), '5')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ minYearsExperience: 5 }))
  })

  it('« CV disponible » n’envoie JAMAIS `false` — absent veut dire indifférent, pas « sans CV »', () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ cvAvailable: undefined }))
  })

  it('#2182.55 — « Compétences prouvées uniquement » n’envoie JAMAIS `false`, envoie `true` une fois activé', () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ provenSkillsOnly: undefined }))

    cleanup()
    const posed = draw()
    fireEvent.click(screen.getByLabelText('Compétences prouvées uniquement'))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ provenSkillsOnly: true }))
  })

  it('#4500 (maquette A12) — « Mes favoris » pose `favorite: mine`, jamais `false`, et se relit à la réouverture', () => {
    cleanup()
    const { onApply } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ favorite: undefined }))

    cleanup()
    const posed = draw()
    fireEvent.click(screen.getByLabelText('Mes favoris'))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(posed.onApply).toHaveBeenCalledWith(expect.objectContaining({ favorite: 'mine' }))

    cleanup()
    draw({ query: { skills: [], favorite: 'mine' } })
    expect(screen.getByLabelText('Mes favoris')).toBeChecked()
  })

  it('rouvrir montre ce qui est RÉELLEMENT appliqué, pas un brouillon abandonné', async () => {
    cleanup()
    const { rerender } = render(
      <TalentFilterDialog
        open={false}
        activeView={null}
        query={{ skills: [], seniority: 'expert', zone: 'Paris', radiusKm: 50, minTjm: 500, minYearsExperience: 10 }}
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )
    rerender(
      <TalentFilterDialog
        open
        activeView={null}
        query={{ skills: [], seniority: 'expert', zone: 'Paris', radiusKm: 50, minTjm: 500, minYearsExperience: 10 }}
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )
    expect(await selectedValue(screen.getByLabelText('Séniorité'))).toBe('expert')
    expect(screen.getByLabelText('Ville')).toHaveValue('Paris')
    expect(await selectedValue(screen.getByLabelText('Rayon'))).toBe('50')
    expect(screen.getByLabelText('TJM minimum')).toHaveValue(500)
    expect(await selectedValue(screen.getByLabelText(/années d.expérience/i))).toBe('10')
  })

  it('Réinitialiser vide le brouillon, y compris le rayon et les années d’expérience', async () => {
    cleanup()
    draw({
      query: {
        skills: [],
        seniority: 'senior',
        availability: 'immediate',
        zone: 'Lyon',
        radiusKm: 100,
        minTjm: 400,
        maxTjm: 900,
        minYearsExperience: 5,
        cvAvailable: true,
      },
    })
    fireEvent.click(screen.getByText('Réinitialiser'))
    expect(await selectedValue(screen.getByLabelText('Séniorité'))).toBe('')
    expect(await selectedValue(screen.getByLabelText('Disponibilité déclarée'))).toBe('')
    expect(screen.getByLabelText('Ville')).toHaveValue('')
    expect(await selectedValue(screen.getByLabelText('Rayon'))).toBe('')
    expect(screen.getByLabelText('TJM minimum')).toHaveValue(null)
    expect(await selectedValue(screen.getByLabelText(/années d.expérience/i))).toBe('')
    expect(screen.getByLabelText('CV disponible')).not.toBeChecked()
  })

  it('#4500 — les critères de l’ANCIENNE BARRE sont dans la modale : vue rapide, type de profil, compétences, secteur, archivés', async () => {
    cleanup()
    const { onApply, onView } = draw()
    for (const label of ['Vue rapide', 'Type de profil', 'Compétences', 'Secteur']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    fireEvent.change(screen.getByLabelText('Compétences'), { target: { value: 'Java, Spring' } })
    fireEvent.change(screen.getByLabelText('Secteur'), { target: { value: 'Banque' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Afficher les archivés' }))
    await chooseOption(screen.getByLabelText('Type de profil'), 'Freelance')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: ['Java', 'Spring'],
        sector: 'Banque',
        includeArchived: true,
        engagementKind: 'freelance',
      }),
    )
    expect(onView).toHaveBeenCalledWith(null)
  })

  it('#4500 — une vue rapide REMPLIT les champs qu’elle touche, visibles et modifiables (« À recontacter » → six mois)', async () => {
    cleanup()
    const { onApply, onView } = draw()
    await chooseOption(screen.getByLabelText('Vue rapide'), 'À recontacter')
    expect(await selectedValue(screen.getByLabelText('Fraîcheur'))).toBe('6')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ dormantMonths: 6 }))
    expect(onView).toHaveBeenCalledWith('dormant')
  })

  it('#4500 — « Candidats » pose le critère caché de la vue ; « Tous les profils » le retire', async () => {
    cleanup()
    const { onApply, onView } = draw({ query: { skills: [], kind: 'candidate' }, activeView: 'candidates' })
    await chooseOption(screen.getByLabelText('Vue rapide'), 'Tous les profils')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: undefined }))
    expect(onView).toHaveBeenCalledWith(null)
  })

  it('#4500 — la forme « Filtrer mon portefeuille » : titre, phrase, Réinitialiser · Appliquer les filtres', () => {
    cleanup()
    draw()
    expect(screen.getByRole('dialog', { name: 'Filtrer mon vivier' })).toBeInTheDocument()
    expect(screen.getByText(/Ces critères organisent les profils de ton vivier/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).toBeInTheDocument()
  })
})
