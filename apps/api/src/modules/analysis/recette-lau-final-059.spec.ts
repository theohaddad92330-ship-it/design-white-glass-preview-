import {
  buildRefreshDiff,
  buildRefreshPlan,
  CORRECTION_SURFACE_TRACES,
  decideFieldWrite,
  orgGraphSchema,
  preserveNotConfirmedPeople,
  ranWithOlderProfile,
  REFRESH_AGED_AFTER_MS,
  type OrgGraph,
} from '@bellum/contracts'
import { ACCOUNT_FIELD_COLUMNS, CONTACT_FIELD_COLUMNS } from '../crm-core/record-fields'

/**
 * #2318.10 — LA RECETTE de LAU-FINAL-059, dix scénarios, écrits.
 *
 * L'issue énumère dix situations : analyse de dix jours · contact parti ·
 * filiale corrigée · ESN faussement présente · signal périmé · mauvais scope ·
 * profil modifié · correction propagée · rollback · deux utilisateurs
 * simultanés. Aucune n'existait en test : `git grep rollback` sur le module
 * d'analyse rendait zéro résultat le 20/09/2026.
 *
 * ⚠️ NEUF sur dix sont écrits ici. Le dixième — « ESN faussement présente » —
 * n'est PAS jouable, et le dernier bloc de ce fichier le PROUVE plutôt que de
 * l'affirmer : l'ESN en place vit dans le blob d'analyse, et aucune colonne
 * corrigeable ne la porte, donc il n'existe aucun geste par lequel un humain
 * pourrait la démentir. Mieux vaut neuf scénarios prouvés qu'un dixième
 * affirmé : un test qui ne prouve rien coûte plus cher que l'absence, parce
 * qu'il fait croire que le sujet est tenu.
 *
 * Ces scénarios sont volontairement écrits sur les fonctions PURES (le plan, le
 * diff, l'arbitre, la préservation des personnes) : c'est là que vit la règle,
 * et un test qui passe par un service mocké prouverait surtout que le mock
 * répond.
 */

function graph(partial: Record<string, unknown>): OrgGraph {
  return orgGraphSchema.parse({
    entities: [{ id: 'e1', name: 'ACME', type: 'groupe', status: 'operating', confidence: 90 }],
    ...partial,
  })
}

const CLAIRE = {
  id: 'p-claire',
  fullName: 'Claire Perrin',
  title: 'DSI',
  entityId: 'e1',
  identityStatus: 'enriched',
  confidence: 80,
}

describe('#2318.10 — recette LAU-FINAL-059', () => {
  // ── 1 ────────────────────────────────────────────────────────────────────
  // « analyse de dix jours ». Ce qui est en jeu : dix jours n'est pas périmé,
  // et le plan doit le DIRE au lieu de proposer de tout repayer.
  describe('1. analyse de dix jours', () => {
    const tenDaysAgo = new Date(Date.UTC(2026, 8, 10, 12, 0, 0))
    const now = new Date(Date.UTC(2026, 8, 20, 12, 0, 0))

    it('annonce les sections ENCORE FRAÎCHES plutôt que de tout proposer à relire', () => {
      const plan = buildRefreshPlan({
        mode: 'organisation',
        fullAnalysisCredits: 10,
        now,
        freshness: Object.fromEntries(
          buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 10, now, freshness: {} }).reread.map(
            dimension => [dimension, tenDaysAgo.toISOString()],
          ),
        ),
      })

      // Dix jours < trente : rien n'est ancien, et tout est nommé frais.
      expect(REFRESH_AGED_AFTER_MS).toBe(30 * 24 * 60 * 60 * 1000)
      expect(plan.aged).toEqual([])
      expect(plan.fresh.length).toBeGreaterThan(0)
    })

    it('porte la DATE de la dernière analyse — jamais un dossier sans âge', () => {
      const plan = buildRefreshPlan({
        mode: 'organisation',
        fullAnalysisCredits: 10,
        now,
        // `entities` est l'un des deux axes que le mode « organisation » relit.
        freshness: { entities: tenDaysAgo.toISOString() },
      })
      expect(plan.lastAnalyzedAt).toBe(tenDaysAgo.toISOString())
    })

    it('un axe JAMAIS mesuré reste INCONNU — il ne se fait pas passer pour frais', () => {
      const plan = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 10, now, freshness: {} })
      expect(plan.lastAnalyzedAt).toBeNull()
      expect(plan.fresh).toEqual([])
      expect(plan.reread.length).toBeGreaterThan(0)
    })
  })

  // ── 2 ────────────────────────────────────────────────────────────────────
  // « contact parti ». Le piège : supprimer la personne. On archive, on ne
  // supprime pas — elle reste au dossier, NOMMÉE non confirmée, avec sa date.
  describe('2. contact parti', () => {
    it('la personne qui n’est plus observée est CONSERVÉE et nommée non confirmée, avec sa date', () => {
      const result = preserveNotConfirmedPeople({
        current: graph({ people: [CLAIRE] }),
        incoming: graph({ people: [] }),
        asOf: '2026-09-20T09:00:00.000Z',
      })

      expect(result?.diff.notConfirmed.map(entry => entry.personId)).toEqual(['p-claire'])
      // …et surtout : elle est TOUJOURS dans le graphe persisté.
      expect(result?.orgGraph.people.map(person => person.id)).toContain('p-claire')
    })
  })

  // ── 3 ────────────────────────────────────────────────────────────────────
  // « filiale corrigée ». Le lien capitalistique EST corrigeable
  // (`groupRole`, `groupHeadSiren`) : un humain qui dit « ce n'est pas une
  // filiale » doit gagner contre la collecte suivante.
  describe('3. filiale corrigée', () => {
    it('le rôle de groupe corrigé à la main tient contre ce que la collecte rapporte', () => {
      expect(ACCOUNT_FIELD_COLUMNS).toHaveProperty('groupRole')
      const decision = decideFieldWrite({
        incomingValue: 'subsidiary',
        incomingSource: 'pipeline',
        currentValue: 'independent',
        currentSource: 'human',
      })
      expect(decision).toEqual({ write: false, reason: 'lower_authority' })
    })

    it('et le diff le DIT — la correction conservée, avec ce qui a été écarté', () => {
      const diff = buildRefreshDiff({
        before: [{ kind: 'fact', key: 'groupRole', label: 'Rôle de groupe', value: 'independent', source: 'human' }],
        after: [{ kind: 'fact', key: 'groupRole', label: 'Rôle de groupe', value: 'subsidiary' }],
      })
      expect(diff.preservedCorrections).toContainEqual(
        expect.objectContaining({ key: 'groupRole', keptValue: 'independent', discardedValue: 'subsidiary' }),
      )
    })
  })

  // ── 5 ────────────────────────────────────────────────────────────────────
  // « signal périmé ». Un signal qui disparaît du relevé ne s'évapore pas : il
  // REDEVIENT INCONNU AVEC SA DATE.
  describe('5. signal périmé', () => {
    it('le signal disparu est NOMMÉ expiré, dernière valeur et date portées', () => {
      const diff = buildRefreshDiff({
        before: [
          {
            kind: 'signal',
            key: 'levee',
            label: 'Levée de fonds',
            value: '20 M€',
            measuredAt: '2026-06-01T00:00:00.000Z',
          },
        ],
        after: [],
      })
      expect(diff.expiredSignals).toContainEqual(
        expect.objectContaining({
          key: 'levee',
          lastKnownValue: '20 M€',
          lastSeenAt: '2026-06-01T00:00:00.000Z',
        }),
      )
      // Il n'est ni « modifié », ni déclaré faux.
      expect(diff.changedFacts.map(fact => fact.key)).not.toContain('levee')
    })
  })

  // ── 6 ────────────────────────────────────────────────────────────────────
  // « mauvais scope ». Choisir le mauvais périmètre ne doit pas être une
  // surprise facturée : le plan annonce AVANT ce qu'il va relire, et les deux
  // modes ne relisent pas la même chose.
  describe('6. mauvais scope', () => {
    const now = new Date(Date.UTC(2026, 8, 20, 12, 0, 0))

    it('les deux modes n’annoncent PAS les mêmes axes — le périmètre se voit avant de payer', () => {
      const organisation = buildRefreshPlan({ mode: 'organisation', fullAnalysisCredits: 10, now, freshness: {} })
      const full = buildRefreshPlan({ mode: 'full', fullAnalysisCredits: 10, now, freshness: {} })
      expect([...organisation.reread]).not.toEqual([...full.reread])
    })

    it('et annonce ce qu’il CONSERVERA quoi qu’il arrive — un mauvais scope ne détruit rien', () => {
      const plan = buildRefreshPlan({ mode: 'full', fullAnalysisCredits: 10, now, freshness: {} })
      expect(plan.preserved.length).toBeGreaterThan(0)
      expect(plan.refund).toBe('refunded_if_failed')
    })
  })

  // ── 7 ────────────────────────────────────────────────────────────────────
  // « profil modifié ». Un dossier produit sous un profil ESN devenu obsolète
  // doit le dire — sinon on lit une recommandation calibrée pour quelqu'un
  // d'autre sans le savoir.
  describe('7. profil modifié', () => {
    it('un dossier produit sous un profil plus ancien est NOMMÉ comme tel', () => {
      expect(ranWithOlderProfile({ esnProfileVersion: 3, currentEsnProfileVersion: 5 })).toBe(true)
    })

    it('mais un dossier sans version connue n’est PAS accusé — « non mesuré » n’est pas « périmé »', () => {
      expect(ranWithOlderProfile({ esnProfileVersion: null, currentEsnProfileVersion: 5 })).toBe(false)
    })
  })

  // ── 8 ────────────────────────────────────────────────────────────────────
  // « correction propagée » — le cœur de #2318.7, vu depuis la recette : la
  // correction dit où elle est arrivée ET où elle n'est pas arrivée.
  describe('8. correction propagée', () => {
    it('les surfaces atteintes sont prouvées, les autres NOMMÉES — jamais neuf promesses', () => {
      const reached = CORRECTION_SURFACE_TRACES.filter(trace => trace.status === 'reached')
      const notReached = CORRECTION_SURFACE_TRACES.filter(trace => trace.status === 'not_reached')

      expect(reached.length).toBeGreaterThan(0)
      expect(notReached.length).toBeGreaterThan(0)
      expect(reached.length + notReached.length).toBe(CORRECTION_SURFACE_TRACES.length)
      for (const trace of notReached) expect(trace.reasonKey).not.toBe('')
    })
  })

  // ── 9 ────────────────────────────────────────────────────────────────────
  // « rollback ». Revenir en arrière n'est pas effacer : c'est une NOUVELLE
  // correction, qui gagne parce qu'elle est humaine — et l'ancienne reste au
  // journal (append-only), consultable.
  describe('9. rollback', () => {
    it('un humain peut revenir à la valeur d’avant — humain contre humain, le dernier écrit gagne', () => {
      const decision = decideFieldWrite({
        incomingValue: 'Lyon',
        incomingSource: 'human',
        currentValue: 'Paris',
        currentSource: 'human',
      })
      expect(decision).toEqual({ write: true, reason: 'higher_or_equal_authority' })
    })

    it('un humain peut aussi REVENIR À L’INCONNU — seul lui peut dire « c’est faux, retire-le »', () => {
      expect(
        decideFieldWrite({
          incomingValue: null,
          incomingSource: 'human',
          currentValue: 'Paris',
          currentSource: 'pipeline',
        }),
      ).toEqual({ write: true, reason: 'higher_or_equal_authority' })

      // …et la collecte, elle, n'a jamais ce droit : un blanc du pipeline
      // n'efface rien. Sinon « rollback » deviendrait « perte silencieuse ».
      expect(
        decideFieldWrite({
          incomingValue: null,
          incomingSource: 'pipeline',
          currentValue: 'Paris',
          currentSource: 'pipeline',
        }),
      ).toEqual({ write: false, reason: 'blank_never_overwrites' })
    })
  })

  // ── 10 ────────────────────────────────────────────────────────────────────
  // « deux utilisateurs simultanés ». Le risque : une correction écrasée sans
  // un mot. La règle tenue ici : la seconde correction humaine est ACCEPTÉE
  // (elle n'est pas refusée en silence), et elle ne peut pas passer inaperçue —
  // #2318.8 fait du constat d'écrasement un élément du compte rendu.
  describe('10. deux utilisateurs simultanés', () => {
    it('la seconde correction humaine est acceptée — jamais refusée en silence', () => {
      expect(
        decideFieldWrite({
          incomingValue: 'Bordeaux',
          incomingSource: 'human',
          currentValue: 'Lyon',
          currentSource: 'human',
        }),
      ).toEqual({ write: true, reason: 'higher_or_equal_authority' })
    })

    it('deux corrections identiques ne se comptent pas deux fois — elles ne changent rien', () => {
      expect(
        decideFieldWrite({
          incomingValue: 'Lyon',
          incomingSource: 'human',
          currentValue: 'Lyon',
          currentSource: 'human',
        }),
      ).toEqual({ write: false, reason: 'unchanged' })
    })

    it('et un écrasement CONSTATÉ ne se dit jamais « conservé » (#2318.8)', () => {
      const diff = buildRefreshDiff({
        before: [{ kind: 'fact', key: 'headquarters', label: 'Siège', value: 'Lyon', source: 'human' }],
        after: [{ kind: 'fact', key: 'headquarters', label: 'Siège', value: 'Bordeaux' }],
        overwrittenCorrections: [
          {
            key: 'headquarters',
            label: 'Siège',
            correctedValue: 'Lyon',
            overwrittenWith: 'Bordeaux',
            byPhase: 'entities',
            correctedAt: null,
          },
        ],
      })
      expect(diff.overwrittenCorrections).toHaveLength(1)
      expect(diff.preservedCorrections.map(entry => entry.key)).not.toContain('headquarters')
    })
  })

  // ── Le scénario qu'on NE SAIT PAS jouer, et la preuve ─────────────────────
  //
  // « ESN faussement présente » : le commercial voit une ESN annoncée en place
  // chez le client, et sait qu'elle n'y est plus. Pour démentir, il lui faudrait
  // un geste de correction sur ce fait — or l'ESN en place vit dans le blob
  // d'analyse, et AUCUNE colonne corrigeable ne la porte. `RecordEditService`
  // étant l'unique chemin d'écriture humain, et n'écrivant que ces colonnes, le
  // geste n'existe pas : il n'y a rien à recetter.
  //
  // Ce test ne simule pas le scénario — il établit l'empêchement, et il rougira
  // le jour où la colonne apparaîtra. C'est-à-dire exactement le jour où il
  // faudra écrire la recette pour de bon.
  describe('4. ESN faussement présente — NON JOUABLE, et voici pourquoi', () => {
    it('aucune colonne corrigeable ne porte l’ESN en place : le démenti n’a pas de geste', () => {
      const correctable = [...Object.keys(ACCOUNT_FIELD_COLUMNS), ...Object.keys(CONTACT_FIELD_COLUMNS)]
      const namesTheIncumbent = correctable.filter(field => /esn|incumbent|prestataire|fournisseur/i.test(field))
      expect(namesTheIncumbent).toEqual([])
    })
  })
})
