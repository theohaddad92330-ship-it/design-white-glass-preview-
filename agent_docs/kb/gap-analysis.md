# Gap analysis — Roadmap vs capacité réelle

Source : note de recalage interne (PDF Drive, destinée à Matteo). Distillée, sans données personnelles.

> Nature du document : c'est une note de **pilotage / recalage de roadmap**, pas une
> analyse technique détaillée des gaps data / agents / prompts. Elle décrit l'écart entre
> les ambitions de la roadmap et la capacité réelle d'exécution **sous l'angle de la
> lisibilité et de la testabilité**, pas sous l'angle « telle donnée manque pour tel prompt ».
> Les contraintes pour la réécriture des prompts sont donc déduites du cadrage business
> ci-dessous, pas listées telles quelles dans le document.

## Constat central

La roadmap est jugée cohérente sur le fond (briques alignées avec la vision cible).
Le problème n'est pas les thèmes, c'est la **pilotabilité** : impossible de lire simplement
où on en est, ce qui est déjà là, ce qui est en cours, ce qui est testable de ses propres yeux.

## Tensions de pilotage identifiées

- Le produit a avancé sur plusieurs briques mais ce n'est **pas assez visible**.
- Trop peu de **versions testables** vues directement.
- Roadmap décrite en **grands chantiers**, pas assez en **livrables testables**.
- **Pas de visibilité sur les coûts réels** des requêtes et des APIs.
- Pas de point précis sur **à partir de quand Bellum est montrable / vendable en l'état**.

## Ce que la roadmap doit rendre lisible

Pour chaque brique : fait / en cours / bloqué / testable / V1 / V2 / délégable à un renfort.

## Recalibrage temporel proposé

- **0–15 j** : première version réellement testable ; clarifier l'état du scraping, des APIs,
  de Stripe, du profil utilisateur et de l'onboarding ; arbitrer le périmètre **strict V1**.
- **15–30 j** : stabiliser le parcours principal ; fiabiliser les **requêtes les plus importantes** ;
  démo propre ; mieux mesurer le **coût réel d'usage**.
- **30–60 j** : vrais cas test ; bêta testeurs ciblés ; corriger les frictions visibles ;
  base claire pour la monétisation.

## Question du renfort

Un profil IA est envisagé, mais seulement s'il soulage un point de friction précis :
orchestration multi-agents, mémoire agentic, RAG, automatisation du RAG, module chat IA,
ou qualité du code. Objectif = soulager une friction réelle, pas empiler un profil.

---

## Contraintes qui encadrent la réécriture des prompts

Le document ne liste pas de gaps data/prompt explicites, mais le cadrage impose ces garde-fous :

1. **Ne promettre que ce qui est déjà testable.** La plainte centrale est l'écart entre
   chantiers annoncés et livrables réels. Un prompt ne doit pas faire miroiter une sortie
   (organigramme complet, plan d'action, contacts) que le pipeline ne produit pas de façon
   fiable aujourd'hui.
2. **Périmètre V1 strict à respecter.** Tout ce qui n'est pas arbitré « V1 » (briques en cours
   ou bloquées) ne doit pas être présenté comme acquis dans les sorties de prompt.
3. **Sensibilité au coût.** Coûts requêtes/API non maîtrisés : éviter les prompts qui
   multiplient les appels externes (Brave, Firecrawl, Apollo, Pappers…) sans nécessité.
   Les prompts doivent rester économes en passes / sources.
4. **État incertain des sources amont** (scraping, APIs, profil utilisateur, onboarding non
   clarifiés à la rédaction) : les prompts doivent dégrader proprement quand une source
   manque — **jamais de données inventées** (cohérent avec la règle CLAUDE.md « JAMAIS de
   données fictives, échec API → erreur claire »).
5. **Sortie démontrable à un bêta testeur.** Cible 30–60 j = montrer une version cohérente.
   Les prompts doivent produire un livrable propre et défendable même partiel, pas une
   coquille ambitieuse non remplie.
