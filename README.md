# Mindfuck

## Projekte

| Ordner | Projekt | Einbindung |
| --- | --- | --- |
| [`source Dateien/`](source%20Dateien/) | Agon Agent | Unveränderter Dateistand aus Google Drive |
| [`Operit/`](Operit/) | Operit | Git-Submodul aus `fmaecos/Operit` |

## Operit

[`Operit/`](Operit/) liegt direkt neben `source Dateien/` und verweist als
Git-Submodul auf [`fmaecos/Operit`](https://github.com/fmaecos/Operit).

- **Eingebunden am:** 16. November 2026.
- **Festgelegter Commit:**
  [`7a39941bad80209973c535046a18195c5da9e647`](https://github.com/fmaecos/Operit/commit/7a39941bad80209973c535046a18195c5da9e647).
- **Umfang:** 3.436 Dateien mit insgesamt rund 147 MB sowie zwei eigene
  Submodul-Verweise. Der große Quellbestand wird nicht in die Git-Historie
  dieses Repositories dupliziert.
- **Originalbestand:** Code, Lizenz und Projektdokumentation bleiben im
  Operit-Repository unverändert erhalten.

### Nach dem Klonen laden

Im Hauptverzeichnis dieses Repositories ausführen:

```bash
git submodule update --init --depth 1 -- Operit
```

Operit besitzt selbst die Submodule `terminal` und
`tools/hotbuild/OperitNightlyRelease`; diese werden dabei nicht mitgeladen.
Den Terminal-Quellcode kann man bei Bedarf separat initialisieren:

```bash
git -C Operit submodule update --init --depth 1 -- terminal
```

Das Release-Submodul verwendet im Original eine SSH-URL und kann zusätzliche
Zugriffsrechte benötigen. Weitere Projekt- und Build-Hinweise stehen in
[`Operit/README.md`](Operit/README.md).

## Agon Agent – Quelldateien

Der Ordner [`source Dateien/`](source%20Dateien/) enthält den unveränderten
Dateistand aus dem Google-Drive-Ordner
[`agon-agent`](https://drive.google.com/drive/folders/1Zw8iFtR-wLV85ZyDypXXrY-KXq9Y5tL7).

- **Übernommen am:** 16. November 2026.
- **Umfang:** alle 69 Dateien einschließlich Unterordnern, Assets, Lockfile,
  Lizenz und der für die Offline-Viewer benötigten generierten Dateien.
- **Integrität:** Dateigrößen und MD5-Prüfsummen aller Dateien stimmen mit den
  Drive-Metadaten überein (insgesamt 2.264.536 Bytes).
- **Einbindung:** reguläre Dateien in diesem Repository, kein Git-Submodul.
  Der Drive-Ordner enthält keine Git-Historie; diese konnte daher nicht
  mitübernommen werden. Abhängigkeiten und lokale Caches sind nicht enthalten.

### Lokal starten

```bash
cd "source Dateien"
npm ci
npm run web
```

Für Android bzw. iOS stehen `npm run android` und `npm run ios` zur Verfügung.

### Prüfungen beim Import

Die Prüfungen liefen in separaten Arbeitskopien, ohne die importierten
Quelldateien zu verändern:

- Installation mit `npm ci --ignore-scripts --no-audit --no-fund`: erfolgreich
  (mit Peer-Dependency-Warnungen).
- TypeScript (`tsc --noEmit`): erfolgreich.
- Viewer-Build (`node scripts/build-viewers.mjs`): reproduziert
  `lib/generated/viewers.ts` bytegenau.
- JSON- und JavaScript-Syntaxprüfungen: erfolgreich.
- Im Original gibt es weder ein Lint-Skript noch eine ESLint-Konfiguration.
  Ein zusätzlicher Lauf mit temporärer Expo-Standardkonfiguration, ohne
  generierte Dateien und Drittanbieter-Bundles, meldet **122 Fehler und
  73 Warnungen** im bestehenden Code. Diese wurden beim reinen Import
  bewusst nicht verändert.
