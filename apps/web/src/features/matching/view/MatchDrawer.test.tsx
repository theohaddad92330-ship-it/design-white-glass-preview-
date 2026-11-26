import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MatchResult, MatchRun } from '@bellum/contracts'
import type { ActionableNeed } from '../../projects/open-needs/model/need-actions'

/**
 * Le routeur, réduit à ce que ces tests mesurent (même patron que
 * `MissionsTable.test.tsx`). #2176.42 ouvre la fiche du consultant : un
 * `RouterProvider` complet coûterait un arbre entier pour vérifier un `href`.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce((current, [key, value]) => current.replace('$' + key, value), to)
    const qs = search ? `?${new URLSearchParams(search).toString()}` : ''
    return (
      <a href={`${path}${qs}`} {...rest}>
        {children}
      </a>
    )
  },
}))

// #2178.23/.41 — le sélecteur du reverse market lit le vivier via ce hook.
// Fixture déterministe : un actif (proposable), un archivé (jamais proposé —
// #2178.15 est un geste séparé).
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({
    data: [
      { id: 'c0000000-0000-4000-8000-000000000001', full_name: 'Amine T.', archived_at: null },
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        full_name: 'Zoé B. (archivée)',
        archived_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  }),
  // #2936 — `RelaunchConsultantDialog` (toujours monté par `Bucket`, quel que
  // soit `consultantId`) et `useConfirmTalentAvailability` (#2176.44) : ces
  // tests ne portent pas sur ces deux gestes, mocks minimaux.
  useConsultant: () => ({ data: undefined, isLoading: false }),
  useConfirmTalentAvailability: () => ({ mutate: vi.fn() }),
}))

import { MatchDrawer } from './MatchDrawer'

/**
 * Le panneau, monté pour de vrai.
 *
 * La leçon du chantier précédent : un composant peut être vert en test unitaire
 * et inerte une fois monté. On vérifie donc ce qu'un utilisateur VOIT — les
 * quatre blocs, le bandeau non masquable, les compteurs par motif — et pas
 * seulement ce que le code déclare.
 */

function result(over: Partial<MatchResult> & Pick<MatchResult, 'consultantId'>): MatchResult {
  return {
    // Le moteur rend TOUJOURS les treize axes, dont certains à `null`. Le fixture
    // en porte quatre, dont trois évaluables : c'est le minimum sous lequel la
    // carte refuse d'écrire un score (« un score n'est jamais nu »).
    axes: [
      { axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] },
      { axis: 'availability', score: 100, weight: 12, detail: 'disponible', evidence: [] },
      { axis: 'seniority', score: 70, weight: 10, detail: 'senior', evidence: [] },
      { axis: 'language', score: null, weight: 5, detail: 'aucune langue demandée', evidence: [] },
    ],
    correspondenceScore: 84,
    pushableScore: 71,
    bucket: 'recommended',
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
    ...over,
  }
}

const RUN: MatchRun = {
  runId: '44444444-4444-4444-8444-444444444444',
  need: {
    needId: '11111111-1111-4111-8111-111111111111',
    role: 'Data Engineer',
    accountName: 'EDF DSI',
    accountSector: 'énergie',
    projectSectors: [],
    skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: 'Paris',
    remote: null,
    startOn: '2026-09-15',
    targetRateCents: null,
    contractKind: 'regie',
  },
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
    client_history: 3,
    comparable_experience: 0,
  },
  threshold: 60,
  evaluatedCount: 3,
  prefilteredCount: 0,
  truncated: false,
  recommended: [result({ consultantId: 'a0000000-0000-4000-8000-000000000001' })],
  borderline: [result({ consultantId: 'a0000000-0000-4000-8000-000000000002', bucket: 'borderline' })],
  notEvaluable: [
    result({
      consultantId: 'a0000000-0000-4000-8000-000000000003',
      bucket: 'not_evaluable',
      exclusions: [{ reason: 'no_skills_recorded', severity: 'not_evaluable', detail: 'aucune compétence' }],
    }),
  ],
  excluded: [
    result({
      consultantId: 'a0000000-0000-4000-8000-000000000004',
      bucket: 'excluded',
      exclusions: [{ reason: 'missing_required_skill', severity: 'blocking', detail: 'Spark absent' }],
    }),
  ],
  exclusionCounts: [{ reason: 'missing_required_skill', count: 1 }],
  nextBestMove: null,
  feedbackLearnings: [],
  identities: [
    {
      consultantId: 'a0000000-0000-4000-8000-000000000001',
      fullName: 'Sophie M.',
      title: 'Data Engineer',
      dailyRateCents: 65000,
      availableFrom: '2026-10-15',
      location: 'Lyon',
    },
    {
      consultantId: 'a0000000-0000-4000-8000-000000000002',
      fullName: 'Pierre L.',
      title: null,
      dailyRateCents: null,
      availableFrom: null,
      location: null,
    },
    {
      consultantId: 'a0000000-0000-4000-8000-000000000003',
      fullName: 'Inès K.',
      title: null,
      dailyRateCents: null,
      availableFrom: null,
      location: null,
    },
    {
      consultantId: 'a0000000-0000-4000-8000-000000000004',
      fullName: 'Marc O.',
      title: null,
      dailyRateCents: null,
      availableFrom: null,
      location: null,
    },
  ],
  createdAt: '2026-09-01T10:00:00.000Z',
}

function mount(run: MatchRun | null = RUN, need?: ActionableNeed) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const identities = new Map(
    (run?.identities ?? []).map(entry => [
      entry.consultantId,
      {
        fullName: entry.fullName,
        title: entry.title,
        dailyRateCents: entry.dailyRateCents,
        availableFrom: entry.availableFrom,
        location: entry.location,
      },
    ]),
  )
  return render(
    <QueryClientProvider client={client}>
      <MatchDrawer
        run={run}
        needId="11111111-1111-4111-8111-111111111111"
        identities={identities}
        need={need}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('le panneau de matching', () => {
  beforeEach(() => cleanup())

  it('affiche les QUATRE blocs, jamais trois', () => {
    mount()
    expect(screen.getByText(/Recommandés \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Limites \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Non évaluables \(1\)/)).toBeTruthy()
    expect(screen.getByText(/Écartés \(1\)/)).toBeTruthy()
  })

  /**
   * #2773 — recette prod 08/10 : « Lancer le matching » ne débite aucun
   * crédit (vrai — `MatchRun` n'a jamais porté de champ coût), mais rien à
   * l'écran ne le disait. Le panneau doit le nommer, pas le laisser deviner.
   */
  it('#2773 / #4463 — annonce que c’est gratuit, sans parler de crédit', () => {
    mount()
    expect(screen.getByText('Gratuit.')).toBeTruthy()
    expect(screen.queryByText(/crédit/i)).toBeNull()
  })

  it('porte le bandeau de transparence, sans aucun moyen de le masquer', () => {
    mount()
    expect(screen.getByText(/produit par un système d'IA/)).toBeTruthy()
    // Le panneau vit dans un portail : on cherche dans le document, pas dans le
    // conteneur de rendu. Aucun bouton dans le bandeau — ni croix, ni « ne plus
    // afficher » : la mention n'est pas une préférence d'interface.
    const note = document.querySelector('[role="note"]')
    expect(note).toBeTruthy()
    expect(note?.querySelector('button')).toBeNull()
  })

  it('replie « Écartés » et montre son compteur par motif', () => {
    mount()
    // Le compteur est visible même replié : c'est lui qui rend « 34 ne collent
    // pas » lisible sans noyer les cinq qui comptent.
    expect(screen.getByText(/compétence obligatoire absente · 1/)).toBeTruthy()
    expect(screen.queryByText('Marc O.')).toBeNull()
    fireEvent.click(screen.getByText(/Écartés \(1\)/))
    expect(screen.getByText('Marc O.')).toBeTruthy()
  })

  // Décision Louis (refonte Théo C, rapprochement) — la correspondance s'écrit EN CLAIR, jamais en points.
  it('n’affiche aucun score en points sur les cartes', () => {
    mount()
    expect(screen.queryAllByText('Correspondance')).toEqual([])
    expect(screen.queryAllByText('Poussable')).toEqual([])
  })

  it('ne propose la comparaison qu’à partir de deux profils cochés', () => {
    mount()
    expect(screen.queryByText('Axe')).toBeNull()
    fireEvent.click(screen.getByLabelText('Sélectionner Sophie M. pour la comparaison'))
    expect(screen.queryByText('Axe')).toBeNull()
    fireEvent.click(screen.getByLabelText('Sélectionner Pierre L. pour la comparaison'))
    expect(screen.getByText('Axe')).toBeTruthy()
  })

  it('n’écrit JAMAIS « 0 » sur un profil que le pré-filtrage a écarté avant tout calcul', () => {
    // Le pré-filtrage coupe AVANT les treize axes, pour une raison de performance.
    // Le service compose alors un résultat `axes: []` avec deux scores à zéro —
    // le contrat ne les accepte pas nullables. La carte imprimait donc
    // « Correspondance 0 · Poussable 0 » sur quelqu'un que PERSONNE n'a noté :
    // c'est un chiffre inventé à l'écran, sur le seul bloc dont la raison d'être
    // est d'expliquer pourquoi on n'a pas proposé la personne.
    //
    // Doctrine du dépôt, deux lignes qui disent la même chose ici : « une valeur
    // absente ne s'affiche JAMAIS 0 » et « un score n'est jamais nu — sous trois
    // axes, il n'y a pas de score ». Le MOTIF, lui, reste affiché : c'est le seul
    // qui soit vrai.
    mount({
      ...RUN,
      prefilteredCount: 1,
      excluded: [
        {
          consultantId: 'a0000000-0000-4000-8000-000000000004',
          axes: [],
          correspondenceScore: 0,
          pushableScore: 0,
          bucket: 'excluded',
          exclusions: [{ reason: 'consent_expired', severity: 'blocking', detail: 'consentement expiré' }],
          skills: [],
          gaps: [],
          adjacency: [],
          questionsToValidate: [],
          flags: [],
        },
      ],
    })
    fireEvent.click(screen.getByText(/Écartés \(1\)/))
    expect(screen.getByText('Marc O.')).toBeTruthy()
    expect(screen.queryAllByText('0')).toEqual([])
    // Le motif, lui, est dû : c'est l'exigence de conformité du §4.1.
    expect(screen.getAllByText('consentement expiré').length).toBeGreaterThan(0)
  })

  it('un profil réellement noté dit ses critères étayés et à confirmer, jamais son score', () => {
    // Le sens inverse : la règle n'efface pas ce qu'on a calculé — elle le dit en mots.
    mount({
      ...RUN,
      recommended: [
        result({
          consultantId: 'a0000000-0000-4000-8000-000000000001',
          axes: [
            { axis: 'must_have', score: 100, weight: 25, detail: '', evidence: [] },
            { axis: 'availability', score: 80, weight: 12, detail: '', evidence: [] },
            { axis: 'seniority', score: 70, weight: 10, detail: '', evidence: [] },
            { axis: 'language', score: null, weight: 5, detail: '', evidence: [] },
          ],
        }),
      ],
    })
    expect(screen.queryAllByText('84')).toEqual([])
    expect(screen.queryAllByText('71')).toEqual([])
    expect(screen.getAllByTestId('match-criteria-counts')[0]).toHaveTextContent('3 critères étayés · 1 à confirmer')
  })

  it('dit qu’il calcule plutôt que d’afficher un panneau vide', () => {
    mount(null)
    expect(screen.getByText(/Je compare les profils/)).toBeTruthy()
  })

  // #2331 — un zéro résultat propose toujours un arbitrage nommé : le calcul
  // (`nextBestMove`, apps/api/.../matching/next-best-move.ts) existait déjà,
  // testé côté service, sans qu'aucun écran ne le lise. Ce test échoue tant
  // que le panneau ne RENVOIE PAS ces libellés — pas seulement que la donnée
  // existe dans le run.
  it('propose les arbitrages nommés quand aucun profil ne mérite d’être proposé (#2331)', () => {
    mount({
      ...RUN,
      recommended: [],
      borderline: [],
      nextBestMove: ['negocier', 'sourcer', 'reverse_market', 'refuser'],
    })
    expect(screen.getByText(/Aucun profil ne mérite d’être proposé aujourd’hui/)).toBeTruthy()
    expect(screen.getByText('Négocier un critère (TJM, contrat…)')).toBeTruthy()
    expect(screen.getByText('Sourcer de nouveaux profils')).toBeTruthy()
    expect(screen.getByText('Trouver des missions')).toBeTruthy()
    expect(screen.getByText('Décliner ce besoin')).toBeTruthy()
    // Non retenu par le calcul pour CE run : ne doit pas être affiché.
    expect(screen.queryByText('Clarifier le besoin avec le client')).toBeNull()
  })

  it('ne montre aucun arbitrage tant qu’au moins un profil est défendable', () => {
    mount() // RUN par défaut : un recommandé, un limite, nextBestMove: null
    expect(screen.queryByText(/Aucun profil ne mérite d’être proposé aujourd’hui/)).toBeNull()
  })

  // #2178.1-.6/.9 — le diagnostic NOMMÉ, pas seulement un compteur replié sous
  // « Écartés ». Le fixture `RUN` porte déjà un écarté (`missing_required_skill`)
  // et un non-évaluable (`no_skills_recorded`) : ce test échoue tant que ces
  // deux causes ne remontent pas EN TÊTE du panneau, avant les arbitrages.
  it('nomme les causes d’un zéro résultat, avant les arbitrages (#2178)', () => {
    mount({
      ...RUN,
      recommended: [],
      borderline: [],
      nextBestMove: ['sourcer', 'refuser'],
    })
    expect(screen.getByText('Pourquoi zéro profil ?')).toBeTruthy()
    // Le même libellé existe aussi, replié, sous le compteur du bloc « Écartés » —
    // ce test vérifie qu'il remonte AUSSI en tête, pas qu'il n'existe qu'une fois.
    expect(screen.getAllByText('compétence obligatoire absente · 1').length).toBeGreaterThan(0)
    // Non évaluable ≠ écarté : nommé à part, jamais confondu avec un refus.
    expect(screen.getByText('aucune compétence saisie · non évaluable · 1')).toBeTruthy()
  })

  it('ne nomme aucune cause tant qu’au moins un profil est défendable', () => {
    mount() // RUN par défaut : un recommandé, un limite
    expect(screen.queryByText('Pourquoi zéro profil ?')).toBeNull()
  })

  // #2178.33/.34 — la compréhension du besoin se lit, jamais un classement
  // ré-ordonné en silence. Visible même quand un profil EST défendable
  // (RUN par défaut) : ce signal ne dépend pas du zéro résultat.
  it('nomme ce que les refus déjà enregistrés disent de ce besoin, quand il y en a', () => {
    mount({ ...RUN, feedbackLearnings: [{ axis: 'price', belowCount: 3 }] })
    expect(screen.getByText('Ce que les refus déjà reçus disent de ce besoin')).toBeTruthy()
    expect(screen.getByText('Tarif · 3')).toBeTruthy()
  })

  // #2178.33 — le feedback PROPOSE une mise à jour du besoin : le dialogue
  // guidé s'ouvre, origine nommée ; rien n'est écrit sans validation.
  it('#2178.33 — un refus « Tarif » propose de négocier le besoin, origine nommée, sans rien écrire', () => {
    mount({
      ...RUN,
      feedbackLearnings: [
        { axis: 'price', belowCount: 3 },
        { axis: 'personality', belowCount: 1 },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Proposer une mise à jour du besoin d’après « Tarif »' }))
    expect(screen.getByRole('dialog', { name: 'Négocier un critère (TJM, contrat…)' })).toBeTruthy()
    expect(screen.getByText(/Proposé par les retours client \(Tarif\)/)).toBeTruthy()
    // Un axe sans champ du besoin qui lui réponde ne propose rien.
    expect(screen.queryByRole('button', { name: /d’après « Personnalité »/ })).toBeNull()
  })

  it('ne montre rien quand aucun refus n’a encore été enregistré (jamais un décompte à zéro)', () => {
    mount() // RUN par défaut : feedbackLearnings: []
    expect(screen.queryByText('Ce que les refus déjà reçus disent de ce besoin')).toBeNull()
  })

  it('« Expliquer ce classement » OUVRE le document — il ne le télécharge plus', async () => {
    // La leçon du 21/08 : la recette au clic s'arrête au bouton. Le geste
    // existait déjà et ouvrait un ONGLET vers un fichier — sur l'origine de
    // l'application, qui n'est pas celle de l'API. Ce test vérifie que le clic
    // monte le panneau, et pas seulement que le bouton est là.
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    mount()
    fireEvent.click(screen.getAllByText('Expliquer ce classement')[0] as HTMLElement)
    expect(await screen.findByText(/Explication du classement/)).toBeTruthy()
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  // #2176.42 — Action : Ouvrir la fiche (consultant).
  it('« Ouvrir la fiche » mène vers la fiche du consultant, jamais un lien mort', () => {
    mount()
    // Recommandés est le premier bloc rendu, avec Sophie M. comme unique carte.
    const link = screen.getAllByText('Ouvrir la fiche')[0]?.closest('a')
    expect(link?.getAttribute('href')).toBe('/consultants/a0000000-0000-4000-8000-000000000001')
  })

  // #2176.47 — Action : Écarter, un geste EXPLICITE — l'absence de sélection
  // n'en tenait lieu qu'implicitement jusqu'ici.
  it('« Écarter » retire le profil du classement, et le compteur du bloc suit', () => {
    mount()
    expect(screen.getByText(/Recommandés \(1\)/)).toBeTruthy()
    expect(screen.getByText('Sophie M.')).toBeTruthy()
    // Première carte affichée : celle de Sophie M., dans « Recommandés ».
    fireEvent.click(screen.getAllByText('Écarter')[0] as HTMLElement)
    expect(screen.getByText(/Recommandés \(0\)/)).toBeTruthy()
    expect(screen.queryByText('Sophie M.')).toBeNull()
  })

  // #2176.41 — Top profils : 5 en tête, le reste consultable, jamais tronqué
  // en silence.
  // #2330.1/.5 — le verdict NOMMÉ, jamais un pourcentage seul. Recette ÉCRAN
  // 23/09 : le tiroir montrait « Correspondance 59 / Poussable 70 » sans
  // aucun verdict — ce test échoue tant que chaque carte n'en porte pas un.
  it('affiche un verdict NOMMÉ sur chaque profil, jamais un score brut seul (#2330.1/.5)', () => {
    mount()
    // RUN : recommandé (Sophie), limite sans blocage (Pierre), non évaluable
    // (Inès), écarté sur exclusion bloquante (Marc).
    expect(screen.getByText('Fortement défendable')).toBeTruthy()
    expect(screen.getByText('À qualifier')).toBeTruthy()
    expect(screen.getByText('Non évaluable')).toBeTruthy()
    fireEvent.click(screen.getByText(/Écartés \(1\)/))
    expect(screen.getByText('Non défendable')).toBeTruthy()
  })

  it('sépare "limites" en Alternative quand un motif bloquant existe, À qualifier sinon (#2330.5)', () => {
    mount({
      ...RUN,
      borderline: [
        result({
          consultantId: 'a0000000-0000-4000-8000-000000000002',
          bucket: 'borderline',
          exclusions: [{ reason: 'missing_required_skill', severity: 'blocking', detail: 'Spark absent' }],
        }),
      ],
    })
    expect(screen.getByText('Alternative')).toBeTruthy()
    expect(screen.queryByText('À qualifier')).toBeNull()
  })

  // NO-GO (#2330.3/.9) : un must-have absent (exclusion bloquante) place le
  // profil parmi les écartés — le verdict qui s'affiche ne doit JAMAIS être
  // "Fortement défendable", quel que soit le score par ailleurs.
  it('NO-GO : un profil sous exclusion bloquante n’affiche jamais "Fortement défendable" (#2330.3/.9)', () => {
    mount({
      ...RUN,
      recommended: [],
      excluded: [
        result({
          consultantId: 'a0000000-0000-4000-8000-000000000004',
          bucket: 'excluded',
          correspondenceScore: 95,
          pushableScore: 90,
          exclusions: [{ reason: 'missing_required_skill', severity: 'blocking', detail: 'Spark absent' }],
        }),
      ],
    })
    fireEvent.click(screen.getByText(/Écartés \(1\)/))
    expect(screen.getByText('Non défendable')).toBeTruthy()
    expect(screen.queryByText('Fortement défendable')).toBeNull()
  })

  // #2330.6 — la prochaine étape, DÉDUITE du verdict, pas une phrase générique.
  it('propose une prochaine étape déduite du verdict (#2330.6)', () => {
    mount({
      ...RUN,
      recommended: [],
      notEvaluable: [],
      excluded: [],
      borderline: [
        result({
          consultantId: 'a0000000-0000-4000-8000-000000000002',
          bucket: 'borderline',
          questionsToValidate: ['confirmer la disponibilité annoncée'],
        }),
      ],
    })
    expect(screen.getByText(/Prochaine étape/)).toBeTruthy()
    // Apparaît deux fois : une fois dans « à valider », une fois reprise dans
    // la prochaine étape, DÉDUITE de cette question précisément.
    expect(screen.getAllByText(/confirmer la disponibilité annoncée/).length).toBeGreaterThan(0)
  })

  it('plafonne les recommandés à 5, et révèle le reste sur demande', () => {
    const identities = Array.from({ length: 6 }, (_, index) => ({
      consultantId: `b000000${index}-0000-4000-8000-00000000000${index}` as string,
      fullName: `Profil ${index}`,
      title: null,
      dailyRateCents: null,
      availableFrom: null,
      location: null,
    }))
    mount({
      ...RUN,
      recommended: identities.map(entry => result({ consultantId: entry.consultantId })),
      identities,
    })
    expect(screen.getByText(/Recommandés \(6\)/)).toBeTruthy()
    for (let index = 0; index < 5; index += 1) {
      expect(screen.getByText(`Profil ${index}`)).toBeTruthy()
    }
    expect(screen.queryByText('Profil 5')).toBeNull()
    fireEvent.click(screen.getByText('Voir 1 de plus'))
    expect(screen.getByText('Profil 5')).toBeTruthy()
  })

  /**
   * #2178.11-.18/.20/.21/.23/.38 — LA RECETTE : chaque arbitrage nommé est un
   * GESTE cliquable, pas seulement un badge, et le PREMIER est le bouton
   * principal. Un besoin (`ActionableNeed`) minimal pour le geste « refuser »,
   * qui a besoin du statut/compétences pour savoir s'il peut clore.
   */
  const ACTIONABLE_NEED: ActionableNeed = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'to_match',
    skills: [{ term: 'spark', required: true, level: null }],
    archived_at: null,
  }

  it('#2178.21 — le premier arbitrage est le bouton PRINCIPAL, les suivants secondaires', () => {
    mount({ ...RUN, recommended: [], borderline: [], nextBestMove: ['negocier', 'sourcer', 'refuser'] })
    const primary = screen.getByText('Négocier un critère (TJM, contrat…)').closest('button, a')
    const secondary = screen.getByText('Sourcer de nouveaux profils').closest('button, a')
    expect(primary?.className).toContain('bg-[var(--bellum-primary)]')
    expect(secondary?.className).not.toContain('bg-[var(--bellum-primary)]')
  })

  // #2178.11-.17 — les sept gestes guidés n'envoient plus vers une page : ils
  // ouvrent le dialogue guidé sur place (son contenu est éprouvé geste par
  // geste dans `NextBestMoveGestureDialog.test.tsx`).
  it('#2178.11-.17 — chaque geste guidé ouvre son dialogue, jamais un lien vers une page', () => {
    const guided: [NonNullable<MatchRun['nextBestMove']>[number], string][] = [
      ['clarifier', 'Clarifier le besoin avec le client'],
      ['negocier', 'Négocier un critère (TJM, contrat…)'],
      ['elargir', 'Élargir la zone acceptée'],
      ['elargir_contrat', 'Élargir au statut CDI/freelance'],
      ['reactiver', 'Réactiver un profil momentanément indisponible'],
      ['recommandation', 'Demander une recommandation'],
      ['sourcer', 'Sourcer de nouveaux profils'],
    ]
    for (const [option, label] of guided) {
      cleanup()
      mount({ ...RUN, recommended: [], borderline: [], nextBestMove: [option] })
      const trigger = screen.getByText(label).closest('button, a')
      expect(trigger?.tagName).toBe('BUTTON')
      expect(screen.queryByRole('dialog', { name: label })).toBeNull()
      fireEvent.click(trigger as HTMLElement)
      // Le geste ouvre un dialogue PAR-DESSUS le tiroir, titré du geste.
      expect(screen.getByRole('dialog', { name: label })).toBeTruthy()
    }
  })

  it('#2178.18 — partenaire mène au compte du besoin (Partenaires)', () => {
    mount({
      ...RUN,
      recommended: [],
      borderline: [],
      nextBestMove: ['partenaire'],
      need: { ...RUN.need, accountId: 'a9999999-0000-4000-8000-000000000009' },
    })
    expect(screen.getByText('Identifier un partenaire').closest('a')?.getAttribute('href')).toBe(
      '/accounts/a9999999-0000-4000-8000-000000000009?tab=partners',
    )
  })

  it('#2178.16/.18 — se grisent, avec leur raison, quand le besoin n’a pas de compte', () => {
    mount({ ...RUN, recommended: [], borderline: [], nextBestMove: ['partenaire'] })
    const button = screen.getByText('Identifier un partenaire').closest('button')
    expect(button).toBeTruthy()
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(button?.getAttribute('title')).toBe('Ce geste demande le compte du besoin, indisponible ici.')
  })

  it('#2178.20 — refuser ouvre le panneau de motif EXISTANT (même dialogue que le kebab)', () => {
    mount({ ...RUN, recommended: [], borderline: [], nextBestMove: ['refuser'] }, ACTIONABLE_NEED)
    fireEvent.click(screen.getByText('Décliner ce besoin'))
    // Le MÊME panneau que `NeedActionsMenu` pour `close_cancelled` : titre,
    // motif obligatoire, et le bouton de confirmation désactivé tant qu'il
    // est vide — la porte que le kebab impose déjà, rejouée à l'identique.
    expect(screen.getByText('Marquer ce besoin annulé')).toBeTruthy()
    const confirm = screen.getByText('Marquer annulé').closest('button')
    expect(confirm?.hasAttribute('disabled')).toBe(true)
  })

  it('#2178.20 — se grise, avec sa raison, quand le contexte n’a pas le besoin entier', () => {
    mount({ ...RUN, recommended: [], borderline: [], nextBestMove: ['refuser'] })
    const button = screen.getByText('Décliner ce besoin').closest('button')
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(button?.getAttribute('title')).toBe('Ce geste demande le statut du besoin, indisponible ici.')
  })

  it('#2178.23/.41 — reverse market ouvre le sélecteur, qui mène vers la page EXISTANTE d’un consultant', () => {
    mount({ ...RUN, recommended: [], borderline: [], nextBestMove: ['reverse_market'] })
    fireEvent.click(screen.getByText('Trouver des missions'))
    expect(screen.getByText('Chercher un profil fort ailleurs')).toBeTruthy()
    // L'archivé (#2178.15 est un geste séparé) n'apparaît jamais ici.
    expect(screen.queryByText('Zoé B. (archivée)')).toBeNull()
    const link = screen.getByText('Amine T.').closest('a')
    expect(link?.getAttribute('href')).toBe('/consultants/c0000000-0000-4000-8000-000000000001/reverse-market')
  })

  // #2178.38 — RECETTE EXHAUSTIVE : chaque arbitrage de la liste FERMÉE rend
  // un geste cliquable et jamais un simple badge inerte — sinon ce test
  // échoue en nommant lequel.
  it('#2178.38 — chaque arbitrage possible rend un geste cliquable (bouton ou lien), jamais un badge inerte', () => {
    const allOptions: NonNullable<MatchRun['nextBestMove']> = [
      'clarifier',
      'negocier',
      'reactiver',
      'elargir',
      'sourcer',
      'refuser',
      'reverse_market',
      'elargir_contrat',
      'recommandation',
      'partenaire',
    ]
    mount(
      {
        ...RUN,
        recommended: [],
        borderline: [],
        nextBestMove: allOptions,
        need: { ...RUN.need, accountId: 'a9999999-0000-4000-8000-000000000009' },
      },
      ACTIONABLE_NEED,
    )
    const offenders: string[] = []
    for (const option of allOptions) {
      const label = screen.getByText(
        new RegExp(
          '^' +
            (
              {
                clarifier: 'Clarifier le besoin avec le client',
                negocier: 'Négocier un critère',
                reactiver: 'Réactiver un profil momentanément indisponible',
                elargir: 'Élargir la zone acceptée',
                sourcer: 'Sourcer de nouveaux profils',
                refuser: 'Décliner ce besoin',
                reverse_market: 'Trouver des missions',
                elargir_contrat: 'Élargir au statut CDI/freelance',
                recommandation: 'Demander une recommandation',
                partenaire: 'Identifier un partenaire',
              } as Record<string, string>
            )[option],
        ),
      )
      const el = label.closest('button, a')
      if (!el || (el.tagName === 'BUTTON' && el.hasAttribute('disabled'))) offenders.push(option)
    }
    expect(offenders.join(', ')).toBe('')
  })
})
