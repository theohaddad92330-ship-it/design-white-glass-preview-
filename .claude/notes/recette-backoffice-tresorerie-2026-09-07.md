# Recette back-office — Trésorerie et MRR (#1649, #1645)

**Pourquoi c'est toi qui la fais** : `apps/dashboard-manager` est derrière
`DM_BASIC_AUTH` + TOTP, et saisir des identifiants m'est interdit. Tranché avec
toi le 07/09/2026 : je livre, j'écris les gestes, tu rends un PASS / FAIL.

⚠️ **Écran réservé au `owner`.** Il est dans `ECRANS_PROPRIETAIRE` : un
`operator` ou un `viewer` doit être refusé. C'est le compte en banque de
l'entreprise.

**Adresse** : `https://belllum-monorepo-dashboard-manager.vercel.app`
**Chemin** : rail › **Revenus › Trésorerie** (`/revenus/tresorerie`)

⚠️ **Vérifie d'abord que le build servi est le bon** — le pied de page affiche
`back-office+<sha>`. S'il est antérieur au commit de ce lot, la recette ne
prouve rien.

⚠️ **Et que l'API l'est aussi.** Cet écran lit une route NEUVE
(`internal/admin/business-metrics`) et sa migration crée trois tables. Vercel
déploie en ~1 min, Railway en plusieurs : entre les deux, l'écran affichera
« Chiffres indisponibles — l'API n'a pas répondu », ce qui est le bon
comportement mais pas le résultat de la recette. Attends que
`curl -s https://api.bellum-ai.com/version` rende le SHA du merge.

---

## 1. L'écran s'atteint EN CLIQUANT, et il ne ment pas quand il est vide

| Geste                                                        | Ce que tu dois voir                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ouvrir le rail, section **Revenus**                          | Une entrée **« Trésorerie »**, sous Clients et Facturation                                                                             |
| Cliquer dessus                                               | L'écran s'ouvre. Aucun 404, aucune redirection                                                                                         |
| Regarder les quatre tuiles du haut, **avant toute saisie**   | **« — » partout**, JAMAIS « 0 € ». Sous « Runway » : _« Aucun mois saisi. »_                                                           |
| Regarder l'historique                                        | « Aucun mois saisi. Le burn et le runway resteront "non mesurés" tant qu'il n'y en a pas deux. »                                        |

**FAIL si** : une tuile affiche `0 €` alors que rien n'est saisi. C'est le
défaut exact que la doctrine interdit, et il serait invisible en CI.

## 2. La saisie — quatre champs, et le vide n'est pas zéro

⚠️ **Le quatrième champ, « Encaissements du mois », n'est pas dans ton issue.**
Elle en demande trois puis écrit `burn = fixes + variables − encaissements` :
les encaissements n'y étaient ni saisis ni dérivables (le MRR est une position
théorique, pas de la caisse ; une facture « payée » ne porte pas sa date
d'encaissement). Sans lui, ta formule était incalculable. **Dis-moi si tu
préfères l'autre arbitrage** — un burn brut, sans les encaissements.

| Geste                                                                                        | Ce que tu dois voir                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Choisir le mois en cours, saisir solde / fixes / variables / encaissements, **Enregistrer**   | La ligne apparaît dans l'historique, avec son **Burn** calculé                                    |
| Regarder « Runway » après CE SEUL mois                                                       | **« — »** et la phrase _« Non mesurable : il faut 2 mois saisis. Un seul mois ne fait pas une moyenne. »_ |
| Saisir le mois **précédent** (les 4 champs)                                                  | Le formulaire est **VIDE** quand tu changes de mois — rien n'est pré-rempli avec le mois d'après   |
| Après ce 2ᵉ mois                                                                             | « Burn moyen » et « Runway » deviennent des **nombres**, avec « Moyenne sur 2 mois mesurés. »      |
| Revenir sur un mois déjà saisi                                                               | Ses valeurs se rechargent, le bouton dit **« Corriger ce mois »**                                 |
| **Vider** une case et enregistrer                                                            | La case redevient **« — »** dans l'historique, pas « 0 € »                                        |
| Taper `douze mille` dans un champ                                                            | Refus explicite : « Montant illisible… ». Rien n'est envoyé                                       |
| Taper `12 480 €` (avec l'espace du clavier français et le symbole)                           | Accepté — 12 480 €                                                                                |

**FAIL si** : changer de mois recopie les chiffres du précédent ; une case vidée
affiche « 0 € » ; « 12 480 € » est refusé.

## 3. Le MRR — la position du moment, et le premier instantané

| Geste                                                | Ce que tu dois voir                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Bandeau « MRR — instantanés mensuels », 4 tuiles     | **MRR (position du moment)** = tes abonnements Stripe payants × la grille ; **Revenu contracté** = tes clients sur facture, ramené au mois |
| Comparer avec ce que tu sais                         | ⚠️ **Le chiffre lui-même est à VÉRIFIER par toi** — c'est la seule chose que je ne peux pas prouver depuis le code                       |
| Cliquer **« Figer <mois précédent> »**               | Une ligne apparaît dans le tableau, et le bouton devient « <mois> déjà figé »                                                           |
| Regarder la colonne **MRR début** de cette 1ʳᵉ ligne | **« — »**, pas « 0 € ». C'est le premier mois de la série : on ne mesurait rien avant                                                   |
| Recliquer (recharge la page d'abord)                 | Le bouton est désactivé. Rien n'est réécrit                                                                                             |

**FAIL si** : la première ligne affiche `0 €` en « MRR début » ; un client sur
facture est compté dans le MRR (il doit être dans « Revenu contracté ») ;
« Ponctuel facturé » divise un montant par 12.

## 4. Les deux thèmes, et la porte des rôles

| Geste                                          | Ce que tu dois voir                                        |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Basculer clair / sombre                        | Tout reste lisible, aucun texte fantôme                     |
| Ouvrir `/revenus/tresorerie` avec un `viewer`  | **Refusé** (comme `/facturation`)                            |
| Ouvrir `/revenus` NU                           | 404 — c'est normal, cet écran-là est #1651, pas encore écrit |

---

## Ce que la recette ne peut PAS prouver, et que je dis plutôt que de le taire

- **Le passage du 1er du mois à 03 h 20** (Europe/Paris) qui fige
  automatiquement le mois écoulé. Il ne se vérifie qu'en octobre, ou dans les
  logs Railway. Le bouton « Figer » emprunte le MÊME chemin, donc s'il marche,
  le calcul est le bon — reste le déclenchement, qui attend le 1er.
- **L'exactitude des chiffres de MRR.** Le calcul est testé (26 tests purs, dont
  l'invariant `fin = début + nouveau + expansion − contraction − churn`), mais
  « le MRR de BellumAI vaut-il vraiment X ? » est une question dont toi seul as
  la réponse.
- **Le mobile** — jamais vérifiable depuis un navigateur piloté, et le
  back-office n'a pas de coque mobile.

## Une question qui t'attend

Le bouton « Figer » photographie les abonnements **d'aujourd'hui** et les range
sous l'étiquette du mois précédent. Pour le PREMIER instantané c'est le seul
choix possible (la position d'août n'existe plus). **Ensuite ce ne le sera
plus** : si un mois est manqué (interrupteur posé, panne), le rattraper à la
main écrira une position fausse sous une vraie étiquette. Dis-moi si tu veux que
le bouton refuse tout mois autre que celui qui vient de finir.
