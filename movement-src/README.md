# LEVEL-UP movement

De nieuwe voorkant van LEVEL-UP: klanten boeken een personal trainer, coaches beheren hun agenda, de admin het team.
Licht en rustig, op dezelfde databank als de oude site.

- Live voorbeeld: https://pieterrvds.github.io/LEVEL-UP-/movement/
- Blauwdruk en bouwvolgorde: `HERSTART.md`. Afspraken en stand van zaken: `CLAUDE.md`.

## Werken

```
npm install
npm run dev      # lokaal bekijken
npm run build    # controleert de types en schrijft de site naar ../movement/
```

## Verhuizen naar een eigen repository

Nu staat het project als map in `Pieterrvds/LEVEL-UP-`. Voor een eigen repository en een eigen adres:

1. Pieter maakt op GitHub een lege, publieke repository `level-up-movement` en geeft de Claude-app er toegang toe.
2. De inhoud van deze map wordt de hoofdmap van die repository; in `vite.config.ts` wordt `outDir` weer `dist`.
3. Een GitHub Action bouwt en publiceert bij elke push; Pieter zet één keer Settings → Pages → Source op
   "GitHub Actions". Het adres wordt dan `https://pieterrvds.github.io/level-up-movement/`.
4. De mappen `movement/` en `movement-src/` verdwijnen uit de oude repository.
