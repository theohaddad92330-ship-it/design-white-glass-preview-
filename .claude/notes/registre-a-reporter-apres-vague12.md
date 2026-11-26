# À reporter dans les registres APRÈS le merge de #2364 et #2365

⚠️ Ces lignes ne se touchent PAS tant que les deux PR sont ouvertes — leurs
branches écrivent dans les mêmes fichiers. Édition LIGNE PAR LIGNE, jamais de
réécriture du fichier.

## `registre-2026-09-15-onboarding-questionnaire.md`

### ligne 131 — `2020.3` « Laura précise ce que la réponse changera » : `retenu` → `recetté`

Le registre dit : « le `subtitle` de `recruits_for_clients` le fait à la main
(`questions.ts:215`) — **un seul cas sur dix** ». **C'est périmé.**

Mesuré le 16/09/2026 :
- `apps/web/src/features/onboarding/lib/question-consequences.ts` porte
  **86 entrées** sur `origin/main` (et 86 sur la branche d'intégration) — ce
  n'est plus un cas à la main, c'est un module dédié ;
- **en PRODUCTION**, écran `/onboarding/<id>/company_info/temps` : **3 questions
  sur 3** portent leur conséquence à l'écran, en troisième ligne. Exemple :
  « Note le temps que tu annonces consacrer au développement commercial, à côté
  de celui qui tient vraiment. »

### ligne 132 — `2020.4` « Laura propose "Je ne sais pas" » : `retenu` → `recetté`

Le registre dit : « **impossible aujourd'hui** : `validate()` exige une valeur
(`validation.ts:30-37`) ». **C'est périmé aussi.**

Mesuré en PRODUCTION le 16/09/2026, même écran : **3 questions sur 3** offrent
« **Je ne sais pas** », et cette option est **DISTINCTE** de « Aucune heure dans
une semaine ordinaire ». C'est GA-18/GA-19 tenu à l'ENTRÉE et pas seulement à
l'affichage : quelqu'un qui ne sait pas n'est jamais poussé à répondre zéro,
donc la donnée fausse n'entre pas dans le système.

## Points à faire passer `recetté` depuis la recette de la nuit

| Sujet | Preuve |
| --- | --- |
| « Close » → « Fermer » | témoin avant/après, même corpus (42 `sr-only`, 24 boutons) |
| les zéros qui mentaient | 0 zéro nu / 124 lignes + « Recours à des externes → Non mesuré → Mémoire locale » |
| le questionnaire ne déduit pas | « soustraire deux tranches inventerait un chiffre que tu n'as pas donné » |
| « rien ne part tout seul » | `/actions/sequences` + « 5 visibles · 2 autres · rien ne sera envoyé » sur `/briefing` |
| GA-44, capacité et pas éditeur | `/briefing` : « ton agenda · connecté », « ta messagerie · connecté » ; 0 fournisseur sur 16 cherchés |

## Ce qui reste `livré`, avec sa raison — NE PAS écrire `recetté`

- **GA-259 / mémoire marché** : `market-context-search` rend `matches: []`, la
  carte se tait à raison, **aucun corpus à mesurer**.
- **« un axe non évaluable sort du dénominateur »** : le compte de recette a ses
  cinq axes évaluables, le cas n'est pas exercé.
- **`/discover` et le défaut `pappers` rouvert le 14/09** : `cartes: 0`,
  `CandidateCard.tsx` n'est pas monté. Il faut lancer une vraie proposition de
  cibles, qui consomme des crédits.
- **les compteurs de `/actions/sequences` en cas d'ÉCHEC** : les quatre « 0 »
  relevés sont mesurés, mais le chemin `isError` n'est pas exercé.

## Lot à ouvrir — signalé par l'intégrateur, non corrigé

`PendingActions.tsx:68` redéfinit sa PROPRE union `PendingChatAction` au lieu de
lire celle des contracts. **Deux vérités pour un contrat (GA-26)**, et c'est la
cause racine du rouge de cette nuit : le web compilait pendant que
`prepare_campaign` n'avait aucune variante zod.

## L'appelant de `question-consequences.ts`, vérifié

```
apps/web/src/features/onboarding/components/SubStepQuestions.tsx
apps/web/src/features/onboarding/lib/onboarding-attention-points.ts
apps/web/src/features/onboarding/lib/question-help.ts
```

`SubStepQuestions.tsx` est le composant qui REND les questions. Les 86
conséquences ne sont donc pas un module orphelin : elles arrivent à l'écran, et
la production le confirme (3/3 sur l'écran mesuré).

---

## Points de couture à prendre à l'INTÉGRATION de la vague 12 bis

Deux branches se croisent sur la même union et aucune ne peut le régler seule.

1. **`prepare_campaign` a besoin d'une entrée dans `ACTION_ICON`.**
   `integration-vague12-audit-laura` apporte le quatorzième variant zod ;
   `fix/lunion-des-propositions-de-laura-vit-a-un-seul-endroit` (`b00cd2779`)
   retire l'union recopiée du `.tsx` et fait lire celle du contrat. Une fois les
   deux ensemble, la table d'icônes n'a plus de ligne pour cette action et **la
   garde `chat-actions-cross-language.test.ts` le dira en rouge**.
   → C'est l'intégrateur qui prend ce point, pas un lot suivant : il n'existe
   qu'au moment où les deux branches se rejoignent, et il rougit tout seul.

2. **`copilot-card-catalog.ts` a TROIS endroits à tenir d'accord**, pas un :
   le type `NavigationAction`, le jumeau d'exécution `NAVIGATION_ACTIONS`, et la
   liste **littérale** de `case` du `switch` qui construit l'intent (il lit la
   forme brute, pas `EffectfulAction`). Corrigé en `689df731a` ; à revérifier si
   une fusion touche ce fichier.

3. **Doublon voisin, hors périmètre, à ouvrir un jour** :
   `apps/api/src/modules/crm/crm-task.ts:17` déclare son propre
   `export type CrmTaskProvider` à côté de celui du contrat — même classe que
   l'union qu'on vient de dédupliquer, autre feature.

4. **Question parquée (produit, pas code)** : `github` et `wttj` sont classés
   « nommés mais ni à nous ni au client » (sources publiques). Si le produit les
   considère comme NOS fournisseurs de collecte, ils rejoignent `OUR_SUPPLIERS`
   et cessent de pouvoir être nommés. C'est une décision de Louis.

5. **Horodatage laissé tel quel** : `1794300000001-RfpAndContentQuestions.ts` est
   aussi choisi à la main, mais la garde ne le voit pas (son reste vaut 1). Non
   touché pour ne pas élargir le lot ; à trancher si on veut la règle stricte.
