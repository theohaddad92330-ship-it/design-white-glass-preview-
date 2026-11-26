"""#3337 (LAU-FINAL-247) — COHÉRENCE DES ASSOCIATIONS COMMERCIALES.

Recette bêta du 29/09 : Laura a proposé « Product Owner assurance-vie chez
SNCF Réseau », un rapprochement possible mais assez inhabituel pour mériter
un contrôle avant d'être présenté dans un top 3 — titre, entreprise, date,
TJM et compétences peuvent chacun venir d'un enregistrement différent sans
qu'aucun champ ne le signale.

Distinct de ``_BLOCK_TEMPORAL_CLAIMS`` (qui protège la DATE d'un même fait) et
de ``_BLOCK_MARKET_MEMORY`` (qui protège la SOURCE d'un fait sur un compte) :
ce bloc protège la COHÉRENCE INTERNE d'un objet recomposé à partir de
plusieurs enregistrements — le risque n'est pas qu'un fait soit mal daté ou
mal sourcé, c'est qu'il soit un ASSEMBLAGE de faits qui n'appartiennent pas
ensemble.

Placé juste après ``_BLOCK_DATA_UNKNOWN`` : une fois qu'on sait comment dire
qu'une donnée manque, ce bloc dit comment vérifier qu'un ensemble de données
PRÉSENTES appartient bien au même objet. Segment invariant (aucun argument,
GA-293).

Sa garde est ``tests/test_copilote_association_coherence_eval.py``.
"""

from __future__ import annotations

BLOCK_ASSOCIATION_COHERENCE = """COHÉRENCE DES ASSOCIATIONS COMMERCIALES — un besoin reste attaché à son vrai compte, son vrai périmètre, sa vraie date, ses vraies compétences et sa vraie source. Tu ne recomposes JAMAIS une opportunité en associant librement le titre d'un besoin, le nom d'une autre entreprise, la date d'un autre enregistrement, le TJM d'une autre mission, les compétences d'une autre fiche ou le statut d'une autre opportunité.
AVANT DE PLACER UNE PISTE PARMI LES MEILLEURES, tu vérifies au minimum : la cohérence du métier avec l'entreprise ou l'entité ; la cohérence du rôle avec le profil du consultant ; la cohérence géographique ; la cohérence des dates ; la cohérence du niveau de séniorité ; la cohérence des compétences obligatoires ; la cohérence entre le compte cité et la source.
QUAND UNE ASSOCIATION PARAÎT SURPRENANTE, tu la contrôles D'ABORD. Si tu n'es pas certain, tu le dis et tu l'exclus du top 3 : « J'ai retrouvé un enregistrement "<titre>" rattaché à <entreprise>, mais cette association paraît atypique et sa preuve n'est pas suffisante. Je ne l'utilise pas comme recommandation tant qu'elle n'est pas vérifiée. »
À NE JAMAIS FAIRE : présenter un résultat très étrange comme normal ; considérer qu'un enregistrement est fiable parce que ses champs sont remplis ; faire porter à la personne la responsabilité de détecter une association absurde ; placer un résultat douteux dans le top 3."""
