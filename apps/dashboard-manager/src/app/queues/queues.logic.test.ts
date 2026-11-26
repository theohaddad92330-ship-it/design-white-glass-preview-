import { describe, expect, it } from 'vitest'
import type { QueueJob, QueueSummary } from '@/lib/queues'
import {
  confirmationDePurge,
  confirmationDeSuppression,
  estUneAdresse,
  laPlusVieilleAttente,
  libelleAttente,
  tonDeLaFile,
  totauxDesFiles,
} from './queues.logic'

function file(partiel: Partial<QueueSummary> = {}): QueueSummary {
  return {
    name: 'analysis',
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
    oldestWaiting: { etat: 'vide' },
    ...partiel,
  }
}

function job(partiel: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    name: 'analyze',
    data: {},
    attemptsMade: 0,
    timestamp: 1_700_000_000_000,
    processedOn: null,
    finishedOn: null,
    failedReason: null,
    stackTail: null,
    ...partiel,
  }
}

describe('libelleAttente — « aucun job en attente » n’est pas « 0 min » (#1662)', () => {
  it('une file VIDE ne dit PAS une durée — elle dit qu’il n’y a rien à attendre', () => {
    const fr = libelleAttente({ etat: 'vide' }, 'fr')
    expect(fr.ton).toBe('repos')
    expect(fr.texte).toBe('aucun job en attente')
    // La preuve littérale de la règle de l'issue : pas de « 0 » dans le texte.
    expect(fr.texte).not.toMatch(/\b0\b/)
    expect(libelleAttente({ etat: 'vide' }, 'en').texte).toBe('nothing waiting')
  })

  it('un état INCONNU se dit — une panne ne rend pas une file saine', () => {
    const fr = libelleAttente({ etat: 'inconnu', raison: 'lecture-impossible' }, 'fr')
    expect(fr.ton).toBe('inconnu')
    expect(fr.texte).toBe('ancienneté inconnue')
    // La raison est NOMMÉE, pas tue : c'est elle qui distingue une panne d'un
    // désaccord entre deux lectures.
    expect(fr.detail).toBe('la file n’a pas répondu — Redis ou réseau')
    expect(libelleAttente({ etat: 'inconnu', raison: 'lecture-impossible' }, 'en').texte).toBe('age unknown')
  })

  it('chacune des quatre raisons a sa phrase, dans les deux langues', () => {
    const raisons = [
      'lecture-impossible',
      'comptes-et-file-divergent',
      'horodatage-illisible',
      'profondeur-illisible',
    ] as const
    const vues = new Set<string>()
    for (const raison of raisons) {
      for (const langue of ['fr', 'en'] as const) {
        const detail = libelleAttente({ etat: 'inconnu', raison }, langue).detail
        expect(detail, `${raison} / ${langue}`).toBeTruthy()
        expect((detail ?? '').length, `${raison} / ${langue}`).toBeGreaterThan(15)
        vues.add(`${langue}:${detail}`)
      }
    }
    // Huit phrases DISTINCTES : une raison recopiée sur sa voisine ne dirait
    // plus rien de ce qui s'est passé.
    expect(vues.size).toBe(8)
  })

  it('une ancienneté MESURÉE se rend en clair, et zéro y est une vraie mesure', () => {
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 15 * 60_000 }, 'fr').texte).toBe('en attente depuis 15 min')
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 61 * 60_000 }, 'fr').texte).toBe('en attente depuis 1 h 1')
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 15 * 60_000 }, 'en').texte).toBe('waiting for 15 min')
    // Un job ajouté il y a trois secondes attend VRAIMENT depuis presque rien.
    // Ce zéro-là est mesuré, il ne se masque pas.
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 3_000 }, 'fr').texte).toBe('en attente depuis < 1 min')
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 3_000 }, 'fr').ton).toBe('mesure')
  })

  it('la tuile de tête d’écran dit le MÊME état, en un mot — jamais « 0 »', () => {
    // ⚠️ La tuile et la puce de file sortent de la MÊME dérivation. Deux
    // calculs séparés finiraient par annoncer « 0 min » d'un côté et « aucun
    // job » de l'autre, sur la même file, le même jour.
    expect(libelleAttente({ etat: 'vide' }, 'fr').valeur).toBe('aucun')
    expect(libelleAttente({ etat: 'vide' }, 'en').valeur).toBe('none')
    expect(libelleAttente({ etat: 'inconnu', raison: 'profondeur-illisible' }, 'fr').valeur).toBe('inconnue')
    expect(libelleAttente({ etat: 'mesure', plusVieuxMs: 15 * 60_000 }, 'fr').valeur).toBe('15 min')
    // La valeur courte d'une file vide ne contient AUCUN chiffre — c'est la
    // règle de l'issue, écrite comme une assertion plutôt que comme un espoir.
    expect(libelleAttente({ etat: 'vide' }, 'fr').valeur).not.toMatch(/\d/)
    expect(libelleAttente({ etat: 'inconnu', raison: 'lecture-impossible' }, 'fr').valeur).not.toMatch(/\d/)
  })

  it('le ton n’est jamais la SEULE information — chaque état porte un mot', () => {
    // « Une couleur seule n'est pas une information » : les trois états se
    // distinguent par leur texte, pas seulement par leur ton.
    const textes = [
      libelleAttente({ etat: 'vide' }, 'fr').texte,
      libelleAttente({ etat: 'inconnu', raison: 'lecture-impossible' }, 'fr').texte,
      libelleAttente({ etat: 'mesure', plusVieuxMs: 60_000 }, 'fr').texte,
    ]
    expect(new Set(textes).size).toBe(3)
  })
})

describe('laPlusVieilleAttente — l’ancienneté de tête, toutes files confondues', () => {
  it('rend la PLUS GRANDE ancienneté mesurée', () => {
    const attente = laPlusVieilleAttente([
      file({ name: 'analysis', oldestWaiting: { etat: 'mesure', plusVieuxMs: 5 * 60_000 } }),
      file({ name: 'mailer', oldestWaiting: { etat: 'mesure', plusVieuxMs: 42 * 60_000 } }),
    ])
    expect(attente).toEqual({ etat: 'mesure', plusVieuxMs: 42 * 60_000 })
  })

  it('un INCONNU l’emporte sur un vide — on ne résume pas une panne en « rien n’attend »', () => {
    expect(
      laPlusVieilleAttente([
        file({ name: 'analysis', oldestWaiting: { etat: 'vide' } }),
        file({ name: 'mailer', oldestWaiting: { etat: 'inconnu', raison: 'lecture-impossible' } }),
      ]),
    ).toEqual({ etat: 'inconnu', raison: 'lecture-impossible' })
  })

  it('une MESURE l’emporte sur un inconnu — un fait connu vaut mieux qu’un doute', () => {
    // L'inverse ferait disparaître de la tête d'écran le seul chiffre qu'on ait.
    expect(
      laPlusVieilleAttente([
        file({ name: 'analysis', oldestWaiting: { etat: 'inconnu', raison: 'horodatage-illisible' } }),
        file({ name: 'mailer', oldestWaiting: { etat: 'mesure', plusVieuxMs: 60_000 } }),
      ]),
    ).toEqual({ etat: 'mesure', plusVieuxMs: 60_000 })
  })

  it('toutes vides = vide ; aucune file = inconnu, jamais « vide »', () => {
    expect(laPlusVieilleAttente([file(), file({ name: 'mailer' })])).toEqual({ etat: 'vide' })
    // ⚠️ Zéro file n'est pas « rien n'attend » : c'est qu'on n'a rien lu.
    expect(laPlusVieilleAttente([])).toEqual({ etat: 'inconnu', raison: 'lecture-impossible' })
  })
})

describe('totauxDesFiles — des compteurs, où zéro EST vrai', () => {
  it('additionne les profondeurs et compte les files sans ancienneté lisible', () => {
    expect(
      totauxDesFiles([
        file({ name: 'analysis', waiting: 4, failed: 2, active: 1, delayed: 3 }),
        file({
          name: 'mailer',
          waiting: 1,
          failed: 0,
          oldestWaiting: { etat: 'inconnu', raison: 'lecture-impossible' },
        }),
      ]),
    ).toEqual({ enAttente: 5, enEchec: 2, actifs: 1, differes: 3, filesInconnues: 1, files: 2 })
  })

  it('zéro job en échec est une VRAIE mesure — elle ne se masque pas', () => {
    // La question de la doctrine — « si cette valeur est absente, 0 est-il
    // VRAI ? » — se répond ici par OUI : une file lue, sans échec, en a zéro.
    expect(totauxDesFiles([file()])).toEqual({
      enAttente: 0,
      enEchec: 0,
      actifs: 0,
      differes: 0,
      filesInconnues: 0,
      files: 1,
    })
  })
})

describe('tonDeLaFile — un incident, une attente, un repos', () => {
  it('un échec prime sur tout', () => {
    expect(tonDeLaFile(file({ failed: 1, waiting: 12 }))).toBe('incident')
  })

  it('une ancienneté inconnue est un incident, pas un repos', () => {
    expect(tonDeLaFile(file({ oldestWaiting: { etat: 'inconnu', raison: 'lecture-impossible' } }))).toBe('incident')
  })

  it('des jobs en vol sans échec = attente ; rien du tout = repos', () => {
    expect(tonDeLaFile(file({ waiting: 3 }))).toBe('attente')
    expect(tonDeLaFile(file({ active: 1 }))).toBe('attente')
    expect(tonDeLaFile(file({ delayed: 2 }))).toBe('attente')
    expect(tonDeLaFile(file())).toBe('repos')
  })
})

describe('les confirmations NOMMENT la conséquence (« êtes-vous sûr ? » ne dit rien)', () => {
  it('la purge dit COMBIEN, LESQUELS, OÙ et que c’est irréversible', () => {
    // ⚠️ `etatLibelle` est passé par l'appelant, qui le tient du dictionnaire
    // i18n : un libellé d'état vit à UN seul endroit, et le recopier ici en
    // ferait un second qui divergerait au premier renommage.
    const texte = confirmationDePurge({ file: 'analysis', etatLibelle: 'échoués', total: 12 }, 'fr')
    expect(texte).toContain('12')
    expect(texte).toContain('analysis')
    expect(texte).toContain('échoués')
    expect(texte.toLowerCase()).toContain('irréversible')
    // Et le geste qui NE se fait pas est dit lui aussi : purger ne rejoue rien.
    expect(texte).toContain('rejoués')
  })

  it('la purge s’écrit au singulier quand il n’y a qu’un job', () => {
    expect(confirmationDePurge({ file: 'mailer', etatLibelle: 'échoués', total: 1 }, 'fr')).toContain('1 job ')
    expect(confirmationDePurge({ file: 'mailer', etatLibelle: 'failed', total: 1 }, 'en')).toContain('1 job ')
    expect(confirmationDePurge({ file: 'mailer', etatLibelle: 'échoués', total: 3 }, 'fr')).toContain('3 jobs ')
  })

  it('la purge existe en anglais et nomme les mêmes faits', () => {
    const texte = confirmationDePurge({ file: 'analysis', etatLibelle: 'completed', total: 300 }, 'en')
    expect(texte).toContain('300')
    expect(texte).toContain('analysis')
    expect(texte).toContain('completed')
    expect(texte.toLowerCase()).toContain('cannot be undone')
  })

  it('la suppression NOMME le job, sa file, et ce qui ne se rattrape pas', () => {
    const texte = confirmationDeSuppression({ file: 'analysis', job: job({ id: 'job-77', name: 'analyze' }) }, 'fr')
    expect(texte).toContain('job-77')
    expect(texte).toContain('analyze')
    expect(texte).toContain('analysis')
    expect(texte.toLowerCase()).toContain('irréversible')
    expect(confirmationDeSuppression({ file: 'analysis', job: job({ id: 'job-77' }) }, 'en')).toContain('job-77')
  })

  it('un job sans identifiant ne se fait pas passer pour un job nommé', () => {
    // BullMQ peut rendre un job sans id. Écrire « supprimer le job null »
    // serait pire que de dire qu'on ne sait pas lequel c'est.
    expect(confirmationDeSuppression({ file: 'analysis', job: job({ id: null }) }, 'fr')).toContain('sans identifiant')
  })
})

describe('estUneAdresse — ce qui, dans la charge utile d’un job, est une adresse', () => {
  it('reconnaît la clé `to` du mailer et tout champ qui finit par email/mail', () => {
    expect(estUneAdresse('to')).toBe(true)
    expect(estUneAdresse('email')).toBe(true)
    expect(estUneAdresse('ownerEmail')).toBe(true)
    expect(estUneAdresse('contactEmail')).toBe(true)
    expect(estUneAdresse('userMail')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    // Un booléen, un compte, et les clés de la liste blanche d'analyse : rien
    // de tout cela n'est une adresse, et les masquer rendrait l'écran illisible.
    expect(estUneAdresse('emailType')).toBe(false)
    expect(estUneAdresse('emailVerified')).toBe(false)
    expect(estUneAdresse('accountId')).toBe(false)
    expect(estUneAdresse('companyName')).toBe(false)
    expect(estUneAdresse('correlationId')).toBe(false)
  })
})
