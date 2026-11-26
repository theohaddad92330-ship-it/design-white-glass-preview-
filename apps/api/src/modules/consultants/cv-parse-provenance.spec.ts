import 'reflect-metadata'
import type { Repository } from 'typeorm'
import { consultantUpsertSchema } from '@bellum/contracts'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { IaClient } from '../ia/ia.client'
import { ConsultantsController } from './consultants.controller'
import { CvParseService } from './cv-parse.service'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * GA-132 — un arbitre de provenance doit avoir un ÉCRIVAIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT, ET COMMENT IL SE VIOLE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une correction humaine gagne toujours » suppose qu'on sache QUI a écrit la
 * valeur en place. Cette mémoire est `field_provenance`, et elle n'existe que si
 * quelqu'un la remplit. Un writer qui LIT la provenance sans jamais la FAIRE
 * ÉCRIRE produit un arbitre qui refuse ses propres écritures : la revue n°1 pose
 * un intitulé de poste, personne ne consigne d'où il vient, la revue n°2 lit une
 * provenance INCONNUE — que le contrat traite en `pipeline`, rang 2 — et refuse
 * une acceptation, qui vaut `model`, rang 1. La fonctionnalité paraît cassée et
 * aucun test de service ne le voit, parce que le trou n'est pas dans le service.
 *
 * C'est la forme locale d'une cause racine que ce dépôt paie en boucle : du code
 * juste que personne n'appelle — ici, une colonne LUE que rien n'écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EST COMPORTEMENTALE ET NON TEXTUELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Reconnaître « ce service fait consigner ce qu'il écrit » dans du texte
 * demanderait de deviner une intention dans du JSX de serveur — exactement la
 * façon dont une garde devient borgne. Celle-ci fait donc tourner le VRAI service
 * et le VRAI contrôleur, et compare deux ensembles qu'elle MESURE : les colonnes
 * réellement posées sur la fiche, et les champs réellement tamponnés. Retirer la
 * boucle de tamponnage du contrôleur la fait tomber ; ajouter une colonne à la
 * revue sans la tamponner aussi.
 */

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'
const CV = 'YANIS BERTHIER — Ingénieur plateforme. Kubernetes, Prometheus, Go.'

/** Les colonnes de fiche que la fiche elle-même NE peut PAS écrire n'ont aucune
 *  main humaine à opposer : les arbitrer gèlerait une valeur pour toujours. */
const TALENT_FORM_COLUMNS = new Set(Object.keys(consultantUpsertSchema.shape))

type Stamp = { source: string; field: string; oldValue: unknown; newValue: unknown }

function build(talent: Partial<ConsultantEntity>) {
  const saved: Record<string, unknown>[] = []
  const stamps: Stamp[] = []

  const consultants = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => talent),
    })),
    save: jest.fn(async (row: Record<string, unknown>) => {
      saved.push({ ...row })
      return row
    }),
    manager: { query: jest.fn(async () => undefined) },
  } as unknown as Repository<ConsultantEntity>

  const cvParse = new CvParseService(consultants, { cvParse: jest.fn() } as unknown as IaClient)

  const provenance = {
    currentSources: jest.fn(async () => ({})),
    commit: jest.fn(async (params: { source: string; changes: Omit<Stamp, 'source'>[] }) => {
      for (const change of params.changes) stamps.push({ source: params.source, ...change })
    }),
  }

  const controller = new ConsultantsController(
    {} as never,
    { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE, role: 'owner' }) } as never,
    {} as never,
    provenance as never,
    cvParse as never,
    {} as never,
    { observe: async () => undefined } as never,
    brandsStub as never,
    {} as never,
  )

  return { controller, provenance, stamps, saved }
}

/** Les cinq blocs qui ont une colonne, tels que l'écran de revue les envoie. */
const FIVE_BLOCKS = {
  fields: [
    { detection: 'identity', decision: 'correct', value: 'Yanis Berthier' },
    { detection: 'job_title', decision: 'accept', value: 'Ingénieur plateforme' },
    { detection: 'skills', decision: 'accept', value: ['Kubernetes', 'Go'] },
    { detection: 'sectors', decision: 'accept', value: ['Banque'] },
    { detection: 'mobility', decision: 'accept', value: ['Île-de-France'] },
  ],
} as never

describe('GA-132 — un arbitre de provenance doit avoir un écrivain', () => {
  it('lit vraiment quelque chose : la revue écrit bien CINQ colonnes de fiche', async () => {
    // Une garde dont le corpus est vide est verte pour toujours. Ici le corpus
    // est ce que le VRAI service pose sur la fiche — si la revue cessait
    // d'écrire, ce chiffre tomberait et la garde le dirait avant de conclure.
    const { controller, saved } = build({ id: TALENT, workspace_id: WORKSPACE, cv_text: CV })
    await controller.commitCvParse(TALENT, FIVE_BLOCKS, { userId: USER } as never)

    const row = saved[0] ?? {}
    const columns = ['full_name', 'title', 'stack', 'sectors', 'zones'].filter(column => row[column] !== undefined)
    expect(columns).toHaveLength(5)
    // Et chacune est une colonne que le FORMULAIRE de la fiche sait écrire :
    // arbitrer une colonne qu'aucune main ne peut atteindre la gèlerait pour
    // toujours, puisque aucune provenance `human` ne pourrait jamais y naître.
    expect(TALENT_FORM_COLUMNS.size).toBeGreaterThan(20)
    for (const column of columns) expect(TALENT_FORM_COLUMNS.has(column)).toBe(true)
  })

  it('TOUTE colonne écrite par la revue est tamponnée sur ELLE-MÊME', async () => {
    const { controller, saved, stamps } = build({ id: TALENT, workspace_id: WORKSPACE, cv_text: CV })
    await controller.commitCvParse(TALENT, FIVE_BLOCKS, { userId: USER } as never)

    const row = saved[0] ?? {}
    const written = ['full_name', 'title', 'stack', 'sectors', 'zones'].filter(column => row[column] !== undefined)
    // Les lignes `cv_parse.<bloc>` disent qu'une revue a EU LIEU ; elles ne
    // disent pas que la colonne a changé de main, et c'est la confusion qui a
    // laissé quatre colonnes sans mémoire.
    const stampedColumns = stamps.filter(s => !s.field.startsWith('cv_parse.')).map(s => s.field)
    expect(stampedColumns.sort()).toEqual([...written].sort())
  })

  it('le tampon distingue « corrigé » de « accepté » — accepter n’est pas écrire', async () => {
    const { controller, stamps } = build({ id: TALENT, workspace_id: WORKSPACE, cv_text: CV })
    await controller.commitCvParse(TALENT, FIVE_BLOCKS, { userId: USER } as never)

    const byField = new Map(stamps.filter(s => !s.field.startsWith('cv_parse.')).map(s => [s.field, s.source]))
    // Le seul bloc CORRIGÉ de l'envoi. Le confondre avec les autres ferait
    // croire, six mois plus tard, qu'un humain a tapé une valeur que personne
    // n'a tapée — et gèlerait la fiche contre toute relecture.
    expect(byField.get('full_name')).toBe('human')
    expect(byField.get('title')).toBe('model')
    expect(byField.get('stack')).toBe('model')
  })

  it('un champ REFUSÉ par l’arbitre n’est PAS tamponné', async () => {
    // Tamponner un refus ferait dire à la fiche « ce champ vient d'un modèle »
    // à propos de la saisie d'un humain : l'arbitrage suivant se tromperait de
    // camp, et la correction qu'on vient de protéger tomberait au tour d'après.
    const { controller, provenance, stamps } = build({
      id: TALENT,
      workspace_id: WORKSPACE,
      cv_text: CV,
      title: 'DSI',
    })
    provenance.currentSources.mockResolvedValueOnce({ title: 'human' } as never)
    await controller.commitCvParse(TALENT, FIVE_BLOCKS, { userId: USER } as never)

    const stampedColumns = stamps.filter(s => !s.field.startsWith('cv_parse.')).map(s => s.field)
    expect(stampedColumns).not.toContain('title')
    // Les autres colonnes de la même revue passent quand même : un refus est
    // par champ, jamais par lot.
    expect(stampedColumns).toContain('stack')
  })

  it('le tampon porte la valeur d’AVANT, pas un `null` de commodité', async () => {
    // Le journal d'écriture répond à « qui a changé ça, et à partir de quoi ».
    // Un `oldValue` toujours nul rend la seconde moitié de la question sans
    // réponse — et c'est ce que le chemin faisait pour `full_name`.
    const { controller, stamps } = build({
      id: TALENT,
      workspace_id: WORKSPACE,
      cv_text: CV,
      title: 'Ingénieur',
      full_name: 'Y. Berthier',
    })
    await controller.commitCvParse(TALENT, FIVE_BLOCKS, { userId: USER } as never)

    const name = stamps.find(s => s.field === 'full_name')
    expect(name?.oldValue).toBe('Y. Berthier')
    expect(name?.newValue).toBe('Yanis Berthier')
  })
})
