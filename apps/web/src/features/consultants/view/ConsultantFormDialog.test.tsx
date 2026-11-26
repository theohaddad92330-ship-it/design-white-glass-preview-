import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consultant, TalentDuplicateMatch } from '@bellum/contracts'
import { optionLabels } from '@/test/select'
import { ConsultantFormDialog } from './ConsultantFormDialog'
import { useSkillSuggestion, useTalentDuplicates } from '../talent-api'

/**
 * Le formulaire d'enregistrement d'un consultant (BEL-BO-003, PDF-02 §3.2-3.3).
 *
 * Cinq choses s'y jouent, et chacune a un défaut mesuré derrière elle :
 *
 *  - **le bloc 4 — le consentement** n'existait pas. Les trois valeurs (base
 *    légale, date de recueil, expiration) étaient en LECTURE SEULE sur l'onglet
 *    « Consentement » : aucune fiche ne pouvait passer de « jamais recueilli »
 *    à « recueilli » ;
 *  - **les trois tarifs** n'avaient aucune garde de droit À LA SAISIE. La garde
 *    n'existait qu'en lecture de liste ;
 *  - **la détection de doublon** existait au dépôt de CV et nulle part ailleurs :
 *    le formulaire créait une seconde fiche sans rien dire ;
 *  - **les compétences** étaient un champ texte plat, alors que le niveau et la
 *    source existent depuis le panneau « Compétences » ;
 *  - **le formulaire ne devient pas obligatoire** pour autant. Le refus est
 *    écrit en tête du composant (« un formulaire qui demande tout reste vide »)
 *    et un seul champ reste requis.
 */
vi.mock('../talent-api', () => ({
  useTalentDuplicates: vi.fn(),
  useSkillSuggestion: vi.fn(),
}))

/** Le dialogue ne lit que `data` de ces deux requêtes — le reste n'a pas besoin
 *  d'exister pour que le rendu soit celui de la production. */
type DuplicatesResult = ReturnType<typeof useTalentDuplicates>
type SuggestionResult = ReturnType<typeof useSkillSuggestion>

function mockDuplicates(items: TalentDuplicateMatch[] | undefined) {
  vi.mocked(useTalentDuplicates).mockReturnValue({ data: items } as DuplicatesResult)
}

function mockSuggestion(data: SuggestionResult['data']) {
  vi.mocked(useSkillSuggestion).mockReturnValue({ data } as SuggestionResult)
}

beforeEach(() => {
  cleanup()
  mockDuplicates(undefined)
  mockSuggestion(undefined)
})

function draw(props: Partial<Parameters<typeof ConsultantFormDialog>[0]> = {}) {
  const onSubmit = vi.fn()
  render(
    <ConsultantFormDialog open consultant={null} saving={false} onClose={() => {}} onSubmit={onSubmit} {...props} />,
  )
  return onSubmit
}

/**
 * LES ANNÉES D'EXPÉRIENCE (décision de Louis du 31/08/2026, écran Vivier).
 *
 * Un champ SAISI, distinct de la séniorité (une catégorie) et des années
 * d'UNE compétence — voir `consultantSchema.years_experience` pour la
 * décision complète.
 */
/**
 * #2186.5 — « en mission » (déclarée par la personne) DISTINCT
 * d'« indisponible » (pas mobilisable, pour toute autre raison). Les deux
 * étaient conflatés sous la même valeur d'enum (`indisponible` → libellé « En
 * mission »).
 */
describe('ConsultantFormDialog — disponibilité : en mission distincte d’indisponible', () => {
  it('propose « En mission » comme option SÉPARÉE d’« Indisponible »', async () => {
    draw()
    const labels = await optionLabels(screen.getByRole('combobox', { name: 'Disponibilité' }))
    expect(labels).toContain('En mission')
    expect(labels).toContain('Indisponible')
  })
})

describe('ConsultantFormDialog — les années d’expérience', () => {
  it('se saisit et voyage jusqu’à `onSubmit`', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.change(screen.getByLabelText('Années d’expérience'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ years_experience: '9' }), expect.anything())
  })

  it('reste vide sans saisie — un champ vide n’est jamais envoyé comme un « 0 »', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ years_experience: '' }), expect.anything())
  })
})

describe('ConsultantFormDialog — le bloc consentement', () => {
  it('porte les trois champs du bloc 4', () => {
    draw()
    expect(screen.getByLabelText(/Consentement recueilli le/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Consentement valable jusqu/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Base légale/)).toBeInTheDocument()
  })

  it('reste FACULTATIF — le nom seul suffit toujours à enregistrer', () => {
    // Le refus tenu depuis la première version : un formulaire qui demande tout
    // reste vide. Le bloc consentement s'ajoute, il ne verrouille rien.
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia Fournier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].consent_given_at).toBe('')
  })

  it('dit « jamais recueilli » — et ne dit PAS « expiré »', () => {
    draw()
    expect(screen.getByText(/Jamais recueilli/)).toBeInTheDocument()
    expect(screen.queryByText(/a expiré/)).not.toBeInTheDocument()
  })

  it('dit « expiré » — un autre état, un autre geste — quand la date est passée', () => {
    draw()
    fireEvent.change(screen.getByLabelText(/Consentement recueilli le/), { target: { value: '2020-01-01' } })
    fireEvent.change(screen.getByLabelText(/Consentement valable jusqu/), { target: { value: '2021-01-01' } })
    expect(screen.getByText(/a expiré/)).toBeInTheDocument()
    expect(screen.queryByText(/Jamais recueilli/)).not.toBeInTheDocument()
  })

  it('n’annonce AUCUN blocage sur « jamais recueilli » — décision de Louis du 28/08/2026', () => {
    // `submission-preflight` pose un AVERTISSEMENT sur `none` et un refus sur
    // `expired`. Écrire « ce profil ne peut pas être positionné » sur une fiche
    // sans consentement contredirait le produit sous les yeux de l'utilisateur.
    draw()
    const neverCollected = screen.getByText(/Jamais recueilli/).textContent ?? ''
    expect(neverCollected).not.toMatch(/ne peut pas être positionné/)
  })
})

describe('ConsultantFormDialog — les trois tarifs sous le droit financier', () => {
  it('les montre quand le droit est là', () => {
    draw({ financeVisible: true })
    expect(screen.getByLabelText(/TJM minimum/)).toBeInTheDocument()
  })

  it('les RETIRE et dit pourquoi quand le droit manque', () => {
    draw({ financeVisible: false })
    expect(screen.queryByLabelText(/TJM minimum/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Coût chargé/)).not.toBeInTheDocument()
    expect(screen.getByText(/pas dans ton périmètre/)).toBeInTheDocument()
  })

  it('garde le TJM cible, qui n’est pas sous ce droit', () => {
    draw({ financeVisible: false })
    expect(screen.getByLabelText(/TJM cible/)).toBeInTheDocument()
  })

  it('remonte le droit AVEC le formulaire, pour que l’envoi n’efface rien', () => {
    // Deux endroits qui déduiraient le même droit finiraient par diverger : le
    // dialogue dit ce qu'il a montré, l'appelant s'en sert pour convertir.
    const onSubmit = draw({ financeVisible: false })
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), { finance: false })
  })
})

const YANIS: TalentDuplicateMatch = {
  talentId: 'a',
  fullName: 'Yanis Berthier',
  reason: 'same_name',
  confidence: 0.3,
  // #2327 — une proposition porte ses signaux et ses contradictions.
  signals: ['name'],
  sharedExperiences: 0,
  conflicts: [],
}

describe('ConsultantFormDialog — le doublon à la saisie du nom', () => {
  it('ARRÊTE, nomme la personne ET la raison', () => {
    // Le motif est celui du dépôt de CV : arrêter, nommer, laisser passer sur
    // AFFIRMATION. Un avertissement qu'on peut ignorer sans le lire ne fait rien.
    mockDuplicates([YANIS])
    draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Yanis Berthier' } })
    expect(screen.getByText(/Yanis Berthier/)).toBeInTheDocument()
    expect(screen.getByText(/même nom/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('ne FUSIONNE jamais — elle laisse « créer quand même »', () => {
    mockDuplicates([YANIS])
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Yanis Berthier' } })
    fireEvent.click(screen.getByRole('button', { name: /créer quand même/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('redemande quand le nom CHANGE après l’affirmation', () => {
    // « Ce n'est pas la même personne » porte sur UNE personne. Le garder acquis
    // laisserait passer le doublon suivant en silence.
    mockDuplicates([YANIS])
    draw()
    const name = screen.getByLabelText(/Nom complet/)
    fireEvent.change(name, { target: { value: 'Yanis Berthier' } })
    fireEvent.click(screen.getByRole('button', { name: /créer quand même/ }))
    fireEvent.change(name, { target: { value: 'Yanis Berthiez' } })
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('ne cherche PAS de doublon en ÉDITION — modifier quelqu’un n’en crée pas un second', () => {
    // Sans ce garde-fou, toute fiche ouverte en édition se signalerait comme son
    // propre doublon : « même e-mail », confiance 0,95, sur elle-même.
    draw()
    expect(vi.mocked(useTalentDuplicates).mock.calls.at(-1)?.[1]).toBe(true)

    cleanup()
    vi.mocked(useTalentDuplicates).mockClear()
    draw({ consultant: existingTalent() })
    expect(vi.mocked(useTalentDuplicates).mock.calls.at(-1)?.[1]).toBe(false)
  })
})

function existingTalent(): Consultant {
  return {
    id: '1',
    workspace_id: null,
    kind: 'consultant',
    source: null,
    last_contact_at: null,
    archived_at: null,
    archived_reason: null,
    review_status: 'qualified',
    consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
    full_name: 'Yanis Berthier',
    title: null,
    seniority: 'senior',
    years_experience: null,
    availability: 'immediate',
    available_from: null,
    contract_type: 'cdi',
    engagement_kind: 'salarie',
    partner_account_id: null,
    contact_visible: true,
    finance_visible: true,
    tjm: null,
    stack: [],
    sectors: [],
    zones: [],
    education: [],
    mobility: {
      zones: null,
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
    preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
    references: [],
    languages: [],
    clearances: [],
    wants: null,
    notes: null,
    cv_text: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  } satisfies Consultant
}

// #3813 — une compétence tapée SANS Entrée ne se perd plus à l'enregistrement.
describe('ConsultantFormDialog — le brouillon de compétence est intégré (#3813.1)', () => {
  const stackSent = (onSubmit: ReturnType<typeof vi.fn>) => (onSubmit.mock.calls.at(-1)?.[0] as { stack: string }).stack

  it('« Spring » tapé sans Entrée puis « Enregistrer » → « Spring » est enregistré', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'Spring' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(stackSent(onSubmit)).toBe('Spring')
  })

  it('le brouillon rejoint les puces déjà validées, sans doublon', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    const input = screen.getByLabelText(/^Compétences/)
    fireEvent.change(input, { target: { value: 'Java' } })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    fireEvent.change(input, { target: { value: 'java, Spring' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(stackSent(onSubmit)).toBe('Java, Spring')
  })

  it('quitter le champ (blur) ajoute la compétence tapée', () => {
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    fireEvent.change(input, { target: { value: 'Spring' } })
    fireEvent.blur(input)
    expect(screen.getByRole('button', { name: 'Retirer Spring' })).toBeInTheDocument()
  })

  it('un collage « Java, Spring, Vue » fait 3 compétences', () => {
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    fireEvent.change(input, { target: { value: 'Java, Spring, Vue' } })
    fireEvent.blur(input)
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(3)
  })

  it('« gestion de projet » reste UNE compétence', () => {
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    fireEvent.change(input, { target: { value: 'gestion de projet' } })
    fireEvent.blur(input)
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(1)
  })

  // #3813.2 — en vrai, Tab envoie le focus sur « Ajouter » (même groupe) : le blur
  // ne doit PAS être ignoré, sinon rien n'est ajouté.
  it('Tab depuis le champ (le focus passe à « Ajouter ») ajoute 3 puces', async () => {
    const user = userEvent.setup()
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    await user.click(input)
    await user.type(input, 'Java, Spring, Vue')
    await user.tab()
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(3)
  })

  it('Tab : « gestion de projet » = 1 puce', async () => {
    const user = userEvent.setup()
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    await user.type(input, 'gestion de projet')
    await user.tab()
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(1)
  })

  it('clic sur « Ajouter » : pas de doublon avec le blur', async () => {
    const user = userEvent.setup()
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    await user.type(input, 'Java, Spring')
    await user.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(2)
  })

  it('contrôle négatif : un champ vide n’ajoute rien à l’envoi', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(stackSent(onSubmit)).toBe('')
  })
})

describe('ConsultantFormDialog — les compétences ne sont plus un champ texte plat', () => {
  it('transforme une saisie en PUCE, retirable', () => {
    draw()
    fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'Kubernetes' } })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    expect(screen.getByRole('button', { name: 'Retirer Kubernetes' })).toBeInTheDocument()
  })

  it('DIT le niveau et la source qui seront enregistrés, plutôt que d’en inventer un', () => {
    // Le panneau « Compétences » d'une fiche porte le niveau ET la source. À la
    // création, le semis écrit « inconnu / déclaré » : l'écrire ici évite qu'un
    // recruteur découvre plus tard une évaluation que personne n'a faite.
    draw()
    expect(screen.getByText(/niveau « inconnu »/)).toBeInTheDocument()
    expect(screen.getByText(/source « déclaré »/)).toBeInTheDocument()
  })

  it('n’ajoute jamais deux fois la même compétence', () => {
    draw()
    const input = screen.getByLabelText(/^Compétences/)
    fireEvent.change(input, { target: { value: 'Kubernetes' } })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    fireEvent.change(input, { target: { value: 'kubernetes' } })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    expect(screen.getAllByRole('button', { name: /^Retirer/ })).toHaveLength(1)
  })

  it('PROPOSE l’alias, ne l’applique jamais d’office', () => {
    mockSuggestion({ term: 'k8s', canonical: 'kubernetes', origin: 'referential' })
    draw()
    fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'k8s' } })
    // La proposition s'affiche…
    expect(screen.getByRole('button', { name: /Utiliser « kubernetes »/ })).toBeInTheDocument()
    // …et tant qu'on ne clique pas, c'est le mot ÉCRIT qui est enregistré.
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la compétence/ }))
    expect(screen.getByRole('button', { name: 'Retirer k8s' })).toBeInTheDocument()
  })

  it('applique l’alias quand on le CLIQUE', () => {
    mockSuggestion({ term: 'k8s', canonical: 'kubernetes', origin: 'referential' })
    draw()
    fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'k8s' } })
    fireEvent.click(screen.getByRole('button', { name: /Utiliser « kubernetes »/ }))
    expect(screen.getByRole('button', { name: 'Retirer kubernetes' })).toBeInTheDocument()
  })

  it('ne propose rien quand le référentiel ne reconnaît pas le mot', () => {
    mockSuggestion({ term: 'Outil maison Zephyr', canonical: null, origin: null })
    draw()
    fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'Outil maison Zephyr' } })
    expect(screen.queryByRole('button', { name: /Utiliser/ })).not.toBeInTheDocument()
  })

  it('interroge le référentiel sur le mot DÉBOUNCÉ, pas à chaque frappe', () => {
    // Sans le délai, écrire « kubernetes » ferait dix requêtes, dont neuf sur
    // des mots que personne n'a fini de taper.
    vi.useFakeTimers()
    try {
      draw()
      fireEvent.change(screen.getByLabelText(/^Compétences/), { target: { value: 'k8s' } })
      expect(vi.mocked(useSkillSuggestion).mock.calls.at(-1)?.[0]).toBe('')
      act(() => vi.advanceTimersByTime(400))
      expect(vi.mocked(useSkillSuggestion).mock.calls.at(-1)?.[0]).toBe('k8s')
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * LE NOM DICTÉ PAR LAURA (#1903.16) — la fiche s'ouvre PRÉREMPLIE, pas vide.
 *
 * `prepare_consultant_record` (chat_tools.py) portait déjà `full_name` dans sa
 * proposition, mais rien côté écran ne le reprenait au clic : la carte ouvrait
 * `/consultants`, formulaire fermé. `initialFullName` est le pont, posé une
 * seule fois à l'ouverture — comme `?q=` sur l'écran, ce n'est pas une
 * synchronisation, corriger le nom dans le champ ne doit pas le faire revenir.
 */
describe('ConsultantFormDialog — le nom dicté par Laura (#1903.16)', () => {
  it('préremplit le nom à la CRÉATION', () => {
    draw({ initialFullName: 'Marc Dupont' })
    expect(screen.getByLabelText(/Nom complet/)).toHaveValue('Marc Dupont')
  })

  it('n’écrase jamais le nom réel d’une fiche en ÉDITION', () => {
    draw({ consultant: existingTalent(), initialFullName: 'Un nom dicté sans rapport' })
    expect(screen.getByLabelText(/Nom complet/)).toHaveValue('Yanis Berthier')
  })

  it('sans amorce, le formulaire de création reste vide — comportement inchangé', () => {
    draw()
    expect(screen.getByLabelText(/Nom complet/)).toHaveValue('')
  })
})

/**
 * #3952.2 (retour bêta 08/10) — « faut pouvoir mettre le linkedin » : le champ
 * existe déjà (`public_profile_url`, le même que l'écran Identité du dossier de
 * compétences), mais sous un libellé générique (« Profil public ») que la
 * personne n'a pas reconnu comme LA case LinkedIn. Il se nomme, comme chez un
 * contact (`contacts.json` : « LinkedIn »).
 */
describe('ConsultantFormDialog — le profil public se nomme LinkedIn (#3952.2)', () => {
  it('porte un libellé qui NOMME LinkedIn, pas seulement « profil public »', () => {
    draw()
    expect(screen.getByLabelText(/LinkedIn/)).toBeInTheDocument()
  })

  it('se saisit et voyage jusqu’à `onSubmit` sous son nom de champ existant', () => {
    const onSubmit = draw()
    fireEvent.change(screen.getByLabelText(/Nom complet/), { target: { value: 'Nadia' } })
    fireEvent.change(screen.getByLabelText(/LinkedIn/), { target: { value: 'https://linkedin.com/in/nadia' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ public_profile_url: 'https://linkedin.com/in/nadia' }),
      expect.anything(),
    )
  })
})

/**
 * #5018.1 — un placeholder « 620 » ou « 8 » se lit comme une valeur SAISIE : le
 * commercial croit le TJM ou les années déjà renseignés. Un exemple doit se
 * dire exemple (« ex. 620 »), jamais ressembler à une valeur.
 */
describe('ConsultantFormDialog — les exemples ne ressemblent pas à des valeurs saisies (#5018)', () => {
  it.each([
    ['TJM cible (€/jour)', 'tjm'],
    ['Années d’expérience', 'années'],
  ])('le placeholder du champ « %s » est visiblement indicatif', label => {
    draw()
    const placeholder = (screen.getByLabelText(label) as HTMLInputElement).placeholder
    expect(placeholder).not.toMatch(/^\d+$/)
    expect(placeholder).toMatch(/^(ex\.|e\.g\.)\s/i)
  })
})
