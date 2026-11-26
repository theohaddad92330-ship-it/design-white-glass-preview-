import 'reflect-metadata'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { TalentController } from './talent.controller'

/**
 * CE QUE LE PRODUIT FAIT PENDANT LA SAISIE (BEL-BO-003, PDF-02 §3.3).
 *
 * Deux lignes du tableau du §3.3 n'avaient aucun chemin depuis le formulaire :
 *
 *  - « Nom saisi → détection de doublon, PROPOSÉE, jamais fusionnée ». Elle
 *    existait au dépôt de CV (`CvIntakeService.findDuplicates`, appelée par
 *    `POST /talents/cv`) et nulle part ailleurs : aucune route ne permettait de
 *    la poser sur un nom qu'on est en train de taper ;
 *  - « Compétence saisie → proposition d'alias depuis le référentiel partagé,
 *    jamais appliqué d'office ». Le référentiel (`canonicalSkill`) et la file
 *    d'enrichissement existaient, mais rien ne PROPOSAIT pendant la frappe : la
 *    file `observe` est nourrie APRÈS l'enregistrement, pour un administrateur.
 *
 * Les deux routes sont des LECTURES. Elles n'écrivent rien, et c'est la moitié
 * de la règle : on propose, on ne fusionne ni n'applique jamais.
 */
function build(overrides: { duplicates?: unknown[]; approved?: Map<string, string> } = {}) {
  const calls: { workspaceId: string; candidate: unknown }[] = []
  const talents = { workspaceOf: () => Promise.resolve('w1') }
  const intakeService = {
    findDuplicates: (workspaceId: string, candidate: unknown) => {
      calls.push({ workspaceId, candidate })
      return Promise.resolve(overrides.duplicates ?? [])
    },
  }
  const aliases = { approvedAliases: () => Promise.resolve(overrides.approved ?? new Map<string, string>()) }
  const photos = { attach: (_workspaceId: string, page: unknown) => Promise.resolve(page) }
  const controller = new TalentController(
    talents as never,
    {} as never,
    intakeService as never,
    // #2568.1 / #2569.1 — le lot N (messagerie, ZIP) : aucun rôle dans
    // l'assistance à la saisie, même raison que le détecteur plus bas.
    {} as never,
    // #3065 (lot 2b) — l'import ZIP volumineux : même raison.
    {} as never,
    aliases as never,
    {} as never,
    photos as never,
    // Le détecteur d'expertise manquante (PDF 4 §8.4) : aucun rôle dans
    // l'assistance à la saisie, mais le contrôleur le porte — l'omettre
    // décalerait les paramètres positionnels d'un cran.
    {} as never,
    // #2327 — la résolution d'identité et la file des tâches : même raison.
    {} as never,
    {} as never,
    // #2326.7/.9 et #2326.8 (épopée #2794) — disponibilités et export ATS :
    // même raison, aucun rôle dans l'assistance à la saisie.
    {} as never,
    {} as never,
    // #4347 — la rédaction du message au consultant : aucun rôle ici, même raison.
    {} as never,
  )
  return { controller, calls }
}

describe('GET /talents/duplicates — la détection PROPOSE pendant la saisie', () => {
  it('rend les correspondances, avec leur raison', async () => {
    const { controller } = build({
      duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_email', confidence: 0.95 }],
    })
    const out = await controller.duplicates(
      { userId: 'u1' } as never,
      {
        full_name: 'Yanis Berthier',
        email: 'yanis@acme.fr',
      } as never,
    )
    expect(out.items).toHaveLength(1)
    expect(out.items[0].reason).toBe('same_email')
  })

  it('ne cherche RIEN quand il n’y a rien à comparer', async () => {
    // Interroger le vivier entier sur une chaîne vide rapprocherait tout le
    // monde de tout le monde — et ferait une requête par frappe pour rien.
    const { controller, calls } = build()
    const out = await controller.duplicates({ userId: 'u1' } as never, { full_name: '   ' } as never)
    expect(out.items).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('passe le nom, l’e-mail et le téléphone tels quels au moteur existant', async () => {
    // Une seconde définition du doublon divergerait de celle du dépôt de CV.
    const { controller, calls } = build()
    await controller.duplicates(
      { userId: 'u1' } as never,
      {
        full_name: 'Nadia Fournier',
        email: 'n@acme.fr',
        phone: '0142000000',
      } as never,
    )
    expect(calls[0].candidate).toEqual({
      fullName: 'Nadia Fournier',
      email: 'n@acme.fr',
      phone: '0142000000',
    })
  })

  it('N’ÉCRIT RIEN : la route est une lecture, pas une fusion', () => {
    // La doctrine `c37_fusion_doublons` : on propose, on ne fusionne jamais.
    // Une route de lecture ne peut pas fusionner — c'est l'absence de code qui
    // le garantit, pas une convention.
    const handler = (TalentController.prototype as unknown as Record<string, () => unknown>).duplicates
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toBeUndefined()
  })
})

describe('GET /talents/skill-suggestion — l’alias se PROPOSE', () => {
  it('reconnaît une écriture du référentiel partagé', async () => {
    const { controller } = build()
    const out = await controller.skillSuggestion({ userId: 'u1' } as never, 'k8s')
    expect(out).toEqual({ term: 'k8s', canonical: 'kubernetes', origin: 'referential' })
  })

  it('fait passer le vocabulaire de L’ESPACE avant celui du référentiel', async () => {
    // « ELK » ne veut pas dire la même chose chez une ESN cyber et chez une ESN
    // data : ce que l'équipe a tranché gagne.
    const { controller } = build({ approved: new Map([['zephyr', 'Outil maison Zephyr']]) })
    const out = await controller.skillSuggestion({ userId: 'u1' } as never, 'zephyr')
    expect(out).toEqual({ term: 'zephyr', canonical: 'Outil maison Zephyr', origin: 'workspace' })
  })

  it('ne propose RIEN quand le terme est déjà le canonique', async () => {
    const { controller } = build()
    const out = await controller.skillSuggestion({ userId: 'u1' } as never, 'Kubernetes')
    expect(out.canonical).toBeNull()
  })

  it('ne propose RIEN sur un mot que personne ne connaît — plutôt que le plus proche', async () => {
    // Rapprocher « Outil maison Zephyr » de « Zabbix » parce que les lettres se
    // ressemblent inventerait une compétence. Le terme part dans la file
    // d'enrichissement à l'enregistrement ; il ne se devine pas ici.
    const { controller } = build()
    const out = await controller.skillSuggestion({ userId: 'u1' } as never, 'Outil maison Zephyr')
    expect(out.canonical).toBeNull()
    expect(out.origin).toBeNull()
  })

  it('rend un terme vide sans rien proposer', async () => {
    const { controller } = build()
    expect((await controller.skillSuggestion({ userId: 'u1' } as never, '  ')).canonical).toBeNull()
  })
})
