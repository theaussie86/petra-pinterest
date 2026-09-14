# Pin-Inhalt: Wie gute Vorlagen entstehen

<!-- NOCH NICHT BEFÜLLT -->

> **Hinweis für den Agenten:** Solange die Zeile `NOCH NICHT BEFÜLLT` oben steht,
> ist diese Anleitung leer. Schreib dann **keine** neuen Vorlagen (Schritt B),
> sondern melde dem Menschen, dass die inhaltliche Anleitung bei der Einrichtung
> noch befüllt werden muss. Änderungswünsche (Schritt C) darfst du trotzdem
> abarbeiten, das Feedback gibt dort die Richtung vor.

> **Hinweis für die Einrichtung:** Diese Datei kommt aus der Umgebung des
> Agenten und wird beim Installieren befüllt, entweder mit der bestehenden
> Anleitung des externen Werkzeugs oder neu erstellt. Danach die Markierung
> `NOCH NICHT BEFÜLLT` oben entfernen. Der technische Ablauf in `SKILL.md` und
> `sql.md` bleibt davon unberührt. Die Abschnitte unten sind die Gliederung, die
> der Agent erwartet.

## Pin-Typen und Verteilung auf 30 Positionen

Welche Pin-Typen es gibt, was jeder leistet, wie viele pro Artikel, in welcher
Reihenfolge. Feld: `pin_type`.

## Keyword-Strategie

Hauptkeyword pro Vorlage, Longtails, Suchphrasen, Suchintention. Wie sich die 30
Vorlagen eines Artikels im Keyword unterscheiden.
Felder: `main_keyword`, `longtails`, `search_phrases`, `search_intent`.

## Titel, Beschreibung, Overlay

Länge, Ton, Aufbau. Technische Pflicht: `description` beginnt mit dem
`main_keyword`, höchstens 500 Zeichen, `overlay` enthält das `main_keyword`
wörtlich, Zeilen mit Zeilenumbruch getrennt.
Felder: `title`, `description`, `overlay`.

## Bild-Idee und Bild-Prompt

Aufbau des Prompts, Format (1000 x 1500 Pixel), Stil, was vermieden wird.
Felder: `image_idea`, `image_prompt`.

## Design

Layouts, Bildposition, Schriften, Scroll-Stopper, Farben (Hex).
Feld: `design`.

## Pinnwände

Wie der Pinnwand-Name gewählt wird. Freitext, wird bei der Freigabe einer echten
Pinnwand zugeordnet. Feld: `board_name_raw`.

## Saison

Wann eine Vorlage saisonal ist und wie das notiert wird. Feld: `season`.

## Qualitätscheck

Checkliste, die der Agent pro Vorlage abhakt, bevor er sendet.
Feld: `quality_check`.
