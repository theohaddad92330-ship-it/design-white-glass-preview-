# Les huit arbitrages de Louis — 10/09/2026 au soir

> Posés en un seul lot, répondus en deux vagues de quatre. **Ne pas les reposer.**
> Chacun porte ce qui a été mesuré AVANT de poser la question — c'est ce qui
> rend la réponse réutilisable dans six semaines.

## 1. `market_company_alias` → **générateur déterministe à l'ingestion**

**Ce qui était mesuré** : la table est LUE à quatre endroits de production
(`market-memory.service.ts:255,508,671,963`) et contient **0 ligne**. Aucun code
n'y écrit. C'est une « colonne lue jamais écrite » d'un cran au-dessus : une
TABLE sans écrivain. Conséquence visible : « SG SOCIETE GENERALE » ne trouve pas
ses 267 parcours (#1756). La migration elle-même l'écrit : « QUI remplit cette
table est une décision produit EN ATTENTE ».

**Tranché** : un générateur déterministe, sans IA, à l'ingestion — formes
juridiques (SA/SAS/SARL), sigles, ponctuation, préfixes de groupe. Rejouable,
mesurable, réversible. Chaque alias porte sa **force** (fort / faible), comme le
rapprochement par domaine le fait déjà.

**Ce qu'il faudra surveiller** : les sigles courts sont le risque de faux
rapprochement. Le seuil se mesure avant d'écrire, pas après.

## 2. #1606.3 axe RELATION par hash → **autorisé, borné au contact déjà possédé**

**Ce qui était mesuré** : le code a REFUSÉ cette forme et l'écrit en commentaire
(`discover_scoring.py:1010-1017`) — « publierait le carnet d'adresses d'un
collègue ». L'objection vaut pour une lecture large ; elle ne vaut pas pour la
forme que l'issue spécifie.

**Tranché** : le contact du workspace → hash de son URL LinkedIn → lookup dans la
mémoire partagée → « Claire Meunier, ton contact, possède un lien historique avec
ce compte. » **Aucun nom nouveau ne sort de la mémoire partagée** : le nom vient
du CRM du workspace, le hash ne fait que confirmer un lien.

⚠️ **La relecture juridique RGPD reste due** — c'est une donnée de parcours d'une
personne physique, même sujet que `c64_analytique_produit`. Le cadre est
technique, pas juridique.

## 3. #1799 rattrapage des faux noms en base → **`--apply` directement**

Le script `apps/api/src/modules/partner-pipeline/scripts/backfill-esn-partner-names.ts`
existe, est idempotent, et n'a jamais été exécuté. Écriture en masse sur des
données de production. **Louis a tranché : `--apply` sans passage à blanc
préalable.**

La commande, avec les identifiants injectés par Railway et jamais imprimés :

```sh
railway run --service belllum-backend-service --environment production -- \
  env NODE_ENV=production npx ts-node \
  src/modules/partner-pipeline/scripts/backfill-esn-partner-names.ts --apply
```

Contrôle en lecture seule **avant et après**, et les deux comptes dans le rapport.

## 4. Le gros bloc mémoire marché → **les 23 ABSENTS, écran par écran**

Inventaire des 3 éclaireurs du 09/09 : **112 points — 54 livrés · 19 partiels ·
8 non prouvés · 23 absents · 3 périmés**, sur 27 issues ouvertes.

**Tranché** : on livre du visible, écran par écran, dans l'ordre
Partenaires → Accès → Vue d'ensemble → Plan → Preuves.

⚠️ **Le risque assumé, à tenir à l'œil** : plusieurs des 23 absents s'appuient sur
des partiels non câblés. Chaque écran commence donc par vérifier ce qui existe
déjà et **cherche l'APPELANT, pas la fonction** — sinon on recode par-dessus.
Deux cas déjà connus : `evidence.diverging` existe en FR et EN et **aucun code ne
l'appelle** (#1624.4 exige la divergence, seule la convergence est livrée) ;
`raw_analysis.addressability` **EST** écrit depuis #1579 (`phase1_research.py:1535`),
seuls les axes PATH manquent — le constat bloquant de #1606 était FAUX.

## 5. #1822 Laura et les réglages → **écriture sur un sous-ensemble nommé, renvoi pour le reste**

15 écrans de réglages, 1 seul couvert aujourd'hui.

**Laura ÉCRIT** ce qui est réversible et sans conséquence externe : routines,
préférences d'affichage, ton, langue. Chaque écriture passe par la porte « geste
d'utilisateur = auto-approuvé » (le clic EST la décision).

**Laura RENVOIE** pour tout le reste : facturation, intégrations OAuth, membres,
offre — les trois arrêts obligatoires du dépôt.

## 6. #1794 + #1787 onboarding → **visite guidée scriptée, zéro appel modèle**

Une séquence écrite à la main : surbrillance de l'onglet, une phrase, étape
suivante. Déterministe, testable, gratuite, bilingue.

**Pourquoi pas « jouée par Laura »** : chaque étape serait un appel facturé contre
un plafond de 50 messages/jour/utilisateur — une visite complète consommerait le
quota d'une journée.

C'est un **chantier à part entière** (une étape par écran majeur), pas un point de
lot de bugs courts. La relance depuis Réglages › Préférences › Démarrage est déjà
livrée ; le lien avec le changelog reste à poser.

## 7. #1819 tests de Laura → **banc complet des 157 usages**

Le catalogue des 157 usages livré avec le corpus devient le jeu de référence.

⚠️ **Ce qu'il faut chiffrer AVANT de le câbler** : 157 tours de modèle par
exécution de CI, contre une CI médiane à **3 min 56 s** aujourd'hui. Deux gestes
qui s'imposent d'eux-mêmes : mesurer le CHOIX D'OUTIL et les arguments plutôt que
la prose (moins cher, moins bruyant), et décider si le banc complet tourne à
chaque PR ou sur une cadence à part. Le seuil se fixe **avant** de mesurer.

## 8. #1613 / #1640 score d'externalisation → **réimporter le pack, puis recalibrer**

**Ce qui était mesuré en production le 09/09**, sur les 60 067 lignes de
`market_company_signal` :

| Colonne | Rempli | Part |
| --- | --- | --- |
| `externalization_score` | 5 573 | 9,3 % |
| `headcount_bracket` | 14 423 | 24,0 % |
| **les deux ENSEMBLE** | **4 122** | **6,9 %** |
| `dataset_version` | **0** | 0 % |

La calibration par cohorte qu'exigent #1613 et #1640 a besoin des deux colonnes
ensemble ; elle en a 6,9 %, et la cohorte majoritaire est « effectif inconnu »
(45 644 lignes).

**Tranché** : réimporter le pack d'abord — ça remplira aussi `dataset_version`,
à 0 aujourd'hui parce que le pack n'a jamais été réimporté depuis la migration de
versionnement — puis recalibrer.

⚠️ **À vérifier SUR LE PACK avant de promettre quoi que ce soit** : rien ne dit
que le corpus source porte plus d'effectifs qu'il n'en a déjà donné. Si c'est le
même 6,9 % après réimport, on aura payé un réimport pour rien, et le repli que
#1613 prévoit elle-même redevient la réponse (« Recours externe observé » /
« Non mesuré », sans Forte/Moyenne/Faible). `MARKET_MEMORY_SCORING_ENABLED = false`
(GA-257) reste où il est jusqu'à la calibration validée.
