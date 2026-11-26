import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PIPELINE_STAGES, SUBMISSION_STAGES, type PipelineSummary, type ProjectReadRow } from '@bellum/contracts'

// ⚠️ #1394 — l'entête de colonne porte maintenant un `Link` vers la liste
// filtrée (`?stage=`), donc ce fichier a besoin d'un routeur. Le faux recopie
// le `search` DANS le `href` : un faux qui jetterait le paramètre laisserait
// passer exactement le défaut du 28/08 — un lien juste, une recherche perdue.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
  }: {
    children: React.ReactNode
    to?: string
    search?: Record<string, unknown>
    params?: Record<string, string>
  }) => {
    // #4344.2 — les paramètres de chemin entrent dans le `href` : un faux qui les jetterait laisserait passer `$needId`.
    to = to?.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? `$${key}`)
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value]),
    ).toString()
    return <a href={query ? `${to ?? '#'}?${query}` : (to ?? '#')}>{children}</a>
  },
}))

// #2170.53 — même patron que `MatchCard.test.tsx` (#2176.48) : `AskLaura`
// résout un GAGNANT de course entre ses instances vivantes (une seule amorce
// à la fois, `laura-intro-store.ts`) — un simulacre de router ne peut pas
// reproduire cette course, et la vraie question n'est pas là : c'est CE QUE
// la carte lui déclare qui l'est.
const askLauraProps: { question: string; label: string; accountId?: string }[] = []
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura">{props.label}</span>
  },
}))

const { PipelineBoard } = await import('./PipelineBoard')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const project = (over: Partial<ProjectReadRow> = {}): ProjectReadRow =>
  ({
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: 'pain',
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: 4500000,
    ...over,
  }) as ProjectReadRow

const summary: PipelineSummary = {
  columns: [
    {
      stage: 'qualified',
      label: 'Qualifié',
      count: 1,
      amount_cents: 4500000,
      without_amount: 0,
      without_next_action: 0,
    },
    {
      stage: 'confirmed',
      label: 'Besoin exprimé',
      count: 0,
      amount_cents: 0,
      without_amount: 0,
      without_next_action: 0,
    },
  ],
  total_amount_cents: 4500000,
  total_count: 1,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
} as PipelineSummary

/**
 * Le kanban est GLISSABLE depuis le PDF 2 §8.5 — et c'est précisément ce qui a
 * cassé le clic en recette : rendre la carte entière glissable supprime
 * l'événement `click` (le capteur de pointeur annule l'événement par défaut).
 * On perdait le tiroir du projet — détail, BTMMP, besoins, positionnements —
 * pour gagner un glissement.
 *
 * Ce test tient le geste le plus utilisé de l'écran. Il ne teste pas le
 * glissement lui-même : un glissement se simule mal et se vérifie à la main.
 */
describe('PipelineBoard — la carte reste cliquable', () => {
  it('ouvre le projet quand on clique le corps de la carte', async () => {
    const onSelect = vi.fn()
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={onSelect} />)

    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByText('Migration data lake'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }))
  })

  it('offre une poignée de glissement NOMMÉE — un geste sans nom est invisible au clavier', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Glisser cette carte vers une autre étape' })).toBeInTheDocument()
  })

  it('affiche « montant non saisi » plutôt que 0 € — le pire défaut d’un pipe est un montant faux', () => {
    render(<PipelineBoard summary={summary} projects={[project({ amount_cents: null })]} onSelect={() => {}} />)
    // Refonte Théo — « Montant à saisir », jamais 0 €.
    expect(screen.getByText('Montant à saisir')).toBeInTheDocument()
    // ⚠️ La portée est la CARTE, pas le document. L'assertion cherchait « 0 € »
    // partout, ce qui interdisait aussi l'en-tête d'une colonne VIDE — où zéro
    // est VRAI, et où l'écrire autrement affirme des affaires non chiffrées qui
    // n'existent pas (mesuré en ligne le 28/08/2026, `columnAmountCents`).
    const carte = screen.getByText('Migration data lake').closest('[data-slot], article, li, div')
    expect(carte).not.toBeNull()
    expect(within(carte as HTMLElement).queryByText('0 €')).not.toBeInTheDocument()
  })

  it('SIGNALE une porte ouverte par une relation — sinon elle se noie dans les détectés', () => {
    // La routine « changement de poste » crée ce projet depuis des semaines et
    // rien ne le distinguait : il tombait au milieu de trois cent soixante
    // autres projets détectés. Le tome 1 l'appelle « le plus rentable des six ».
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ access_mode: 'introduction_relation' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(/Porte via une relation/)).toBeInTheDocument()
    // Et le libellé DIT ce que c'est : laisser croire à un besoin ferait
    // préparer un message qui parle de ce que le client n'a jamais demandé.
    expect(screen.getByText(/pas encore une affaire/)).toBeInTheDocument()
  })

  it('ne signale RIEN sur un projet ordinaire — un badge permanent cesse d’être lu', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText(/Porte via une relation/)).not.toBeInTheDocument()
  })

  it("n'affiche PAS une porte telle que la routine l'écrit — et c'est la limite à connaître", () => {
    // ⚠️ Trouvé en recette live le 27/08. Le test ci-dessus passait au vert en
    // fabriquant un projet à `stage: 'qualified'`, c'est-à-dire déjà entré dans
    // le pipe. Or `openDoorFromMove` insère la porte à `stage: 'detected'` et
    // `kind: 'signal'` — le pipe écarte les deux (`isPipelineStage`). Le badge
    // du lot 8 était donc INATTEIGNABLE pour une vraie porte.
    //
    // Ce test ne réclame pas de changer le pipe : une porte n'est pas une
    // affaire, et la faire entrer dans une colonne du pipe créerait le troisième
    // jeu d'états que D2 interdit. Il FIGE la limite, pour qu'elle cesse d'être
    // une surprise — la surface qui nomme la porte est l'onglet Projets d'un
    // dossier de compte (`TabProjects.door.test.tsx`).
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ stage: 'detected', kind: 'signal', access_mode: 'introduction_relation' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText(/Porte via une relation/)).not.toBeInTheDocument()
  })
})

/**
 * #2170.15 / #2170.17 / #2170.20 (lot W20, registre 16/09) — LA CARTE DIT QUI,
 * QUAND, AVEC QUELLE PREUVE.
 *
 * Trois champs de la demande #2170 (« CARTE D'OPPORTUNITÉ ») que la carte ne
 * rendait pas : l'owner (donnée déjà résolue ailleurs via `useProjectOwners`,
 * jamais câblée jusqu'ici), la dernière activité (`project.updated_at`, déjà le
 * proxy assumé du tableau — `ProjectsTable.tsx`), et le niveau de preuve
 * (`project.evidence`, déjà calculé et servi par `GET /projects`, mais effacé à
 * la frontière TypeScript par un typage `ProjectRow[]` au lieu de
 * `ProjectReadRow[]`). Rien n'est inventé : les trois existent déjà ailleurs.
 */
describe('PipelineBoard — la carte dit qui, quand, avec quelle preuve', () => {
  it("affiche l'owner résolu quand le prop ownerName est fourni", () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ owner_id: 'u-1' })]}
        onSelect={() => {}}
        ownerName={id => (id === 'u-1' ? 'Alice Martin' : null)}
      />,
    )
    // Refonte Théo — le prénom sur la carte, le nom entier au survol.
    expect(screen.getByTitle('Responsable : Alice Martin')).toHaveTextContent('Alice')
  })

  it("n'affiche AUCUNE ligne d'owner quand personne n'est attribué — inventer un porteur relancerait la mauvaise personne", () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ owner_id: null })]}
        onSelect={() => {}}
        ownerName={() => null}
      />,
    )
    expect(screen.queryByText(/Responsable :/)).not.toBeInTheDocument()
  })

  it('affiche la dernière activité — le même proxy `updated_at` que le tableau', () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ updated_at: '2026-09-10T08:00:00.000Z' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(/Dernière activité/)).toBeInTheDocument()
  })

  it('NON (arbitrage Louis 24/10, #4499) : la carte ne porte plus le niveau de preuve — il se lit dans le détail', () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[
          project({
            evidence: { level: 'opportunity', requirement: null, missing: [] },
          }),
        ]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText('Opportunité CRM')).not.toBeInTheDocument()
  })

  it("reste MUETTE sur le niveau de preuve quand l'API ne l'a pas dit — pas une invention", () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText('Opportunité CRM')).not.toBeInTheDocument()
    expect(screen.queryByText('Non mesuré')).not.toBeInTheDocument()
  })

  /**
   * #2170.19 (lot W20, registre 16/09) — LE NOMBRE DE PROFILS POSITIONNÉS,
   * déjà compté côté serveur (`projects.service.ts`, même prédicat que
   * `positioned_consultants_count` sur un besoin) et jamais lu jusqu'ici sur
   * la carte du pipe.
   */
  it('affiche le nombre de profils positionnés quand il est SUPÉRIEUR à zéro', () => {
    render(<PipelineBoard summary={summary} projects={[project({ positioned_count: 3 })]} onSelect={() => {}} />)
    expect(screen.getByText('3 profils suivis')).toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne quand personne n'est encore positionné — zéro ne mérite pas une ligne sur une carte dense", () => {
    render(<PipelineBoard summary={summary} projects={[project({ positioned_count: 0 })]} onSelect={() => {}} />)
    expect(screen.queryByText(/positionné/)).not.toBeInTheDocument()
  })

  it("reste MUETTE quand l'API ne l'a pas dit — un instantané antérieur au déploiement, pas une invention", () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText(/positionné/)).not.toBeInTheDocument()
  })

  /**
   * #2170.5 — LE STADE DÉRIVÉ « EN ENTRETIEN(S) », au pluriel, calculé côté
   * serveur (`interview_count`, `projects.service.ts`). Décision Louis G6
   * 16/09 : `Submission.stage === 'interview'` reste la source de vérité, la
   * carte n'affiche qu'un DÉRIVÉ.
   */
  it('#4343 — la carte d’affaire n’affiche JAMAIS une étape candidat, même avec des positionnements en entretien', () => {
    render(<PipelineBoard summary={summary} projects={[project({ interview_count: 2 })]} onSelect={() => {}} />)
    expect(screen.queryByText(/[Ee]ntretien/)).not.toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne quand aucun positionnement n'est en entretien — zéro ne mérite pas une ligne sur une carte dense", () => {
    render(<PipelineBoard summary={summary} projects={[project({ interview_count: 0 })]} onSelect={() => {}} />)
    expect(screen.queryByText(/[Ee]ntretien/)).not.toBeInTheDocument()
  })

  it("reste MUETTE sur l'entretien quand l'API ne l'a pas dit — un instantané antérieur au déploiement, pas une invention", () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText(/[Ee]ntretien/)).not.toBeInTheDocument()
  })

  /**
   * #2170.13 — LE BESOIN PRINCIPAL, SUR LA CARTE. L'issue le demande à côté du
   * montant ; `ProjectNeedsPanel` (le détail complet, rôles multiples) reste le
   * seul tiroir, cette ligne ne fait que NOMMER la famille de prestation
   * achetée (`primary_domain_code`, déjà renvoyée par `GET /projects` pour
   * #2170.20/#2171). Aucune nouvelle donnée : la carte lit un champ qu'elle
   * recevait déjà sans l'afficher.
   */
  it('la famille de prestation ne s’affiche plus sur la carte, même connue (AFFAIRES-E34)', () => {
    render(
      <PipelineBoard summary={summary} projects={[project({ primary_domain_code: 'esn_it' })]} onSelect={() => {}} />,
    )
    // Notre AFFAIRES-E34 (validé 19/10) — la famille de prestation quitte la carte : elle vit dans la fiche.
    expect(screen.queryByText('Besoin principal : Informatique et numérique')).not.toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne de besoin principal quand la famille de prestation n'est pas dite", () => {
    render(<PipelineBoard summary={summary} projects={[project({ primary_domain_code: null })]} onSelect={() => {}} />)
    expect(screen.queryByText(/Besoin principal/)).not.toBeInTheDocument()
  })
})

/**
 * #2170.13 — LE BESOIN PRINCIPAL, sur la carte. `ProjectNeedsPanel` n'existait
 * que dans le tiroir de détail : la carte ne disait rien du rôle recherché.
 */
describe('PipelineBoard — la carte dit le besoin principal (#2170.13)', () => {
  it('NON (arbitrage Louis 24/10, #4499) : la carte ne porte plus le besoin principal — il vit dans le panneau des besoins', () => {
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ primary_need_title: 'Architecte data' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText(/Architecte data/)).not.toBeInTheDocument()
  })

  it("n'affiche AUCUNE ligne quand aucun besoin n'est rattaché — jamais un placeholder", () => {
    render(<PipelineBoard summary={summary} projects={[project({ primary_need_title: null })]} onSelect={() => {}} />)
    expect(screen.queryByText(/Architecte data/)).not.toBeInTheDocument()
  })

  it("reste MUETTE quand l'API ne l'a pas dit — un instantané antérieur au déploiement", () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText(/Architecte data/)).not.toBeInTheDocument()
  })
})

/**
 * #4343.2 — le Pipe d'AFFAIRES n'affiche QUE des étapes d'affaires. L'affinage « profils recherchés /
 * préparés / entretien » (#2170.3) lisait le statut d'un BESOIN (côté candidats, l'ATS de Talents) et le
 * posait en badge sur la carte : « Entretien » et « Négociation » se retrouvaient sur le même écran.
 * L'étape candidat se lit sur la fiche du besoin, jamais dans une colonne ni sur une carte d'affaire.
 */
describe('PipelineBoard — aucune étape ATS dans le Pipe d’affaires (#4343.2)', () => {
  const ATS_LABELS = ['Profils recherchés', 'Profils préparés', 'Entretien', 'Embauché', 'Embauchée']

  it('les colonnes sont EXACTEMENT les étapes d’affaires, sans clé commune avec les étapes candidat', () => {
    expect(PIPELINE_STAGES.filter(stage => (SUBMISSION_STAGES as readonly string[]).includes(stage))).toEqual([])
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    for (const label of ATS_LABELS) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it.each(['profiles_wanted', 'profiles_prepared', 'interview'] as const)(
    'une affaire dont le besoin est « %s » ne porte AUCUN badge d’étape candidat',
    detail => {
      render(<PipelineBoard summary={summary} projects={[project({ stage_detail: detail })]} onSelect={() => {}} />)
      for (const label of ATS_LABELS) expect(screen.queryByText(label)).not.toBeInTheDocument()
    },
  )
})

/**
 * #4194 (L3) — plus de bouton Laura par carte : le clic ouvre le panneau latéral
 * unique, qui en porte UN (`RecordPanel.test.tsx`).
 */
describe('PipelineBoard — aucune carte ne porte son propre bouton Laura (#4194)', () => {
  it('ne monte aucun `AskLaura` sur les cartes', () => {
    askLauraProps.length = 0
    render(
      <PipelineBoard
        summary={summary}
        projects={[project({ account_id: 'acc-42', label: 'Migration data lake' })]}
        onSelect={() => {}}
      />,
    )
    expect(askLauraProps).toHaveLength(0)
  })
})

/**
 * Le chiffre de tête du pipe, trouvé en recette live le 27/08 sur la
 * production : « 0 € sur 1 projet(s) au pipe », et la ligne suivante annonçait
 * « 1 projet(s) sans montant saisi ». Les tuiles de colonnes étaient honnêtes
 * (« Aucun montant saisi ») ; le seul chiffre qu'on lit d'abord affirmait un
 * zéro MESURÉ là où rien n'avait été mesuré.
 *
 * C'est l'invariant central du produit : une valeur absente ne s'affiche jamais
 * « 0 ». Un pipe dont aucun projet n'est chiffré ne vaut pas zéro euro — sa
 * valeur est INCONNUE, et celui qui lit « 0 € » en conclut qu'il n'y a rien à
 * vendre alors que la vérité est que personne n'a saisi de montant.
 */
describe('PipelineBoard — le total ne fabrique jamais un zéro', () => {
  const withTotals = (over: Partial<PipelineSummary>): PipelineSummary => ({ ...summary, ...over })

  it('aucun montant saisi : le total est NON MESURÉ, jamais « 0 € »', () => {
    render(
      <PipelineBoard
        summary={withTotals({
          columns: [
            {
              stage: 'qualified',
              label: 'Qualifié',
              count: 1,
              amount_cents: 0,
              without_amount: 1,
              without_next_action: 0,
            },
          ],
          total_count: 1,
          total_amount_cents: 0,
          total_without_amount: 1,
        })}
        projects={[project({ amount_cents: null })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    // Aucun montant nulle part : ni en tête, ni sur la tuile de colonne.
    expect(screen.queryByText('0 €')).not.toBeInTheDocument()
    // …et le compte des projets reste dit : « je ne sais pas combien ça vaut »
    // n'est pas « il n'y a rien ».
    expect(screen.getByText(/1 projet au pipe/)).toBeInTheDocument()
  })

  it('une PARTIE seulement est chiffrée : le total s’annonce comme un PLANCHER', () => {
    render(
      <PipelineBoard
        summary={withTotals({ total_count: 3, total_amount_cents: 4500000, total_without_amount: 1 })}
        projects={[project()]}
        onSelect={() => {}}
      />,
    )
    // #4499 — la ligne de synthèse dit le plancher par ce qui MANQUE, dans le groupe du total : sans elle, le
    // montant se lirait exact.
    expect(screen.getByTestId('pipeline-total')).toHaveTextContent('1 affaire sans montant, hors total')
  })

  it('tout est chiffré : le total est annoncé sec, sans « au moins »', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.queryByText(/sans montant saisi/)).not.toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/)).not.toBeInTheDocument()
    // #4499 — le COMPTE est en tête de la ligne (« 1 affaire dans cette vue »), le montant le suit avec
    // « estimation non pondérée » : « je sais ce que ça vaut » ne se dit jamais sans dire sur combien d'affaires.
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaire active : 1')
    expect(screen.getByTestId('pipeline-total')).toHaveTextContent(
      /pipe ouvert HT.*45\s?000\s?€.*estimation non pondérée/,
    )
  })
})

/**
 * Le pluriel se CHOISIT, il ne s'imprime pas en double.
 *
 * « 190 signal / signaux, comptés à part » affichait les deux formes et laissait
 * le lecteur trancher — sur la même ligne où le reste écrivait « projet(s) ».
 * Deux conventions de pluriel dans une seule phrase, et le dépôt n'en emploie
 * qu'une : le pluriel i18next `_one`/`_other`, 285 clés contre 39 libellés
 * en « (s) ».
 */
describe('PipelineBoard — une seule forme de pluriel', () => {
  it('accorde « N affaires dans cette vue » au lieu d’imprimer « affaire(s) »', () => {
    render(
      <PipelineBoard
        summary={{ ...summary, total_count: 2 }}
        projects={[project(), project({ id: 'p-2', label: 'Refonte SI' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaires actives : 2')
    expect(screen.queryByText(/affaire\(s\)/)).not.toBeInTheDocument()
  })

  // #4193.2 — l'en-tête, le Kanban et le tableau comptent la MÊME chose : les affaires ACTIVES. Les gagnées ont quitté
  // le Kanban (#4291.8, garde) ; elles se nomment À PART, jamais mêlées au compte (23 en tête pour 19 en colonnes).
  it('#4193.2 — compte les actives seules et nomme les gagnées à part', () => {
    render(
      <PipelineBoard
        summary={{ ...summary, total_count: 3 }}
        projects={[project(), project({ id: 'p-2', label: 'Refonte SI' }), project({ id: 'p-3', stage: 'won' })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaires actives : 2')
    expect(screen.getByTestId('pipeline-won')).toHaveAccessibleName('affaire gagnée, à part : 1')
  })

  it('accorde au singulier quand il n’y en a qu’une', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaire active : 1')
  })

  it('n’écrit plus « projet(s) » — la convention du dépôt est le pluriel i18next', () => {
    render(
      <PipelineBoard
        summary={{ ...summary, total_count: 4, total_without_amount: 2 }}
        projects={[project()]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText(/projet\(s\)/)).not.toBeInTheDocument()
    expect(screen.getByText('2 affaires sans montant, hors total')).toBeInTheDocument()
  })
})

/**
 * DEUX LIBELLÉS NE SE COLLENT PAS.
 *
 * Recette en production le 28/08/2026, colonne « Qualifié » de `/projects` :
 *
 *     Aucun montant saisi1 sans montant
 *
 * Deux chaînes justes, deux `t(...)` justes, et rien entre les deux. La cause
 * n'est pas dans les libellés : l'en-tête de colonne empilait ses lignes avec
 * `space-y-0.5`, qui pose une MARGE HAUTE sur ses enfants — et une marge
 * verticale est SANS EFFET sur un élément inline. Les deux `<span>` restaient
 * donc sur la même ligne, collés, comme si le texte était concaténé.
 *
 * Le test ne cherche pas un espace dans une chaîne (on pourrait en ajouter un,
 * et l'écran resterait faux) : il vérifie qu'aucun conteneur en FLUX NORMAL ne
 * porte deux enfants inline porteurs de texte. C'est la forme GÉNÉRALE du
 * défaut, donc celle qui attrapera le prochain.
 */
describe('PipelineBoard — deux libellés ne se collent jamais', () => {
  /**
   * Les paires d'éléments qui se retrouvent sur la même ligne, collées.
   *
   * Un conteneur flex ou grid « bloquifie » ses enfants et les espace par son
   * `gap` : ceux-là vont bien. Le danger est le conteneur en flux normal — un
   * `<div>` ordinaire — dont deux enfants sont inline (`<span>`, `<button>`).
   */
  function gluedPairs(root: HTMLElement): string[] {
    const LAYOUT = ['flex', 'inline-flex', 'grid', 'inline-grid']
    const text = (node: Element) => (node.textContent ?? '').trim()
    const out: string[] = []
    for (const node of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const element = node as HTMLElement
      if (LAYOUT.some(name => element.classList.contains(name))) continue
      const inlineChildren = Array.from(element.children).filter(child => {
        const html = child as HTMLElement
        if (!text(html)) return false
        if (html.classList.contains('block') || html.classList.contains('flex')) return false
        return html.tagName === 'SPAN' || html.tagName === 'BUTTON' || html.tagName === 'A'
      })
      for (let index = 1; index < inlineChildren.length; index++) {
        out.push(`${text(inlineChildren[index - 1])}${text(inlineChildren[index])}`)
      }
    }
    return out
  }

  it('sait dire NON — deux <span> dans un <div> ordinaire sont bien signalés', () => {
    // La forme EXACTE du défaut, montée à la main : sans cette preuve, un
    // détecteur qui ne trouve jamais rien passerait au vert pour toujours.
    const glued = document.createElement('div')
    glued.className = 'space-y-0.5 px-1'
    glued.innerHTML = '<span>Aucun montant saisi</span><span>1 sans montant</span>'
    expect(gluedPairs(glued)).toEqual(['Aucun montant saisi1 sans montant'])

    // …et il ne crie pas sur un conteneur qui, lui, espace ses enfants.
    const spaced = document.createElement('div')
    spaced.className = 'flex flex-col gap-0.5'
    spaced.innerHTML = '<span>Aucun montant saisi</span><span>1 sans montant</span>'
    expect(gluedPairs(spaced)).toEqual([])
  })

  it('l’en-tête de colonne ne colle pas « Aucun montant saisi » à « 1 sans montant »', () => {
    const { container } = render(
      <PipelineBoard
        summary={{
          ...summary,
          columns: [
            {
              stage: 'qualified',
              label: 'Qualifié',
              count: 1,
              amount_cents: 0,
              without_amount: 1,
              without_next_action: 0,
            },
          ],
          total_count: 1,
          total_amount_cents: 0,
          total_without_amount: 1,
        }}
        projects={[project({ amount_cents: null })]}
        onSelect={() => {}}
      />,
    )
    // Les deux libellés sont bien là, chacun de son côté…
    expect(screen.getByText('Aucun montant saisi')).toBeInTheDocument()
    expect(screen.getByText('1 sans montant')).toBeInTheDocument()
    // …et rien, nulle part sur l'écran, ne se retrouve collé.
    expect(gluedPairs(container)).toEqual([])
  })

  it('et pas davantage quand la colonne est chiffrée — le compteur devient un bouton', () => {
    const { container } = render(
      <PipelineBoard
        summary={{
          ...summary,
          columns: [
            {
              stage: 'qualified',
              label: 'Qualifié',
              count: 3,
              amount_cents: 4500000,
              without_amount: 1,
              without_next_action: 0,
            },
          ],
          total_count: 3,
          total_amount_cents: 4500000,
          total_without_amount: 1,
        }}
        projects={[project(), project({ id: 'p-2', amount_cents: null })]}
        onSelect={() => {}}
      />,
    )
    expect(gluedPairs(container)).toEqual([])
  })
})

/**
 * LE SIGNÉ EST NOMMÉ, JAMAIS SOMMÉ (29/08/2026).
 *
 * `pipelineSummary()` additionnait les CINQ colonnes du contrat, `won` compris.
 * « X € sur N projets au pipe » contenait donc l'argent déjà gagné : le chiffre
 * montait à chaque victoire et ne redescendait qu'à une perte. Le contrat le
 * sépare désormais ; ce bloc vérifie que l'ÉCRAN le montre — un champ que
 * personne n'affiche est la version affichage du défaut « code juste que
 * personne n'appelle ».
 */
describe('PipelineBoard — le signé à côté du pipe, jamais dedans', () => {
  const withTotals = (over: Partial<PipelineSummary>): PipelineSummary => ({ ...summary, ...over })

  // #4499 — la carte « Signé : … jamais ajouté au pipe » a quitté la page ; le signé reste À PART : la ligne de
  // synthèse ne dit que le pipe OUVERT, et la colonne Gagnée porte ses propres « X € estimés ».
  it('le total de la ligne reste celui des affaires ouvertes, même avec 90 000 € signés', () => {
    render(
      <PipelineBoard
        summary={withTotals({ signed_count: 2, signed_amount_cents: 9_000_000, signed_without_amount: 0 })}
        projects={[project()]}
        onSelect={() => {}}
      />,
    )
    const total = screen.getByTestId('pipeline-total')
    expect(total).toHaveTextContent(/45\s?000/)
    expect(total).not.toHaveTextContent(/90\s?000|135\s?000/)
  })

  // #4291.8 — le gagné a quitté le Kanban : plus de colonne Gagnée, donc plus de « X € estimés » dessus ; le signé
  // n'entre toujours pas dans le total ouvert.
  it('un projet gagné n’est plus une carte et ne grossit pas le total', () => {
    render(
      <PipelineBoard
        summary={withTotals({
          columns: [
            ...summary.columns,
            {
              stage: 'won',
              label: 'Gagnée',
              count: 1,
              amount_cents: 7_100_000,
              without_amount: 0,
              without_next_action: 0,
            },
          ],
          signed_count: 1,
          signed_amount_cents: 7_100_000,
          signed_without_amount: 0,
        })}
        projects={[project(), project({ id: 'p-w', label: 'Migration Data', stage: 'won', amount_cents: 7_100_000 })]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText('Migration Data')).not.toBeInTheDocument()
    expect(screen.queryByText(/71\s?000\s?€ estimés/)).not.toBeInTheDocument()
    expect(screen.getByTestId('pipeline-total')).not.toHaveTextContent(/71\s?000|116\s?000/)
  })

  it('NON : aucune ligne « Signé » sur la page', () => {
    render(
      <PipelineBoard
        summary={withTotals({ signed_count: 3, signed_amount_cents: 0, signed_without_amount: 3 })}
        projects={[project()]}
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByText(/Signé/)).not.toBeInTheDocument()
  })
})

/**
 * LA VALEUR DU PIPE PORTE TOUJOURS SON LIBELLÉ (30/08/2026).
 *
 * Recette live en production, compte réel, pipe à cinq colonnes : le bandeau de
 * tête affichait « non mesuré — aucun montant saisi sur 1 projet au pipe », à
 * côté de « 428 projets détectés à reprendre » et « 222 signaux, comptés à
 * part ». Le FOND était juste — c'est exactement la doctrine « non mesuré n'est
 * pas zéro ». Mais la valeur du pipe était la SEULE des trois à ne porter aucun
 * libellé propre : ses deux voisines sont des phrases complètes qui NOMMENT ce
 * qu'elles comptent (« … détectés à reprendre », « … comptés à part »), alors
 * que « non mesuré — … » ne dit nulle part que c'est la VALEUR DU PIPE dont il
 * est question — il faut lire jusqu'au bout d'une phrase pour le déduire.
 *
 * Le correctif est un libellé, sous la MÊME forme que ses deux voisines : un
 * texte qui précède la valeur, mesuré ou non. GA-134 (`architecture/`) empêche
 * qu'il disparaisse en silence.
 */
describe('PipelineBoard — la valeur du pipe porte son libellé, comme ses deux voisines', () => {
  const withTotals = (over: Partial<PipelineSummary>): PipelineSummary => ({ ...summary, ...over })

  it('le libellé précède la valeur NON MESURÉE — la donnée exacte de la recette du 30/08', () => {
    render(
      <PipelineBoard
        summary={withTotals({
          columns: [
            {
              stage: 'qualified',
              label: 'Qualifié',
              count: 1,
              amount_cents: 0,
              without_amount: 1,
              without_next_action: 0,
            },
          ],
          total_count: 1,
          total_amount_cents: 0,
          total_without_amount: 1,
          intake: 428,
          signals: 222,
        })}
        projects={[project({ amount_cents: null })]}
        onSelect={() => {}}
      />,
    )
    // #4499 — les deux voisines ont quitté le Pipeline (la file de qualification se lit depuis l'onglet
    // Besoins) ; la valeur du pipe garde le SIEN, juste avant elle quand elle n'est pas mesurée.
    expect(screen.queryByText('Affaires à qualifier')).not.toBeInTheDocument()
    expect(screen.getByText('pipe ouvert HT')).toBeInTheDocument()
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  it('le libellé précède aussi la valeur MESURÉE — pas seulement le cas non mesuré', () => {
    render(<PipelineBoard summary={summary} projects={[project()]} onSelect={() => {}} />)
    expect(screen.getByText('pipe ouvert HT')).toBeInTheDocument()
    expect(screen.getByText('estimation non pondérée')).toBeInTheDocument()
  })

  it('et sur un pipe VIDE — le zéro vrai garde lui aussi son libellé', () => {
    render(
      <PipelineBoard
        summary={withTotals({ columns: [], total_count: 0, total_amount_cents: 0, total_without_amount: 0 })}
        projects={[]}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText('pipe ouvert HT')).toBeInTheDocument()
  })
})

/**
 * #4344.2 / E6 — ARBITRAGE LOUIS 24/10 (#4499) : le besoin principal en lien et l'origine ont quitté la carte (maquette
 * V22). Leurs chemins restent : le détail de l'affaire porte l'origine (`ProjectProvenanceLine`) et le panneau des
 * besoins mène à la fiche du besoin (`ProjectNeedsPanel`) — preuve dans `PipelineBoard.v22Card.test.tsx` (absents de
 * la carte) et `ProjectPropertiesContent.test.tsx` (présents au détail).
 */
