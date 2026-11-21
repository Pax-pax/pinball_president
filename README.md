# Flipper Test

Maquette grise du flipper **Ballottage** : Three.js pour le rendu, Rapier (WebAssembly) pour la physique, pensé pour le téléphone en portrait. Disposition en éventail inspirée des tables Williams de la fin des années 90 (structure de jeu à six personnages façon Monster Bash), habillée en satire de la présidentielle 2027.

## Lancer

```bash
npm install
npm run dev      # serveur local (ouvrir l'URL réseau sur le téléphone)
npm test         # tirs de référence de la physique
npm run sweep    # balayage des tirs depuis chaque flipper
npm run build    # dist/index.html autonome (un seul fichier)
```

## Candidats

Tous les noms, surnoms, slogans et couleurs des six candidats sont dans `src/candidates.ts`, séparés du code. Le dépôt livre des archétypes fictifs ; remplace les textes par ce que tu veux pour ta version.

## Commandes

- Téléphone : moitié gauche / droite de l'écran = flippers. Maintenir à droite quand la bille est dans le couloir = lanceur. Glisser vite vers le haut = secouer la table (tilt au 3e avertissement).
- Clavier : Z ou ← (gauche), M ou → (droite), Espace ou ↓ (lanceur), N ou ↑ (secousse).

## Physique

Unités réelles : bille d'acier 27 mm / 80 g, plateau 51 × 107 cm incliné à 6,5°, pas fixe à 480 Hz découplé de l'affichage, détection continue des collisions. Tous les réglages sont en tête de `src/sim.ts`, qui ne dépend ni du DOM ni de Three.js : les tests le font tourner directement dans Node.
