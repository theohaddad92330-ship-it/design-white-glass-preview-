"""Technologies mentionnées par une offre d'emploi — #3204.2 (épopée #3238),
partie EXTRACTION de LAU-FINAL-210.

> « Pour chaque offre : […] technologies. »

Zéro LLM, zéro appel réseau : cherche dans le TEXTE déjà moissonné (`label` +
`detail`, France Travail / APEC / WTTJ) des mentions EXPLICITES d'un catalogue
de technologies FR+EN fermé — même geste que `remote_policy.py`/`seniority.py`.
Une technologie absente du catalogue n'est jamais devinée depuis un intitulé
générique (« développeur », « ingénieur ») : silence plutôt qu'invention.

Le catalogue est volontairement resserré aux technologies qu'un compte ESN
qualifie réellement (langages, frameworks web, cloud/infra, data, ERP/CRM) —
pas un dictionnaire exhaustif : une liste plus large produirait plus de faux
positifs sur des mots communs (« Go » dans « Go plus loin », par exemple, déjà
exclu ci-dessous faute de forme non ambiguë).
"""

from __future__ import annotations

import re

from app.services.text_norm import normalize_name

# Nom canonique affiché → formes normalisées (minuscules, sans accents)
# recherchées dans le texte. Chaque forme est un MOT ou une expression, jamais
# une racine : "java" ne doit pas matcher "javascript" et inversement, d'où
# deux entrées distinctes.
_TECH_MARKERS: dict[str, tuple[str, ...]] = {
    "Java": ("java",),
    "JavaScript": ("javascript", "js"),
    "TypeScript": ("typescript", "ts"),
    "Python": ("python",),
    "C#": ("c#", "csharp", "c sharp"),
    "C++": ("c++",),
    "PHP": ("php",),
    "Go": ("golang",),
    "Ruby": ("ruby",),
    "Kotlin": ("kotlin",),
    "Swift": ("swift",),
    "Rust": ("rust",),
    "Scala": ("scala",),
    "React": ("react", "reactjs", "react.js"),
    "Angular": ("angular", "angularjs"),
    "Vue.js": ("vue.js", "vuejs", "vue js"),
    "Node.js": ("node.js", "nodejs", "node js"),
    ".NET": (".net", "dotnet"),
    "Spring": ("spring boot", "spring framework"),
    "Django": ("django",),
    "Symfony": ("symfony",),
    "Laravel": ("laravel",),
    "AWS": ("aws", "amazon web services"),
    "Azure": ("azure",),
    "GCP": ("gcp", "google cloud"),
    "Kubernetes": ("kubernetes", "k8s"),
    "Docker": ("docker",),
    "Terraform": ("terraform",),
    "SQL": ("sql",),
    "PostgreSQL": ("postgresql", "postgres"),
    "MongoDB": ("mongodb", "mongo db"),
    "Kafka": ("kafka",),
    "Spark": ("spark",),
    "Hadoop": ("hadoop",),
    "Power BI": ("power bi", "powerbi"),
    "Tableau": ("tableau software",),
    "SAP": ("sap",),
    "Salesforce": ("salesforce",),
    "Dynamics 365": ("dynamics 365", "microsoft dynamics"),
}

# Marqueurs contenant un caractère non alphanumérique (#, +, .) : `\b` ne les
# borne pas correctement (\b n'existe qu'entre un caractère de mot et un
# caractère hors-mot), donc recherche par substring sur le texte PADDÉ
# d'espaces plutôt que par regex à frontière de mot.
_SYMBOL_MARKERS = re.compile(r"[^a-z0-9 ]")


def derive_technologies(*texts: str | None) -> list[str]:
    """Les technologies EXPLICITEMENT nommées dans le texte, dans l'ordre du
    catalogue (déterministe, jamais l'ordre d'apparition — un ordre stable
    évite un diff de test qui ne dépend que de la position dans la phrase).

    Liste vide si aucune forme du catalogue n'apparaît — jamais une
    technologie déduite d'un intitulé générique."""
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    if not combined:
        return []
    padded = f" {combined} "
    found: list[str] = []
    for canonical, markers in _TECH_MARKERS.items():
        for marker in markers:
            if _SYMBOL_MARKERS.search(marker):
                if f" {marker} " in padded or f" {marker}," in padded or f" {marker}." in padded:
                    found.append(canonical)
                    break
            elif re.search(rf"\b{re.escape(marker)}\b", combined):
                found.append(canonical)
                break
    return found


__all__ = ["derive_technologies"]
