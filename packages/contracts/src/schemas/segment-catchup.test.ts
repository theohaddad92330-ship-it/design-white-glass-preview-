import { describe, expect, it } from 'vitest'
import {
  isSegmentCollectionStale,
  latestCapabilityAt,
  SEGMENT_CAPABILITY_EPOCH,
  segmentCapabilityAt,
  SEGMENT_CAPABILITY_HISTORY,
  type SegmentCapability,
} from './segment-catchup.js'

/**
 * #2655.2 — LA GARDE DU RATTRAPAGE CIBLÉ.
 *
 * Elle existe parce qu'un défaut SILENCIEUX a été mesuré le 21/09/2026 :
 * `SEGMENT_CAPABILITY_EPOCH.contacts` était resté à la date de #2543 (18/09)
 * alors que #2655.1 avait changé la collecte des contacts le 20/09 à 13:08Z.
 * Tout compte collecté entre les deux était déclaré « à jour » sans l'être, et
 * l'écran qui prévient l'utilisateur héritait du même biais.
 *
 * Ce que cette garde protège : la date de bascule d'un segment se DÉDUIT de son
 * histoire, elle ne s'écrit pas. Oublier d'inscrire une capacité devient visible.
 */
describe('#2655.2 — la date de bascule se déduit de l’histoire du segment', () => {
  it('chaque segment bascule à sa capacité la PLUS RÉCENTE', () => {
    for (const [segment, capabilities] of Object.entries(SEGMENT_CAPABILITY_HISTORY)) {
      const attendu = latestCapabilityAt(capabilities ?? [])
      expect(SEGMENT_CAPABILITY_EPOCH[segment as keyof typeof SEGMENT_CAPABILITY_EPOCH], segment).toBe(attendu)
    }
  })

  it('sait dire NON : une capacité plus récente DÉPLACE la bascule', () => {
    const histoire: readonly SegmentCapability[] = [
      { issue: '#1', commit: null, at: '2026-09-18T00:00:00.000Z', why: 'la première' },
      { issue: '#2', commit: null, at: '2026-09-20T13:08:13.000Z', why: 'la seconde, sur le MÊME segment' },
    ]
    expect(latestCapabilityAt(histoire)).toBe('2026-09-20T13:08:13.000Z')
    // Et l'ordre d'écriture ne doit rien changer : c'est le TEMPS qui tranche.
    expect(latestCapabilityAt([...histoire].reverse())).toBe('2026-09-20T13:08:13.000Z')
  })

  it('sait dire NON : un segment sans histoire ne porte pas de bascule inventée', () => {
    expect(latestCapabilityAt([])).toBe('')
  })

  it('le défaut mesuré ne peut pas revenir : `contacts` bascule au 20/09, pas au 18/09', () => {
    const contacts = SEGMENT_CAPABILITY_EPOCH.contacts
    expect(contacts).toBeDefined()
    expect(Date.parse(contacts as string)).toBeGreaterThanOrEqual(Date.parse('2026-09-20T13:08:13.000Z'))
  })

  // #3742/#3744 — le périmètre « France » écarte enfin les personnes étrangères
  // (puce de périmètre comprise). Un compte collecté AVANT garde son stock
  // d'alors : son écran doit le dire, et le ciblage le compter.
  it('#3742 — un compte collecté avant le filtre géographique des personnes est CONCERNÉ', () => {
    const contacts = SEGMENT_CAPABILITY_HISTORY.contacts ?? []
    expect(contacts.some(c => c.issue === '#3742')).toBe(true)
    expect(isSegmentCollectionStale('2026-10-05T09:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.contacts as string)).toBe(true)
  })

  // SIG-B (11/10/2026) — les recruteurs NOMMÉS par une offre gardée deviennent des
  // contacts candidats. Un compte dont les contacts ont été collectés AVANT n'en a
  // aucun : il est CONCERNÉ (ciblé, jamais rejoué tout seul) et son écran le DIT.
  it('SIG-B — une collecte de contacts antérieure aux recruteurs prouvés par une offre est CONCERNÉE', () => {
    const at = segmentCapabilityAt('contacts', '#4016.3')
    expect(at).toBeTruthy()
    expect(isSegmentCollectionStale('2026-10-11T08:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.contacts as string)).toBe(true)
    // sait dire NON : une collecte postérieure à la capacité n'est pas concernée
    expect(isSegmentCollectionStale(new Date(Date.parse(at as string) + 60_000).toISOString(), at as string)).toBe(
      false,
    )
  })

  it('un compte collecté entre les deux capacités est CONCERNÉ, plus « à jour »', () => {
    // Exactement le cas qui passait à travers : collecté le 19/09, donc après
    // #2543 mais avant #2655.1.
    const entreLesDeux = '2026-09-19T09:00:00.000Z'
    expect(isSegmentCollectionStale(entreLesDeux, SEGMENT_CAPABILITY_EPOCH.contacts as string)).toBe(true)
  })

  // #2722.1 — l'histoire de `contacts` ne portait QUE #2543 (18/09 00:00Z) et
  // #2655.1 (20/09) ; #2543.5g (l'élargissement automatique, ACTIF PAR DÉFAUT
  // seulement depuis `49a582961`, committer date 2026-09-18T10:44:43+02:00 —
  // avant, `CONTACTS_AUTO_WIDEN_ENABLED=false` ne corrigeait rien) manquait.
  // Le trou ne bougeait PAS `SEGMENT_CAPABILITY_EPOCH.contacts` aujourd'hui
  // (#2655.1 est plus récent), mais laissait l'histoire incomplète — exactement
  // la classe de défaut que #2655.2 a déjà mesurée une fois : retirer #2655.1
  // demain ferait retomber la bascule au 18/09 MINUIT, avant que
  // l'élargissement soit réellement actif, sans que rien ne le signale.
  it('#2543.5g — l’élargissement automatique porte sa propre entrée', () => {
    const contacts = SEGMENT_CAPABILITY_HISTORY.contacts ?? []
    const entry = contacts.find(c => c.commit === '49a5829612ad685e80c5facd5f979a60ec173c6e')
    expect(entry, 'entrée #2543.5g manquante dans SEGMENT_CAPABILITY_HISTORY.contacts').toBeDefined()
    expect(entry?.at).toBe('2026-09-18T08:44:43.000Z')
    expect(entry?.issue).toBe('#2543.5')
  })

  it('une capacité sans commit doit DIRE pourquoi', () => {
    for (const [segment, capabilities] of Object.entries(SEGMENT_CAPABILITY_HISTORY)) {
      for (const capability of capabilities ?? []) {
        if (capability.commit !== null) {
          expect(capability.commit, `${segment} ${capability.issue}`).toMatch(/^[0-9a-f]{40}$/)
          continue
        }
        // Pas de SHA deviné pour faire joli : l'absence s'explique.
        expect(capability.why.length, `${segment} ${capability.issue}`).toBeGreaterThan(30)
      }
    }
  })

  // #2755 (24/09/2026) — `entities` REJOINT le registre. Avant cette entrée,
  // `SEGMENT_CAPABILITY_EPOCH.entities` était absent et `SegmentStaleCollectionNotice
  // dimension="entities"` ne rendait RIEN pour AUCUN compte (docblock du
  // composant) : un compte analysé avant le correctif snake_case IA
  // (`51f284697`, qui faisait lire `entities_exhaustive`/`sales_context`/
  // `official_directory` — jamais `entitiesExhaustive`/`salesContext`/
  // `officialDirectory` — sur le chemin « Enrichir la carte ») restait
  // silencieusement périmé, sans bandeau pour le dire.
  it('#2755 — `entities` porte enfin une capacité datée (repli snake_case IA)', () => {
    const entities = SEGMENT_CAPABILITY_HISTORY.entities ?? []
    const entry = entities.find(c => c.commit === '51f284697c948ceb2e866bbe1fdd10e752d69ce9')
    expect(entry, 'entrée #2755 manquante dans SEGMENT_CAPABILITY_HISTORY.entities').toBeDefined()
    expect(entry?.at).toBe('2026-09-23T12:09:58.000Z')
    expect(SEGMENT_CAPABILITY_EPOCH.entities).toBeDefined()
    // Un compte de la beta (260a9757…, analysé le 23/09 avant le correctif,
    // 08:49Z) est CONCERNÉ : sa collecte precède la capacité.
    expect(isSegmentCollectionStale('2026-09-23T08:49:28.709Z', SEGMENT_CAPABILITY_EPOCH.entities as string)).toBe(true)
  })

  it('toute capacité porte une date UTC lisible et une demande', () => {
    for (const [segment, capabilities] of Object.entries(SEGMENT_CAPABILITY_HISTORY)) {
      expect(capabilities?.length, segment).toBeGreaterThan(0)
      for (const capability of capabilities ?? []) {
        expect(Number.isFinite(Date.parse(capability.at)), `${segment} ${capability.at}`).toBe(true)
        expect(capability.at.endsWith('Z'), `${segment} ${capability.at}`).toBe(true)
        expect(capability.issue, segment).toMatch(/^#\d+(\.\d+)?$/)
      }
    }
  })

  // #3922 / #3935 (lot Q02, recette prod 09/10 soir) — une analyse NEUVE (20:09) de SG gardait le
  // bandeau « analysé avant une amélioration de la collecte » : les capacités #3922.3 et #2371.4
  // étaient datées « demain 00:00 » (le premier jour entier après le lot), donc TOUT compte analysé
  // le jour du déploiement restait « concerné », rejeu compris. Une capacité est datée du
  // déploiement RÉEL, jamais d'un instant à venir.
  it('aucune capacité n’est datée dans le futur — sinon une analyse neuve resterait « concernée »', () => {
    const now = Date.now()
    for (const [segment, capabilities] of Object.entries(SEGMENT_CAPABILITY_HISTORY)) {
      for (const capability of capabilities ?? []) {
        expect(Date.parse(capability.at) <= now, `${segment} ${capability.issue} ${capability.at}`).toBe(true)
      }
    }
  })

  it('#3922.3 / #2371.4 / #3970 — une analyse postérieure au dernier déploiement n’est PAS concernée', () => {
    // Après #3970 (09/10, 23:27Z) : une analyse neuve du soir est à jour ; celle de 20:09, antérieure aux signaux typés, est concernée.
    // (l'epoch du segment a avancé avec #3978 : on ancre sur la capacité #3970 elle-même)
    const p07 = segmentCapabilityAt('signals', '#3970') as string
    expect(isSegmentCollectionStale('2026-10-09T23:40:00.000Z', p07)).toBe(false)
    expect(isSegmentCollectionStale('2026-10-09T20:09:00.000Z', p07)).toBe(true)
    // sait dire NON : une collecte du matin, avant le lien source, reste concernée
    expect(isSegmentCollectionStale('2026-10-09T05:00:00.000Z', p07)).toBe(true)
  })

  it('#3504 — `signals` porte la correction de la tranche INSEE : un compte collecté avant est CONCERNÉ, un compte d’après non', () => {
    // L'instant PROPRE à #3504 (la capacité suivante, #3922.3, a avancé l'epoch).
    const own = SEGMENT_CAPABILITY_HISTORY.signals?.find(entry => entry.issue === '#3504')
    expect(own).toBeDefined()
    expect(isSegmentCollectionStale('2026-09-29T08:00:00.000Z', own?.at)).toBe(true)
    // sait dire NON : une collecte postérieure n'est pas déclarée périmée
    expect(isSegmentCollectionStale('2026-10-02T08:00:00.000Z', own?.at)).toBe(false)
  })

  // #3922.3 — le lien source ouvre une capacité du segment `signals` : un signal
  // collecté avant ne porte pas d'URL, et l'écran doit le dire (jamais un « lien
  // manquant » muet). La garde sait dire NON : sans l'entrée, l'epoch reste à #3504.
  it('#3922.3 — les signaux collectés avant le lien source sont CONCERNÉS', () => {
    const signals = SEGMENT_CAPABILITY_HISTORY.signals ?? []
    expect(signals.some(c => c.issue === '#3922.3')).toBe(true)
    const epoch = segmentCapabilityAt('signals', '#3970') as string
    expect(epoch).toBe('2026-10-09T23:27:32.000Z')
    expect(isSegmentCollectionStale('2026-10-05T08:00:00.000Z', epoch)).toBe(true)
    expect(isSegmentCollectionStale('2026-10-09T23:40:00.000Z', epoch)).toBe(false)
    expect(isSegmentCollectionStale(null, epoch)).toBe(true)
  })

  // #3916/#3917/#3918 (lot RAK) — BODACC + presse datée + CRM : un compte collecté
  // le 20/09 est CONCERNÉ, un compte collecté après la capacité ne l'est pas.
  it('#3916/#3917/#3918 — la collecte du 20/09 est concernée, celle d’après la capacité non', () => {
    const own = segmentCapabilityAt('signals', '#3916')
    expect(own).toBe('2026-10-09T10:43:55.000Z')
    expect(isSegmentCollectionStale('2026-09-20T09:00:00.000Z', own as string)).toBe(true)
    expect(isSegmentCollectionStale('2026-10-09T11:00:00.000Z', own as string)).toBe(false)
    // et l'epoch du segment n'est jamais antérieur à cette capacité
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(Date.parse(own as string))
    expect(isSegmentCollectionStale('2026-09-20T09:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.signals as string)).toBe(true)
  })

  // Intégration AG+AH+AI (09/10/2026) — #3922.3 a avancé l'epoch `signals` au 10/10 :
  // un écran qui parle d'UNE capacité précise (la barrière lit l'effectif, #3504)
  // ne doit pas hériter de la date d'une autre (le lien source). Sinon un compte
  // collecté le 02/10 se dit « analysé avant la correction de l'effectif » — faux.
  it('segmentCapabilityAt rend la date d’UNE capacité, pas l’epoch du segment', () => {
    expect(segmentCapabilityAt('signals', '#3504')).toBe('2026-10-01T11:31:34.000Z')
    // sait dire NON : ce n'est PAS l'epoch (la plus récente) du segment
    expect(segmentCapabilityAt('signals', '#3504')).not.toBe(SEGMENT_CAPABILITY_EPOCH.signals)
    expect(segmentCapabilityAt('signals', '#2291.2')).toBe('2026-09-19T11:20:34.000Z')
    // une capacité inconnue ne s'invente pas
    expect(segmentCapabilityAt('signals', '#0000')).toBeUndefined()
    expect(segmentCapabilityAt('access_relation', '#3504')).toBeUndefined()
  })

  // #3978 — le DOMAINE D'OFFRE classé à l'analyse (`domain_code` sur chaque signal) ouvre une capacité
  // du segment `signals` : un signal collecté avant n'en porte pas, et c'est le rejeu CIBLÉ du segment
  // (geste d'opérateur existant, jamais au déploiement) qui le lui apporte.
  it('#3978 — les signaux collectés avant le classement par domaine d’offre sont CONCERNÉS', () => {
    const own = segmentCapabilityAt('signals', '#3978')
    expect(own, 'entrée #3978 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    expect(isSegmentCollectionStale('2026-10-09T23:40:00.000Z', own as string)).toBe(true)
    // sait dire NON : une collecte postérieure à la capacité est à jour
    expect(isSegmentCollectionStale(new Date(Date.parse(own as string) + 60_000), own as string)).toBe(false)
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(Date.parse(own as string))
  })

  // #4837 — #4754 (offres de plus de 12 mois stockées, estampillées historical) était livrée côté collecte
  // mais absente du registre : le bandeau « collecte antérieure » restait inerte. Le rejeu ciblé du segment
  // signaux (geste d'opérateur, jamais au déploiement) est ce qui les apporte.
  it('#4837 — les signaux collectés avant les offres de plus de 12 mois (#4754) sont CONCERNÉS', () => {
    const own = segmentCapabilityAt('signals', '#4754')
    expect(own, 'entrée #4754 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    expect(isSegmentCollectionStale('2026-10-28T09:00:00.000Z', own as string)).toBe(true)
    // sait dire NON : une collecte postérieure à la capacité est à jour
    expect(isSegmentCollectionStale(new Date(Date.parse(own as string) + 60_000), own as string)).toBe(false)
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(Date.parse(own as string))
    // la capacité ne rejoue ni contacts ni entités
    expect(segmentCapabilityAt('contacts', '#4754')).toBeUndefined()
  })

  // #4031 — DECATHLON-FIN : les offres d'emploi se rattachent au GROUPE (entités, agrégateurs paginés,
  // requête par domaine). Une veille collectée avant ne porte que les offres de l'entité nommée : son
  // écran DIT « collecte antérieure », et le rejeu CIBLÉ du segment signaux (jamais au déploiement)
  // les lui apporte — les offres seules, jamais l'analyse entière.
  it('#4031 — les signaux collectés avant le rattachement des offres au groupe sont CONCERNÉS', () => {
    const own = segmentCapabilityAt('signals', '#4031')
    expect(own, 'entrée #4031 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    expect(isSegmentCollectionStale('2026-10-11T07:30:00.000Z', own as string)).toBe(true)
    expect(isSegmentCollectionStale(new Date(Date.parse(own as string) + 60_000), own as string)).toBe(false)
    // sait dire NON : aucune entrée sous un autre segment (les offres ne rejouent ni contacts ni stratégie)
    expect(segmentCapabilityAt('contacts', '#4031')).toBeUndefined()
    expect(segmentCapabilityAt('entities', '#4031')).toBeUndefined()
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(Date.parse(own as string))
  })

  // #3978 (11/10/2026) — pains et enjeux portent AUSSI leur domaine (`bellum_strategy`). Ils sont
  // produits par la PHASE 1 (`phase1_research`), persistés par `applyResearch`, qui date
  // `signals_collected_at` — jamais par le plan (`savePlan` → `strategy_collected_at`). Le segment
  // de leur collecte EST donc `signals` : la capacité y est inscrite, et le rejeu ciblé `signals`
  // (`refreshResearch`) est le seul à les régénérer. L'inscrire sous `strategy` ferait dire
  // « collecte antérieure » à l'onglet Plan de tout compte, et pousserait un rejeu `replan`
  // (payant) qui ne rapporte AUCUN domaine — une capacité datée sur le mauvais segment.
  it('#3978 — pains/enjeux se rattrapent par le segment de LEUR collecte (signals), jamais par `strategy`', () => {
    const own = SEGMENT_CAPABILITY_HISTORY.signals?.find(capability => capability.issue === '#3978')
    expect(own, 'entrée #3978 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    // la raison écrite nomme ce qu'elle rattrape — pains ET enjeux, pas seulement les signaux
    expect(own?.why).toContain('pains')
    expect(own?.why).toContain('enjeux')
    // sait dire NON : aucune entrée #3978 sous `strategy`
    expect(segmentCapabilityAt('strategy', '#3978')).toBeUndefined()
  })

  // #4078 — les cinq blocs du dossier complet (axes de lecture, écosystème, domaines d'opportunité,
  // indicateurs financiers, garde-fous) sont produits par une vraie analyse depuis l'intégration
  // f2258af8ac (13/10, 04:58:48Z). Un compte analysé avant ne les porte pas : c'est SON segment,
  // ni `dossier_read` (Phase 4) ni `strategy` — l'étape qui les écrit tourne APRÈS l'analyse.
  it('#4078 — `dossier_blocks` bascule à l’intégration des cinq producteurs, et sait dire NON', () => {
    expect(SEGMENT_CAPABILITY_EPOCH.dossier_blocks).toBe('2026-10-13T04:58:48.000Z')
    expect(
      isSegmentCollectionStale('2026-10-12T10:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.dossier_blocks as string),
    ).toBe(true)
    expect(
      isSegmentCollectionStale('2026-10-13T09:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.dossier_blocks as string),
    ).toBe(false)
    // GA-26 : la capacité n'avance pas l'epoch d'un AUTRE segment.
    expect(segmentCapabilityAt('dossier_read', '#4078')).toBeUndefined()
    expect(segmentCapabilityAt('strategy', '#4078')).toBeUndefined()
  })

  // #4837 — #4754 (offres de plus de 12 mois stockées, estampillées `historical`) était livrée côté collecte
  // (003d5bf9a1, fusion d818e6b7d3 le 28/10, 20:03:39Z) mais SANS entrée au registre : le bandeau de collecte
  // antérieure restait muet sur les comptes déjà analysés, et le rejeu ciblé `signals` ne les voyait pas.
  it('#4837 — `signals` inscrit #4754 : un compte collecté avant est CONCERNÉ, un compte d’après non', () => {
    const own = SEGMENT_CAPABILITY_HISTORY.signals?.find(entry => entry.issue === '#4754')
    expect(own).toBeDefined()
    expect(own?.at).toBe('2026-10-28T20:03:39.000Z')
    expect(isSegmentCollectionStale('2026-10-28T09:00:00.000Z', own?.at)).toBe(true)
    // sait dire NON : une collecte postérieure à la fusion n'est pas déclarée périmée
    expect(isSegmentCollectionStale('2026-10-29T09:00:00.000Z', own?.at)).toBe(false)
    // #4754 (branche) — le repli par l'epoch du segment dit la même chose :
    // une collecte antérieure reste périmée même lue par l'epoch.
    expect(isSegmentCollectionStale('2026-10-25T09:00:00.000Z', SEGMENT_CAPABILITY_EPOCH.signals as string)).toBe(true)
    // GA-26 : la capacité n'avance pas l'epoch d'un AUTRE segment.
    expect(segmentCapabilityAt('contacts', '#4754')).toBeUndefined()
  })

  // Lot 762 (31/10/2026) — « pas de limite » d'âge : la collecte GRATUITE ne jette plus rien à cause de l'âge.
  // Un compte collecté avant garde un historique tronqué : CONCERNÉ, ciblé sur `signals` SEUL.
  it('lot 762 — `signals` inscrit #4762 : collecté avant = CONCERNÉ, après = à jour ; aucun autre segment', () => {
    const own = SEGMENT_CAPABILITY_HISTORY.signals?.find(entry => entry.issue === '#4762')
    expect(own, 'entrée #4762 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    expect(isSegmentCollectionStale('2026-10-30T09:00:00.000Z', own?.at)).toBe(true)
    expect(isSegmentCollectionStale(new Date(Date.parse(own?.at as string) + 60_000), own?.at)).toBe(false)
    // elle fait partie de l'histoire du segment signals — la plus récente l'emporte (#2322.70 est postérieure) …
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(Date.parse(own?.at as string))
    // … mais ne rejoue ni les contacts, ni les entités, ni la stratégie (par SEGMENT, jamais l'analyse entière).
    for (const other of ['contacts', 'entities', 'strategy'] as const) {
      expect(segmentCapabilityAt(other, '#4762'), other).toBeUndefined()
    }
  })
})

describe('#4754 — la collecte profonde des offres est inscrite au registre du segment signals', () => {
  it('le segment signals bascule APRÈS le 20/10/2026, sur le merge de la PR #4764', () => {
    const capacite = SEGMENT_CAPABILITY_HISTORY.signals?.find(c => c.issue === '#4754')
    expect(capacite?.commit).toBe('d818e6b7d3d743fd127351890e1a034210c55da6')
    expect(segmentCapabilityAt('signals', '#4754')).toBe('2026-10-28T20:03:39.000Z')
    // Lot 762 : #4762 (31/10) est désormais la capacité la plus récente — l'epoch ne recule jamais derrière #4754.
    expect(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals as string)).toBeGreaterThanOrEqual(
      Date.parse('2026-10-28T20:03:39.000Z'),
    )
    expect((SEGMENT_CAPABILITY_EPOCH.signals as string) > '2026-10-20T23:59:59.999Z').toBe(true)
  })

  it('un compte collecté avant le merge est « concerné », un compte collecté après ne l’est pas', () => {
    const merge = segmentCapabilityAt('signals', '#4754') as string
    expect(isSegmentCollectionStale('2026-10-23T15:00:00.000Z', merge)).toBe(true)
    expect(isSegmentCollectionStale('2026-10-29T08:00:00.000Z', merge)).toBe(false)
  })

  it('l’entrée n’avance pas l’epoch d’un autre segment (GA-26)', () => {
    expect(segmentCapabilityAt('contacts', '#4754')).toBeUndefined()
  })
})

// #4923.15 — la collecte pilotée par la demande (têtes de familles cibles, passe
// web par rôle, ancres de tout le groupe) change ce qu'une collecte de contacts
// TROUVE. Un compte collecté avant (L'Oréal, Decathlon, AXA de l'espace de Julien
// Laszlo) garde son stock d'alors : son écran doit le dire.
describe('#4923.15 — la collecte pilotée par la demande date le segment contacts', () => {
  it('un compte collecté avant #4923 est CONCERNÉ, un compte d’après non', () => {
    const own = SEGMENT_CAPABILITY_HISTORY.contacts?.find(entry => entry.issue === '#4923')
    expect(own).toBeDefined()
    expect(isSegmentCollectionStale('2026-10-29T08:00:00.000Z', own?.at)).toBe(true)
    expect(isSegmentCollectionStale(new Date(Date.parse(own?.at as string) + 3600_000).toISOString(), own?.at)).toBe(
      false,
    )
  })
})

// #2322.70 (31/10/2026) — rôle, équipe, compétences et tension d'une offre d'emploi sont extraits à la collecte.
// Un compte collecté avant n'en porte aucun : CONCERNÉ, ciblé sur `signals` SEUL, rejeu sur geste jamais au déploiement.
describe('#2322.70 — l’extraction des offres est inscrite au registre du segment signals', () => {
  it('collecté avant = CONCERNÉ, après = à jour ; aucun autre segment', () => {
    const own = SEGMENT_CAPABILITY_HISTORY.signals?.find(entry => entry.issue === '#2322.70')
    expect(own, 'entrée #2322.70 manquante dans SEGMENT_CAPABILITY_HISTORY.signals').toBeDefined()
    expect(isSegmentCollectionStale('2026-10-31T09:00:00.000Z', own?.at)).toBe(true)
    expect(isSegmentCollectionStale(new Date(Date.parse(own?.at as string) + 60_000), own?.at)).toBe(false)
    expect(SEGMENT_CAPABILITY_EPOCH.signals).toBe(own?.at)
    for (const other of ['contacts', 'entities', 'strategy'] as const) {
      expect(segmentCapabilityAt(other, '#2322.70'), other).toBeUndefined()
    }
  })
})
