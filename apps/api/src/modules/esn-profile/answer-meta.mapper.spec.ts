import { resolveAnswerStatus, type EsnAnswers } from '@bellum/contracts'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { mapRowToAnswerMeta, stampAnswerMeta } from './answer-meta.mapper'

/**
 * #2006.22 — la migration qui ne réécrit rien en base, elle change comment on
 * LIT une ligne écrite avant ce lot : une réponse historique (une valeur dans
 * `EsnAnswers`, aucune entrée dans `answer_meta`) se lit `proposed`, JAMAIS
 * `confirmed` — personne n'a confirmé quoi que ce soit, et le présenter comme
 * validé serait une donnée inventée (GA-11/GA-12 : la colonne est ADDITIVE,
 * `NOT NULL DEFAULT '{}'`, cf. migration `1795000000001-OnboardingAnswerMeta`).
 */
describe('mapRowToAnswerMeta — #2006.22 une ligne historique ne se lit jamais confirmée', () => {
  it('rend un objet vide pour une ligne sans colonne (avant ce lot, `undefined`)', () => {
    expect(mapRowToAnswerMeta(null)).toEqual({})
    expect(mapRowToAnswerMeta({ answer_meta: undefined } as never)).toEqual({})
  })

  it('rend un objet vide pour une ligne dont la colonne est `{}` (défaut SQL)', () => {
    expect(mapRowToAnswerMeta({ answer_meta: {} } as never)).toEqual({})
  })

  it('conserve une entrée valide telle quelle', () => {
    const meta = {
      esn_name: {
        question: { key: 'esn_name', label: "Nom de l'ESN", version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-16', actorId: null },
        status: 'confirmed',
        branchReason: 'always_asked',
        consumerAreas: ['audit'],
      },
    }
    expect(mapRowToAnswerMeta({ answer_meta: meta } as never)).toEqual(meta)
  })

  it('écarte une entrée corrompue sans faire tomber la lecture du profil entier', () => {
    const row = { answer_meta: { esn_name: { status: 'not_a_real_status' } } } as never
    expect(mapRowToAnswerMeta(row)).toEqual({})
  })
})

describe('resolveEffectiveStatus (via le module) — jamais `confirmed` pour une clé sans meta', () => {
  it('une clé présente dans `EsnAnswers` mais absente de `answer_meta` se résout `proposed`', () => {
    const meta = mapRowToAnswerMeta({ answer_meta: {} } as never)
    expect(resolveAnswerStatus(meta.esn_name)).toBe('proposed')
  })
})

/**
 * #2006.22 (décision Louis 20/09/2026, QCM) — « une réponse saisie ou
 * corrigée par l'utilisateur est `confirmed`. » `stampAnswerMeta` ferme le
 * fil : le lot précédent avait `mapRowToAnswerMeta` (lecture) sans aucune
 * écriture.
 */
describe('stampAnswerMeta — #2006.22 le geste humain confirme, rien d’autre', () => {
  const NOW = new Date('2026-09-20T10:00:00.000Z')
  const EMPTY = {} as EsnAnswers

  function entity(answerMeta: Record<string, unknown> = {}): EsnProfileEntity {
    return { answer_meta: answerMeta } as unknown as EsnProfileEntity
  }

  it('stampe `confirmed` pour une clé neuve, avec la provenance humaine', () => {
    const e = entity()
    stampAnswerMeta(e, { esn_name: 'Acme' }, EMPTY, 'user-1', NOW)

    expect(e.answer_meta.esn_name).toEqual({
      question: { key: 'esn_name', label: 'esn_name', version: 1 },
      questionnaireVersion: 1,
      provenance: { source: 'user', confidence: 'high', observedAt: NOW.toISOString(), actorId: 'user-1' },
      status: 'confirmed',
      branchReason: 'company_profile',
      consumerAreas: expect.arrayContaining(['audit']),
    })
  })

  it('choisit le motif de branchement `personal_profile` pour une clé personnelle', () => {
    const e = entity()
    stampAnswerMeta(e, { contact_windows: ['Matin (avant 12h)'] }, EMPTY, 'user-1', NOW)
    expect((e.answer_meta.contact_windows as { branchReason: string }).branchReason).toBe('personal_profile')
  })

  it('choisit le motif `temps2_after_first_analysis` pour une clé du complément Temps 2', () => {
    const e = entity()
    stampAnswerMeta(e, { avg_tjm: '550-700' }, EMPTY, 'user-1', NOW)
    expect((e.answer_meta.avg_tjm as { branchReason: string }).branchReason).toBe('temps2_after_first_analysis')
  })

  it('ne touche AUCUNE clé quand rien ne change réellement — pas de faux « confirmé »', () => {
    const e = entity()
    const before = { esn_name: 'Acme' } as EsnAnswers
    stampAnswerMeta(e, { esn_name: 'Acme' }, before, 'user-1', NOW)
    expect(e.answer_meta).toEqual({})
  })

  it('ne re-confirme PAS un champ déjà chargé, inchangé, réenvoyé dans le MÊME appel qu’un champ réellement modifié', () => {
    // #2006.22 — `ProfileStagePage` (`useProfileAnswers`) réenvoie l'objet
    // COMPLET des réponses déjà chargées à chaque sauvegarde automatique, pas
    // seulement le champ que l'utilisateur vient de modifier. Une réponse
    // migrée AVANT ce lot (`proposed`, jamais confirmée) doit rester
    // `proposed` si l'utilisateur n'a modifié qu'un AUTRE champ dans la même
    // sauvegarde — sinon toucher UN champ confirmerait tout le profil déjà
    // rempli, l'inverse exact de ce que #2006.22 demande.
    const e = entity({
      esn_name: {
        question: { key: 'esn_name', label: 'esn_name', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'inference', confidence: 'low', observedAt: null, actorId: null },
        status: 'proposed',
        branchReason: 'company_profile',
        consumerAreas: ['audit'],
      },
    })
    const before = { esn_name: 'Acme', consultant_size: '1-10' } as EsnAnswers
    // Réenvoi complet : `esn_name` inchangé, `consultant_size` réellement modifié.
    stampAnswerMeta(e, { esn_name: 'Acme', consultant_size: '10-30' }, before, 'user-1', NOW)

    expect((e.answer_meta.esn_name as { status: string }).status).toBe('proposed')
    expect((e.answer_meta.consultant_size as { status: string }).status).toBe('confirmed')
  })

  it('écrase une correction ANTÉRIEURE par la plus récente quand la valeur change réellement', () => {
    const e = entity({
      esn_name: {
        question: { key: 'esn_name', label: 'esn_name', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-01T00:00:00.000Z', actorId: 'old-user' },
        status: 'confirmed',
        branchReason: 'company_profile',
        consumerAreas: ['audit'],
      },
    })
    const before = { esn_name: 'Old name' } as EsnAnswers
    stampAnswerMeta(e, { esn_name: 'New name' }, before, 'user-2', NOW)

    const meta = e.answer_meta.esn_name as { provenance: { actorId: string; observedAt: string } }
    expect(meta.provenance.actorId).toBe('user-2')
    expect(meta.provenance.observedAt).toBe(NOW.toISOString())
  })

  it('ignore une clé absente (`undefined`) de `answers` — jamais une confirmation sur du non-envoyé', () => {
    const e = entity()
    stampAnswerMeta(e, { esn_name: undefined, consultant_size: '1-10' }, EMPTY, 'user-1', NOW)
    expect(e.answer_meta.esn_name).toBeUndefined()
    expect(e.answer_meta.consultant_size).toBeDefined()
  })
})
