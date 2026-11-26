import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, onTestFinished } from 'vitest'
import { i18n } from '@/i18n'
import { ContactKeyInfo } from './ContactKeyInfo'

// #4599.6 — la ligne « E-mail absent » porte la recherche d'« Enrichir » (react-query) : doublée ici, testée à part.
vi.mock('./ContactEnrichButton', () => ({
  useContactEnrich: () => ({ enrich: vi.fn(), setScope: vi.fn(), disabled: false, hint: undefined }),
  ContactEnrichConfirm: () => null,
}))

// #4504.3 — deux lignes rejoignent la carte : « Responsable du contact · Modifier » (même porte qu'« Attribuer ») et
// « Préférence de sollicitation » (droits d'équipe tenus par `DoNotContactPreference`, testée à part).
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))

function contactWith(extra: Partial<Contact>): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Amina Benali',
    raw_data: { apolloDetails: { hasEmail: true, hasPhone: true } },
    ...extra,
  } as Contact
}

describe('ContactKeyInfo — la promesse d’enrichissement', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('annonce ce que le crédit va révéler tant que rien n’a été tenté', () => {
    render(<ContactKeyInfo contact={contactWith({})} />)
    expect(screen.getByText('Email disponible')).toBeInTheDocument()
    expect(screen.getByText('Téléphone disponible')).toBeInTheDocument()
    // #4522 — plus aucun « — enrichir pour révéler » : le geste reste le bouton Enrichir de l'en-tête.
    expect(screen.queryByText(/enrichir pour révéler/)).not.toBeInTheDocument()
  })

  it('le badge ne recouvre pas l’étiquette : ligne repliable, étiquette et pilule incompressibles (#3724)', () => {
    render(<ContactKeyInfo contact={contactWith({})} />)
    const badge = screen.getByText('Email disponible').parentElement
    const row = badge?.parentElement
    const label = screen.getAllByText('Email professionnel')[0]?.parentElement
    expect(row?.className).toContain('flex-wrap')
    // #4522 — le badge tient dans sa colonne : il peut rétrécir (`min-w-0`) et son texte passe à la ligne.
    expect(badge?.className).toContain('min-w-0')
    expect(badge?.className).toContain('max-w-full')
    expect(label?.className).toContain('shrink-0')
  })

  it('ne PROMET plus un canal resté vide APRÈS un enrichissement (#2598.2)', () => {
    // Le cas vécu : l'enrichissement a résolu le nom, la photo et l'email, un
    // crédit a été débité — et la ligne téléphone continuait de promettre.
    // Le drapeau vient de la recherche gratuite, d'AVANT ; la tentative payante
    // fait autorité. #2598 (18/09) : rester complètement muet ensuite se lisait
    // comme « le produit n'a jamais le numéro » — voir describe dédié plus bas
    // pour ce que la ligne dit désormais à la place.
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
        })}
      />,
    )
    expect(screen.queryByText('Téléphone disponible')).not.toBeInTheDocument()
  })

  it('affiche la valeur trouvée, elle, sans condition', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({ phone: '+33 1 23 45 67 89', last_enrichment_at: '2026-08-04T12:00:00.000Z' })}
      />,
    )
    expect(screen.getByText('+33 1 23 45 67 89')).toBeInTheDocument()
  })

  /**
   * #2297.8 — un mobile professionnel EXISTE déjà côté données
   * (`apollo_enrichment.phone_numbers[].type === 'mobile'`, déjà collecté et
   * déjà légalement permis : le catalogue #2297.55 n'interdit que
   * `personal_phone`/`personal_mobile`, jamais un mobile PROFESSIONNEL) — mais
   * la colonne scalaire `phone` fusionnait le type, et l'écran affichait
   * toujours le libellé générique « Téléphone ». Le champ DIT maintenant
   * « Mobile professionnel » quand le numéro affiché EST ce mobile.
   */
  // #4178.2 — « Mobile professionnel » déduisait la nature du TYPE de ligne :
  // un mobile est une ligne, pas un statut pro. Le champ dit « Mobile », la
  // nature se lit sur sa propre ligne.
  it('nomme le champ « Mobile » (jamais « professionnel » par déduction) quand le numéro affiché est un mobile Apollo (#4178.2)', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: '+33611223344',
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
          apollo_enrichment: { phone_numbers: [{ number: '+33611223344', type: 'mobile', status: 'valid' }] },
        })}
      />,
    )
    expect(screen.getByText('Mobile')).toBeInTheDocument()
    expect(screen.queryByText('Mobile professionnel')).not.toBeInTheDocument()
    expect(screen.queryByText('Professionnel déclaré')).not.toBeInTheDocument()
    expect(screen.queryByText('Nature non vérifiée')).not.toBeInTheDocument()
  })

  it('garde le libellé générique « Téléphone » quand le type Apollo n’est pas mobile', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: '+33144556677',
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
          apollo_enrichment: { phone_numbers: [{ number: '+33144556677', type: 'work_hq', status: 'valid' }] },
        })}
      />,
    )
    expect(screen.getByText('Téléphone')).toBeInTheDocument()
    expect(screen.queryByText('Mobile')).not.toBeInTheDocument()
  })

  describe('nature du numéro (#4178.2)', () => {
    const natureOf = (extra: Record<string, unknown>) =>
      render(
        <ContactKeyInfo
          contact={contactWith({ phone: '+33144556677', last_enrichment_at: '2026-08-04T12:00:00.000Z', ...extra })}
        />,
      )

    it('#4292.17 — sans nature stockée ni métadonnée : aucune ligne « Nature non vérifiée », jamais pro', () => {
      natureOf({})
      expect(screen.queryByText('Nature non vérifiée')).not.toBeInTheDocument()
      expect(screen.queryByText('Professionnel déclaré')).not.toBeInTheDocument()
    })

    it('dit « Professionnel déclaré » quand le fournisseur type la ligne « travail »', () => {
      natureOf({ phone_nature: 'professional_declared', phone_nature_source: 'provider' })
      expect(screen.getByText('Professionnel déclaré')).toBeInTheDocument()
      expect(screen.queryByText('Professionnel vérifié')).not.toBeInTheDocument()
    })

    it('dit « Personnel » pour un numéro personnel reconnu', () => {
      natureOf({ phone_nature: 'personal', phone_nature_source: 'provider' })
      expect(screen.getByText('Personnel')).toBeInTheDocument()
    })

    it('ne masque pas deux sources qui se contredisent', () => {
      natureOf({
        phone_nature: 'unknown',
        apollo_enrichment: {
          phone_numbers: [
            { number: '+33144556677', type: 'work_hq' },
            { number: '+33 1 44 55 66 77', type: 'home' },
          ],
        },
      })
      expect(screen.getByText('Sources en désaccord : Professionnel déclaré · Personnel')).toBeInTheDocument()
    })

    it('n’affiche rien sans numéro (une absence ne fait aucune ligne)', () => {
      render(<ContactKeyInfo contact={contactWith({ phone: null })} />)
      expect(screen.queryByText('Nature non vérifiée')).not.toBeInTheDocument()
    })
  })
})

/**
 * #2120.69 — le téléphone n'a AUCUNE vérification dans le produit : il
 * s'affiche donc « Non vérifié », ce qui est exact — jamais un « Vérifié »
 * deviné.
 *
 * #3843 — retour bêta 08/10 : le badge « Vérifié » posé sur l'e-mail était
 * pointé comme clutter (« supprime »). Retiré : une coordonnée vérifiée ne
 * porte plus de décoration — le silence EST la bonne nouvelle. Ce qui reste,
 * parce qu'aucune doctrine ne le couvre (CLAUDE.md ne mentionne aucun badge
 * de vérification par champ) : « Non vérifié » continue de NOMMER le doute
 * plutôt que de le taire (même famille que GA-18/19, « non mesuré n'est
 * jamais tu » — ici appliquée à un FAUX connu, pas à un inconnu).
 */
describe('ContactKeyInfo — #2120.69/#3843 statut vérifié / non vérifié par coordonnée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // #4292.17 / #4292.18 — « Non vérifié » ne s'écrit plus à côté de la coordonnée ; le doute vit au survol (title).
  it('#4292.17 — aucun « Non vérifié » écrit à côté de l’e-mail ni du téléphone ; le survol le dit', () => {
    render(
      <ContactKeyInfo contact={contactWith({ email: 'a@acme.fr', email_verified: false, phone: '+33102030405' })} />,
    )
    expect(screen.queryByText('Non vérifié')).not.toBeInTheDocument()
    expect(screen.queryByText('Vérifié')).not.toBeInTheDocument()
    expect(screen.getByText('Téléphone')).toHaveAttribute('title', 'Non vérifié')
    expect(screen.getByText('Email professionnel')).toHaveAttribute('title', 'Non vérifié')
  })

  it('#3843 — un e-mail vérifié ne porte ni badge ni survol', () => {
    render(
      <ContactKeyInfo contact={contactWith({ email: 'a@acme.fr', email_verified: true, phone: '+33102030405' })} />,
    )
    expect(screen.queryByText('Vérifié')).not.toBeInTheDocument()
    expect(screen.getByText('Email professionnel')).not.toHaveAttribute('title')
  })

  it('sait dire NON : sans coordonnée, aucun statut n’est affiché', () => {
    render(<ContactKeyInfo contact={contactWith({ email: null, phone: null })} />)
    expect(screen.queryByText('Non vérifié')).not.toBeInTheDocument()
    expect(screen.queryByText('Vérifié')).not.toBeInTheDocument()
  })
})

/**
 * R15-11 (recette du 15/09/2026, prod `5ca597d5a`) — L'ÉTIQUETTE ET LA VALEUR
 * SE LISENT TOUTES LES DEUX.
 *
 * Mesuré à l'écran, fiche contact THALES › Informations clés :
 *
 *   « FoncHead of CISO Services / Chief Information S… »
 *   « EntitTHALES COMMUNICATION & SECURITE NU… »
 *
 * La colonne d'étiquettes était compressée sous son propre texte et la valeur
 * passait PAR-DESSUS au lieu de la pousser. Cause racine connue du dépôt :
 * `index.css` pose `min-width: 0` sur tout enfant de flex — ce qui règle les
 * débordements horizontaux, et retire du même coup le plancher qui empêchait
 * une étiquette de se faire écraser. Un enfant qui ne doit JAMAIS se rétrécir
 * le dit alors lui-même (`shrink-0`) ; il ne peut plus compter sur le défaut.
 *
 * Ces tests lisent les classes de mise en page, parce que c'est le seul endroit
 * où la règle existe : jsdom ne calcule aucune largeur. Ils tiennent donc trois
 * choses vérifiables — l'étiquette ne se rétrécit pas, la valeur n'est plus
 * forcée sur une seule ligne tronquée, et la ligne a le droit de passer à la
 * ligne quand les deux ne tiennent pas côte à côte (l'écran à ~400 px).
 */
describe('ContactKeyInfo — étiquette et valeur ne se recouvrent pas (R15-11)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const LONG_TITLE = 'Head of CISO Services / Chief Information Security Officer'
  const LONG_ENTITY = 'THALES COMMUNICATION & SECURITE NUMERIQUE SAS'

  function renderRows() {
    const { container } = render(<ContactKeyInfo contact={contactWith({ title: LONG_TITLE, entity: LONG_ENTITY })} />)
    return container
  }

  it('l’étiquette porte son propre plancher — elle ne se rétrécit pas sous son texte', () => {
    renderRows()
    const label = screen.getByText('Fonction')
    // Le conteneur de l'étiquette (icône + mot) est le parent direct du texte.
    expect(label.parentElement?.className).toContain('shrink-0')
  })

  it('la valeur n’est plus forcée sur une ligne tronquée : elle passe à la ligne', () => {
    renderRows()
    const value = screen.getByText(LONG_TITLE)
    expect(value.className).not.toContain('whitespace-nowrap')
    expect(value.className).not.toContain('truncate')
    // Un mot interminable (une entité en majuscules sans espace) casse aussi.
    expect(value.className).toContain('break-words')
  })

  it('la ligne entière passe à la ligne quand les deux ne tiennent pas côte à côte', () => {
    renderRows()
    const row = screen.getByText('Entité').closest('div')?.parentElement
    expect(row?.className).toContain('flex-wrap')
  })

  it('sait dire NON : les deux textes sont bien rendus EN ENTIER, pas coupés', () => {
    renderRows()
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument()
    expect(screen.getByText(LONG_ENTITY)).toBeInTheDocument()
    expect(screen.getByText('Fonction')).toBeInTheDocument()
    expect(screen.getByText('Entité')).toBeInTheDocument()
  })

  /**
   * Vu en passant (lot R22, 07/10) — recette : « Entité : N/A » affiché alors
   * que la fiche montrait un compte associé par ailleurs (« Dossiers associés »).
   * `entity` est une déclaration libre, et un import peut y avoir écrit ce bruit
   * littéral plutôt qu'un `null` propre — la ligne doit alors disparaître, pas
   * afficher le bruit.
   */
  it('#3831-adjacent — "N/A" (bruit d’import) ne s’affiche jamais comme une entité', () => {
    render(<ContactKeyInfo contact={contactWith({ title: LONG_TITLE, entity: 'N/A' })} />)
    expect(screen.queryByText('Entité')).not.toBeInTheDocument()
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })
})

/**
 * #3945/#3946 (retour bêta Louis 08/10/2026) — remplace les deux `describe`
 * ci-dessous (confiance/coût #2120.68/#2120.70/#3840, provenance par champ
 * #2988/#2161), qui prouvaient que `ContactFieldMeta` s'affichait. Le bloc est
 * désormais SUPPRIMÉ : troisième retour sur le même point (après #3842/#3840,
 * qui l'avaient fusionné en une ligne plutôt que supprimé), tranché cette fois
 * mot pour mot « supprimer ». Les coordonnées elles-mêmes restent affichées EN
 * CLAIR (doctrine c87) — seule la méta disparaît.
 */
describe('ContactKeyInfo — #3945/#3946 plus de provenance/confiance/coût sous les champs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('e-mail et téléphone restent affichés en clair, sans aucune ligne de méta sous eux', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'a@acme.fr',
          email_confidence: 'high',
          email_cost_credits: 1,
          phone: '+33102030405',
          phone_cost_credits: 1,
          source: 'apollo',
          created_at: '2026-09-01T00:00:00.000Z',
        })}
      />,
    )
    // La coordonnée reste en clair (c87).
    expect(screen.getByText('a@acme.fr')).toBeInTheDocument()
    expect(screen.getByText('+33 1 02 03 04 05')).toBeInTheDocument()
    // Plus aucune ligne de confiance, de coût ni de provenance par champ.
    expect(screen.queryByText(/Confiance/)).not.toBeInTheDocument()
    expect(screen.queryByText(/crédit engagé/)).not.toBeInTheDocument()
    expect(screen.queryByText(/lu dans un outil connecté/)).not.toBeInTheDocument()
  })
})

/**
 * #2598 — « j'ai l'impression que j'ai jamais le numéro, c'est un bug ? »
 *
 * Avant ce lot, une tentative d'enrichissement restée vide faisait
 * disparaître la ligne téléphone/email de « Informations clés » sans laisser
 * aucune trace : ni « non renseigné », ni « non trouvé », ni ce qu'il
 * faudrait pour l'avoir. Un numéro qu'on n'a pas ne s'invente jamais — mais
 * l'écran doit le DIRE plutôt que se taire.
 */
describe('ContactKeyInfo — #2598 un canal cherché et non trouvé se DIT', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('#2598.2 — dit « non trouvé » au lieu de rien, sur le téléphone comme sur l’email', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: null,
          phone: null,
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
        })}
      />,
    )
    expect(screen.getAllByText('Introuvable chez nos sources — à ajouter à la main si tu le connais')).toHaveLength(2)
  })

  it('#3822/E1 — « Introuvable chez N sources » : le compte réel, jamais les noms', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: null,
          phone: null,
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
          enrichment_coordinates: {
            email: { state: 'not_found', sources_queried: 3, at: '2026-08-04T12:00:00.000Z' },
            phone: { state: 'not_found', sources_queried: 2, at: '2026-08-04T12:00:00.000Z' },
          },
        })}
      />,
    )
    expect(screen.getByText(/^Introuvable chez 3 sources/)).toBeInTheDocument()
    expect(screen.getByText(/^Introuvable chez 2 sources/)).toBeInTheDocument()
  })

  it('#2598.2 — jamais un « 0 » ni une valeur devinée : la vraie valeur, elle, reste prioritaire', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          phone: '+33 1 23 45 67 89',
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
        })}
      />,
    )
    expect(screen.getByText('+33 1 23 45 67 89')).toBeInTheDocument()
    expect(
      screen.queryByText('Introuvable chez nos sources — à ajouter à la main si tu le connais'),
    ).not.toBeInTheDocument()
  })

  it('#2598.3 — sous cooldown, dit jusqu’à quand un nouvel essai a du sens', () => {
    // Horloge figée : sans elle, le test expirait de lui-même le 10/10/2026 (tentative + 30 j = aujourd'hui).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const attemptedAt = '2026-09-10T12:00:00.000Z'
    const retryDate = new Date(new Date(attemptedAt).getTime() + 30 * 86_400_000).toLocaleDateString('fr')
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          linkedin_url: 'https://linkedin.com/in/amina-benali',
          phone: null,
          last_enrichment_at: attemptedAt,
          last_enrichment_result: 'no_new_data',
          last_enrichment_missing: ['phone'],
        })}
      />,
    )
    expect(screen.getByText(`Non trouvé — nouvel essai possible à partir du ${retryDate}`)).toBeInTheDocument()
  })

  it('#2598.3 — hors cooldown (résultat « matched » malgré le canal manquant), reste au message générique', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          phone: null,
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
          last_enrichment_result: 'matched',
          last_enrichment_missing: [],
        })}
      />,
    )
    expect(screen.getByText('Introuvable chez nos sources — à ajouter à la main si tu le connais')).toBeInTheDocument()
  })
})

/**
 * #3822.2 / #3850.2 — un canal resté à `unknown` (l'appel a ÉCHOUÉ, OU une
 * sonde FullEnrich n'a pas eu le temps de conclure — les deux sont la MÊME
 * incertitude, « on ne sait pas encore ») se distingue d'un « non trouvé »
 * (l'appel a RÉPONDU, vide) : le premier invite à réessayer, le second non.
 * #3850.2 (08/10) — la copie ne doit JAMAIS affirmer un échec qu'on n'a pas
 * constaté : « panne fournisseur » devient « en attente du fournisseur »,
 * cohérent avec la doctrine « un timeout n'est pas un échec ». Persisté par
 * contact et par coordonnée (`enrichment_coordinates`, état `unknown` —
 * l'état d'E1).
 */
describe('ContactKeyInfo — #3822.2/#3850.2 un canal `unknown` se distingue d’un « non trouvé »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit l’attente fournisseur, pas « non trouvé », quand le téléphone est à `unknown` dans `enrichment_coordinates`', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: null,
          enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
        })}
      />,
    )
    expect(
      screen.getByText("En attente du fournisseur — la recherche n'a pas conclu, réessaie dans quelques minutes"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Introuvable chez nos sources — à ajouter à la main si tu le connais'),
    ).not.toBeInTheDocument()
  })

  it('ne nomme en attente QUE la coordonnée ciblée par `enrichment_coordinates` (`unknown`)', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: null,
          phone: null,
          enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
        })}
      />,
    )
    expect(
      screen.getAllByText("En attente du fournisseur — la recherche n'a pas conclu, réessaie dans quelques minutes"),
    ).toHaveLength(1)
  })

  it('une valeur déjà connue reste affichée malgré une attente plus récente', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: '+33 1 23 45 67 89',
          enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-07T09:00:00.000Z' } },
        })}
      />,
    )
    expect(screen.getByText('+33 1 23 45 67 89')).toBeInTheDocument()
    expect(
      screen.queryByText("En attente du fournisseur — la recherche n'a pas conclu, réessaie dans quelques minutes"),
    ).not.toBeInTheDocument()
  })
})

/**
 * #3782 — retour bêta 06/10 : « avant l'enrichissement c'était indiqué que le
 * numéro de téléphone était disponible, mais quand l'enrichissement s'est
 * fini, il dit numéro introuvable ». La tentative synchrone a matché l'e-mail
 * (`enrichmentAttempted` devient vrai) alors que la révélation du mobile
 * Apollo est encore EN VOL (webhook, `enrichment_coordinates.phone.state ===
 * 'pending'`) — le champ n'est ni « trouvé » ni « introuvable », il est
 * EN ATTENTE, et doit le dire plutôt que de retomber sur « non trouvé ».
 */
describe('ContactKeyInfo — une révélation en attente ne se lit jamais « introuvable » (#3782)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit « en attente », pas « non trouvé », quand le téléphone est à `pending` juste après l’enrichissement', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          phone: null,
          last_enrichment_at: '2026-10-06T12:37:00.000Z',
          enrichment_coordinates: { phone: { state: 'pending', sources_queried: 1, at: '2026-10-06T12:37:00.000Z' } },
        })}
      />,
    )
    expect(screen.getByText('Le fournisseur répond encore — le numéro arrivera automatiquement')).toBeInTheDocument()
    expect(
      screen.queryByText('Introuvable chez nos sources — à ajouter à la main si tu le connais'),
    ).not.toBeInTheDocument()
  })

  it('un canal `unknown` garde la priorité d’affichage sur une attente `pending`', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          phone: null,
          last_enrichment_at: '2026-10-06T12:37:00.000Z',
          enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-06T12:37:00.000Z' } },
        })}
      />,
    )
    expect(
      screen.getByText("En attente du fournisseur — la recherche n'a pas conclu, réessaie dans quelques minutes"),
    ).toBeInTheDocument()
  })
})

/**
 * #3782 — le chevauchement du retour bêta ne se mesure pas en jsdom (aucune
 * largeur réelle n'y est posée) : on prouve donc la CAUSE CSS plutôt que le
 * symptôme. `NotFoundRow` poussait son indice (« non trouvé par nos
 * fournisseurs — à ajouter à la main si tu le connais ») en texte libre, sans
 * `min-w-0`/`flex-1` : sur une carte étroite, il ne se repliait pas et
 * débordait PAR-DESSUS le reste de la carte — même cause racine que R15-11
 * (étiquette/valeur), remède identique.
 */
describe('ContactKeyInfo — l’indice « non trouvé » ne déborde plus de la carte (#3782)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('l’indice est confiné à l’espace restant de la ligne (min-w-0, flex-1) et peut se replier (break-words)', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          phone: null,
          last_enrichment_at: '2026-08-04T12:00:00.000Z',
        })}
      />,
    )
    const hint = screen.getByText('Introuvable chez nos sources — à ajouter à la main si tu le connais')
    const hintWrapper = hint.parentElement
    expect(hintWrapper?.className).toContain('min-w-0')
    expect(hintWrapper?.className).toContain('flex-1')
    expect(hint.className).toContain('break-words')
  })
})

/**
 * #2297.51 — une coordonnée ARCHIVÉE par la rétention (trois ans sans
 * activité) se DIT : jamais une ligne muette, jamais « non trouvé ».
 */
describe('ContactKeyInfo — coordonnées archivées par la rétention (#2297.51)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme la date de l’archivage à la place de l’e-mail et du téléphone', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          raw_data: null,
          email: null,
          phone: null,
          last_enrichment_at: '2023-01-10T12:00:00.000Z',
          enrichment_archived_at: '2026-08-10T12:00:00.000Z',
        })}
      />,
    )
    const date = new Date('2026-08-10T12:00:00.000Z').toLocaleDateString('fr')
    expect(screen.getAllByText(`Archivé le ${date} — trois ans sans activité (RGPD)`)).toHaveLength(2)
    expect(screen.queryByText(/Non trouvé/)).not.toBeInTheDocument()
  })
})

/**
 * #2297.33/.39 — le téléphone n'avait AUCUN statut de validité (#2120.69).
 * `invalid` se fonde sur la FORME de la valeur (`looksLikePhoneNumber`,
 * réutilisée depuis `@bellum/contracts` — jamais un vocabulaire de
 * fournisseur non documenté dans ce dépôt).
 */
describe('ContactKeyInfo — validité du téléphone (#2297.33/.39)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme le doute quand la valeur stockée ne ressemble pas à un numéro — la valeur RESTE affichée', () => {
    render(<ContactKeyInfo contact={contactWith({ phone: 'N/A', last_enrichment_at: '2026-08-04T12:00:00.000Z' })} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(
      screen.getByText("Ce numéro ne ressemble pas à une coordonnée exploitable — vérifie-le avant d'appeler"),
    ).toBeInTheDocument()
  })

  it('un numéro bien formé ne déclenche AUCUN avertissement', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({ phone: '+33 1 23 45 67 89', last_enrichment_at: '2026-08-04T12:00:00.000Z' })}
      />,
    )
    expect(
      screen.queryByText("Ce numéro ne ressemble pas à une coordonnée exploitable — vérifie-le avant d'appeler"),
    ).not.toBeInTheDocument()
  })
})

/**
 * #3850.4 — AFFICHAGE international lisible, quel que soit le format STOCKÉ :
 * un numéro écrit en E.164 compact (nouvelle discipline de ce lot) se lit
 * aussi facilement qu'un numéro historique déjà espacé.
 */
describe('ContactKeyInfo — affichage international lisible (#3850.4)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un téléphone stocké en E.164 COMPACT s’affiche en international lisible', () => {
    render(<ContactKeyInfo contact={contactWith({ phone: '+33681050091' })} />)
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('+33681050091')).not.toBeInTheDocument()
  })

  it('un format local français (0 initial) s’affiche aussi en international', () => {
    render(<ContactKeyInfo contact={contactWith({ phone: '0681050091' })} />)
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
  })
})

describe('#2159.62 — la date de dernière vérification d’emploi', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('affiche la date quand l’emploi a été vérifié', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({ title: 'Chef de projet', employment_verified_at: '2026-09-20T00:00:00.000Z' })}
      />,
    )
    expect(screen.getByText('Emploi vérifié le 20/09/2026')).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne quand l’emploi n’a jamais été vérifié — jamais une date devinée', () => {
    render(<ContactKeyInfo contact={contactWith({ title: 'Chef de projet' })} />)
    expect(screen.queryByText(/Emploi vérifié/)).not.toBeInTheDocument()
  })
})

describe('ContactKeyInfo — l’e-mail ne se coupe pas (#3687, recette 06/10)', () => {
  it('pose l’e-mail SOUS son étiquette, entier dans un seul nœud', () => {
    render(<ContactKeyInfo contact={contactWith({ email: 'i.rouault@sncf-groupe.example' })} />)
    const value = screen.getByText('i.rouault@sncf-groupe.example')
    expect(value.closest('[data-stacked="true"]')).not.toBeNull()
  })
})

// #4292.16 (#4280.1) — retour bêta « BEUG AFFICHAGE » : « +33 6 33 09 63 / 57 » se coupait au milieu du numéro
// dans la colonne étroite ; un numéro, comme un e-mail, ne se coupe pas — il passe SOUS son étiquette.
describe('ContactKeyInfo — le numéro de téléphone ne se coupe pas (#4292.16)', () => {
  it('pose le numéro principal SOUS son étiquette, entier dans un seul nœud', () => {
    render(<ContactKeyInfo contact={contactWith({ phone: '+33633096357' })} />)
    const value = screen.getByText('+33 6 33 09 63 57')
    expect(value.closest('[data-stacked="true"]')).not.toBeNull()
  })

  it('un numéro supplémentaire se pose de même', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: '+33633096357',
          apollo_enrichment: { phone_numbers: [{ number: '+33144556677', type: 'work', status: 'valid' }] },
        })}
      />,
    )
    const value = screen.getByText(/\+33 1 44 55 66 77/)
    expect(value.closest('[data-stacked="true"]')).not.toBeNull()
  })
})

describe('ContactKeyInfo — l’e-mail ESTIMÉ se badge (#4016 L4.1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('une adresse estimée porte « estimé, vérifié le … », jamais « non vérifié » ni « vérifié »', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          email: 'amina.benali@exemple.fr',
          email_verified: false,
          email_estimated_at: '2026-10-11T09:00:00.000Z',
        })}
      />,
    )
    expect(screen.getByText(/estimé, vérifié le 11 oct\.? 2026/)).toBeInTheDocument()
    expect(screen.queryByText('Non vérifié')).not.toBeInTheDocument()
  })

  it('sait dire NON : une adresse non estimée ne porte aucun badge « estimé »', () => {
    render(<ContactKeyInfo contact={contactWith({ email: 'amina.benali@exemple.fr', email_verified: true })} />)
    expect(screen.queryByText(/estimé/)).not.toBeInTheDocument()
  })
})

// #4055.8 (Louis 15/10/2026) — les trois états d'emploi d'un contact.
describe('ContactKeyInfo — état de l’emploi (#4055.8)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('jamais relu ni vérifié : « pas encore vérifié »', () => {
    render(<ContactKeyInfo contact={contactWith({})} />)
    expect(screen.getByTestId('employment-status')).toHaveTextContent('pas encore vérifié')
  })

  it('relu sans résultat : « non retrouvé », daté', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({ raw_data: { employmentCheck: { at: '2026-10-11T08:00:00.000Z', state: 'not_found' } } })}
      />,
    )
    expect(screen.getByTestId('employment-status')).toHaveTextContent(/non retrouvé/)
  })

  it('un autre employeur observé, daté : « a quitté l’entreprise »', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          raw_data: { employmentCheck: { at: '2026-10-11T08:00:00.000Z', state: 'left', organization: 'Capgemini' } },
        })}
      />,
    )
    const line = screen.getByTestId('employment-status')
    expect(line).toHaveTextContent('A quitté l’entreprise')
    expect(line).toHaveTextContent('Capgemini')
  })

  // #4055.9 (Exteam, EX-04) — un titre périmé n'est jamais présenté comme actuel.
  it('#4055.9 — la fonction d’un contact PARTI se lit « Ancienne fonction », jamais « Fonction »', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          title: 'Directeur des systèmes d’information',
          raw_data: { employmentCheck: { at: '2026-10-11T08:00:00.000Z', state: 'left', organization: 'Capgemini' } },
        })}
      />,
    )
    expect(screen.getByText('Ancienne fonction')).toBeInTheDocument()
    expect(screen.queryByText('Fonction')).not.toBeInTheDocument()
    expect(screen.getByText('Directeur des systèmes d’information')).toBeInTheDocument()
  })

  it('#4055.9 SAIT DIRE NON — « non retrouvé » ne vaut pas départ : la fonction reste « Fonction »', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          title: 'Directeur des systèmes d’information',
          raw_data: { employmentCheck: { at: '2026-10-11T08:00:00.000Z', state: 'not_found' } },
        })}
      />,
    )
    expect(screen.getByText('Fonction')).toBeInTheDocument()
    expect(screen.queryByText('Ancienne fonction')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — un emploi déjà vérifié n’affiche pas « pas encore vérifié »', () => {
    render(<ContactKeyInfo contact={contactWith({ employment_verified_at: '2026-09-01T00:00:00.000Z' })} />)
    expect(screen.queryByTestId('employment-status')).not.toBeInTheDocument()
  })
})

describe('#4504.3 — ce qui a quitté l’en-tête vit dans Informations clés', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('« Responsable du contact » nomme le porteur et offre « Modifier »', () => {
    render(<ContactKeyInfo contact={contactWith({ owner: { user_id: 'u-moi', name: 'Maëva Coet' } })} />)
    const row = screen.getByTestId('contact-owner-row')
    expect(screen.getByText('Responsable du contact')).toBeInTheDocument()
    expect(row).toHaveTextContent('Maëva Coet')
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attribuer' })).not.toBeInTheDocument()
  })

  it('un porteur lu SANS titulaire se dit « Non attribué » ; un porteur non servi ne devine rien', () => {
    const { unmount } = render(<ContactKeyInfo contact={contactWith({ owner: null })} />)
    expect(screen.getByTestId('contact-owner-row')).toHaveTextContent('Non attribué')
    unmount()
    render(<ContactKeyInfo contact={contactWith({})} />)
    expect(screen.getByTestId('contact-owner-row')).not.toHaveTextContent('Non attribué')
  })

  it('une sollicitation récente d’un collègue se lit sous le responsable, nommée et datée', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          owner: { user_id: 'u-2', name: 'Théo Haddad' },
          solicitation: { colleague: { user_id: 'u-2', name: 'Théo Haddad' }, lastTouchOn: '2026-10-12' },
        } as Partial<Contact>)}
      />,
    )
    expect(screen.getByTestId('contact-owner-row')).toHaveTextContent(/Sollicité par Théo Haddad le/)
  })

  it('« Préférence de sollicitation » porte la ligne « ne pas contacter »', () => {
    render(<ContactKeyInfo contact={contactWith({})} />)
    expect(screen.getByText('Préférence de sollicitation')).toBeInTheDocument()
    expect(screen.getByText('Aucune opposition consignée')).toBeInTheDocument()
  })

  it('le rebond e-mail se nomme à côté de l’adresse ; sans rebond, rien', () => {
    const { unmount } = render(
      <ContactKeyInfo contact={contactWith({ email: 'a@b.fr', email_bounced_at: '2026-10-10T00:00:00.000Z' })} />,
    )
    expect(screen.getByText('N’est jamais arrivé')).toBeInTheDocument()
    unmount()
    render(<ContactKeyInfo contact={contactWith({ email: 'a@b.fr' })} />)
    expect(screen.queryByText('N’est jamais arrivé')).not.toBeInTheDocument()
  })
})

/**
 * #4522 (recette prod 25/10, `f3b199c180`) — « Téléphone disponible » restait un BADGE alors que le numéro
 * était CONNU : la colonne `contacts.phone` était vide, mais le profil fournisseur déjà stocké
 * (`apollo_enrichment.phone_numbers[]`) portait le numéro, replié dans « Plus d'infos » comme
 * « Autre téléphone ». Doctrine c87 : une coordonnée qu'on A s'affiche en clair, à sa place. Le badge court
 * ne sert QUE quand on n'a pas la valeur.
 */
describe('ContactKeyInfo — #4522 une coordonnée connue sort en clair, le badge ne sert que sans valeur', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('téléphone connu (colonne `phone`) → le NUMÉRO, jamais le badge', () => {
    render(<ContactKeyInfo contact={contactWith({ phone: '+33681050091' })} />)
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('Téléphone disponible')).not.toBeInTheDocument()
  })

  it('téléphone connu du seul profil fournisseur → le NUMÉRO sur la ligne principale, pas le badge ni le repli', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: null,
          apollo_enrichment: { phone_numbers: [{ number: '+33 6 81 05 00 91', type: 'mobile' }] },
        } as Partial<Contact>)}
      />,
    )
    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('Téléphone disponible')).not.toBeInTheDocument()
    // Hors du repli « Plus d'infos » : la ligne principale, nommée « Mobile », jamais un « Autre téléphone ».
    expect(screen.getByText('+33 6 81 05 00 91').closest('details')).toBeNull()
    expect(screen.getByText('Mobile')).toBeInTheDocument()
    expect(screen.queryByText('Autre téléphone')).not.toBeInTheDocument()
  })

  it('le premier numéro du profil s’affiche, les suivants restent des « Autre téléphone » (aucun ne disparaît)', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: null,
          apollo_enrichment: {
            phone_numbers: [
              { number: '+33 1 23 45 67 89', type: 'work_direct' },
              { number: '+33 6 11 22 33 44', type: 'mobile' },
            ],
          },
        } as Partial<Contact>)}
      />,
    )
    expect(screen.getByText('+33 1 23 45 67 89').closest('details')).toBeNull()
    expect(screen.getByText('+33 6 11 22 33 44 (mobile)').closest('details')).not.toBeNull()
  })

  it('sait dire NON : SANS téléphone mais signalé disponible → badge court « Téléphone disponible »', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({ phone: null, apollo_enrichment: { phone_numbers: [] } } as Partial<Contact>)}
      />,
    )
    expect(screen.getByText('Téléphone disponible')).toBeInTheDocument()
    expect(screen.queryByText(/enrichir/i)).not.toBeInTheDocument()
  })

  it('un « numéro » sans forme de téléphone dans le profil ne remplace pas le badge (jamais une valeur devinée)', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          phone: null,
          apollo_enrichment: { phone_numbers: [{ number: 'ext 4512' }] },
        } as Partial<Contact>)}
      />,
    )
    expect(screen.getByText('Téléphone disponible')).toBeInTheDocument()
  })

  it('l’annonce par champ (`phone_availability` / `email_availability`, R22 a4) suffit au badge — celle que la démo sème', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          raw_data: null,
          email: null,
          phone: null,
          email_availability: 'available',
          phone_availability: 'available',
        } as Partial<Contact>)}
      />,
    )
    expect(screen.getByText('Email disponible')).toBeInTheDocument()
    expect(screen.getByText('Téléphone disponible')).toBeInTheDocument()
  })

  it('sait dire NON : une annonce `unknown` / `not_found` ne fait aucun badge', () => {
    render(
      <ContactKeyInfo
        contact={contactWith({
          raw_data: null,
          email_availability: 'unknown',
          phone_availability: 'not_found',
        } as Partial<Contact>)}
      />,
    )
    expect(screen.queryByText('Email disponible')).not.toBeInTheDocument()
    expect(screen.queryByText('Téléphone disponible')).not.toBeInTheDocument()
  })

  it('e-mail connu → l’ADRESSE, jamais le badge', () => {
    render(<ContactKeyInfo contact={contactWith({ email: 'herve@bruckernet.com' })} />)
    expect(screen.getByText('herve@bruckernet.com')).toBeInTheDocument()
    expect(screen.queryByText('Email disponible')).not.toBeInTheDocument()
  })

  it('sait dire NON : SANS e-mail mais signalé disponible → badge court « Email disponible »', () => {
    render(<ContactKeyInfo contact={contactWith({ email: null })} />)
    expect(screen.getByText('Email disponible')).toBeInTheDocument()
    expect(screen.queryByText(/enrichir/i)).not.toBeInTheDocument()
  })
})
