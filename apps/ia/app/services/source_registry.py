"""Ce que chaque source fait QUAND ELLE TOMBE — déclaré, pas deviné.

⚠️ Corrigé le 30/08/2026 : ce docstring annonçait encore « sept » au-dessus
d'une énumération à quatre valeurs — un lecteur pressé aurait cru les sept
couverts (`agent_docs/iteration-3-trous-2026-08-30.md`, T-066).

Le tome 2 §23 (« PARTIE F — QUAND UNE SOURCE TOMBE ») PROPOSAIT sept entrées
avec leur code (`provider_unavailable`, `rate_limited`, `200 + searched: true`,
`scope_missing`, `deprecated`, `stale`, `conflict`) —
marqué `[Spécification proposée]` dans le tome, jamais confirmé. Le tracker du
dépôt le dit lui-même (`agent_docs/tome2-donnee-sources-pipeline-2026-08-21.md:188`,
item 85, statut PARTIEL) : cinq de ces sept sont ceux d'un registre VOISIN
mais DISTINCT — `apps/api/src/common/connector-error.ts` (`CONNECTOR_ERROR_CODES`,
5 codes, pour un connecteur OAuth Google/HubSpot/Microsoft qui perd l'accès,
pas une source publique) — et `deprecated`, `stale`, `conflict` n'existent
NULLE PART dans le dépôt. Aucun des sept ne rejoint donc ce registre-ci tel
quel :

  - `provider_unavailable`, `scope_missing` et `deprecated` couvrent le même
    terrain que `graceful_empty`/`reported_degraded`, `raises_unavailable` et
    `no_op_documented` ci-dessous — sous les noms choisis quand CE registre a
    été construit (PDF-10). Les ajouter dupliquerait une valeur qui existe
    déjà, sous un nom concurrent.
  - `rate_limited` (« file d'attente, reprise en arrière-plan ») est une
    condition TRANSITOIRE avant qu'un module retombe sur l'un des quatre
    comportements FINAUX déclarés ici — pas un comportement du même niveau.
  - `stale` et `conflict` décrivent la vie d'un FAIT au fil du temps
    (« redevient inconnu, daté » ; « les deux valeurs affichées, datées ») —
    la doctrine du dépôt (« on archive, on ne supprime pas »), portée par un
    système de decay / provenance, pas par ce registre qui déclare le
    comportement d'un MODULE pendant UNE recherche.

Le vocabulaire RÉELLEMENT construit ici est celui de PDF-10 et de `GD-08` :
« chaque source déclare son comportement de panne parmi les quatre ». Le
dépôt les IMPLÉMENTAIT déjà, un par un, dans le corps de seize modules — donc
personne ne pouvait répondre à « que se passe-t-il si BODACC tombe ? » sans
lire seize fichiers, et rien n'empêchait la dix-septième source d'oublier.

Ce registre est DÉCLARATIF : il ne fait rien, il dit. Sa valeur est la garde qui
l'accompagne (`test_source_registry.py`) — un module ajouté dans
`data_sources/` sans entrée ici fait échouer la CI, avec la question qu'il faut :
« que voit l'utilisateur quand cette source ne répond pas ? »

Les quatre comportements du dépôt, et le seul qui compte vraiment : une
réponse vide QUALIFIÉE (le cas « `200 + searched: true` » du tome, « j'ai
cherché dans 1 240 offres, aucune ne correspond » — la qualification vit dans
le champ `loses` de chaque entrée, pas dans un cinquième comportement). Une
liste vide non qualifiée est indiscernable d'un refus d'accès — c'était la
troisième panne de la recette du 16/08, et la pire.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

#: Les quatre comportements de panne d'une SOURCE DE COLLECTE (PDF-10, `GD-08`)
#: — pas les sept entrées que le tome 2 §23 PROPOSAIT sans les confirmer,
#: voir le docstring du module ci-dessus. `graceful_empty` est le cas nominal
#: d'une source d'APPOINT : elle disparaît du dossier, les autres continuent.
FailureBehaviour = Literal[
    "graceful_empty",  # rend [], les autres sources continuent
    "reported_degraded",  # rend [] ET s'inscrit dans `degraded` — l'écran le DIT
    "raises_unavailable",  # lève : la source est structurante pour cet écran
    "no_op_documented",  # sans clé/identifiants : zéro appel, no-op assumé
]

#: Le niveau de collecte du tome 2 §1.1 — le statut juridique de la source.
CollectionLevel = Literal["N1", "N2", "N3", "N4"]


class SourceDeclaration(NamedTuple):
    """Ce qu'une source donne, sous quel régime, et ce qu'elle fait en panne."""

    level: CollectionLevel
    behaviour: FailureBehaviour
    #: Ce que l'utilisateur perd quand elle tombe. En français, et concret : ce
    #: texte est ce qu'on affiche ou journalise, pas une note interne.
    loses: str


#: Une entrée par module de `app/services/data_sources/`. Le nom de la clé est le
#: nom du module — c'est ce qui rend la garde possible sans registre parallèle.
SOURCE_REGISTRY: dict[str, SourceDeclaration] = {
    "france_travail": SourceDeclaration(
        "N1", "raises_unavailable", "plus aucun signal de recrutement : la source la plus dense de Découvrir"
    ),
    "apec": SourceDeclaration("N1", "graceful_empty", "les offres cadres, environ un tiers du volume"),
    "wttj": SourceDeclaration(
        "N3", "no_op_documented", "rien — la source est éteinte tant qu'un opérateur ne fournit pas ses identifiants"
    ),
    "ats_boards": SourceDeclaration("N3", "graceful_empty", "les offres publiées sur le board propre d'une entreprise"),
    # #3885 (lot RAS) — Adzuna, Jooble, TheirStack : API officielles / partenaire
    # sous contrat (`agent_docs/sources-offres-besoins.md`). Chacun NO-OP STRICT
    # sans sa clé ; une panne rend [] ET s'inscrit dans `degraded`.
    "job_aggregators": SourceDeclaration(
        "N3",
        "reported_degraded",
        "les offres reprises par les agrégateurs d'emploi (dont celles publiées sur LinkedIn et Indeed) — rien tant qu'aucune clé n'est posée",
    ),
    # DISCOVER-OFFRES (15/10) — l'aperçu GRATUIT du volume d'offres par carte, et la lecture du
    # solde de crédits du même partenaire. NO-OP STRICT sans clé ; une panne ne rend RIEN (jamais « 0 »).
    "mantiks_volume": SourceDeclaration(
        "N3",
        "graceful_empty",
        "le nombre d'offres sur 90 jours affiché sur les cartes de Découvrir — la ligne disparaît, jamais un « 0 »",
    ),
    "mantiks_balance": SourceDeclaration(
        "N3",
        "graceful_empty",
        "rien à l'écran : seulement l'alerte de solde de crédits bas dans le journal d'exploitation",
    ),
    # #2616.1 (23/09/2026, doctrine c79_collecte_large_mais_propre) — recrutement
    # multi-plateformes via le waterfall de recherche déjà branché (Serper →
    # Tavily → Brave), en complément d'APEC/WTTJ. NO-OP STRICT sans aucune des
    # trois clés ; `[]` gracieux sur toute panne, comme les autres sources
    # d'appoint du même waterfall (serper/tavily ci-dessous) : une offre en
    # moins jamais confondue avec « aucune ESN ne recrute ».
    "job_search": SourceDeclaration(
        "N4",
        "graceful_empty",
        "les offres d'embauche trouvées par recherche web, en complément des plateformes d'offres publiques — le waterfall passe au fournisseur suivant",
    ),
    # #2616.1 — table de vérité UNIQUE des libellés/domaines de plateformes
    # d'offres (GA-26), lue par `job_search.py` ET `discover_signals.py` : pas
    # d'appel réseau, aucun état à perdre — comme `territory_query`/
    # `signal_errors` ci-dessous.
    "job_platforms": SourceDeclaration(
        "N1",
        "graceful_empty",
        "rien — table d'attribution partagée (libellé et domaine de plateforme), pas une source réseau",
    ),
    "public_tenders": SourceDeclaration("N1", "raises_unavailable", "les appels d'offres publics ouverts"),
    # #4116 — TED (UE) : sa panne lève TedUnavailable, attrapée par `public_tenders`
    # qui la SIGNALE (source dégradée « ted ») ; BOAMP continue seul.
    "ted": SourceDeclaration("N1", "reported_degraded", "les appels d'offres européens (TED), BOAMP continue seul"),
    "decp": SourceDeclaration(
        "N1", "raises_unavailable", "les marchés attribués, donc le verrouillage et son échéance"
    ),
    "bodacc": SourceDeclaration(
        "N1", "reported_degraded", "les événements légaux : création, fusion, procédure collective"
    ),
    # #3941.5 (lot V10-A, décision Louis 17/10 : levée = BODACC B) — lève `SignalSourceUnavailable`, que le mode
    # Signaux de Découvrir NOMME comme famille tombée.
    "bodacc_capital": SourceDeclaration(
        "N1", "raises_unavailable", "les augmentations de capital du mode Signaux de Découvrir"
    ),
    # #4732.1 — « Rachat ou fusion » est une famille du mode Signaux : sa panne lève `SignalSourceUnavailable`,
    # Découvrir la NOMME comme famille tombée au lieu d'afficher une liste courte.
    "bodacc_takeover": SourceDeclaration(
        "N1", "raises_unavailable", "les rachats et fusions du mode Signaux de Découvrir"
    ),
    "recherche_entreprises": SourceDeclaration(
        "N1", "reported_degraded", "l'identité de registre — sans elle, plus de résolution d'entité"
    ),
    "registry_lookup": SourceDeclaration(
        "N1", "graceful_empty", "le nom derrière un SIREN : un titulaire de marché reste sans nom, jamais un SIRET brut"
    ),
    "inpi_rne": SourceDeclaration("N1", "graceful_empty", "les bénéficiaires effectifs"),
    "brave_news": SourceDeclaration(
        "N4", "reported_degraded", "la presse récente, donc une partie du « pourquoi maintenant »"
    ),
    "serper": SourceDeclaration(
        "N4", "graceful_empty", "des résultats web supplémentaires — le waterfall passe au suivant"
    ),
    "tavily": SourceDeclaration("N4", "graceful_empty", "idem : le waterfall passe au provider suivant"),
    "github_org": SourceDeclaration("N3", "graceful_empty", "le signal technique d'une organisation GitHub"),
    "tech_detect": SourceDeclaration("N2", "graceful_empty", "la stack observée sur le site"),
    # Le découpage administratif (geo.api.gouv.fr) : il ne dit rien des
    # entreprises, il dit OÙ est une ville. En panne, le champ « ville » ne
    # propose plus rien — mais la recherche par DÉPARTEMENT continue de marcher
    # entièrement, puisqu'elle ne dépend d'aucune source. C'est une perte de
    # confort de saisie, pas une perte de territoire.
    "geo_communes": SourceDeclaration(
        "N1",
        "graceful_empty",
        "le choix d'une ville et le rayon autour d'elle : la recherche par département reste entière",
    ),
    # #4361.2 — l'index ouvert des sociétés dont la cotation est prouvée. En panne, « Exclure les
    # sociétés cotées » ne retire rien et la réponse le dit (`listingFilter.sourceAvailable`) :
    # jamais un compte déclaré « non coté » faute de réponse.
    "listed_companies": SourceDeclaration(
        "N1",
        "graceful_empty",
        "l'interrupteur « Exclure les sociétés cotées » ne retire rien, et la réponse le dit",
    ),
    "territory_query": SourceDeclaration(
        "N1", "graceful_empty", "rien — ce sont deux primitives de normalisation, pas une source"
    ),
    "signal_errors": SourceDeclaration(
        "N1", "graceful_empty", "rien — c'est le type d'erreur partagé par les sources de Découvrir"
    ),
    "_http_pool": SourceDeclaration(
        "N1", "graceful_empty", "rien — c'est le client HTTP partagé de process (#2604.2), pas une source réseau"
    ),
    # #2805 (#2291.3) — DataForge/ORION comme source de CANDIDATS, en APPOINT du
    # registre public (jamais structurant : ce pack qualifie un nombre restreint
    # de comptes déjà choisis, pas un bassin à égaler). NO-OP sans le pont
    # interne configuré (`API_INTERNAL_URL`/`INTERNAL_API_SECRET`) ; `[]`
    # gracieux sur toute panne, comme les autres sources d'appoint ci-dessus.
    "dataforge_candidates": SourceDeclaration(
        "N4",
        "graceful_empty",
        "des comptes déjà qualifiés par le pack interne ORION, en complément du registre public",
    ),
    # Intégration AE (09/10/2026, chantier signaux #3916-#3936) — les cinq modules
    # absorbés. Tous des sources d'APPOINT : une panne rend `[]`, jamais une erreur
    # qui casserait le dossier, et jamais lue comme « il ne se passe rien ».
    "ats_boards_more": SourceDeclaration(
        "N3", "reported_degraded", "les offres publiées sur d'autres boards publics d'entreprise (ATS supplémentaires)"
    ),
    "careers_pages": SourceDeclaration(
        "N3", "graceful_empty", "les offres lues dans les données structurées de la page carrières du site"
    ),
    "company_events": SourceDeclaration(
        "N1", "reported_degraded", "les ouvertures d'établissement datées du registre officiel des entreprises"
    ),
    "employer_match": SourceDeclaration(
        "N1", "graceful_empty", "rien — c'est un filtre pur d'attribution employeur (#3901), sans appel réseau"
    ),
    "job_recruiters": SourceDeclaration(
        "N3", "graceful_empty", "rien — tri pur des recruteurs nommés par les offres gardées (SIG-B), sans réseau"
    ),
    "press_rss": SourceDeclaration(
        "N3", "reported_degraded", "les articles récents des flux RSS publics de la presse française"
    ),
    # #3941 — fils publics de levées de fonds ; VIDE (`FUNDING_FEED_URLS`) = aucun fil, zéro réseau.
    "funding_feed": SourceDeclaration(
        "N3", "graceful_empty", "les levées de fonds datées et sourcées des fils publics configurés — rien sans fil"
    ),
    # #4735 — Crunchbase (tours de table). Source PAYANTE d'appoint : NO-OP STRICT sans `CRUNCHBASE_API_KEY`, un appel
    # = une ligne au `cost_ledger`, un cache single-flight. Une panne rend `[]` (jamais une levée inventée) et n'est
    # pas mise en cache comme un vide.
    "crunchbase": SourceDeclaration(
        "N3",
        "graceful_empty",
        "les tours de table datés avec leur montant publié — rien tant qu'aucune clé n'est posée, jamais une levée devinée",
    ),
    # #4734 (rouvert par Louis le 28/10) — annuaires French Tech, national et régionaux : le label tel que l'annuaire le
    # dit, rattaché par SIREN seulement. NO-OP STRICT sans `FRENCH_TECH_DIRECTORY_URLS`.
    "french_tech": SourceDeclaration(
        "N1",
        "graceful_empty",
        "le label, le programme et la promotion des annuaires de l'écosystème startup — l'entreprise n'en porte aucun, jamais une ligne vide",
    ),
}


def declaration_for(module: str) -> SourceDeclaration | None:
    """La déclaration d'un module, ou ``None`` s'il n'en a pas — auquel cas la
    garde a déjà échoué et personne ne devrait arriver ici."""
    return SOURCE_REGISTRY.get(module)
