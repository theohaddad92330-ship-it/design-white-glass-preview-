"""Ce que le client LIT ne doit jamais parler de notre plomberie.

Le défaut qui a motivé ce module, relevé sur un run réel du 10/08/2026 : le
chiffre d'affaires affiché sur la fiche BlaBlaCar valait

    « 253 millions d'euros (exercice 2023, en hausse de 29 %…, source Usine
      Digitale) - donnée Pappers "revenue_latest" non disponible »

Un nom de fournisseur et un nom de champ interne, dans une valeur qu'un
commercial montre à son prospect. Le modèle n'a rien inventé : le bloc registre
lui est passé en JSON BRUT, avec nos noms de champs dedans, et il a signalé
honnêtement ce qui manquait — avec notre vocabulaire.

D'où deux niveaux, et pas un seul :

1. la consigne de prompt, qui interdit de nommer une source technique ou un
   champ dans une valeur ;
2. **ce module**, qui ne fait PAS confiance au premier. Une consigne oubliée par
   le modèle une fois sur cent produit une fiche gênante ; un filtre
   déterministe, non.

La règle est délibérément ÉTROITE. On ne retire un morceau que s'il porte les
deux marques d'un aveu de plomberie : il nomme un fournisseur de données ET il
dit que la donnée manque (ou cite un identifiant en `serpent_de_mots`, qu'aucune
valeur firmographique légitime ne contient). « (exercice 2023, source Usine
Digitale) » reste donc intact — c'est une vraie citation de source, exactement ce
que le produit demande. Élargir le filtre effacerait des sources vraies, ce qui
serait pire que le défaut qu'il répare.

Et quand il ne reste rien : la valeur devient VIDE. Jamais « N/A », jamais
« non communiqué » — l'absence se dit par l'absence, sinon quelqu'un finit par
lire un marque-place comme une donnée.
"""

from __future__ import annotations

import re

#: Les fournisseurs de données que nous interrogeons. Nommer l'un d'eux dans une
#: valeur, c'est parler de notre chaîne d'approvisionnement à un prospect.
#: Les sources PUBLIQUES citables (INSEE, BODACC, INPI, presse…) n'y sont pas :
#: les citer est justement ce que le produit promet.
_INTERNAL_PROVIDERS = ("pappers", "apollo", "firecrawl", "brave", "serper", "tavily", "salesql", "dropcontact", "crunchbase")

#: « la donnée n'est pas là » — dit avec notre vocabulaire, pas celui du client.
_UNAVAILABLE = re.compile(
    r"non\s+disponible|non\s+renseign|indisponible|absente?\s+de|introuvable|non\s+fournie?"
    r"|ne\s+(?:renseigne|fournit|donne|retourne|remonte)\s+pas|pas\s+de\s+donn[ée]e",
    re.IGNORECASE,
)

#: Un identifiant technique (`revenue_latest`, `naf_code`). Aucune valeur
#: firmographique écrite pour un humain n'en contient.
_SNAKE_CASE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")

#: Les séparateurs qui rattachent un commentaire à une valeur. Le tiret doit être
#: ENTOURÉ d'espaces : « Saint-Denis » et « Rhône-Alpes » ne sont pas des
#: commentaires, et les couper au trait d'union mutilerait des noms de lieux.
_SEGMENT = re.compile(r"\s+[-–—]\s+|\s*;\s*|\s*\|\s*")


def _is_plumbing(segment: str) -> bool:
    """Vrai quand ce morceau parle de NOTRE outillage plutôt que de l'entreprise."""
    lowered = segment.lower()
    names_provider = any(provider in lowered for provider in _INTERNAL_PROVIDERS)
    if not names_provider:
        # Un identifiant technique seul suffit : il ne peut venir que de chez nous.
        return bool(_SNAKE_CASE.search(segment))
    return bool(_UNAVAILABLE.search(segment) or _SNAKE_CASE.search(segment))


def clean_display_value(value: object) -> str:
    """Retire d'une valeur affichée les morceaux qui parlent de notre plomberie.

    Rend `""` quand il ne reste rien : une valeur absente est une réponse, un
    marque-place n'en est pas une.
    """
    if not isinstance(value, str):
        return ""
    kept = [seg.strip() for seg in _SEGMENT.split(value) if seg.strip() and not _is_plumbing(seg)]
    return " - ".join(kept).strip()


#: Les champs que la fiche compte affiche comme des FAITS sur l'entreprise. Ce
#: sont eux qu'un prospect lit en premier, et eux que le défaut a touchés.
#: Volontairement pas les textes longs (description, angles…) : y découper des
#: segments sur un tiret ferait plus de dégâts que le défaut réparé.
DISPLAY_FIRMOGRAPHIC_FIELDS = ("revenue", "employees", "sector", "headquarters")


#: Un nom d'hôte, et rien d'autre. Ni espace, ni parenthèse, ni deux-points.
_HOSTNAME = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")


def clean_website(value: object) -> str:
    """Rend le nom d'hôte d'un site, ou `""`.

    ⚠️ Trouvé en RECETTE LIVE : trois comptes de production portaient de la
    PROSE dans ce champ — « non identifié explicitement dans les sources
    fournies (le site officiel blablacar est notoirement blablacar.fr ». L'écran
    Comptes partait alors chercher un logo pour la phrase entière, un 404 à
    chaque chargement.

    Le modèle répond parfois par une explication au lieu d'une valeur. La règle
    est donc de FORME et non de contenu : ce qui n'est pas un nom d'hôte n'est
    pas un site, et une valeur absente est une réponse — un marque-place n'en
    est pas une. On ne tente surtout pas d'extraire le domaine caché dans la
    phrase : « blablacar.fr » y est cité comme une supposition que le modèle
    dit lui-même ne pas avoir vérifiée.
    """
    if not isinstance(value, str):
        return ""
    host = value.strip().lower()
    if not host:
        return ""
    host = re.sub(r"^https?://", "", host)
    host = host.split("/")[0].split("?")[0]
    host = re.sub(r"^www\.", "", host).strip(". ")
    return host if _HOSTNAME.match(host) else ""


def clean_firmographics(result: dict) -> dict:
    """Nettoie sur place les champs firmographiques affichés. Rend le même dict."""
    for field in DISPLAY_FIRMOGRAPHIC_FIELDS:
        raw = result.get(field)
        if isinstance(raw, str) and raw.strip():
            result[field] = clean_display_value(raw)
    # Le site suit sa propre règle : il n'est pas une valeur affichée en prose,
    # c'est une CLÉ — le relais de logo s'en sert, et la déduplication d'import
    # aussi. Une phrase y est donc un défaut, pas une imprécision.
    website = result.get("website")
    if isinstance(website, str) and website.strip():
        result["website"] = clean_website(website)
    return result
