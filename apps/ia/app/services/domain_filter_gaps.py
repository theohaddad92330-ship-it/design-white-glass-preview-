"""Les packs dont les SOURCES ne sont pas encore triées — nommés, pas tus.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT
─────────────────────────────────────────────────────────────────────────────
:func:`~app.services.domain_job_filters.job_filter_for` et
:func:`~app.services.domain_market_filters.market_filter_for` rendent ``None``
pour six des huit packs enregistrés. Le tri IT historique s'applique alors, ce
qui est la bonne sûreté — mais rien ne le DISAIT. Un vendeur finance recevait
des annonces de développeurs, et le dépôt ne portait aucune phrase expliquant
pourquoi ; il fallait relire deux modules pour s'apercevoir que la table des
filtres n'a qu'une entrée.

C'est le jumeau exact du défaut mesuré le 29/08/2026 sur le parseur DATAFORGE :
dix-huit colonnes tombaient parce qu'un filtre de préfixes muet se lit
« il n'y avait rien ». Un filtre doit dire ce qu'il rejette, et pourquoi.

─────────────────────────────────────────────────────────────────────────────
POURQUOI LE LEXIQUE V10 NE COMBLE PAS LE TROU TEL QUEL
─────────────────────────────────────────────────────────────────────────────
Le pack DATAFORGE V10 livre bien ce qui manque : un lexique par domaine —
66 domaines, 972 termes de recherche (951 distincts) et 281 termes de signal —
rattachés à ces packs par ``bellum_existing_offer_pack``. Mesuré le 29/08/2026
sur le CSV canonique.

Il n'est PAS branché ici, et c'est une décision, pas un oubli : **102 des
951 termes font trois caractères ou moins** et sont des sigles qui percutent du
vocabulaire courant — ``tom``, ``lab``, ``tax``, ``sea``, ``vue``, ``mm``,
``pp``, ``sd``, ``ot``, ``hr`` — et l'un d'eux (``tr s``) est un sigle abîmé à
l'export. Un ``\\b…\\b`` sur un intitulé d'offre les ferait tous matcher : le
vendeur verrait son flux se remplir de bruit, en silence, ce qui est pire que
le tri IT qu'il subit aujourd'hui. Les termes existent, ils demandent une
CURATION — la même que celle qui a produit la table industrielle à la main.

Ce module ne filtre donc rien. Il rend le trou visible et le tient : la garde
``tests/test_domain_filter_coverage.py`` fait échouer l'ajout d'un pack dont
personne n'a tranché le tri des sources.
"""

from __future__ import annotations

#: Pack → pourquoi ses sources retombent sur le tri IT historique.
#:
#: Le nombre entre parenthèses est la taille du lexique V10 disponible pour ce
#: pack (union des mots-clés distincts de ses domaines, mesurée le 29/08/2026) :
#: c'est ce qu'il y a à curer, et c'est ce qui dit si le chantier est un
#: après-midi ou une semaine.
DOMAIN_FILTER_GAPS: dict[str, str] = {
    "generic": (
        "23 domaines du pack V10, 330 mots-clés distincts disponibles — le plus gros gisement et le plus "
        "hétérogène : « générique » couvre du juridique, du marketing, de la santé et du secteur public, dont "
        "les intitulés d'offres n'ont aucun vocabulaire commun. Un filtre unique pour ce pack serait soit trop "
        "large (le tri disparaît) soit trop étroit (il exclut cinq domaines sur six). À découper par domaine "
        "avant d'être curé, pas à recopier en bloc."
    ),
    "finance": (
        "7 domaines du pack V10, 108 mots-clés distincts disponibles. Le référentiel ROME porte ses métiers en "
        "M12 (audit, gestion, organisation) et M16 (direction financière), qui restent à vérifier sur des offres "
        "réelles avant d'être posés : un préfixe ROME trop haut ramène toute la comptabilité fournisseurs."
    ),
    "supply_chain": (
        "5 domaines du pack V10, 65 mots-clés distincts disponibles. Le risque propre à ce pack est la division "
        "CPV 60 (transport), qui est un ACHAT de transport et non une prestation de conseil : la retenir "
        "noierait les marchés adressables, l'exclure ferait perdre les schémas directeurs logistiques. "
        "L'arbitrage demande de lire des avis réels."
    ),
    "product_design": (
        "6 domaines du pack V10, 91 mots-clés distincts disponibles (le CSV les nomme "
        "`product_design_or_commercial`). Le lexique mêle produit, design et vente ; sans découpage, un filtre "
        "ramènerait les postes commerciaux de toutes les entreprises du territoire."
    ),
    "pmo": (
        "8 domaines du pack V10, 94 mots-clés distincts disponibles. Le terme central, « chef de projet », est "
        "porté par presque tous les métiers : il ne discrimine rien seul et doit être combiné à un référentiel, "
        "ce que le lexique V10 ne fournit pas."
    ),
    "ia": (
        "Pack NEUF, arrivé le 20/09/2026 avec #2633.1 (un ESN spécialisé Data Science / ML / GenAI recevait le "
        "prompt générique IT). Son tri de sources n'est pas curé, et la raison est exactement celle qui a fait "
        "naître le pack : son vocabulaire — data, IA, ML — est celui que `esn_it` matche déjà large. Les deux "
        "référentiels placent ces métiers dans les mêmes familles informatiques, donc un préfixe ROME ou une "
        "division CPV ne distinguerait PAS un ESN IA d'un ESN IT tous domaines ; il ramènerait le tri qu'on "
        "cherche justement à quitter. Le tri doit se faire au niveau de l'INTITULÉ (Data Scientist, ML Engineer, "
        "MLOps, prompt/RAG, Chief AI Officer), ce qui demande une curation sur des offres réelles avant d'être "
        "posé — la même exigence que pour `finance`."
    ),
    "rh": (
        "3 domaines du pack V10, 39 mots-clés distincts disponibles — le plus petit gisement. À ne pas confondre "
        "avec l'axe PLACEMENT (`recruits_for_clients`), qui est orthogonal : vendre du conseil RH et placer des "
        "profils chez ses clients sont deux métiers, et les mêler ferait exploser le signal d'emploi d'un "
        "vendeur de SIRH sans qu'il l'ait demandé."
    ),
    "cyber": (
        "Pack NEUF (#3186.3, 28/09/2026) — même raison que `ia` au 20/09 : un vendeur cyber pur (code "
        "portefeuille CYBER_IAM_GRC) recevait le prisme générique `esn_it`, dont le vocabulaire — RSSI, SOC, "
        "IAM, GRC — est celui que le tri IT matche déjà large (« cyber » figure dans les mots-clés IT du dé-silo "
        "heuristique, `domain_focus._IT_KEYWORDS`). Un préfixe ROME ou une division CPV ne distinguerait donc "
        "PAS un ESN cyber d'un ESN IT tous domaines ; le tri doit se faire au niveau de l'INTITULÉ (RSSI, "
        "pentester, SOC analyst, IAM engineer, DPO), curation à faire sur des offres réelles — même exigence "
        "que pour `ia`."
    ),
    "hse": (
        "Pack NEUF (#3186.5, 28/09/2026). Le code portefeuille QUALITY_VALIDATION_HSE pointait sur "
        "`industrial_engineering`, dont le filtre existant (préfixes ROME H12/H14/H15/H25/I11/I13, "
        "`domain_job_filters._INDUSTRIAL`) porte « qualite fournisseur », « assurance qualite », « metrologie », "
        "« amdec » — vocabulaire QUALITÉ, pas ENVIRONNEMENT : ni ICPE, ni REACH, ni CSRD, ni bilan carbone n'y "
        "figurent. Hériter ce filtre laisserait donc passer la moitié du métier HSE et jetterait l'autre moitié. "
        "Curation dédiée à faire sur des offres réelles avant tout filtre — même exigence que pour `ia` et "
        "`cyber`."
    ),
}


def filter_gap_for(pack: str | None) -> str | None:
    """Pourquoi ce pack n'a pas de tri de sources — ``None`` s'il en a un, s'il
    est le défaut IT, ou s'il n'existe pas.

    Rendre ``None`` pour un pack inconnu est délibéré : ce module DÉCRIT, il ne
    décide de rien. C'est la garde qui refuse qu'un pack existe sans réponse.
    """
    if not pack:
        return None
    return DOMAIN_FILTER_GAPS.get(pack)
