# Comptes de démonstration réels — état, faits collectés, et ce qui manque

> **Décision Louis, 10/08/2026** : les trois dossiers inventés (Groupe Helios,
> NovaSanté, Altiver) laissent la place à **cinq sociétés réelles** — Société
> Générale, leboncoin, Thales, RATP, BlaBlaCar — avec « des données réelles pour
> tout ».

Ce document dit où en est ce chantier : ce qui est collecté et vérifiable, ce que
les sources publiques ne donnent PAS, et le seul chemin honnête pour combler
l'écart.

---

## 1. Ce qui est fait

`scripts/collect-demo-facts.mjs` collecte, sans aucune clé, depuis les MÊMES
sources que le pipeline :

- **l'annuaire des entreprises** (open data INSEE/RNE) — dénomination, SIREN,
  NAF, forme juridique, siège, tranche d'effectif, chiffre d'affaires et
  résultat du dernier exercice déposé, dirigeants (nom + fonction) ;
- **le BODACC** (annonces légales DILA) — les mouvements datés : augmentations
  de capital, changements d'administration, dépôts de comptes.

Le script écarte délibérément deux choses que l'annuaire rend pourtant : les
**dates de naissance et nationalités** des dirigeants (un organigramme a besoin
d'un nom et d'une fonction ; le reste est de la donnée personnelle sans usage sur
un lien PUBLIC) et toute tentative de **coordonnées** (elles ne sont dans aucune
de ces sources — les inventer sur des personnes nommées serait exactement la
faute que le produit s'interdit partout ailleurs).

### Ce que la collecte rend (10/08/2026)

| Société          | Entité au registre                                 | Effectif (registre) | CA dernier exercice | Dirigeants au registre | Annonces BODACC |
| ---------------- | -------------------------------------------------- | ------------------- | ------------------- | ---------------------- | --------------- |
| Société Générale | SOCIETE GENERALE (SG), 552120222                   | 10 000 et plus      | 26,8 Md€ (2024)     | 16                     | 141             |
| leboncoin        | LBC FRANCE, 521724336                              | 500 à 999           | 831 M€ (2024)       | **0**                  | 29              |
| Thales           | THALES, 552059024                                  | **1 000 à 1 999**   | 20,6 Md€ (2024)     | 16                     | 98              |
| RATP             | RÉGIE AUTONOME DES TRANSPORTS PARISIENS, 775663438 | 10 000 et plus      | **non publié**      | 33                     | 65              |
| BlaBlaCar        | COMUTO, 491904546                                  | 250 à 499           | **non publié**      | 6                      | 85              |

---

## 2. Ce que ce tableau révèle — et qu'il faut regarder en face

La collecte marche. C'est le RÉSULTAT qui pose problème, et il vaut mieux le
savoir maintenant que devant un prospect.

**leboncoin n'a aucun dirigeant au registre.** Zéro. Avec des données strictement
réelles, l'onglet Organigramme de ce dossier serait vide — or c'est l'écran qui
fait l'effet en démonstration.

**Thales affiche « 1 000 à 1 999 salariés ».** C'est vrai : le registre décrit la
société holding, pas le groupe (~80 000 personnes). Un prospect qui connaît
Thales lira une erreur, et il aura tort — mais il en conclura que le produit se
trompe, ce qui revient au même.

**RATP donne 33 dirigeants presque tous « Autre ».** Ce sont des administrateurs
et des représentants du personnel, pas une chaîne de décision. Aucun DSI, aucun
directeur des achats : rien de ce qu'un commercial cherche. Et son chiffre
d'affaires n'est pas publié (EPIC).

**BlaBlaCar (COMUTO) ne publie pas non plus son chiffre d'affaires.**

Autrement dit : les sources publiques gratuites donnent une **identité** solide et
un **historique légal** daté, mais elles ne donnent ni les défis IT, ni les
signaux d'achat, ni l'organigramme opérationnel (DSI, CTO, RSSI, directeur des
achats). Ce sont précisément les trois choses qui font la valeur d'un dossier —
et elles ne s'inventent pas.

---

## 2 bis. Les cinq analyses RÉELLES ont été lancées (10/08/2026)

Stack locale complète, profil ESN réaliste, fournisseurs réels (Apollo,
Firecrawl, Pappers, Brave, Claude). Résultat brut : **quatre dossiers terminés,
un impossible**.

| Société          | Résultat             | Contacts | Signaux | Défis IT | Angles |
| ---------------- | -------------------- | -------- | ------- | -------- | ------ |
| Société Générale | terminé              | 440      | 6       | 5        | 3      |
| Thales           | terminé              | 1 588    | 6       | 5        | 3      |
| leboncoin        | terminé              | 215      | 6       | **0**    | **0**  |
| BlaBlaCar        | terminé              | 157      | 6       | **0**    | **0**  |
| RATP             | **échec, deux fois** | 1 079    | 6       | 5        | —      |

**Les signaux sont excellents** — et c'est ce qu'aucune source publique gratuite
ne donnait : Thales recrutant 3 300 personnes en France en 2026 et rachetant
Exail pour 4 Md€ ; leboncoin lançant son application dans ChatGPT ; BlaBlaCar
entrant dans 20 pays et cédant BlaBlaCar Daily à Karos.

**Cinq défauts produit sont sortis de ces runs.** Trois sont corrigés, deux
demandent un arbitrage.

_Corrigés (PR #904)_ — la dérive de FORME du modèle tuait des dossiers complets
(`technologyStack` en chaîne JSON, `rdvScript.exploration` en liste, l'enveloppe
`data` sérialisée : trois runs perdus sur cinq) ; et un doublon de nom faisait
perdre le dossier à l'enregistrement, parce que le repli ligne par ligne tournait
dans une transaction déjà avortée.

_À arbitrer_ :

1. **Les contacts les mieux classés sont inutilisables.** Sur Société Générale,
   **12 des 12 premiers n'ont qu'un prénom** (« Willy — Chief Information
   Officer ») : l'offre de recherche Apollo masque le nom de famille, et le tri
   par score ne le voit pas. On ne contacte pas « Willy ».
2. **Deux dossiers sur quatre n'ont AUCUNE recommandation** — zéro angle, zéro
   axe écarté, zéro défi. Les phases ont tourné et écrit des tableaux vides ;
   rien à l'écran ne le signale. Les deux cas sont des plateformes tech, les deux
   groupes traditionnels rendent 3/4/5 chacun.

**RATP ne peut PAS aboutir, et c'est structurel.** La phase `classify` dépasse
son budget de 200 s — non parce qu'elle se bloque, mais parce que sa charge est
proportionnelle au nombre de contacts (1 079 contre ~150 pour un compte normal).
Or les cinq budgets de phase somment à **1 080 s pour 1 080 s disponibles** :
marge nulle. Aucun budget ne peut donc grandir sans qu'un autre rétrécisse, et le
message rendu à l'utilisateur — « L'analyse a dépassé le temps imparti.
Relancez-la. » — invite à une boucle qui ne peut pas aboutir.

Ce n'est pas un réglage à pousser : c'est une décision produit. Soit `classify`
borne son propre travail (précédent existant : `CONTACTS_ENRICH_MAX = 50`), soit
les très gros comptes publics restent hors d'atteinte — or ce sont exactement les
prospects d'une ESN (SNCF, La Poste, EDF…).

## 3. Le seul chemin honnête pour la suite

**Faire tourner le pipeline RÉEL une fois sur chacune des cinq sociétés, puis
capturer sa sortie dans le jeu de démonstration.**

C'est la seule option qui produit des dossiers à la fois réels et riches, parce
que c'est exactement ce qu'un client obtient : le scrape du site, la presse, les
offres d'emploi, les marchés publics, l'enrichissement des contacts et le
raisonnement du modèle. Écrire ces dossiers à la main produirait des phrases
plausibles et invérifiables sur des entreprises identifiables — le contraire de
ce que « données réelles » veut dire.

Ce que ça demande, et qui n'est pas de mon ressort :

1. cinq analyses réelles (clés fournisseurs + crédits) sur un espace de travail
   dédié — les vraies, pas des rejeux ;
2. une relecture de chaque dossier avant publication : ce qui sort du modèle est
   une lecture, et elle part sur un lien PUBLIC au nom d'entreprises réelles ;
3. la conversion de la sortie en jeu de démonstration (mécanique, une fois les
   runs faits).

**Trois points à trancher avant de lancer les runs :**

- **Thales** : afficher l'entité au registre (1 000-1 999 salariés, ce qui se
  lira comme une erreur) ou le périmètre du GROUPE, qui suppose d'assembler
  plusieurs entités ? Le pipeline sait le faire — encore faut-il décider ce que
  la fiche annonce.
- **leboncoin** : sans aucun dirigeant au registre, son organigramme dépendra
  entièrement de l'enrichissement fournisseur. S'il ne rend rien, la vue reste
  vide. Garder la société, ou la remplacer par une cinquième au périmètre plus
  lisible ?
- **RATP** : un EPIC sans chiffre d'affaires publié et sans comité de direction
  au registre. C'est un excellent compte pour une ESN (gros acheteur public,
  marchés visibles au BOAMP), mais sa fiche sera structurellement différente des
  autres.

---

## 4. Ce qui reste en place d'ici là

Les trois dossiers inventés **restent en production**. Un jeu de démonstration à
moitié migré — deux dossiers réels, un inventé, deux vides — serait pire que
l'état actuel : le prospect ne verrait pas une transition, il verrait un produit
incohérent.

La bascule se fait d'un coup, une fois les cinq runs disponibles et relus.

---

## 5. Rafraîchir les faits

```bash
node scripts/collect-demo-facts.mjs > /tmp/demo-facts.json
```

Aucune clé requise. À relancer avant toute mise à jour des dossiers : un effectif
ou un dirigeant périmé sur une société réelle est une erreur visible par
n'importe qui, et la fraîcheur affichée doit être celle de la collecte, jamais
celle du déploiement.
