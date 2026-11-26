# Recette back-office — l'écran Adoption (#1685, #1657.2)

**Pourquoi c'est toi qui la fais** : `apps/dashboard-manager` est derrière
`DM_BASIC_AUTH` + TOTP, et saisir des identifiants m'est interdit. Mesuré à
l'instant : `GET /produit/adoption` répond **401** avec
`www-authenticate: Basic realm="BellumAI Backoffice"` — l'application est en
ligne, le mur est fermé, et je m'arrête là.

Verdict de mon côté : **BLOCKED** (accès), pas FAIL. Rien n'a été vu tourner.

**Adresse** : `https://belllum-monorepo-dashboard-manager.vercel.app/produit/adoption`
**Commit de merge** : `6eff5f2ee` (PR #1848)
**CI** : 16 checks verts, 0 rouge, dont `Test (back-office)` — le job qui garde
réellement cette application.

⚠️ **Vérifie d'abord le build servi.** Le pied de page affiche
`back-office+<sha>`. S'il ne commence pas par `6eff5f2e` ou plus récent, la
recette ne prouve rien : le déploiement n'est pas passé, et il faut attendre.

---

## 1. La feature APPARAÎT-elle ? — la question qui passe avant les autres

| Geste | Ce que tu dois voir |
| --- | --- |
| Ouvrir le back-office, **sans taper d'URL** | Dans le rail de gauche, section **Produit**, une entrée **« Adoption »** entre « Analytique produit » et « Changelog » |
| Cliquer dessus | L'écran s'ouvre. Compte les clics : il en faut **deux** depuis l'arrivée |

**FAIL si** l'entrée n'est pas dans le rail — un écran qu'on n'atteint que par
son URL n'est pas livré, c'est la règle du dépôt.

## 2. Ce que l'écran doit dire

Il répond à une seule question : **quelles fonctions gatées par l'offre (Growth
vs Entreprise) sont payées et jamais utilisées.**

| Geste | Ce que tu dois voir |
| --- | --- |
| Lire le tableau | Une ligne par **fonction**, avec : espaces qui y ont droit · espaces qui l'ont utilisée · utilisations/semaine · première utilisation médiane · taux d'échec |
| Lire la colonne verdict | Quatre valeurs seulement : **adoptée** (> 60 % des espaces éligibles) · **confidentielle** (10–60 %) · **ignorée** (< 10 %) · **morte** (0 % depuis 90 jours) |
| Chercher une fonction récente | Une fonction de **moins de 60 jours** n'est **jamais** classée « ignorée ». Si tu en vois une, c'est un FAIL |

**Pourquoi cette dernière règle** : on ne peut pas reprocher à une nouveauté de
ne pas avoir été trouvée. C'est ta propre règle, écrite dans #1685.

## 3. La frontière — c'est le point le plus important

| Geste | Ce que tu dois voir |
| --- | --- |
| Balayer tout l'écran, y compris les infobulles | **Aucun nom d'espace client.** Nulle part |
| Chercher une métrique sur peu de données | Sous **5 sessions distinctes**, aucune métrique — une mention de non-mesurabilité, jamais un « 0 » |

**FAIL si** un nom d'espace apparaît, ou si une case affiche `0` là où la vraie
réponse est « pas assez de sessions pour le dire ». C'est la frontière de #1681 :
on mesure le PRODUIT, jamais la personne, et l'unité d'analyse est la FONCTION.

Une garde tient ce point (`adoption-ne-nomme-jamais-un-espace.test.ts`, 6 tests) —
mais une garde vérifie du code, pas un rendu. C'est pour ça que ce geste-ci est
dans la liste.

## 4. Zéro régression

Ouvre les autres entrées du rail (Analytique produit, Changelog, Trésorerie,
MRR, Facturation, Clients, Dépendances). **Un écran cassé ailleurs est un échec
du lot**, même si Adoption est parfait.

---

## Rends-moi un verdict

- **PASS** — les objets attendus sont là, les liens et les valeurs sont corrects.
- **FAIL** — l'écran déclare un succès et la donnée est absente ou fausse.
- **PARTIAL** — ça marche mais il manque une colonne, une association, un cas.
- **BLOCKED** — tu n'as pas pu entrer (identifiants, TOTP, quota).

Tant que je n'ai pas ce verdict, **#1685 et #1657 restent OUVERTES**. Livré n'est
pas vérifié.
