import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { CV_DETECTIONS } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { IaClient } from '../ia/ia.client'
import { CvParseService } from './cv-parse.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

const CV = 'YANIS BERTHIER — Ingénieur plateforme. Kubernetes, Prometheus, Go.'

function makeService(overrides: { talent?: unknown; parse?: unknown; parseThrows?: Error } = {}) {
  const saved: Record<string, unknown>[] = []
  const seedQuery = jest.fn(async () => undefined)
  const talent = 'talent' in overrides ? overrides.talent : { id: TALENT, workspace_id: WORKSPACE, cv_text: CV }
  const consultants = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => talent),
    })),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push(row)
      return row
    }),
    manager: { query: seedQuery },
  } as unknown as Repository<ConsultantEntity>
  const cvParse = jest.fn(async () => {
    if (overrides.parseThrows) throw overrides.parseThrows
    return overrides.parse ?? { data: { fields: [], source_chars: CV.length } }
  })
  const ia = { cvParse } as unknown as IaClient
  return { service: new CvParseService(consultants, ia), saved, cvParse, seedQuery }
}

function field(over: Record<string, unknown> = {}) {
  return {
    detection: 'skills',
    value: ['Kubernetes', 'Go'],
    confidence: 0.9,
    source_excerpt: 'Kubernetes, Prometheus, Go.',
    excerpt_offset: 38,
    ...over,
  }
}

/**
 * Le parsing d'un CV et sa validation (PDF 3 §4, ticket BEL-ATS-201).
 *
 * Les deux gestes sont séparés, et c'est toute la garde : lire ne doit rien
 * écrire, et écrire ne doit arriver qu'après un geste humain.
 */
describe('CvParseService.propose', () => {
  it('N’ÉCRIT RIEN', async () => {
    const { service, saved } = makeService({ parse: { data: { fields: [field()], source_chars: CV.length } } })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.fields.length).toBeGreaterThan(0)
    // Une compétence écrite avant validation deviendrait une compétence du
    // vivier — donc un profil poussé sur un besoin — sans relecture.
    expect(saved).toEqual([])
  })

  it('#2542.3 — dit que la LECTURE du CV source était partielle, jamais silencieusement', async () => {
    // #2542.3 — mesuré en suivant la chaîne #2542 : le dépôt sait déjà marquer
    // une fiche `cv_extraction_partial`. L'écran de revue est ce qui EXPOSE le
    // signal — sans lui, un champ « non trouvé » sur une page jamais lue est
    // indiscernable d'un champ absent du CV (GA-18/GA-19).
    const { service } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, cv_extraction_partial: true },
      parse: { data: { fields: [field()], source_chars: CV.length } },
    })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.partial).toBe(true)
  })

  it('#2542.3 — contrôle négatif : une lecture COMPLÈTE ne se dit jamais partielle', async () => {
    const { service } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, cv_extraction_partial: false },
      parse: { data: { fields: [field()], source_chars: CV.length } },
    })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.partial).toBe(false)
  })

  it('rend TOUJOURS les treize blocs, même ceux que le modèle a sautés', async () => {
    const { service } = makeService({ parse: { data: { fields: [field()], source_chars: CV.length } } })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.fields).toHaveLength(CV_DETECTIONS.length)
    // Un bloc absent de la liste se lirait comme un oubli d'affichage plutôt
    // que comme « ce CV ne le dit pas ».
    expect(proposal.fields.filter(entry => entry.value === null).length).toBe(CV_DETECTIONS.length - 1)
  })

  it('REJETTE un champ que l’IA aurait rendu sans citation', async () => {
    // Deuxième validation, après celle du service IA : la règle « pas de champ
    // sans preuve » est trop importante pour ne vivre qu'à un seul endroit.
    const { service } = makeService({
      parse: { data: { fields: [field({ source_excerpt: '' })], source_chars: CV.length } },
    })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.fields.find(entry => entry.detection === 'skills')?.value).toBeNull()
  })

  it('interdit « Tout accepter » quand un champ CRITIQUE est incertain', async () => {
    const { service } = makeService({
      parse: {
        data: {
          fields: [field(), field({ detection: 'identity', value: 'Yanis Berthier', confidence: 0.3 })],
          source_chars: CV.length,
        },
      },
    })
    const proposal = await service.propose(TALENT, WORKSPACE, USER)
    expect(proposal.canAcceptAll).toBe(false)
  })

  it('refuse de lire une fiche SANS CV plutôt que de composer à partir de rien', async () => {
    const { service, cvParse } = makeService({ talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: null } })
    await expect(service.propose(TALENT, WORKSPACE, USER)).rejects.toThrow(UnprocessableEntityException)
    expect(cvParse).not.toHaveBeenCalled()
  })

  /**
   * #2542.1 — mesuré pendant le call client de Ludovic Marx : le bouton
   * « Analyser » restait « en analyse » sans qu'aucune erreur ne remonte
   * quand le service IA lui-même était injoignable (pas seulement quand il
   * répondait sans rien d'exploitable — déjà couvert plus bas).
   */
  it('nomme le service indisponible plutôt que de laisser fuir une erreur technique (#2542.1)', async () => {
    const { service, cvParse } = makeService({ parseThrows: new Error('socket hang up') })
    const attempt = service.propose(TALENT, WORKSPACE, USER)
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(attempt).rejects.toThrow(/indisponible/)
    expect(cvParse).toHaveBeenCalled()
  })

  it('ne lit pas la fiche d’une autre équipe', async () => {
    const { service } = makeService({ talent: null })
    await expect(service.propose(TALENT, WORKSPACE, USER)).rejects.toThrow(NotFoundException)
  })
})

describe('CvParseService.commit', () => {
  it('QUALIFIE la fiche — le seul chemin qui le fasse', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' }],
    })
    expect(outcome.qualified).toBe(true)
    expect(saved[0]?.['review_status']).toBe('qualified')
    expect(saved[0]?.['qualified_at']).toBeInstanceOf(Date)
  })

  it('distingue « corrigé » de « accepté » dans la provenance', async () => {
    // Accepter n'est pas écrire : les confondre ferait croire, six mois plus
    // tard, que quelqu'un a saisi une valeur que personne n'a tapée.
    const { service } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [
        { detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' },
        { detection: 'skills', decision: 'correct', value: ['Kubernetes'] },
      ],
    })
    expect(outcome.applied).toEqual([
      { detection: 'job_title', provenance: 'model' },
      { detection: 'skills', provenance: 'human' },
    ])
  })

  it('n’écrit RIEN pour un champ rejeté', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'job_title', decision: 'reject', value: 'Directeur technique' }],
    })
    expect(outcome.rejected).toEqual(['job_title'])
    expect(saved[0]?.['title']).toBeUndefined()
  })

  it('n’invente PAS de séniorité — elle reste saisie', async () => {
    // La déduire d'un parsing la rendrait fausse sur tous les CV sans dates.
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'seniority', decision: 'accept', value: 8 }],
    })
    expect(saved[0]?.['seniority']).toBeUndefined()
  })
})

/**
 * Le bloc `identity` écrit enfin le NOM de la fiche (D367, D368).
 *
 * Jusqu'ici il tombait dans le `default` d'`applyToColumns` — « rien à écrire
 * aujourd'hui ». L'écran de revue proposait pourtant déjà ce bloc, avec
 * accepter / corriger / refuser, et `POST /parse/commit` recevait déjà la
 * décision : elle était JETÉE À L'ARRIVÉE. Du code juste que personne
 * n'appelle, dans sa forme la plus coûteuse — l'utilisateur croyait décider.
 */
describe('CvParseService.commit — le nom de la personne', () => {
  it('écrit le nom quand l’identité lue est sans ambiguïté un nom', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Yanis Berthier' }],
    })
    expect(saved[0]?.['full_name']).toBe('Yanis Berthier')
    expect(outcome.unwritten).toEqual([])
  })

  it('écrit le NOM en tête d’un agrégat, jamais l’agrégat entier (#3734)', async () => {
    // La forme que le prompt demande : « nom — intitulé/e-mail/… » dans une
    // seule valeur. Refusée en bloc jusqu'au 06/10/2026 : 464 fiches sur 484
    // sans nom après l'import ZIP. Le nom en tête est lu ; le reste ne l'est pas.
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'YANIS BERTHIER — Ingénieur plateforme' }],
    })
    expect(saved[0]?.['full_name']).toBe('YANIS BERTHIER')
    expect(outcome.unwritten).toEqual([])
  })

  it('n’écrit RIEN d’un agrégat sans nom de personne, et DIT pourquoi', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Ingénieur plateforme — Lyon' }],
    })
    expect(saved[0]?.['full_name']).toBeUndefined()
    expect(outcome.unwritten).toEqual([{ detection: 'identity', reason: 'joins_several_items' }])
  })

  it('n’écrit pas le nom du fichier, même si le modèle le rend', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'CV_2024_v3' }],
    })
    expect(saved[0]?.['full_name']).toBeUndefined()
    expect(outcome.unwritten).toEqual([{ detection: 'identity', reason: 'looks_like_a_file' }])
  })

  it('n’écrit rien quand le bloc est REFUSÉ', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'reject', value: 'Yanis Berthier' }],
    })
    expect(saved[0]?.['full_name']).toBeUndefined()
    // Un refus est une DÉCISION, pas une lecture ratée : il ne rejoint pas
    // `unwritten`, il est déjà dans `rejected`.
    expect(outcome.rejected).toEqual(['identity'])
    expect(outcome.unwritten).toEqual([])
  })

  /**
   * « Une correction humaine gagne toujours, quelle que soit sa date. »
   *
   * Le scénario réel : quelqu'un corrige « Yanis Berthier » sur la fiche, puis
   * on relance une revue du même CV et on ACCEPTE la lecture du modèle. Sans
   * arbitre, la proposition écrase la correction — sans erreur, sans log, et
   * la personne n'ose plus corriger.
   */
  describe('face à une correction humaine déjà en base', () => {
    it('une ACCEPTATION (provenance modèle) ne l’écrase pas', async () => {
      const { service, saved } = makeService({
        talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, full_name: 'Yanis Berthier' },
      })
      const outcome = await service.commit(
        TALENT,
        WORKSPACE,
        USER,
        { fields: [{ detection: 'identity', decision: 'accept', value: 'YANIS BERTHIER' }] },
        { full_name: 'human' },
      )
      expect(saved[0]?.['full_name']).toBe('Yanis Berthier')
      expect(outcome.unwritten).toEqual([{ detection: 'identity', reason: 'lower_authority' }])
    })

    it('une CORRECTION (provenance humaine) l’emporte', async () => {
      const { service, saved } = makeService({
        talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, full_name: 'Yanis Berthier' },
      })
      const outcome = await service.commit(
        TALENT,
        WORKSPACE,
        USER,
        { fields: [{ detection: 'identity', decision: 'correct', value: 'Yanis Berthié' }] },
        { full_name: 'human' },
      )
      expect(saved[0]?.['full_name']).toBe('Yanis Berthié')
      expect(outcome.unwritten).toEqual([])
    })

    it('remplit un nom ABSENT même depuis une acceptation — un trou n’a rien à protéger', async () => {
      const { service, saved } = makeService({
        talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, full_name: null },
      })
      await service.commit(
        TALENT,
        WORKSPACE,
        USER,
        { fields: [{ detection: 'identity', decision: 'accept', value: 'Yanis Berthier' }] },
        { full_name: 'human' },
      )
      expect(saved[0]?.['full_name']).toBe('Yanis Berthier')
    })
  })
})

/**
 * Lot 19 (#1789) — le défaut mesuré de bout en bout en production le 10/09 :
 * un CV texte dont l'identité s'écrit « Camille Recette —
 * camille.recette@example.invalid — 06 00 00 00 00 — Paris (75) » qualifiait
 * une fiche « Nom non renseigné », SANS e-mail ni téléphone, alors que les
 * trois étaient LUS et AFFICHÉS « sûr à 100 % » dans la revue. Le nom refuse
 * légitimement cet agrégat (D367, `carries_contact`) ; l'e-mail et le
 * téléphone, eux, n'avaient tout simplement aucun chemin d'écriture —
 * `consultants.email`/`consultants.phone` existent depuis le début.
 */
describe('CvParseService.commit — l’e-mail et le téléphone du bloc identity (#1789)', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75)'

  it('écrit le nom, l’e-mail et le téléphone d’un même agrégat — c’est LE défaut mesuré en prod', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    // #3734 — le nom en tête est lu aussi : jusqu'au 06/10/2026 il était
    // refusé en bloc, sur la forme même que le prompt demande.
    expect(saved[0]?.['full_name']).toBe('Camille Recette')
    expect(saved[0]?.['email']).toBe('camille.recette@example.invalid')
    expect(saved[0]?.['phone']).toBe('06 00 00 00 00')
  })

  it('n’ajoute PAS l’absence d’adresse à `unwritten` — un identity sans coordonnée est un CV normal', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Yanis Berthier' }],
    })
    expect(saved[0]?.['email']).toBeUndefined()
    expect(saved[0]?.['phone']).toBeUndefined()
    expect(outcome.unwritten).toEqual([])
  })

  it('une CORRECTION humaine de l’e-mail gagne sur une acceptation plus récente', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, email: 'camille@perso.example' },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }] },
      { email: 'human' },
    )
    // La fiche garde la correction humaine — `save` reçoit l'entité entière
    // (`Object.assign`), donc la valeur d'origine reste, jamais un `undefined`
    // de commodité.
    expect(saved[0]?.['email']).toBe('camille@perso.example')
    expect(outcome.written.some(entry => entry.column === 'email')).toBe(false)
  })

  it('rend les colonnes ÉCRITES avec leur provenance, comme les autres blocs', async () => {
    const { service } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(outcome.written).toEqual(
      expect.arrayContaining([
        { column: 'email', previous: null, value: 'camille.recette@example.invalid', source: 'model' },
        { column: 'phone', previous: null, value: '06 00 00 00 00', source: 'model' },
      ]),
    )
  })
})

/**
 * #2183.21 — même agrégat, même règle que l'e-mail et le téléphone : la
 * ville se cite indépendamment du sort du nom, jamais en cascade.
 */
describe('CvParseService.commit — la ville du bloc identity (#2183.21)', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75)'

  it('écrit la ville ET le nom d’un même agrégat (#3734)', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(saved[0]?.['full_name']).toBe('Camille Recette')
    expect(saved[0]?.['location']).toBe('Paris (75)')
  })

  it('n’écrit rien sur une ville nue, sans code — jamais une devinette', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Camille Recette — Lyon' }],
    })
    expect(saved[0]?.['location']).toBeUndefined()
  })

  it('une CORRECTION humaine de la ville gagne sur une acceptation plus récente', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, location: 'Nantes (44)' },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }] },
      { location: 'human' },
    )
    expect(saved[0]?.['location']).toBe('Nantes (44)')
  })

  it('rend la colonne ÉCRITE avec sa provenance, comme les autres blocs', async () => {
    const { service } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(outcome.written).toEqual(
      expect.arrayContaining([{ column: 'location', previous: null, value: 'Paris (75)', source: 'model' }]),
    )
  })
})

/**
 * #3952.3 (retour bêta 08/10) — même agrégat, même règle que l'e-mail, le
 * téléphone et la ville : le profil LinkedIn se cite indépendamment du sort
 * du nom. Mesuré en production : sans lui, `POST :id/enrich` refuse en 400
 * (`no_match_key`) toute fiche née d'un CV.
 */
describe('CvParseService.commit — le profil LinkedIn du bloc identity (#3952.3)', () => {
  const AGGREGATE =
    'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75) — linkedin.com/in/camille-recette'

  it('écrit le profil LinkedIn ET le nom d’un même agrégat', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(saved[0]?.['full_name']).toBe('Camille Recette')
    expect(saved[0]?.['public_profile_url']).toBe('https://linkedin.com/in/camille-recette')
  })

  it('n’écrit rien sans lien LinkedIn dans l’agrégat — jamais une devinette', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Camille Recette — Paris (75)' }],
    })
    expect(saved[0]?.['public_profile_url']).toBeUndefined()
  })

  it('une CORRECTION humaine du profil gagne sur une acceptation plus récente', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, public_profile_url: 'linkedin.com/in/perso' },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }] },
      { public_profile_url: 'human' },
    )
    expect(saved[0]?.['public_profile_url']).toBe('linkedin.com/in/perso')
  })

  it('rend la colonne ÉCRITE avec sa provenance, comme les autres blocs', async () => {
    const { service } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(outcome.written).toEqual(
      expect.arrayContaining([
        {
          column: 'public_profile_url',
          previous: null,
          value: 'https://linkedin.com/in/camille-recette',
          source: 'model',
        },
      ]),
    )
  })
})

/**
 * #3935.2 (08/10/2026) — même agrégat, même règle que l'e-mail/le téléphone/la
 * ville : l'URL de profil professionnel se cite indépendamment du sort du
 * nom, jamais en cascade.
 */
describe('CvParseService.commit — le profil du bloc identity (#3935.2)', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — https://www.linkedin.com/in/camille-recette'

  it('écrit le profil ET le nom d’un même agrégat', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(saved[0]?.['full_name']).toBe('Camille Recette')
    expect(saved[0]?.['public_profile_url']).toBe('https://www.linkedin.com/in/camille-recette')
  })

  it('n’écrit rien sans URL dans l’agrégat', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: 'Camille Recette — Lyon' }],
    })
    expect(saved[0]?.['public_profile_url']).toBeUndefined()
  })

  it('une URL CORRIGÉE à la main gagne sur une acceptation plus récente', async () => {
    const { service, saved } = makeService({
      talent: {
        id: TALENT,
        workspace_id: WORKSPACE,
        cv_text: CV,
        public_profile_url: 'https://www.linkedin.com/in/deja-corrige',
      },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }] },
      { public_profile_url: 'human' },
    )
    expect(saved[0]?.['public_profile_url']).toBe('https://www.linkedin.com/in/deja-corrige')
  })

  it('rend la colonne ÉCRITE avec sa provenance, comme les autres blocs', async () => {
    const { service } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'identity', decision: 'accept', value: AGGREGATE }],
    })
    expect(outcome.written).toEqual(
      expect.arrayContaining([
        {
          column: 'public_profile_url',
          previous: null,
          value: 'https://www.linkedin.com/in/camille-recette',
          source: 'model',
        },
      ]),
    )
  })
})

/**
 * #3935.2 (08/10/2026) — le bloc `languages` → `consultants.languages`
 * (`{code, level}[]`), signalé « chantier à part » au lot 19 (#1789) : la
 * colonne existait, rien ne la lisait. Même politique de GEL que les autres
 * listes (`stack`/`sectors`/`zones`) : une liste tenue par un humain n'est
 * jamais réécrite par une acceptation de modèle.
 */
describe('CvParseService.commit — le bloc languages (#3935.2)', () => {
  it('écrit la liste des langues depuis une acceptation', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'languages', decision: 'accept', value: 'Anglais (B2), Espagnol' }],
    })
    expect(saved[0]?.['languages']).toEqual([
      { code: 'en', level: 'b2' },
      { code: 'es', level: null },
    ])
    expect(outcome.written).toEqual(
      expect.arrayContaining([
        {
          column: 'languages',
          previous: [],
          value: [
            { code: 'en', level: 'b2' },
            { code: 'es', level: null },
          ],
          source: 'model',
        },
      ]),
    )
  })

  it('n’écrit rien quand aucune langue n’est reconnue', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'languages', decision: 'accept', value: 'Espéranto' }],
    })
    expect(saved[0]?.['languages']).toBeUndefined()
  })

  it('une liste de langues CORRIGÉE à la main n’est jamais réécrite par une acceptation', async () => {
    const { service, saved } = makeService({
      talent: {
        id: TALENT,
        workspace_id: WORKSPACE,
        cv_text: CV,
        languages: [{ code: 'de', level: 'c1' }],
      },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'languages', decision: 'accept', value: 'Anglais (B2)' }] },
      { languages: 'human' },
    )
    expect(saved[0]?.['languages']).toEqual([{ code: 'de', level: 'c1' }])
  })

  it('une CORRECTION humaine de la liste l’emporte, et remplace tout', async () => {
    const { service, saved } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'languages', decision: 'correct', value: 'Allemand (natif)' }],
    })
    expect(saved[0]?.['languages']).toEqual([{ code: 'de', level: 'natif' }])
  })
})

/**
 * #2183.26 / #2784 — le bloc `education` rejoint désormais une colonne
 * réelle (`consultants.education`), avec le même arbitrage que `sectors` :
 * une liste écrite par un humain est gelée entière, jamais fusionnée.
 */
describe('CvParseService.commit — les formations du bloc education (#2183.26)', () => {
  it('écrit la liste des formations depuis une acceptation', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'education', decision: 'accept', value: ['Master Informatique — Sorbonne — 2015'] }],
    })
    expect(saved[0]?.['education']).toEqual(['Master Informatique — Sorbonne — 2015'])
    expect(outcome.written).toEqual(
      expect.arrayContaining([
        {
          column: 'education',
          previous: null,
          value: ['Master Informatique — Sorbonne — 2015'],
          source: 'model',
        },
      ]),
    )
  })

  it('gèle la liste de formations tenue à la main plutôt que de la fusionner', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, education: ['DUT Réseaux — Lyon'] },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'education', decision: 'accept', value: ['Master Informatique — Sorbonne — 2015'] }] },
      { education: 'human' },
    )
    expect(saved[0]?.['education']).toEqual(['DUT Réseaux — Lyon'])
    expect(outcome.unwritten).toEqual([{ detection: 'education', reason: 'lower_authority' }])
  })
})

/**
 * #3935.2a (lot M07, 09/10) — environnements, outils et certifications étaient
 * LUS par le modèle et jamais écrits : aucune colonne ne les portait. Ils ont
 * maintenant leur colonne (`consultants.environments/tools/certifications`),
 * le même arbitrage que `education` (liste gelée par une correction humaine)
 * et leur provenance par champ dans `field_provenance` (via `written`).
 * « Non lu » reste `null` : un bloc sans valeur n'écrit JAMAIS une liste vide.
 */
describe('CvParseService.commit — environnements, outils, certifications (#3935.2a)', () => {
  it.each([
    ['environments', ['AWS', 'PostgreSQL', 'GitLab CI']],
    ['tools', ['Jira', 'Power BI']],
    ['certifications', ['AWS Solutions Architect — Amazon']],
  ] as const)('écrit le bloc %s dans sa colonne, en provenance model', async (detection, value) => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection, decision: 'accept', value: [...value] }],
    })
    expect(saved[0]?.[detection]).toEqual(value)
    expect(outcome.written).toEqual(
      expect.arrayContaining([{ column: detection, previous: null, value, source: 'model' }]),
    )
  })

  it('une correction humaine gagne : la liste tenue à la main n’est pas réécrite par une acceptation', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, tools: ['Confluence'] },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'tools', decision: 'accept', value: ['Jira'] }] },
      { tools: 'human' },
    )
    expect(saved[0]?.['tools']).toEqual(['Confluence'])
    expect(outcome.unwritten).toEqual([{ detection: 'tools', reason: 'lower_authority' }])
  })

  it('« non lu » n’est jamais vide : un bloc sans valeur n’écrit rien, la colonne reste nulle', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [
        { detection: 'environments', decision: 'accept', value: null },
        { detection: 'certifications', decision: 'accept', value: [] },
      ],
    })
    expect(saved[0]).not.toHaveProperty('environments')
    expect(saved[0]).not.toHaveProperty('certifications')
    expect(outcome.written.map(entry => entry.column)).not.toContain('environments')
  })
})

/**
 * Lot 19 (#1789) — `availability` figure parmi les treize détections et sa
 * colonne SQL existe depuis `1788013450112-Consultants` ; rien ne les
 * reliait. Mesuré en production : `availability: "inconnu"` sur une fiche dont
 * le CV disait « Disponible : sous 1 mois », lu et affiché sûr à 100 %.
 */
describe('CvParseService.commit — la disponibilité (#1789)', () => {
  it('écrit la disponibilité sur une fiche NEUVE — le piège du défaut `inconnu`', async () => {
    // `availability` vaut `'inconnu'` par DÉFAUT SQL sur toute fiche neuve —
    // ce n'est l'affirmation de personne. Sans traiter ce défaut comme un
    // blanc, `decideFieldWrite` le lirait comme une valeur `pipeline` déjà en
    // place et refuserait la toute première acceptation d'un modèle
    // (`lower_authority`) : la colonne resterait `inconnu` pour toujours,
    // silencieusement — exactement le symptôme mesuré en production.
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, availability: 'inconnu' },
    })
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'availability', decision: 'accept', value: 'Disponible : sous 1 mois' }],
    })
    expect(saved[0]?.['availability']).toBe('sous_1_mois')
    expect(outcome.unwritten).toEqual([])
  })

  it('n’écrit rien sur une mention ambiguë — jamais de catégorie devinée', async () => {
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'availability', decision: 'accept', value: 'Disponible' }],
    })
    expect(saved[0]?.['availability']).toBeUndefined()
    expect(outcome.unwritten).toEqual([])
  })

  it('une CORRECTION humaine l’emporte sur une acceptation ultérieure', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, availability: 'indisponible' },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'availability', decision: 'accept', value: 'Disponible immédiatement' }] },
      { availability: 'human' },
    )
    // La fiche garde la correction humaine, pas un `undefined` de commodité.
    expect(saved[0]?.['availability']).toBe('indisponible')
    expect(outcome.unwritten).toEqual([{ detection: 'availability', reason: 'lower_authority' }])
  })
})

/**
 * Le semis du référentiel typé, trouvé manquant en recette.
 *
 * Une revue de CV remplissait la liste libre de la fiche et laissait l'onglet
 * « Compétences » vide : les deux portent le même nom à l'écran et lisent deux
 * tables différentes.
 */
describe('CvParseService.commit — semis des compétences typées', () => {
  it('sème les compétences validées avec la source « cv » et un niveau inconnu', async () => {
    const { service, seedQuery } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'skills', decision: 'accept', value: ['Kubernetes', 'Go'] }],
    })
    // Le semis, puis (#5016.1) la lecture qui resynchronise la liste libre.
    expect(seedQuery).toHaveBeenCalledTimes(2)
    const [sql, params] = seedQuery.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('consultant_skills')
    expect(sql).toContain("'inconnu'")
    expect(params[2]).toEqual(['kubernetes', 'go'])
    expect(params[4]).toBe('cv')
  })

  it('#5016.1 — resynchronise la liste libre sur le référentiel après le semis, dans l’espace de la fiche', async () => {
    const { service, seedQuery } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'skills', decision: 'accept', value: ['Kubernetes'] }],
    })
    const [sql, params] = seedQuery.mock.calls[1] as unknown as [string, unknown[]]
    expect(sql).toContain('FROM consultants')
    expect(sql).toContain('consultant_skills')
    expect(params).toEqual([TALENT, WORKSPACE])
  })

  it('ne sème rien quand aucune compétence n’a été validée', async () => {
    const { service, seedQuery } = makeService()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'skills', decision: 'reject', value: ['Kubernetes'] }],
    })
    expect(seedQuery).not.toHaveBeenCalled()
  })

  it('un semis en échec ne fait pas tomber la validation du CV', async () => {
    const { service, seedQuery } = makeService()
    seedQuery.mockRejectedValueOnce(new Error('base indisponible'))
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'skills', decision: 'accept', value: ['Kubernetes'] }],
    })
    expect(outcome.qualified).toBe(true)
  })

  /**
   * Le semis suit ce que le RECRUTEUR a validé, pas ce que la colonne a reçu.
   *
   * Les deux tables n'ont pas la même règle, et le fichier le dit déjà : « retirer
   * un mot de la liste libre ne doit jamais supprimer une compétence prouvée ».
   * Faire dépendre le semis du sort de `consultants.stack` ferait qu'un arbitrage
   * sur la LISTE LIBRE désactiverait au passage le référentiel typé — une
   * capacité perdue en silence, que personne n'a demandé de retirer.
   */
  it('sème même quand la liste libre a été préservée par l’arbitre', async () => {
    const { service, seedQuery, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, stack: ['Go'] },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'skills', decision: 'accept', value: ['Kubernetes', 'Go'] }] },
      { stack: 'human' },
    )
    expect(saved[0]?.['stack']).toEqual(['Go'])
    expect(seedQuery).toHaveBeenCalledTimes(2)
  })
})

/**
 * Les QUATRE autres colonnes de fiche que la revue écrit (D378).
 *
 * `full_name` était arbitré depuis D368 ; `title`, `stack`, `sectors` et `zones`
 * ne l'étaient pas. Le scénario est le même que pour le nom, et il est banal :
 * un commercial corrige l'intitulé de poste d'un consultant, quelqu'un relit le
 * même CV et clique « Accepter » sur le bloc — la correction disparaît, sans un
 * mot. « Une correction humaine gagne toujours, quelle que soit sa date. »
 */
describe('CvParseService.commit — les quatre autres colonnes de fiche', () => {
  it('une ACCEPTATION n’écrase pas un intitulé de poste corrigé à la main', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, title: 'DSI' },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'job_title', decision: 'accept', value: 'Directeur des systèmes d’information' }] },
      { title: 'human' },
    )
    expect(saved[0]?.['title']).toBe('DSI')
    // Un silence se lirait « le produit est cassé » : le refus porte sa raison.
    expect(outcome.unwritten).toEqual([{ detection: 'job_title', reason: 'lower_authority' }])
  })

  it('une CORRECTION l’emporte sur la valeur en base, quelle que soit sa date', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, title: 'DSI' },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'job_title', decision: 'correct', value: 'Directrice des systèmes d’information' }] },
      { title: 'human' },
    )
    expect(saved[0]?.['title']).toBe('Directrice des systèmes d’information')
    expect(outcome.unwritten).toEqual([])
  })

  /**
   * Les trois LISTES — le choix, et sa raison.
   *
   * `stack`, `sectors` et `zones` sont gelées ENTIÈREMENT dès qu'un humain les a
   * écrites : on ne fusionne pas la proposition du modèle dans la liste tenue à
   * la main. La raison est qu'une fusion RESSUSCITE — rien, dans le dépôt, ne se
   * souvient qu'un recruteur a retiré « PHP » de ce profil, donc chaque relecture
   * du CV le remettrait. Le gel, lui, ne contredit jamais un geste : il refuse
   * juste d'en ajouter, le dit, et la porte reste ouverte — « corriger » est une
   * décision humaine, et elle passe toujours.
   */
  it('gèle la liste ENTIÈRE des compétences, pas seulement les retraits', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, stack: ['Go', 'Kubernetes'] },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'skills', decision: 'accept', value: ['Go', 'Kubernetes', 'Prometheus'] }] },
      { stack: 'human' },
    )
    // Ni fusion, ni union : la liste tenue à la main reste telle quelle.
    expect(saved[0]?.['stack']).toEqual(['Go', 'Kubernetes'])
    expect(outcome.unwritten).toEqual([{ detection: 'skills', reason: 'lower_authority' }])
  })

  it('gèle de la même façon les secteurs et les zones', async () => {
    const { service, saved } = makeService({
      talent: {
        id: TALENT,
        workspace_id: WORKSPACE,
        cv_text: CV,
        sectors: ['Banque'],
        zones: ['Île-de-France'],
      },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      {
        fields: [
          { detection: 'sectors', decision: 'accept', value: ['Banque', 'Assurance'] },
          { detection: 'mobility', decision: 'accept', value: ['France entière'] },
        ],
      },
      { sectors: 'human', zones: 'human' },
    )
    expect(saved[0]?.['sectors']).toEqual(['Banque'])
    expect(saved[0]?.['zones']).toEqual(['Île-de-France'])
    expect(outcome.unwritten).toEqual([
      { detection: 'sectors', reason: 'lower_authority' },
      { detection: 'mobility', reason: 'lower_authority' },
    ])
  })

  it('remplit une liste ABSENTE même depuis une acceptation — un trou n’a rien à protéger', async () => {
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, stack: [] },
    })
    await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'skills', decision: 'accept', value: ['Go'] }] },
      { stack: 'human' },
    )
    expect(saved[0]?.['stack']).toEqual(['Go'])
  })

  it('remplit un intitulé ABSENT depuis une acceptation — un trou n’a rien à protéger', async () => {
    // Le cas de très loin le plus fréquent : la fiche vient d'un CV déposé, elle
    // n'a pas d'intitulé, la revue le lui donne.
    const { service, saved } = makeService()
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' }],
    })
    expect(saved[0]?.['title']).toBe('Ingénieur plateforme')
    expect(outcome.unwritten).toEqual([])
  })

  it('une ACCEPTATION ne réécrit pas une valeur d’origine INCONNUE', async () => {
    // Le contrat traite une provenance non enregistrée comme `pipeline` (rang 2)
    // et une acceptation vaut `model` (rang 1) : accepter n'écrase donc pas une
    // valeur dont personne ne sait d'où elle vient. C'est déjà la règle du nom
    // depuis D368, et c'est la prudente — la seule main qu'on risquerait
    // d'écraser est une main qu'on n'a pas su enregistrer. La porte reste
    // ouverte d'un clic (« corriger »), et le refus est DIT.
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, title: 'Ingénieur' },
    })
    const outcome = await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' }],
    })
    expect(saved[0]?.['title']).toBe('Ingénieur')
    expect(outcome.unwritten).toEqual([{ detection: 'job_title', reason: 'lower_authority' }])
  })

  it('deux acceptations successives se départagent par la plus récente', async () => {
    // Ce que la mémoire de provenance rend possible (D379) : la revue n°1 écrit
    // et fait tamponner `model` ; la revue n°2 accepte à son tour, `model` contre
    // `model`, et la plus récente passe. Sans le tampon, un arbitre refuserait
    // ses propres écritures et la revue ne servirait qu'une fois.
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, title: 'Ingénieur' },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' }] },
      { title: 'model' },
    )
    expect(saved[0]?.['title']).toBe('Ingénieur plateforme')
    expect(outcome.unwritten).toEqual([])
  })

  /**
   * Ce que le contrôleur doit consigner — la seconde moitié de l'arbitrage.
   *
   * `written` ne rend QUE ce qui a atterri en colonne. Une revue qui rendrait
   * aussi les refus ferait tamponner une provenance sur une valeur jamais
   * écrite : la fiche dirait « ce champ vient d'un modèle » à propos de la
   * saisie d'un humain, et l'arbitrage suivant se tromperait de camp.
   */
  it('rend les colonnes RÉELLEMENT écrites, avec leur provenance et leur valeur d’avant', async () => {
    const { service } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, title: 'DSI', sectors: ['Banque'] },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      {
        fields: [
          { detection: 'job_title', decision: 'accept', value: 'Directeur des systèmes d’information' },
          { detection: 'sectors', decision: 'correct', value: ['Assurance'] },
          { detection: 'identity', decision: 'correct', value: 'Yanis Berthier' },
        ],
      },
      { title: 'human' },
    )
    expect(outcome.written).toEqual([
      { column: 'sectors', previous: ['Banque'], value: ['Assurance'], source: 'human' },
      { column: 'full_name', previous: null, value: 'Yanis Berthier', source: 'human' },
    ])
  })

  it('une valeur ILLISIBLE n’écrit rien et ne VIDE rien', async () => {
    // Un `correct` de provenance humaine a le droit de vider un champ ; mais une
    // valeur que la revue n'a pas su lire n'est pas une intention de vider. La
    // confondre avec un effacement supprimerait une liste sur un bloc laissé
    // vide à l'écran.
    const { service, saved } = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, stack: ['Go'] },
    })
    const outcome = await service.commit(
      TALENT,
      WORKSPACE,
      USER,
      { fields: [{ detection: 'skills', decision: 'correct', value: [] }] },
      { stack: 'human' },
    )
    expect(saved[0]?.['stack']).toEqual(['Go'])
    expect(outcome.unwritten).toEqual([])
  })
})

/**
 * #3935.2b (lot M07, 09/10) — les expériences lues dans le CV s'écrivent dans
 * `consultant_experiences`, avec leur provenance par champ ; une expérience
 * saisie ou corrigée à la main n'est jamais réécrite par une relecture.
 */
describe('CvParseService — expériences structurées (#3935.2b)', () => {
  type Row = Record<string, unknown> & { id: string }
  function withExperiences(existing: Row[] = []) {
    const base = makeService()
    const rows: Row[] = existing.map(row => ({ ...row }))
    const experiences = {
      find: jest.fn(async () => rows),
      create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
      save: jest.fn(async (row: Record<string, unknown>) => {
        rows.push({ id: `new-${rows.length}`, ...row })
        return row
      }),
      update: jest.fn(async () => ({ affected: 1 })),
    }
    const consultants = (base.service as unknown as { consultants: unknown }).consultants
    const ia = (base.service as unknown as { ia: unknown }).ia
    const service = new CvParseService(consultants as never, ia as never, experiences as never)
    return { service, experiences, rows, saved: base.saved }
  }
  const LINE = 'Cheffe de projet SI | Cabinet de conseil | 2023-01 | 2025-06 | Deux migrations en parallèle'

  it('une acceptation écrit l’expérience lue, provenance model par champ, bornée à l’espace', async () => {
    const { service, experiences } = withExperiences()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'experiences', decision: 'accept', value: [LINE] }],
    })
    expect(experiences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        consultant_id: TALENT,
        workspace_id: WORKSPACE,
        role: 'Cheffe de projet SI',
        entreprise: 'Cabinet de conseil',
        date_debut: '2023-01-01',
        date_debut_precision: 'month',
        date_fin: '2025-06-01',
        date_fin_precision: 'month',
        realisations: 'Deux migrations en parallèle',
        field_provenance: {
          role: 'model',
          entreprise: 'model',
          date_debut: 'model',
          date_fin: 'model',
          realisations: 'model',
        },
      }),
    )
  })

  it('une correction humaine gagne : la ligne saisie à la main n’est pas réécrite', async () => {
    const { service, experiences } = withExperiences([
      {
        id: 'h1',
        role: 'Cheffe de projet SI',
        entreprise: 'Cabinet de conseil',
        date_debut: '2022-09-01',
        date_fin: '2025-06-01',
        realisations: 'Saisi à la main',
        field_provenance: {
          role: 'human',
          entreprise: 'human',
          date_debut: 'human',
          date_fin: 'human',
          realisations: 'human',
        },
      },
    ])
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'experiences', decision: 'accept', value: [LINE] }],
    })
    expect(experiences.update).not.toHaveBeenCalled()
    expect(experiences.create).not.toHaveBeenCalled()
  })

  it('la lecture automatique écrit aussi les expériences, avec l’extrait du CV pour preuve', async () => {
    const { service, experiences } = withExperiences()
    const base = makeService({
      talent: { id: TALENT, workspace_id: WORKSPACE, cv_text: CV, review_status: 'needs_review' },
      parse: {
        data: {
          fields: [field({ detection: 'experiences', value: [LINE], source_excerpt: 'Kubernetes, Prometheus, Go.' })],
          source_chars: CV.length,
        },
      },
    })
    const consultants = (base.service as unknown as { consultants: unknown }).consultants
    const ia = (base.service as unknown as { ia: unknown }).ia
    const auto = new CvParseService(consultants as never, ia as never, experiences as never)
    await auto.autoRead(TALENT, WORKSPACE, USER, {})
    expect(experiences.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'Cheffe de projet SI', preuve: 'Kubernetes, Prometheus, Go.' }),
    )
    expect(service).toBeDefined()
  })

  // #3935 (lot P03, décision Louis 09/10) — « 2019 – 2021 » est GARDÉE à l'année :
  // l'année au 1er janvier (convention de stockage) ET la précision `year`.
  it('une date à l’année seule est écrite avec sa précision `year`, jamais un mois', async () => {
    const { service, experiences } = withExperiences()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [
        { detection: 'experiences', decision: 'accept', value: ['Chargée de projet junior |  | 2019 | 2021 |'] },
      ],
    })
    expect(experiences.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Chargée de projet junior',
        date_debut: '2019-01-01',
        date_debut_precision: 'year',
        date_fin: '2021-01-01',
        date_fin_precision: 'year',
        field_provenance: { role: 'model', date_debut: 'model', date_fin: 'model' },
      }),
    )
  })

  it('le rattrapage complète une date laissée vide par le lot M07, précision comprise', async () => {
    const { service, experiences } = withExperiences([
      {
        id: 'm1',
        role: 'Chargée de projet junior',
        entreprise: null,
        date_debut: null,
        date_debut_precision: null,
        date_fin: null,
        date_fin_precision: null,
        realisations: null,
        field_provenance: { role: 'model' },
      },
    ])
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [
        { detection: 'experiences', decision: 'accept', value: ['Chargée de projet junior |  | 2019 | 2021 |'] },
      ],
    })
    expect(experiences.update).toHaveBeenCalledWith(
      { id: 'm1', consultant_id: TALENT },
      expect.objectContaining({
        date_debut: '2019-01-01',
        date_debut_precision: 'year',
        date_fin: '2021-01-01',
        date_fin_precision: 'year',
      }),
    )
  })

  it('sait dire NON : une date humaine garde sa date ET sa précision, seule la fin vide se complète', async () => {
    const { service, experiences } = withExperiences([
      {
        id: 'h2',
        role: 'Chargée de projet junior',
        entreprise: null,
        date_debut: '2018-06-01',
        date_debut_precision: null,
        date_fin: null,
        date_fin_precision: null,
        realisations: null,
        field_provenance: { role: 'human', date_debut: 'human' },
      },
    ])
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [
        { detection: 'experiences', decision: 'accept', value: ['Chargée de projet junior |  | 2019 | 2021 |'] },
      ],
    })
    expect(experiences.update).toHaveBeenCalledTimes(1)
    const [, patch] = experiences.update.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(patch).toEqual(expect.objectContaining({ date_fin: '2021-01-01', date_fin_precision: 'year' }))
    expect(patch).not.toHaveProperty('date_debut')
    expect(patch).not.toHaveProperty('date_debut_precision')
  })

  it('sait dire NON : un bloc en texte libre n’écrit aucune expérience devinée', async () => {
    const { service, experiences } = withExperiences()
    await service.commit(TALENT, WORKSPACE, USER, {
      fields: [{ detection: 'experiences', decision: 'accept', value: ['2019-2021 — Chargée de projet junior.'] }],
    })
    expect(experiences.create).not.toHaveBeenCalled()
  })
})
