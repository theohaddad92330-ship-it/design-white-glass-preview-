// Décision Louis 12/10 revient sur c88, délibérément : les fiches démo nées d'un CV sont qualifiées.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  accountAnalysisSchema,
  actionTypeSchema,
  assessInvoiceReadiness,
  computeDso,
  consultantAvailabilitySchema,
  consultantContractSchema,
  consultantSenioritySchema,
  invoicingNeedsTimesheet,
  MEASURABILITY_THRESHOLDS,
  OUTCOME_ACTION_TYPES,
} from '@bellum/contracts'
import { DEMO_BPCE_REAL_CONTACTS_COMPANY } from './bpce-csv-mapping'
import { BPCE_ROWS } from './bpce-seed'
import { DEMO_BRIEF_THIN_COMPANIES, DEMO_REAL_CONTACTS_COMPANIES } from './commercial-brief-seed'
import { scriptedDemoParse } from '../consultants/cv-parse-demo'
import { canonicalSkill } from '../consultants/skill-referential'
import { densifiedContactsFor } from './demo-contact-density'
import { seatNameOrNull } from './demo-seat-names'
import {
  DEMO_CONSULTANTS,
  DEMO_CV_IMPORT_CONSULTANTS,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_USER_ACTIONS,
  demoInvoiceHistory,
} from './demo-dataset'

/**
 * Invariants du jeu de démonstration.
 *
 * Ce que ces tests protègent, ce n'est pas une forme de données : c'est ce qu'un
 * prospect a SOUS LES YEUX pendant une démo. Un onglet vide ou une image cassée
 * ne fait échouer aucun test de rendu — elle se voit seulement en réunion.
 */

/** Racine du monorepo (`apps/api/src/modules/demo` → 5 niveaux au-dessus). */
const REPO_ROOT = resolve(__dirname, '../../../../..')

/** Chemin disque d'un visuel de démo servi par la SPA. */
function assetPath(publicPath: string): string {
  return resolve(REPO_ROOT, 'apps/web/public', publicPath.replace(/^\//, ''))
}

describe('DEMO_DOSSIERS — ce que le prospect voit', () => {
  it('respecte le contrat `raw_analysis` (mêmes clés qu’un vrai run)', () => {
    for (const dossier of DEMO_DOSSIERS) {
      const parsed = accountAnalysisSchema.safeParse(dossier.account.raw_analysis)
      expect(parsed.success).toBe(true)
    }
  })

  /**
   * #2165.24 / #2166.3 / #2165.16 — Société Générale porte un lien
   * capitalistique FACTUELLEMENT VRAI (elle EST la tête des filiales que
   * `subsidiaries` nomme déjà) ; les cinq autres dossiers réels n'en portent
   * AUCUN — ce sont des sociétés indépendantes les unes des autres, et en
   * inventer un lien affirmerait un fait FAUX entre deux entreprises RÉELLES
   * (le principe « SIX SOCIÉTÉS RÉELLES » du docblock en tête de fichier).
   */
  describe('rattachement capitalistique (#2165.24 / #2166.3 / #2165.16)', () => {
    it('Société Générale est marquée « groupe », pointant sur elle-même', () => {
      const sg = DEMO_DOSSIERS.find(d => d.account.company_name === 'Société Générale')
      expect(sg?.account.group_role).toBe('groupe')
      expect(sg?.account.group_head_siren).toBe(sg?.account.siren)
      expect(sg?.account.group_link_source).toBeTruthy()
      expect(sg?.account.group_link_observed_at).toBeInstanceOf(Date)
    })

    it('aucun autre dossier réel ne porte un lien inventé', () => {
      const others = DEMO_DOSSIERS.filter(d => d.account.company_name !== 'Société Générale')
      for (const dossier of others) {
        expect(dossier.account.group_role ?? null).toBeNull()
      }
    })
  })

  describe('onglet Sites', () => {
    it('chaque dossier a des implantations — sinon l’onglet affiche « Aucun site identifié »', () => {
      for (const dossier of DEMO_DOSSIERS) {
        const sites = dossier.account.raw_analysis['sites_france']
        expect(Array.isArray(sites)).toBe(true)
        expect((sites as unknown[]).length).toBeGreaterThan(0)
      }
    })

    it('chaque site est projetable sur la carte (ville + coordonnées plausibles)', () => {
      for (const dossier of DEMO_DOSSIERS) {
        const sites = dossier.account.raw_analysis['sites_france'] as {
          city?: string | null
          latitude?: number | null
          longitude?: number | null
        }[]
        const isBpce = dossier.account.company_name === DEMO_BPCE_REAL_CONTACTS_COMPANY
        for (const site of sites) {
          expect(site.city).toBeTruthy()
          // EXEMPTION NOMMÉE — Groupe BPCE : les deux campus datacenter du CSV
          // n'ont pas de ville (« Campus Albiréo », « Campus Antarès ») ; inventer
          // une latitude les poserait au hasard. Sans coordonnée, ils ne se
          // dessinent pas sur la carte mais restent listés.
          if (isBpce && site.latitude == null) continue
          // Bornes de la France métropolitaine : une coordonnée inventée
          // poserait un marqueur en pleine mer, ce qu'aucun schéma n'attrape.
          expect(site.latitude).toBeGreaterThan(41)
          expect(site.latitude).toBeLessThan(52)
          expect(site.longitude).toBeGreaterThan(-6)
          expect(site.longitude).toBeLessThan(10)
        }
      }
    })

    it('couvre le siège ET au moins un autre type — les onglets de catégorie ne sont pas décoratifs', () => {
      for (const dossier of DEMO_DOSSIERS) {
        const sites = dossier.account.raw_analysis['sites_france'] as {
          type?: string | null
          is_headquarters?: boolean | null
        }[]
        // Le siège est désigné pour TOUS les dossiers — Groupe BPCE compris
        // depuis le brief commercial du 01/10/2026 (Tours Duo, Paris 13e ; le
        // relevé CSV, lui, ne le disait pas et aucun de ses sites ne le prétend).
        expect(sites.filter(site => site.is_headquarters)).toHaveLength(1)
        // EXEMPTION NOMMÉE (04/10/2026) : Chantiers de l'Atlantique — le classeur ne nomme qu'« un siège et site »
        // (Saint-Nazaire) ; un second type de site serait inventé (voir DEMO_BRIEF_THIN_COMPANIES).
        const thin = DEMO_BRIEF_THIN_COMPANIES.includes(dossier.account.company_name)
        // EXEMPTION NOMMÉE (04/10/2026, démo clients) : Kiabi. Son classeur ne nomme qu'UN site en France, le siège (Kiabi
        // Village, Lezennes) ; en poser un second serait l'inventer. Le plancher de Kiabi est ce que son classeur porte.
        if (dossier.account.company_name === 'Kiabi') expect(sites).toHaveLength(1)
        expect(new Set(sites.map(site => site.type)).size).toBeGreaterThan(thin ? 0 : 1)
      }
    })
  })

  describe('visuels — ce qu’on NE dessine PAS pour une société réelle', () => {
    /**
     * Le jeu portait des logos et des portraits illustrés, cohérents avec des
     * sociétés inventées. Les cinq sociétés sont désormais réelles :
     *  - redessiner leur marque reproduirait le signe distinctif d'un tiers ;
     *  - dessiner un visage pour un mandataire social fabriquerait l'image d'une
     *    personne qui existe, sur un lien public.
     * Dans les deux cas l'interface retombe sur le monogramme, qui est son
     * comportement normal pour tout compte sans logo résolu.
     */
    it('aucun compte ne porte de logo dessiné', () => {
      for (const dossier of DEMO_DOSSIERS) {
        expect(dossier.account.logo_url).toBeNull()
      }
    })

    it('aucun contact ne porte de portrait', () => {
      for (const dossier of DEMO_DOSSIERS) {
        for (const contact of dossier.contacts) {
          expect(contact.photo_url).toBeNull()
        }
      }
    })

    it('aucune coordonnée n’est publiée sur une personne RÉELLE du registre', () => {
      // La règle non négociable : un lien de démonstration public ne diffuse pas
      // de coordonnée sur quelqu'un qui existe. Depuis DEMO-02 (17/08), des
      // interlocuteurs SIMULÉS en portent — mais eux seuls, et la frontière est
      // vérifiable : leurs noms viennent de `demo-contact-density.ts`.
      const simulated = new Set(
        DEMO_DOSSIERS.flatMap(dossier =>
          densifiedContactsFor(dossier.account.company_name).map(contact => contact.full_name),
        ),
      )
      for (const dossier of DEMO_DOSSIERS) {
        // EXEMPTION NOMMÉE — Groupe BPCE : décision Louis du 30/09/2026, après
        // avertissement sur le risque RGPD (« Tout, coordonnées incluses »,
        // confirmée deux fois). Renversement assumé de cette règle POUR CE SEUL
        // DOSSIER (voir `bpce-csv-mapping.ts`) ; elle reste entière pour les six
        // autres — et le test « les coordonnées BPCE viennent du CSV » ci-dessous
        // interdit d'en inventer une.
        // Même exemption NOMMÉE, étendue le 01/10/2026 (décision Louis, « coordonnées
        // en clair ») aux cinq comptes à brief commercial : `DEMO_REAL_CONTACTS_COMPANIES`.
        if (DEMO_REAL_CONTACTS_COMPANIES.has(dossier.account.company_name)) continue
        for (const contact of dossier.contacts) {
          if (simulated.has(contact.full_name)) continue
          expect({ name: contact.full_name, email: contact.email }).toEqual({
            name: contact.full_name,
            email: null,
          })
        }
      }
    })

    it('les coordonnées du dossier BPCE viennent du CSV importé — jamais inventées (décision Louis 30/09/2026)', () => {
      const bpce = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_BPCE_REAL_CONTACTS_COMPANY)
      expect(bpce).toBeDefined()
      const csv = BPCE_ROWS.map(row => [row.email, row.email_pro, row.telephone, row.mobile, row.linkedin].join('|'))
        .join('|')
        .toLowerCase()
      const withCoordinates = bpce!.contacts.filter(contact => contact.email || contact.phone || contact.linkedin_url)
      expect(withCoordinates.length).toBeGreaterThan(300)
      for (const contact of withCoordinates) {
        for (const value of [contact.email, contact.phone, contact.linkedin_url]) {
          if (value) expect(csv).toContain(value.toLowerCase())
        }
      }
    })

    it('les coordonnées simulées ne peuvent atteindre personne', () => {
      // Ce qui rend la densification tenable : une adresse en `.example`
      // (RFC 2606) n'est attribuable à personne, et un numéro de la plage
      // `06 39 98 xx xx` est réservé à la fiction par l'ARCEP. Un message ou un
      // appel parti par erreur pendant une démonstration ne joint aucun humain.
      const simulated = DEMO_DOSSIERS.flatMap(dossier => densifiedContactsFor(dossier.account.company_name))
      expect(simulated.length).toBeGreaterThan(0)
      for (const contact of simulated) {
        if (contact.email) expect(contact.email).toMatch(/@[a-z0-9-]+\.example$/)
        // #2297.33/.39 — UN contact (`invalidPhone`, `demo-contact-density.ts`)
        // porte un numéro DÉLIBÉRÉMENT malformé (deux lettres à la place des
        // deux derniers chiffres), pour montrer le statut « invalid » en
        // salle de démo. Le préfixe de fiction ARCEP reste intact — des
        // lettres ne composent de toute façon aucun numéro.
        if (contact.phone) expect(contact.phone).toMatch(/^\+33 6 39 98 (\d{2}|XX) (\d{2}|XX)$/)
        // Aucune URL de profil : il n'existe pas de réseau social « .example »,
        // donc toute adresse de profil désignerait un compte réel.
        expect(contact).not.toHaveProperty('linkedin_url')
      }
    })

    it('chaque dossier a de quoi montrer la chaîne complète (DEMO-02)', () => {
      // Les trois chiffres de l'audit : détectés, qualifiés, prêts à contacter.
      // Un dossier qui s'arrête avant le troisième ne montre jamais à quoi sert
      // le produit.
      for (const dossier of DEMO_DOSSIERS) {
        // EXEMPTION NOMMÉE — Groupe BPCE : tout le CSV y est semé (décision Louis
        // 30/09/2026), donc des centaines de contacts joignables ; la borne haute
        // ci-dessous vise les dossiers DENSIFIÉS à la main. Le dossier BPCE est
        // tenu par `bpce-csv-mapping.spec.ts` (chaque ligne consommée).
        // (étendue le 01/10/2026 aux cinq comptes à brief commercial : leurs personnes
        // viennent des classeurs du CEO, pas d'une densification à la main.)
        if (DEMO_REAL_CONTACTS_COMPANIES.has(dossier.account.company_name)) continue
        const contacts = dossier.contacts
        const reachable = contacts.filter(contact => Boolean(contact.email))
        const qualified = contacts.filter(contact => contact.contact_score >= 55)
        expect({
          compte: dossier.account.company_name,
          detectes: contacts.length >= 50,
          qualifies: qualified.length >= 18,
          // Borne HAUTE autant que basse : cinquante contacts joignables ne
          // seraient pas une démonstration plus convaincante, seulement une liste
          // que personne ne croit.
          contactables: reachable.length >= 10 && reachable.length <= 15,
        }).toEqual({
          compte: dossier.account.company_name,
          detectes: true,
          qualifies: true,
          contactables: true,
        })
      }
    })

    it('les visuels de démonstration livrés avec la SPA existent toujours', () => {
      // Les fichiers restent servis (d'autres écrans de démonstration s'en
      // servent) : ce test garde la garde d'origine sans exiger qu'un dossier
      // les référence.
      expect(existsSync(assetPath('/demo-assets'))).toBe(true)
    })
  })

  describe('vivier de consultants (écran « Vivier »)', () => {
    it('n’est pas vide — sinon l’écran s’ouvre sur un état vide en pleine démo', () => {
      expect(DEMO_CONSULTANTS.length).toBeGreaterThanOrEqual(5)
    })

    it('n’utilise que des valeurs du contrat (séniorité, dispo, contrat)', () => {
      for (const consultant of DEMO_CONSULTANTS) {
        expect(consultantSenioritySchema.safeParse(consultant.seniority).success).toBe(true)
        expect(consultantAvailabilitySchema.safeParse(consultant.availability).success).toBe(true)
        expect(consultantContractSchema.safeParse(consultant.contract_type).success).toBe(true)
      }
    })

    it('porte un CV source — sans lui la réécriture p22 répond 400 et la démo s’arrête', () => {
      for (const consultant of DEMO_CONSULTANTS) {
        expect(consultant.cv_text.length).toBeGreaterThan(200)
        // La garde anti-invention recherche chaque expérience DANS ce texte : un
        // CV qui ne cite pas la stack déclarée ferait retirer les expériences.
        expect(consultant.stack.length).toBeGreaterThan(0)
      }
    })

    it('couvre les besoins des dossiers seedés — un vivier hors-sujet sort un matching vide', () => {
      const haystack = DEMO_CONSULTANTS.flatMap(c => [...c.stack, ...c.sectors])
        .join(' ')
        .toLowerCase()
      // Les mots-clés suivent les cinq dossiers réels : exploitation de
      // plateforme et observabilité, industrialisation de modèles, reprise de
      // données lors d'une sortie d'activité, sécurité applicative, systèmes
      // d'information industriels.
      for (const needle of ['observabilité', 'mlops', 'reprise de données', 'sécurité applicative', 'si industriel']) {
        expect(haystack).toContain(needle)
      }
    })

    // #3830.3 — recette démo du 07/10 : le filtre compétences (déjà corrigé
    // ddb5ec0f68) doit pouvoir se PROUVER sur cette salle. Sans au moins un
    // profil par compétence cherchée, la salle rend le même vivier NON
    // filtré — pas un défaut du filtre, un manque du semis. `canonicalSkill`
    // est la fonction que `DemoSeedService` et `TalentService.search` utilisent
    // TOUS LES DEUX pour écrire puis lire `consultant_skills` (GA-26) : une
    // compétence absente d'ici resterait invisible même filtrée correctement.
    it.each(['Kubernetes', 'Java', 'Spring'])(
      'au moins un profil porte la compétence « %s », indexable (#3830.3)',
      skill => {
        const canonical = canonicalSkill(skill) ?? skill.toLowerCase()
        const porteurs = DEMO_CONSULTANTS.filter(c =>
          c.stack.some(s => (canonicalSkill(s) ?? s.toLowerCase()) === canonical),
        )
        expect(porteurs.length).toBeGreaterThan(0)
      },
    )

    // #3830.4 — le filtre cherche AUSSI la sous-chaîne du libellé affiché (`coalesce(raw_label, skill)`,
    // `TalentService.search`). Pour que la salle le montre, il faut une compétence LIBRE (hors référentiel).
    it('#3830.4 — un profil porte une compétence libre « Analyse de risque », hors référentiel', () => {
      expect(canonicalSkill('Analyse de risque')).toBeNull()
      const porteurs = DEMO_CONSULTANTS.filter(c => c.stack.some(s => s.toLowerCase().includes('risque')))
      expect(porteurs.map(c => c.full_name)).toEqual(['Inès Kaczmarek'])
    })

    it('sait dire NON : une compétence absente de tout le vivier ne trouve personne', () => {
      const canonical = canonicalSkill('Rust') ?? 'rust'
      const porteurs = DEMO_CONSULTANTS.filter(c =>
        c.stack.some(s => (canonicalSkill(s) ?? s.toLowerCase()) === canonical),
      )
      expect(porteurs.length).toBe(0)
    })
  })

  describe('#3811.4 — une lecture de CV partielle est observable en démo', () => {
    it('le CV de Julien Fabre (qualifié, lecture à corriger) cite des compétences que la lecture scriptée ne sort pas', () => {
      const doc = DEMO_CV_IMPORT_CONSULTANTS.find(c => c.full_name === 'Julien Fabre' && c.documents.length > 0)
        ?.documents[0]
      expect(doc?.text).toMatch(/^COMPÉTENCES$/m)
      const skills = scriptedDemoParse(doc?.text ?? '').find(field => field.detection === 'skills')
      expect(skills?.value ?? null).toBeNull()
    })

    it('#4034 — la fiche d’Inès Castel porte un CV lisible : « Ouvrir le CV » (entête) a de quoi s’ouvrir en démo', () => {
      const latest = DEMO_CV_IMPORT_CONSULTANTS.find(c => c.full_name === 'Inès Castel')?.documents.at(-1)
      expect((latest?.text ?? '').trim().length).toBeGreaterThan(0)
    })

    it('sait dire NON : le CV d’Inès Castel, sans section compétences, n’est pas une lecture partielle', () => {
      const doc = DEMO_CV_IMPORT_CONSULTANTS.find(c => c.full_name === 'Inès Castel')?.documents.at(-1)
      expect(doc?.text).not.toMatch(/^COMPÉTENCES$/m)
    })
  })

  describe('historique d’activité (écran « Historique »)', () => {
    it('n’émet que des types d’action du contrat', () => {
      for (const action of DEMO_USER_ACTIONS) {
        expect(actionTypeSchema.safeParse(action.action_type).success).toBe(true)
      }
    })

    it('ne référence que des comptes et des contacts réellement seedés', () => {
      // ⚠️ Le corpus ignorait le CLIENT D'EXEMPLE, qui est pourtant semé par la
      // même porte : la garde ne savait donc pas valider une trace le
      // concernant, et refusait une référence parfaitement bonne. Elle n'est pas
      // élargie pour faire passer un semis — elle l'est parce qu'elle regardait
      // une partie seulement de ce qu'elle prétend garder.
      const companies = new Set([
        ...DEMO_DOSSIERS.map(dossier => dossier.account.company_name),
        DEMO_DELIVERY_CLIENT.account.company_name,
      ])
      const contacts = new Set([
        ...DEMO_DOSSIERS.flatMap(dossier => dossier.contacts.map(contact => contact.full_name)),
        ...DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.full_name),
      ])
      for (const action of DEMO_USER_ACTIONS) {
        if (action.company) expect(companies.has(action.company)).toBe(true)
        if (action.contact) expect(contacts.has(action.contact)).toBe(true)
      }
    })

    it('la garde LIT bien les deux corpus — sinon elle validerait n’importe quel nom', () => {
      // Un corpus vide, ou amputé du client d'exemple, laisserait passer une
      // trace pointant vers un compte que personne ne sème.
      expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
      // …et les issues déclarées portent sur le COMPTE du client de livraison,
      // jamais sur une personne (décision Louis 04/10/2026 : aucune déclaration
      // inventée sur une personne réelle — « a répondu », « rendez-vous
      // décroché » ne sont plus semés).
      const outcomes = DEMO_USER_ACTIONS.filter(a =>
        (OUTCOME_ACTION_TYPES as readonly string[]).includes(a.action_type),
      )
      expect(outcomes.length).toBeGreaterThan(0)
      for (const outcome of outcomes) {
        expect(outcome.company).toBe(DEMO_DELIVERY_CLIENT.account.company_name)
        // Lot D01 (06/10/2026) : « Réponse reçue » ne vise que l'interlocutrice SIMULÉE du client
        // de livraison (adresse en `.example`) — jamais une personne réelle du registre.
        if (outcome.contact !== null) {
          const simulated = DEMO_DELIVERY_CLIENT.contacts.find(contact => contact.full_name === outcome.contact)
          expect(simulated?.email ?? '').toMatch(/\.example$/)
        }
      }
    })

    it('est ancré en RELATIF — une date en dur vieillirait après quelques mois', () => {
      for (const action of DEMO_USER_ACTIONS) {
        expect(action.hours_ago).toBeGreaterThan(0)
        // Une semaine : au-delà, « Historique » range la trace hors des filtres
        // récents et le tableau de bord ne la compte plus.
        expect(action.hours_ago).toBeLessThanOrEqual(24 * 7)
      }
    })
  })
})

/**
 * L'HISTORIQUE DE FACTURATION DU CLIENT D'EXEMPLE — D42 (Louis, 28/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ, ET CE QUI ÉTAIT FAUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice_readiness` était classée « vide à dessein », avec pour raison que
 * « l'état de facturation se RECALCULE à chaque lecture ». C'est vrai des
 * BLOQUEURS, et faux de tout le reste : `RevenueService.dso()` lit la TABLE
 * (`revenue.service.ts:291-307`), pas un calcul. En démonstration la requête
 * ramenait zéro ligne, et la tuile « Délai de paiement » affichait pour
 * toujours « non mesurable — 0 facture sur les 10 nécessaires ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUINZE LIGNES DEPUIS #2566.4, ET POURQUOI LE PLANCHER N'EST PLUS EXACT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seuil de `MEASURABILITY_THRESHOLDS.dso` porte sur ce qui est CALCULÉ, et
 * jamais sur ce qui est écarté (`measurability.ts:178-181`) : il faut donc DIX
 * délais exploitables, PLUS la mal datée, PLUS les deux contestées. À
 * l'origine (D42), treize lignes donnaient DIX délais — exactement le
 * plancher, sans marge. #2566.4 sème la mission longue au bon de commande
 * expiré avec DEUX mois déjà réglés (le reste de son critère de recette),
 * portant le calculable à DOUZE : deux lignes de marge au-dessus du plancher,
 * plus jamais l'exactitude d'avant. Les deux délais choisis (vingt et
 * quarante jours) encadrent la paire centrale des dix délais d'origine sans
 * la déplacer, donc la MÉDIANE reste à 32 jours — seul le compte exact au
 * seuil change.
 */
describe('historique de facturation du client d’exemple (D42)', () => {
  const DAY = 86_400_000

  /**
   * Les dates de visite, sur trois ans — 1er, 15 et dernier jour de chaque mois.
   *
   * Toutes les dates du jeu sont ancrées sur MAINTENANT : un invariant vérifié
   * le 28 d'un mois de 31 jours ne dit rien du 1er mars. Les pièges tiennent au
   * calendrier (février, les mois de 30 jours, l'année bissextile), donc c'est
   * le calendrier qu'on balaie.
   */
  function visitDates(): number[] {
    const dates: number[] = []
    for (let year = 2026; year <= 2028; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        for (const day of [1, 15, lastDay]) {
          // 00:30 UTC : l'heure la plus hostile — c'est là qu'un fuseau à l'est
          // fait basculer la date du jour, donc le mois « précédent ».
          dates.push(Date.UTC(year, month, day, 0, 30))
        }
      }
    }
    return dates
  }

  /** Le premier jour du mois, `k` mois avant celui de `now`. */
  function monthStart(now: number, monthsAgo: number): string {
    const at = new Date(now)
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - monthsAgo, 1)).toISOString().slice(0, 10)
  }

  /**
   * Le DSO tel que la tuile le calcule, sur les lignes que la démonstration
   * écrit — mêmes refus, dans le même ordre, que `RevenueService.dso()`.
   *
   * ⚠️ Le filtre des contestées vit dans le `WHERE` de la requête, PAS dans
   * `computeDso` : le rejouer ici est ce qui rend le test comparable à l'écran.
   * `slice(0, 10)` reproduit le `to_char(…, 'YYYY-MM-DD')` du SQL.
   */
  function tile(now: number, options: { keepDisputed?: boolean } = {}) {
    // ⚠️ Le `WHERE ir.paid_at IS NOT NULL` du SQL écarte les IMPAYÉES, et ce
    // filtre est reproduit ici. Une impayée est un RETARD et non un délai : la
    // moyenne d'un portefeuille ne se mesure pas sur une facture qui n'est
    // jamais rentrée. Le jeu en porte deux depuis l'écran « Encaissements », et
    // la tuile doit continuer à dire exactement la même chose qu'avant.
    const rows = demoInvoiceHistory(now).filter(row => row.paidAt !== null)
    const disputed = rows.filter(row => row.disputedAt !== null).length
    const measured = options.keepDisputed ? rows : rows.filter(row => row.disputedAt === null)
    return computeDso(
      measured.map(row => ({ invoicedAt: row.invoicedAt.slice(0, 10), paidAt: (row.paidAt ?? '').slice(0, 10) })),
      { disputed },
    )
  }

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    // 15 depuis #2566.4 (13 d'origine + les deux mois déjà facturés de la
    // mission longue au bon de commande expiré).
    expect(DEMO_DELIVERY_CLIENT.invoices.length).toBeGreaterThanOrEqual(15)
    expect(demoInvoiceHistory(Date.now())).toHaveLength(DEMO_DELIVERY_CLIENT.invoices.length)
    expect(visitDates().length).toBeGreaterThanOrEqual(100)
  })

  it('rend la tuile MESURABLE, à 32 jours, quel que soit le jour de la visite', () => {
    for (const now of visitDates()) {
      const result = tile(now)
      expect(result.measurability.measurable).toBe(true)
      // DOUZE depuis #2566.4 : deux lignes de marge au-dessus du plancher
      // (`MEASURABILITY_THRESHOLDS.dso`), apportées par la mission longue.
      // La médiane, elle, ne bouge pas — voir la garde « sait dire NON »
      // ci-dessous pour le comportement AU plancher.
      expect(result.measurability.observed).toBe(MEASURABILITY_THRESHOLDS.dso + 2)
      expect(result.days).toBe(32)
      expect(result.undatable).toBe(1)
      expect(result.disputed).toBe(2)
    }
  })

  it('sait dire NON — sous le PLANCHER de mesurabilité, la tuile se tait', () => {
    // La contrepartie obligatoire : sans elle, un test qui n'affirme que
    // « mesurable » resterait vert sur un jeu qui aurait perdu sa raison d'être.
    // Depuis #2566.4 le jeu porte deux lignes de MARGE au-dessus du plancher
    // (douze délais exploitables pour un seuil à dix) : retirer une seule
    // ligne ne suffit donc plus à faire taire la tuile. On retire assez de
    // lignes pour retomber SOUS le plancher (`dso - 1`), et c'est bien là
    // que la tuile doit se taire.
    const measured = demoInvoiceHistory(Date.now()).filter(
      row => row.disputedAt === null && row.paidAt !== null && Date.parse(row.paidAt) >= Date.parse(row.invoicedAt),
    )
    expect(measured).toHaveLength(MEASURABILITY_THRESHOLDS.dso + 2)
    const belowFloor = computeDso(
      measured
        .slice(0, MEASURABILITY_THRESHOLDS.dso - 1)
        .map(row => ({ invoicedAt: row.invoicedAt.slice(0, 10), paidAt: (row.paidAt ?? '').slice(0, 10) })),
      { disputed: 2 },
    )
    expect(belowFloor.measurability.measurable).toBe(false)
    expect(belowFloor.days).toBeNull()
  })

  it('fait TRAVAILLER l’exclusion des contestées — sinon on ne verrait pas qu’elle existe', () => {
    // Deux factures réglées après négociation, à 96 et 118 jours. Les garder
    // ferait dire 36 jours à la tuile : le prospect voit donc le refus AGIR, et
    // pas seulement une mention en pied de tuile.
    for (const now of visitDates()) {
      expect(tile(now, { keepDisputed: true }).days).toBe(36)
    }
  })

  it('ne date aucune facture ni aucun paiement dans le FUTUR', () => {
    for (const now of visitDates()) {
      for (const row of demoInvoiceHistory(now)) {
        for (const at of [row.invoicedAt, row.paidAt, row.disputedAt, row.disputeResolvedAt]) {
          if (at === null) continue
          expect(Date.parse(at)).toBeLessThanOrEqual(now)
        }
      }
    }
  })

  it('laisse INTACT le mois que « Prêt à facturer » regarde', () => {
    // L'écran s'ouvre sur le mois PRÉCÉDENT. Y poser une facture rendrait
    // « facturé » la ligne prête, la ligne bloquée et le forfait — c'est-à-dire
    // les trois états que ce jeu de données existe pour montrer.
    for (const now of visitDates()) {
      const months = demoInvoiceHistory(now).map(row => row.periodMonth)
      expect(months).not.toContain(monthStart(now, 0))
      expect(months).not.toContain(monthStart(now, 1))
    }
  })

  it('pose chaque facture DANS la fenêtre de la mission qu’elle porte', () => {
    // Un mois facturé hors de la mission serait invisible sur l'écran (la
    // requête borne sur `m.started_on` / `m.ends_on`) — donc indétectable à
    // l'œil, et faux quand même. C'est « un semis doit lire comme l'écran ».
    for (const now of visitDates()) {
      for (const row of demoInvoiceHistory(now)) {
        const mission = DEMO_DELIVERY_CLIENT.missions.find(entry => entry.label === row.missionLabel)
        expect(mission).toBeDefined()
        const startedAt = now - (mission?.started_days_ago ?? 0) * DAY
        const endsAt = mission?.ends_in_days == null ? Number.POSITIVE_INFINITY : now + mission.ends_in_days * DAY
        const periodStart = Date.parse(`${row.periodMonth}T00:00:00.000Z`)
        const periodEnd = new Date(periodStart).setUTCMonth(new Date(periodStart).getUTCMonth() + 1) - 1
        expect(periodEnd).toBeGreaterThanOrEqual(startedAt)
        expect(periodStart).toBeLessThanOrEqual(endsAt)
      }
    }
  })

  it('n’écrit qu’UNE ligne par mission et par mois — l’index unique la refuserait', () => {
    for (const now of visitDates()) {
      const keys = demoInvoiceHistory(now).map(row => `${row.missionLabel}|${row.periodMonth}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('fait voyager le motif AVEC la date de litige, et ne lève jamais un litige non ouvert', () => {
    // `invoice_dispute_reason_check` et `invoice_dispute_resolution_check`
    // (migration 1790170000001) tiennent les deux règles en BASE : un jeu de
    // données qui les oublierait ferait tomber `POST /demo/session`, pas un test.
    for (const now of visitDates()) {
      for (const row of demoInvoiceHistory(now)) {
        expect((row.disputeReason ?? '').length > 0).toBe(row.disputedAt !== null)
        if (row.disputeResolvedAt !== null) expect(row.disputedAt).not.toBeNull()
      }
    }
  })

  it('ouvre le litige APRÈS l’émission et avant le règlement', () => {
    for (const now of visitDates()) {
      for (const row of demoInvoiceHistory(now)) {
        if (row.disputedAt === null) continue
        expect(Date.parse(row.disputedAt)).toBeGreaterThan(Date.parse(row.invoicedAt))
        // Une impayée n'a pas de règlement à borner : les deux lignes contestées
        // du jeu sont réglées, et cette assertion ne vaut que pour elles.
        if (row.paidAt !== null) expect(Date.parse(row.disputedAt)).toBeLessThanOrEqual(Date.parse(row.paidAt))
        if (row.disputeResolvedAt === null) continue
        expect(Date.parse(row.disputeResolvedAt)).toBeGreaterThan(Date.parse(row.disputedAt))
      }
    }
  })

  it('horodate à MIDI UTC — la date lue par `to_char` ne dépend alors d’aucun fuseau', () => {
    // Le SQL du DSO fait `to_char(ir.invoiced_at, 'YYYY-MM-DD')`, qui convertit
    // dans le fuseau de la SESSION. À midi UTC, aucun fuseau réel ne change le
    // jour ; à minuit, la moitié de la planète décale d'un jour — et le délai
    // vaudrait un jour de plus ou de moins selon le serveur.
    for (const row of demoInvoiceHistory(Date.now())) {
      for (const at of [row.invoicedAt, row.paidAt]) {
        // Une facture jamais réglée n'a pas de date de règlement à horodater.
        if (at === null) continue
        expect(at).toMatch(/T12:00:00/)
      }
    }
  })

  it('ne montre AUCUN montant inventé — chacun est le TJM de la mission × des jours', () => {
    const rows = demoInvoiceHistory(Date.now())
    expect(rows).toHaveLength(DEMO_DELIVERY_CLIENT.invoices.length)
    rows.forEach((row, index) => {
      const invoice = DEMO_DELIVERY_CLIENT.invoices[index]
      const mission = DEMO_DELIVERY_CLIENT.missions.find(entry => entry.label === row.missionLabel)
      // Une facture sur une mission sans TJM n'aurait aucun montant : le jeu
      // n'en porte pas, et cette ligne le dit avant que le chiffre d'affaires
      // facturé n'annonce « 1 ligne sans montant » devant un prospect.
      const rate = mission?.daily_rate ?? null
      expect(rate).not.toBeNull()
      expect(row.invoicedAmountCents).toBe((rate ?? 0) * invoice.billed_days * 100)
      // ⚠️ Une facture jamais réglée porte `null` et JAMAIS 0 : « zéro euro
      // encaissé » se lirait comme un règlement à zéro, alors que rien n'est
      // rentré du tout. Les deux ne se corrigent pas de la même façon.
      expect(row.paidAmountCents).toBe(invoice.paid_days === null ? null : (rate ?? 0) * invoice.paid_days * 100)
      expect(row.invoicedAmountCents).toBeGreaterThan(0)
    })
  })

  /**
   * LES DEUX IMPAYÉES — l'écran « Encaissements » a besoin qu'elles existent.
   *
   * Sans elles, le seau « En retard » reste vide pour toujours : les treize
   * lignes d'origine sont toutes réglées, parce qu'elles ont été semées pour la
   * tuile du délai de paiement, qui ne regarde que ce qui est rentré. Un écran
   * de trésorerie qui ne montre aucun retard en démonstration ne montre rien.
   */
  it('porte des factures ÉMISES ET JAMAIS RÉGLÉES, franchement en retard', () => {
    for (const now of visitDates()) {
      const unpaid = demoInvoiceHistory(now).filter(row => row.paidAt === null)
      expect(unpaid).toHaveLength(2)
      for (const row of unpaid) {
        // Rien de rentré ⇒ aucun montant réglé. `null`, jamais 0.
        expect(row.paidAmountCents).toBeNull()
        // Et un montant FACTURÉ, lui, bien réel : c'est ce que le seau totalise.
        expect(row.invoicedAmountCents).toBeGreaterThan(0)
        // Échue depuis longtemps, quel que soit le jour de la visite : c'est ce
        // qui donne à l'écran sa bande de gravité et sa relance due.
        expect(Date.parse(`${row.dueOn}T00:00:00.000Z`)).toBeLessThan(now)
      }
    }
  })

  it('montre les DEUX moitiés du litige — un qui court, un qui a été levé', () => {
    // Lever un litige ne réécrit pas le temps qu'il a fait perdre : la facture
    // levée reste HORS du calcul et reste comptée. Sans une ligne levée, cette
    // moitié de la règle ne se voit nulle part en démonstration.
    const disputed = demoInvoiceHistory(Date.now()).filter(row => row.disputedAt !== null)
    expect(disputed).toHaveLength(2)
    expect(disputed.filter(row => row.disputeResolvedAt === null)).toHaveLength(1)
    expect(disputed.filter(row => row.disputeResolvedAt !== null)).toHaveLength(1)
  })
})

/**
 * #2566.4 — LA MISSION LONGUE AU BON DE COMMANDE EXPIRÉ, EN DÉMONSTRATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER RECOMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `po_period_mismatch` (#2566.2) est déjà testé côté contrat
 * (`invoice-readiness.test.ts`) et côté service/écran (`invoice-readiness.
 * service.spec.ts`, `MissionDetailTabs.test.tsx`) — cette garde-ci ne les
 * rejoue pas. Elle prouve autre chose : que LE SEMIS DE DÉMONSTRATION porte
 * bien les données qui déclenchent ce bloqueur, en rejouant `assessInvoice
 * Readiness` sur les champs RÉELS de `DEMO_DELIVERY_CLIENT`, comme le fait
 * `demo-account-invoice-readiness-coverage.spec.ts`. Sans elle, retirer
 * `po_valid_until_days_ago` du jeu de données ne ferait rougir AUCUN test :
 * l'écran perdrait silencieusement le seul cas de la salle qui démontre ce
 * bloqueur.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * #2419.4 — LE RÈGLEMENT PARTIEL SANS LITIGE EST BIEN SEMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette garde ne rejoue pas la dérivation (`collections.test.ts` et
 * `invoice-readiness.test.ts` la tiennent) : elle prouve que LE SEMIS porte la
 * donnée qui la déclenche. Sans elle, ramener `paid_days` à `billed_days` sur
 * cette ligne ne ferait rougir AUCUN test — et la salle reperdrait
 * silencieusement le seul cas qui montre un reste dû réclamé.
 *
 * ⚠️ Un paiement partiel existait déjà dans le jeu, mais CONTESTÉ : le litige
 * passe avant, et il masquait donc exactement ce qu'on veut montrer. Les deux
 * doivent exister, et la garde exige les deux — une classification de
 * couverture AFFIRME, elle ne vérifie pas.
 */
describe('le règlement partiel de la démonstration (#2419.4)', () => {
  /** Toutes les lignes où un règlement a été constaté SOUS le facturé. */
  const partials = DEMO_DELIVERY_CLIENT.invoices.filter(
    invoice => invoice.paid_days !== null && invoice.paid_days < invoice.billed_days,
  )

  it('sème un règlement partiel SANS litige — celui que rien ne masque', () => {
    const undisputed = partials.filter(invoice => invoice.dispute_opened_days_after_invoice === null)
    expect(undisputed.length).toBeGreaterThan(0)
    // Un encaissement a bien eu lieu : sans date, la ligne serait une simple
    // impayée et ne dirait rien du partiel.
    expect(undisputed.every(invoice => invoice.payment_delay_days !== null)).toBe(true)
  })

  it('garde aussi le partiel CONTESTÉ — le client règle ce qu’il ne conteste pas', () => {
    expect(partials.some(invoice => invoice.dispute_opened_days_after_invoice !== null)).toBe(true)
  })

  it('le semis rend deux MONTANTS distincts, et un reste dû strictement positif', () => {
    const rows = demoInvoiceHistory(Date.UTC(2026, 8, 20, 12)).filter(
      row => row.paidAt !== null && row.disputedAt === null && row.paidAmountCents !== null,
    )
    const partial = rows.filter(
      row => row.invoicedAmountCents !== null && (row.paidAmountCents ?? 0) < row.invoicedAmountCents,
    )
    expect(partial.length).toBeGreaterThan(0)
    for (const row of partial) {
      expect(row.invoicedAmountCents! - row.paidAmountCents!).toBeGreaterThan(0)
    }
  })
})

describe('la mission longue au bon de commande expiré, en démo (#2566.4)', () => {
  const LABEL = 'Supervision de la chaîne de production — mission longue'
  const mission = DEMO_DELIVERY_CLIENT.missions.find(entry => entry.label === LABEL)

  /** Le premier jour du mois PRÉCÉDENT celui de `now` — le mois que l'écran
   *  « Prêt à facturer » ouvre par défaut, même dérivation que le §D42
   *  ci-dessus (`monthStart(now, 1)`). */
  function previousMonthStart(now: number): string {
    const at = new Date(now)
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
  }

  /** Rejoue `assessInvoiceReadiness` sur les champs réels de la mission, comme
   *  le fait le serveur — jamais recopié, la fonction du contrat. `poValidUntil`
   *  est le seul paramètre : c'est lui que la garde « sait dire NON » retire. */
  function assess(now: number, poValidUntil: string | null) {
    return assessInvoiceReadiness({
      timesheet: mission!.timesheet
        ? {
            status: mission!.timesheet.status,
            days: mission!.timesheet.days,
            anomalies: [],
            gap: mission!.timesheet.days - mission!.timesheet.expected_days,
            gapExplanation: mission!.timesheet.gap_explanation,
          }
        : null,
      dailyRateCents: mission!.daily_rate === null ? null : Math.round(mission!.daily_rate * 100),
      requiresPo: mission!.requires_po,
      poNumber: mission!.po_number,
      invoicedAt: null,
      billingContactId: mission!.billing_contact,
      chargedCostCents: mission!.loaded_daily_cost_cents,
      expectsTimesheet: invoicingNeedsTimesheet(mission!.contract_kind),
      billingCadence: mission!.billing_cadence as 'monthly' | 'milestone' | 'fixed_price',
      periodMonth: previousMonthStart(now),
      poValidUntil,
    })
  }

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(mission).toBeDefined()
    expect(mission?.po_valid_until_days_ago).not.toBeNull()
  })

  it('bloque sur `po_period_mismatch`, SEUL bloqueur, sur le mois que l’écran ouvre par défaut', () => {
    const now = Date.now()
    const expiredOn = new Date(now - (mission!.po_valid_until_days_ago as number) * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const result = assess(now, expiredOn)
    expect(result.state).toBe('blocked')
    expect(result.blockers).toEqual(['po_period_mismatch'])
  })

  it('sait dire NON — retirer l’échéance du bon de commande fait DISPARAÎTRE le blocage démontré', () => {
    // La contrepartie obligatoire : sans elle, l’assertion positive ci-dessus
    // pourrait dire « bloqué » pour une tout autre raison (relevé, contact…) et
    // le test resterait vert même si le champ que ce lot sème disparaissait.
    const result = assess(Date.now(), null)
    expect(result.state).toBe('ready')
    expect(result.blockers).toEqual([])
  })

  it('porte DEUX mois déjà facturés et réglés — le reste du critère #2566.4', () => {
    const invoiced = demoInvoiceHistory(Date.now()).filter(row => row.missionLabel === LABEL)
    expect(invoiced).toHaveLength(2)
    for (const row of invoiced) {
      expect(row.paidAt).not.toBeNull()
      expect(row.paidAmountCents ?? 0).toBeGreaterThan(0)
      expect(row.disputedAt).toBeNull()
    }
  })
})

/**
 * LES INTERLOCUTEURS DU CLIENT D'EXEMPLE, ET CE QU'ILS ONT SIGNÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le compte du client d'exemple ne portait AUCUN contact — `DemoSeedService`
 * n'en crée que pour les cinq dossiers réels — et aucune de ses sept missions ne
 * nommait de contact de facturation. Deux écrans livrés s'ouvraient donc vides
 * ou faux devant un prospect :
 *
 *  - l'agrégat « missions signées par contact » n'avait pas une seule ligne à
 *    rendre, donc pas un seul badge « a signé N missions » — c'est-à-dire que la
 *    distinction entre un ACHETEUR et un prospect ne se voyait nulle part ;
 *  - `assessInvoiceReadiness` pousse `missing_billing_contact` dès que
 *    `billingContactId` vaut `null` (`invoice-readiness.ts:301`). Les SEPT
 *    missions de la salle portaient donc ce bloqueur, y compris les deux que le
 *    jeu de données décrit comme « prêtes à facturer ». L'écran « Prêt à
 *    facturer » n'avait aucune ligne prête à montrer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CES DEUX PERSONNES SONT INVENTÉES, ET DOIVENT LE RESTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Les contacts des cinq autres comptes sont des personnes RÉELLES publiées au
 * registre du commerce, sans la moindre coordonnée. Ici c'est l'inverse : SNCF
 * LOGISTIQUE n'existe pas, ses interlocuteurs non plus, et c'est PARCE QUE la
 * société est fictive qu'on peut leur donner une adresse et un numéro — la
 * mécanique se montre sans rien affirmer de personne. La contrepartie est tenue
 * plus bas : domaine `.example` (RFC 2606), plage de fiction ARCEP, et aucun nom
 * emprunté à un autre contact du jeu.
 */
describe('le client d’exemple — ses interlocuteurs et les missions qu’ils ont signées', () => {
  // Décision Louis 04/10/2026 — le client de livraison (SNCF) ne crée AUCUN
  // interlocuteur : les signataires sont des SIÈGES (sans nom) déjà semés par
  // son dossier. Aucune personne réelle ne porte de déclaration.
  const carrier = DEMO_DOSSIERS.find(
    dossier => dossier.account.company_name === DEMO_DELIVERY_CLIENT.account.company_name,
  )
  const byName = new Map((carrier?.contacts ?? []).map(contact => [contact.full_name, contact]))
  const signerNames = [
    ...new Set(
      DEMO_DELIVERY_CLIENT.missions
        .map(mission => mission.billing_contact)
        .filter((name): name is string => name !== null),
    ),
  ]
  const contacts = signerNames.map(name => byName.get(name)).filter(contact => contact !== undefined)

  it('lit un corpus NON VIDE — deux sièges signataires, et des missions en face', () => {
    // Lot D01 (06/10/2026) : les seuls interlocuteurs créés sont SIMULÉS (`.example`, aucune URL de profil).
    for (const contact of DEMO_DELIVERY_CLIENT.contacts) {
      expect(contact.email ?? '').toMatch(/@sncf-groupe\.example$/)
      expect(contact.linkedin_url ?? null).toBeNull()
    }
    expect(contacts.length).toBe(2)
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThanOrEqual(5)
  })

  it('porte les deux rôles qui SIGNENT — celui qui décide et celui qui achète', () => {
    expect(contacts.map(contact => contact?.decision_role).sort()).toEqual(['procurement', 'technical'])
  })

  it('les signataires sont des SIÈGES du dossier, sans coordonnée — aucune personne créée ni déclarée', () => {
    for (const contact of contacts) {
      // `roleSeat` : décision Louis 01/11/2026 — le siège porte un NOM FICTIF, jamais l'intitulé du poste.
      expect(contact?.full_name).not.toBe(contact?.title)
      expect(contact?.full_name).toBe(seatNameOrNull(contact?.title ?? ''))
      expect(contact?.email ?? null).toBeNull()
      expect(contact?.phone ?? null).toBeNull()
      expect(contact?.photo_url ?? null).toBeNull()
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Ce que les missions nomment                                            */
  /* ---------------------------------------------------------------------- */

  it('nomme un contact de facturation sur au moins DEUX missions, et jamais un inconnu', () => {
    const signed = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.billing_contact !== null)
    expect(signed.length).toBeGreaterThanOrEqual(2)
    for (const mission of signed) {
      // Un nom qui ne résout pas écrirait `null` en base : la mission
      // ressemblerait à une mission sans contact, et personne ne saurait que le
      // jeu de données en promettait un.
      expect(byName.has(mission.billing_contact ?? '')).toBe(true)
    }
  })

  it('laisse au moins une mission SANS contact — le bloqueur doit rester visible', () => {
    // La contrepartie, et c'est elle qui fait la démonstration : si les sept
    // missions portaient un contact, le bloqueur « contact de facturation
    // inconnu » disparaîtrait de la salle, et un prospect ne verrait jamais
    // l'écran qui le lui demande.
    const unsigned = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.billing_contact === null)
    expect(unsigned.length).toBeGreaterThanOrEqual(1)
  })

  it('rend l’agrégat « missions signées par contact » à PLUS D’UNE ligne, et à des comptes DIFFÉRENTS', () => {
    // La maille de l'agrégat : une ligne par contact, le nombre de missions
    // qu'il a signées. Une seule ligne montrerait un badge, jamais la
    // comparaison entre deux interlocuteurs — qui est ce que l'écran sert à
    // faire. Et deux comptes égaux ne diraient pas que le compteur compte.
    const perContact = new Map<string, number>()
    for (const mission of DEMO_DELIVERY_CLIENT.missions) {
      if (!mission.billing_contact) continue
      perContact.set(mission.billing_contact, (perContact.get(mission.billing_contact) ?? 0) + 1)
    }
    expect(perContact.size).toBeGreaterThanOrEqual(2)
    expect([...perContact.values()].some(count => count > 1)).toBe(true)
  })

  it('donne un contact aux DEUX missions que le jeu annonce « prêtes à facturer »', () => {
    // `assessInvoiceReadiness` bloque sur `billingContactId === null`. Les deux
    // missions à relevé VALIDÉ sont les seules que la salle peut montrer prêtes :
    // sans contact, elles portaient toutes les deux un bloqueur, et l'écran
    // « Prêt à facturer » de la démonstration n'avait rien de prêt à montrer.
    const ready = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.status === 'active' && mission.contract_kind === 'regie' && mission.timesheet?.status === 'validated',
    )
    expect(ready.length).toBeGreaterThanOrEqual(2)
    for (const mission of ready) expect(mission.billing_contact).not.toBeNull()
  })

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  L'IDENTITÉ LÉGALE DE LA SALLE (31/08/2026)                               */
  /*                                                                            */
  /*  La carte du portefeuille affiche le SIREN, le SIRET et une pastille       */
  /*  « vérifié ». Trois choses peuvent mal tourner, et deux d'entre elles      */
  /*  passeraient inaperçues jusqu'en réunion.                                  */
  /* ────────────────────────────────────────────────────────────────────────── */

  it('aucun SIREN affirmé sur les entités du porteur — le brief n’en publie pas', () => {
    // Décision Louis 04/10/2026 : les entités sont de vraies entités du brief ;
    // un SIREN non sourcé y serait une donnée inventée.
    expect(DEMO_DELIVERY_CLIENT.entities.length).toBeGreaterThan(0)
    for (const entity of DEMO_DELIVERY_CLIENT.entities) expect(entity.siren).toBeNull()
  })

  it('le SIRET commence par le SIREN, et il est ÉCRIT — jamais calculé', () => {
    for (const entity of DEMO_DELIVERY_CLIENT.entities) {
      if (!entity.siret) continue
      expect(entity.siret).toMatch(/^[0-9]{14}$/)
      // Un SIRET dont les neuf premiers chiffres ne sont pas ceux du SIREN
      // désignerait un établissement d'une AUTRE société — et le service le
      // refuserait au semis, en silence, en laissant la carte sans SIRET.
      expect(entity.siret.startsWith(entity.siren ?? '')).toBe(true)
    }
  })

  it('la preuve d’identité porte SES DEUX MOITIÉS, et jamais un registre public', () => {
    for (const entity of DEMO_DELIVERY_CLIENT.entities) {
      if (!entity.identity) continue
      expect(entity.identity.checkedDaysAgo).toBeGreaterThan(0)
      // ⚠️ Aucun registre public ne porte une société qui n'existe pas :
      // `public_registry` sur ce jeu serait une provenance FABRIQUÉE, ce que la
      // primitive `Provenance` existe précisément pour empêcher.
      expect(entity.identity.source).toBe('human_declared')
    }
  })

  it('une entité au moins n’a AUCUNE identité — la pastille doit savoir se taire', () => {
    // Sans elle, la démonstration ferait croire que tout compte porte un badge,
    // et personne ne verrait l'autre moitié de la règle.
    expect(DEMO_DELIVERY_CLIENT.entities.some(entity => entity.identity === null)).toBe(true)
  })
})

// #2986 → #3710.2 — le panneau « Repositionner le consultant » qui nommait une contrainte déclarée vivait sur
// /missions/renouvellements, SUPPRIMÉ (#3656) : on ne certifie plus qu'une ligne de cet écran la montre. Reste le fait
// lui-même, qui est une donnée de la FICHE consultant (champ « Restrictions de mobilité », éditable) : la salle en
// porte une, sur un affecté d'une mission qui finit dans la fenêtre d'action.
describe('démo — #2986 une restriction de mobilité déclarée sur un affecté', () => {
  it('un affecté d’une mission qui finit dans la fenêtre d’action porte une restriction de mobilité nommée', () => {
    const ACTIONABLE_DAYS = 60
    const withRestriction = new Set(
      DEMO_CONSULTANTS.filter(c => (c.mobility_restrictions ?? '').trim() !== '').map(c => c.full_name),
    )
    const inWindow = DEMO_DELIVERY_CLIENT.missions.filter(
      m => typeof m.ends_in_days === 'number' && m.ends_in_days >= 0 && m.ends_in_days <= ACTIONABLE_DAYS,
    )
    expect(inWindow.some(m => m.consultant && withRestriction.has(m.consultant))).toBe(true)
  })
})
