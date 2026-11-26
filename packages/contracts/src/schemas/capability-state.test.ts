import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_SYNC_LATE_DAYS,
  capabilityStateValues,
  deriveCapabilityEntryState,
  deriveCapabilityState,
  missingScopesFor,
} from './tool-registry.js'

/**
 * L'état d'une capacité (addendum final p19).
 *
 * « Connecté » couvrait trois situations très différentes : relié mais incapable
 * d'écrire, relié mais cassé, relié mais en retard. Le copilote lisait la même
 * valeur dans les trois cas et promettait donc des actions impossibles — pour
 * échouer après le clic, c'est-à-dire au moment le plus coûteux.
 *
 * L'ORDRE des tests est ce qui compte le plus ici : ce qui empêche toute action
 * doit passer devant ce qui la limite.
 */

const now = new Date('2026-09-01T00:00:00.000Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

describe('état dérivé d’une capacité', () => {
  it('dit « non connecté » pour tout ce qui n’est pas relié', () => {
    expect(deriveCapabilityState({ status: 'available', writesGranted: false })).toBe('not_connected')
    expect(deriveCapabilityState({ status: 'coming_soon', writesGranted: false })).toBe('not_connected')
  })

  it('fait passer un jeton expiré AVANT tout le reste', () => {
    // Un jeton expiré et une sync ancienne, c'est d'abord un jeton expiré :
    // afficher « synchronisation en retard » enverrait chercher au mauvais endroit.
    expect(
      deriveCapabilityState({
        status: 'action_required',
        writesGranted: true,
        lastSync: daysAgo(365),
        degraded: true,
        now,
      }),
    ).toBe('authorization_expired')
  })

  it('signale l’incident fournisseur avant les limites de droits', () => {
    expect(deriveCapabilityState({ status: 'connected', writesGranted: false, degraded: true, now })).toBe('degraded')
  })

  it('distingue lecture seule et écriture limitée', () => {
    expect(deriveCapabilityState({ status: 'connected', writesGranted: false, now })).toBe('read_only')
    expect(deriveCapabilityState({ status: 'connected', writesGranted: true, writesPartial: true, now })).toBe(
      'limited_write',
    )
  })

  it('signale une synchronisation trop ancienne', () => {
    expect(
      deriveCapabilityState({
        status: 'connected',
        writesGranted: true,
        lastSync: daysAgo(CAPABILITY_SYNC_LATE_DAYS + 1),
        now,
      }),
    ).toBe('sync_late')
    expect(
      deriveCapabilityState({
        status: 'connected',
        writesGranted: true,
        lastSync: daysAgo(CAPABILITY_SYNC_LATE_DAYS - 1),
        now,
      }),
    ).toBe('operational')
  })

  it('ne considère PAS une connexion jamais utilisée comme en retard', () => {
    // Jamais utilisée n'est pas « en retard » : c'est neuf. Confondre les deux
    // ferait afficher une alerte sur chaque intégration fraîchement connectée.
    expect(deriveCapabilityState({ status: 'connected', writesGranted: true, lastSync: null, now })).toBe('operational')
  })

  it('dit « opérationnel » quand tout va bien', () => {
    expect(deriveCapabilityState({ status: 'connected', writesGranted: true, lastSync: daysAgo(1), now })).toBe(
      'operational',
    )
  })
})

describe('deriveCapabilityEntryState — l’état d’UNE capacité', () => {
  const now = new Date('2026-08-21T12:00:00.000Z')
  const proof = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString()

  it('dit `scope_missing` quand la portée n’a jamais été accordée', () => {
    // C'est l'état qui manquait, et il désigne exactement les trois pannes du
    // 16/08. `read_only` aurait été faux : là, la lecture marche.
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['Mail.Send'],
        required: ['Files.Read.All'],
        now,
      }),
    ).toBe('scope_missing')
  })

  it('compare les portées SANS tenir compte de la casse', () => {
    // Microsoft rend `Mail.Read` à l'écran de consentement et `mail.read` dans
    // la réponse du jeton. La comparaison stricte éteignait une capacité qui
    // marche — et laissait la garde du contrôleur passer pendant que le service
    // rendait `[]`.
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['files.read.all'],
        required: ['Files.Read.All'],
        lastProofAt: proof(1),
        now,
      }),
    ).toBe('operational')
  })

  it('refuse de dire « opérationnel » sans preuve', () => {
    // La règle du §2 : « `sain` n'est jamais déclaré. Il est dérivé des portées
    // accordées ET d'un test réel. » Le 16/08, le registre disait
    // « opérationnel » sur un agenda éteint depuis des semaines.
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['https://www.googleapis.com/auth/calendar.readonly'],
        required: ['https://www.googleapis.com/auth/calendar.readonly'],
        lastProofAt: null,
        now,
      }),
    ).toBe('untested')
  })

  it('classe l’irréversible avant le rattrapable', () => {
    // Un jeton mort ET une portée absente, c'est d'abord un jeton mort : c'est
    // la reconnexion qui répare les deux, et annoncer la portée enverrait
    // regarder au mauvais endroit.
    expect(
      deriveCapabilityEntryState({
        status: 'action_required',
        granted: [],
        required: ['Files.Read.All'],
        now,
      }),
    ).toBe('authorization_expired')
  })

  it('vieillit une preuve trop ancienne plutôt que de la croire pour toujours', () => {
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['x'],
        required: ['x'],
        lastProofAt: proof(CAPABILITY_SYNC_LATE_DAYS + 1),
        now,
      }),
    ).toBe('sync_late')
  })

  it('n’exige rien d’une capacité sans portée — un webhook a une URL, pas des droits', () => {
    expect(
      deriveCapabilityEntryState({ status: 'connected', granted: [], required: [], lastProofAt: proof(1), now }),
    ).toBe('operational')
  })

  it('nomme les portées manquantes — c’est ce que « Réparer » affiche', () => {
    expect(missingScopesFor(['Mail.Send'], ['Mail.Send', 'Files.Read.All'])).toEqual(['Files.Read.All'])
  })
})

/**
 * `degraded` — « je l'ai vérifié, et ça n'a pas marché ».
 *
 * L'état était déclaré, traduit en FR et en EN, branché dans les deux fonctions
 * de dérivation… et AUCUN appelant ne le passait. Un état inatteignable promet
 * une finesse qui n'existe pas.
 *
 * Le signal qui lui manquait existait pourtant, à un champ de là : quand une
 * sonde ÉCHOUE, `ConnectorProbeService.record()` écrit `last_error_at` et efface
 * `last_proof_at`. La capacité retombait donc sur `untested` — « Jamais
 * vérifié » — alors qu'elle venait précisément d'être vérifiée, et qu'elle avait
 * échoué. C'est le défaut de fond du dépôt appliqué à son propre tableau de
 * bord : « cassé » et « non mesurable » se ressemblent à l'écran, et le premier
 * se lit comme le second, c'est-à-dire comme un simple « à faire ».
 */
describe('deriveCapabilityEntryState — une vérification qui a ÉCHOUÉ', () => {
  const now = new Date('2026-08-21T12:00:00.000Z')

  it('dit `degraded`, et surtout PAS « jamais vérifié »', () => {
    const state = deriveCapabilityEntryState({
      status: 'connected',
      granted: ['x'],
      required: ['x'],
      lastProofAt: null,
      degraded: true,
      now,
    })
    expect(state).toBe('degraded')
    expect(state).not.toBe('untested')
  })

  it('laisse la PORTÉE manquante passer devant — c’est elle qui se répare', () => {
    // Une sonde échoue toujours quand la portée n'est pas accordée. Annoncer
    // « dégradé » masquerait la cause actionnable, et le bouton « Réparer » ne
    // s'affiche que sur `scope_missing`.
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['Mail.Send'],
        required: ['Files.Read.All'],
        degraded: true,
        now,
      }),
    ).toBe('scope_missing')
  })

  it('laisse le jeton mort passer devant — la reconnexion répare les deux', () => {
    expect(
      deriveCapabilityEntryState({ status: 'action_required', granted: [], required: [], degraded: true, now }),
    ).toBe('authorization_expired')
  })

  it('passe devant une écriture non sondable — un envoi cassé n’est pas « opérationnel »', () => {
    expect(
      deriveCapabilityEntryState({
        status: 'connected',
        granted: ['x'],
        required: ['x'],
        probeable: false,
        degraded: true,
        now,
      }),
    ).toBe('degraded')
  })

  it('ne se déclenche pas tout seul — sans échec, rien ne change', () => {
    expect(
      deriveCapabilityEntryState({ status: 'connected', granted: ['x'], required: ['x'], lastProofAt: null, now }),
    ).toBe('untested')
  })
})

/**
 * `action_pending` a été RETIRÉ du contrat le 29/08/2026 (D102).
 *
 * Il n'avait aucun producteur, et le seul qui aurait été honnête — la porte
 * d'approbation d'écriture CRM/ERP — est une décision PARQUÉE (D100 : la route
 * `GET /crm/write-requests` n'a toujours aucun écran). Entre « déclarer un état
 * qu'aucun chemin n'atteint » et « le retirer jusqu'à ce que son producteur
 * existe », le second ne ment pas.
 *
 * ⚠️ Le retrait est sûr parce que ces états sont DÉRIVÉS et jamais STOCKÉS :
 * aucune contrainte SQL ne les énumère, donc aucune valeur en base ne devient
 * illisible. Si la porte d'approbation gagne son écran, la valeur se rajoute EN
 * FIN d'énumération, jamais au milieu (GA-08).
 */
describe('les états du contrat sont tous atteignables', () => {
  it('n’énumère plus `action_pending`', () => {
    expect(capabilityStateValues).not.toContain('action_pending')
  })

  it('lit bien quelque chose — l’énumération n’est pas vide', () => {
    expect(capabilityStateValues.length).toBeGreaterThanOrEqual(9)
    expect(capabilityStateValues).toContain('degraded')
    expect(capabilityStateValues).toContain('untested')
  })
})
