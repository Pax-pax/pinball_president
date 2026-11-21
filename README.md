# Flipper Test

Bac à sable physique du flipper **Ballottage** : Three.js pour le rendu, Rapier (WebAssembly) pour la physique, pensé pour le téléphone en portrait.

## Lancer

```bash
npm install
npm run dev      # serveur local (ouvrir l'URL réseau sur le téléphone)
npm test         # tirs de référence de la physique
npm run build    # dist/index.html autonome (un seul fichier)
```

## Commandes

- Téléphone : moitié gauche / droite de l'écran = flippers. Maintenir à droite quand la bille est dans le couloir = tirer le lanceur, relâcher pour lancer.
- Clavier : Z ou ← (gauche), M ou → (droite), Espace ou ↓ (lanceur).

## Physique

Unités réelles : bille d'acier 27 mm / 80 g, plateau 51 × 107 cm incliné à 6,5°, pas fixe à 480 Hz découplé de l'affichage, détection continue des collisions. Flippers cinématiques (55° de course en ~30 ms), lanceur à ressort, bumpers actifs. Tous les réglages sont en tête de `src/sim.ts`.

`src/sim.ts` ne dépend ni du DOM ni de Three.js : les tests (`test/sim.test.ts`) le font tourner directement dans Node.
