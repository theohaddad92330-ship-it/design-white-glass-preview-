import { describe, expect, it } from 'vitest'
import {
  CAPACITES,
  estUnEcranProprietaire,
  etatDeLaConnexion,
  lireListeDacces,
  normaliserEmail,
  peut,
  type Capability,
} from './roles'

/**
 * La matrice de #1669, et la lecture de `DM_ALLOWED_EMAILS` de #1668.
 *
 * Ce fichier tient la MATRICE, pas son câblage : que la route de suppression
 * demande bien `users.delete` est l'affaire de
 * `architecture/toute-route-declare-sa-capacite.test.ts`.
 */

describe('la matrice des rôles (#1669)', () => {
  it('LIT quelque chose — la table des capacités n’est pas vide', () => {
    // Contrôle positif : sans lui, une table vidée rendrait chaque `peut()`
    // ci-dessous faux pour la même raison, et la garde resterait verte.
    expect(Object.keys(CAPACITES).length).toBeGreaterThan(15)
  })

  it('rend la matrice de l’issue, ligne par ligne', () => {
    const lignes: Array<[Capability, boolean, boolean, boolean]> = [
      // capacité              owner  operator viewer
      ['impersonate', true, true, false],
      ['credits.grant', true, true, false],
      ['users.suspend', true, true, false],
      ['users.delete', true, false, false],
      ['offers.write', true, false, false],
      ['invoices.write', true, false, false],
      ['treasury.read', true, false, false],
      ['treasury.write', true, false, false],
      ['audit.read', true, true, false],
    ]
    for (const [capacite, o, op, v] of lignes) {
      expect(peut('owner', capacite), `owner / ${capacite}`).toBe(o)
      expect(peut('operator', capacite), `operator / ${capacite}`).toBe(op)
      expect(peut('viewer', capacite), `viewer / ${capacite}`).toBe(v)
    }
  })

  it('un viewer ne fait AUCUNE action — sauf lire un signalement, un jugement de vérité terrain, lire les prospects, ou signaler un défaut de la console', () => {
    const actions = (Object.keys(CAPACITES) as Capability[]).filter(capacite => peut('viewer', capacite))
    // « lecture seule, aucune action ». Les quatre exceptions sont NOMMÉES :
    // lire un signalement, lire le jeu de vérité terrain (#1622 — voir un
    // jugement ou une métrique n'expose aucune donnée client), lire les
    // prospects de la démo (#2706 — même plancher que 'feedback.read'), et
    // écrire un défaut sur la console elle-même — aucune des quatre ne
    // touche un client.
    expect(actions.sort()).toEqual(['feedback.read', 'ground_truth.read', 'issue.report', 'leads.read'])
  })

  it('les SIX URL fermées au propriétaire le sont', () => {
    // /couts, /offres et /usage redirigent vers /facturation?view=… : la porte
    // est posée sur les quatre pour que le refus précède le rebond.
    // /revenus/tresorerie s'y ajoute le 07/09 (#1649) : c'est le solde bancaire.
    // /revenus entier s'y ajoute le 07/09 (#1651) : c'est le chiffre d'affaires.
    for (const chemin of ['/facturation', '/couts', '/offres', '/usage', '/revenus', '/revenus/tresorerie']) {
      expect(estUnEcranProprietaire(chemin), chemin).toBe(true)
    }
    expect(estUnEcranProprietaire('/facturation/quelque-chose')).toBe(true)
  })

  it('⚠️ `/revenus/clients` reste OUVERT alors que `/revenus` est fermé', () => {
    // LE PIÈGE QUE CE TEST TIENT : `estUnEcranProprietaire` compare par PRÉFIXE.
    // Fermer `/revenus` fermait donc aussi `/revenus/clients` — l'écran de
    // support quotidien (#1652), celui qui remplace `/clients` dans le rail, et
    // que l'opérateur ouvre dix fois par jour. Une régression d'accès arrivée
    // par effet de bord, pas par décision : c'est exactement ce qu'aucun test ne
    // voit si personne ne l'écrit.
    expect(estUnEcranProprietaire('/revenus')).toBe(true)
    expect(estUnEcranProprietaire('/revenus/tresorerie')).toBe(true)
    expect(estUnEcranProprietaire('/revenus/clients')).toBe(false)
    // L'exception ne s'arrête pas au chemin nu : un détail sous l'écran ouvert
    // reste ouvert, sinon le refus arriverait au premier clic sur une ligne.
    expect(estUnEcranProprietaire('/revenus/clients/42')).toBe(false)
  })

  it('l’exception est ÉTROITE — un voisin de `/revenus/clients` reste fermé', () => {
    // La deuxième preuve : l'exception ne doit pas ouvrir ce qu'elle ne vise
    // pas. Un écran futur sous `/revenus` naît FERMÉ, et l'ouvrir est un geste
    // écrit — l'inverse d'une comparaison exacte, qui les ouvrirait tous.
    expect(estUnEcranProprietaire('/revenus/clients-vip')).toBe(true)
    expect(estUnEcranProprietaire('/revenus/cohortes')).toBe(true)
  })

  it('/supervision est RÉSERVÉ AU PROPRIÉTAIRE, page et sous-routes (30/09, Louis)', () => {
    // La charge de l'infra et la base de production ne sont pas pour l'opérateur.
    for (const chemin of ['/supervision', '/supervision/supabase', '/supervision/runners/x']) {
      expect(estUnEcranProprietaire(chemin), chemin).toBe(true)
    }
    // Le préfixe est un segment, pas une sous-chaîne.
    expect(estUnEcranProprietaire('/supervisions-voisines')).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — le reste de la console reste ouvert', () => {
    for (const chemin of ['/clients', '/monitoring', '/health', '/queues', '/facturations-voisines', '/']) {
      expect(estUnEcranProprietaire(chemin), chemin).toBe(false)
    }
  })
})

describe('la liste d’accès (#1668)', () => {
  it('ABSENTE ≠ VIDE — c’est ce qui rend la couche inerte sans risque', () => {
    // Variable jamais posée : la couche n'existe pas, chemin d'avant.
    expect(lireListeDacces(undefined)).toEqual({ etat: 'absente' })
    // Posée mais ne donnant aucune adresse : 503 (T4). Une configuration
    // écrite qui ne dit rien est une erreur, pas un mode.
    expect(lireListeDacces('')).toEqual({ etat: 'vide' })
    expect(lireListeDacces(' , , ')).toEqual({ etat: 'vide' })
    expect(lireListeDacces('pas-une-adresse')).toEqual({ etat: 'vide' })
  })

  it('lit le rôle après les deux points, et normalise l’adresse', () => {
    const liste = lireListeDacces(' Theo@Bellum-IT.com:owner , louis@bellum-it.com:operator ,stag@x.fr:viewer')
    expect(liste.etat).toBe('active')
    if (liste.etat !== 'active') return
    expect(liste.roles.get('theo@bellum-it.com')).toBe('owner')
    expect(liste.roles.get('louis@bellum-it.com')).toBe('operator')
    expect(liste.roles.get('stag@x.fr')).toBe('viewer')
  })

  it('une entrée sans rôle vaut operator, un rôle illisible aussi', () => {
    // Décision de Louis du 07/09/2026 : ni verrouillé dehors (ce que `viewer`
    // ferait d'une faute de frappe), ni en droit de supprimer un compte.
    const liste = lireListeDacces('a@x.fr,b@x.fr:,c@x.fr:admin,d@x.fr:OWNER')
    if (liste.etat !== 'active') throw new Error('liste inattendue')
    expect(liste.roles.get('a@x.fr')).toBe('operator')
    expect(liste.roles.get('b@x.fr')).toBe('operator')
    expect(liste.roles.get('c@x.fr')).toBe('operator')
    // La casse ne fait pas perdre un rôle écrit correctement.
    expect(liste.roles.get('d@x.fr')).toBe('owner')
  })

  it('normalise comme la connexion comparera', () => {
    expect(normaliserEmail('  Louis@Bellum-IT.COM ')).toBe('louis@bellum-it.com')
  })
})

describe('ce que l’écran de connexion raconte (trouvé en recette live, 07/09/2026)', () => {
  it('éteinte ≠ mal configurée — l’interrupteur se lit AVANT ce qui manque', () => {
    // Le défaut mesuré en production : `/login` montrait son formulaire et une
    // alerte rouge « SUPABASE_URL manque » sur un environnement où la couche
    // est éteinte à dessein. Une console qui crie au loup sur son écran
    // d'entrée est ce qui fait ignorer la vraie alerte.
    expect(etatDeLaConnexion('absente', ['SUPABASE_URL', 'SUPABASE_ANON_KEY'])).toBe('eteinte')
    expect(etatDeLaConnexion('absente', [])).toBe('eteinte')
  })

  it('sait dire NON — liste posée et vérification impossible', () => {
    expect(etatDeLaConnexion('active', ['SUPABASE_URL'])).toBe('mal_configuree')
    expect(etatDeLaConnexion('vide', ['SUPABASE_URL'])).toBe('mal_configuree')
  })

  it('prête quand tout est là', () => {
    expect(etatDeLaConnexion('active', [])).toBe('prete')
  })
})
