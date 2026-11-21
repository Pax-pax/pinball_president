# Ballottage (pinball_president)

Flipper 3D pour téléphone (portrait), jouable aussi au clavier sur ordinateur. Satire de la présidentielle française 2027, avec une structure de jeu inspirée de Monster Bash (Williams, 1998) : six candidats à « battre », chacun avec son mode, puis une grande finale. Projet de Maxime (motion designer à Marseille), qui pilote et teste sur un Android Samsung pendant que Claude code.

Plan de développement (doc partagé) : https://claude.ai/artifact/4giRGcDRKz5JGjcmqYMJNw

## Commandes

```bash
npm install
npm run dev       # serveur Vite ; ouvrir l'URL réseau sur le téléphone
npm test          # tirs de référence de la physique + tri des secousses (à lancer après TOUTE modif de physique ou de géométrie)
npm run sweep     # frappe depuis chaque flipper à 14 instants : quels éléments sont atteignables
npm run stuck     # lâche la bille sur ~600 points : liste les endroits où elle reste bloquée
npm run browser   # build + captures et contrôles dans Chrome headless (rendu, accéléromètre simulé, clavier)
npm run build     # dist/index.html autonome (Three.js + Rapier WASM inline, ~5 Mo)
```

`npm run browser` cherche Chrome à l'emplacement standard (macOS ou Linux) ; sinon définir `CHROME_PATH`.

## Architecture

- `src/sim.ts` : toute la physique et la géométrie de la table, sans DOM ni Three.js (tourne dans Node pour les tests). Classe `Sim` : `step(input)` avance d'un pas fixe de 1/480 s, `takeEvents()` rend les événements de jeu (flip, bumper, sling, ramp, orbit, hole, kickout, gate, spinner, target, bank, drain, nudge, warning, tilt…). Les constantes réglables sont toutes en tête de fichier.
- `src/main.ts` : rendu Three.js, caméra auto-cadrée en portrait, commandes (tactile, clavier, accéléromètre), boucle à pas fixe découplée de l'affichage, HUD et bandeaux. Les points y sont provisoires (pas encore de règles).
- `src/shake.ts` : détection des secousses du téléphone (pure, testable).
- `src/candidates.ts` : les six candidats (nom, surnom, mode, slogans, couleur), séparés du code.
- `test/` : `sim.test.ts` (24 tirs de référence), `shake.test.ts`, `sweep.ts`, `stuck.ts`, et trois scripts navigateur (`shot.mjs`, `motion.mjs`, `keys.mjs`).

## Repère et unités

Unités réelles : mètres, kilos, secondes. Repère « table » : x vers la droite, y vers le haut (perpendiculaire au plateau), z vers le joueur. Le plateau est plat dans ce repère ; l'inclinaison de 6,5° est portée par la gravité. Dans le rendu, le groupe `table` est tourné de 6,5° autour de x. Bille d'acier 27 mm / 80 g, plateau 51 × 107 cm, couloir de lancement à droite. `mx(x)` donne le symétrique gauche/droite autour de l'axe de l'aire de jeu (`CX`).

## Physique (état actuel)

- Rapier 3D (WASM) avec `world.lengthUnit = 0.05` (objets centimétriques) et CCD sur la bille.
- Flippers cinématiques pilotés par un modèle de bobine : courant qui monte en ~30 ms (`COIL_TAU`), fin de course atteinte en ~29 ms, maintien à 30 % en fin de course (`EOS_HOLD`), ressort de rappel. Un flipper levé cède sous le choc (masse finie via `FLIP_INERTIA`) et un choc juste après l'arrivée en fin de course est absorbé (live catch, `LIVE_CATCH_WINDOW`).
- Matériaux (`MATS`) : élasticité, baisse d'élasticité avec la vitesse d'impact (`fo`), frottement. Valeurs de départ reprises des réglages de référence de la communauté Visual Pinball X.
- `correctBounce()` impose la vitesse de sortie après chaque début de contact latéral, parce que le solveur de Rapier perd une partie de la restitution sur les contacts anticipés. Exclus : sol, vitre, bumpers, capteurs, colliders désactivés, blocs convexes (sauf slingshots). Normale calculée par `projectPoint`.
- Bumpers et slingshots actifs (impulsion propre au contact) ; les bumpers frappent aussi une bille posée contre eux.
- Trous (scoop, couloir du Recomposé, soucoupe) : capture, maintien, éjection (`updateHoles`).
- Secousse et tilt : `nudge(dx, dz)`, deux avertissements puis tilt (flippers coupés jusqu'à la perte de bille).

## Pièges connus

- Toute modification de géométrie peut créer des poches où la bille se coince : lancer `npm run stuck` et regarder les positions de fin regroupées. Les points de départ placés à l'intérieur d'une structure (sous une montée de rampe, dans un toit) sont des faux positifs.
- Les montées de rampe sont pleines jusqu'en haut (`ramp(path, 3)` : 3 segments à rails pleins), avec un biseau sous l'épingle ; seuls l'épingle et le retour sont suspendus (les orbites passent dessous).
- Pas de murs à bout plat là où une bille peut tomber dessus (bouts pointus en haut des orbites, toits en pente derrière les couloirs centraux).
- Les cibles sont décollées des murs (couloir de 35 mm derrière) : une protubérance contre un mur arrête une bille qui le longe.
- Un capteur (`setSensor`) génère aussi des événements de contact : toujours l'exclure des corrections physiques.

## Commandes de jeu

- Téléphone : moitié gauche / droite de l'écran = flippers ; maintenir à droite quand la bille est dans le couloir = lanceur ; glisser vite vers le haut ou pousser le téléphone d'un coup sec = secousse.
- Clavier : ← → ou Maj G / Maj D (flippers), ↓ ou Entrée maintenus (lanceur), Espace ou ↑ (secousse avant), Q / D (secousse gauche / droite), R (nouvelle bille).
- Secousse : comme sur une vraie machine, la bille part à l'opposé de la poussée (`NUDGE_FOLLOWS_PUSH` dans `main.ts` pour inverser).

## Candidats

Les noms, surnoms, slogans et couleurs vivent uniquement dans `src/candidates.ts`. Le dépôt livre des archétypes fictifs (Le Recomposé, L'Union, Le Revenant, Le Tribun, L'Héritière, La Créature des marais) ; Maxime remplace lui-même les textes pour sa version. Ne jamais coder un nom de candidat en dur ailleurs : tout l'affichage lit ce fichier. Chaque camp en prend pour son grade.

| Emplacement | Élément de table | Mode prévu |
| --- | --- | --- |
| recompose | couloir central fermé par une cible (7 coups) | Meeting de lancement : multibille 3 billes, jouet à frapper |
| union | rampes gauche et droite | Union forcée : 3 rampes de chaque côté en alternance, 30 s |
| revenant | cibles R-E-T-O-U-R à droite | Le Retour au scoop : 5 coups |
| tribun | orbites | Fièvre des plateaux : 4 orbites puis 4 hurry-ups |
| heritiere | bumpers | Opération bandelettes : 60 coups de bumpers puis scoop |
| creature | soucoupe | Méga-bassine : 4 coups puis 5 tirs chronométrés |

## Déploiement

- GitHub Pages via `.github/workflows/pages.yml` à chaque push sur `main` (tests + build). Dans les réglages du dépôt : Pages, Source = GitHub Actions. Une adresse https propre est nécessaire pour l'accéléromètre, que les pages hébergées chez Claude bloquent.
- Version de test hébergée chez Claude (sans accéléromètre) : https://claude.ai/artifact/WMHeeBBSWh2uMzw3KfAid1

## Feuille de route

1. ~~Bac à sable physique~~ · ~~Flippers~~ · ~~Maquette grise en éventail~~ · ~~Physique réaliste~~ · ~~Contrôles clavier et accéléromètre~~
2. **Règles et score (prochaine étape)** : couche de règles séparée de `sim.ts` (par ex. `src/rules.ts`) qui consomme les événements ; 3 billes par partie, afficheur, les six modes ci-dessus, ralliements, multibille (la `Sim` ne gère encore qu'une bille), finales « Le Grand Débat » (six modes lancés, 4 billes) et « Union nationale » (six ralliements), « La Manif » (6 tours de spinner), œuf de Pâques « 49.3 » (49e tir dans le scoop). Multiplicateur piloté par les 3 cibles « sondages ».
3. Habillage 3D et visuels satiriques (modélisation Blender, export glTF), jouets (Recomposé qui sort du plateau, Revenant qui se balance).
4. Son et voix (Howler.js), vibrations affinées.
5. App Android via Capacitor, puis stores.

## Conventions

- Code, commentaires, commits et textes du jeu en français.
- Pas de tirets cadratins (—) ni demi-cadratins (–) dans les textes affichés ou rédigés pour Maxime : virgules, points ou parenthèses.
- Après toute modification de physique ou de géométrie : `npm test`, puis `npm run stuck` et `npm run sweep` si la table a bougé. Ajouter un tir de référence dans `test/sim.test.ts` pour chaque nouveau comportement.
- Garder `sim.ts` sans dépendance au DOM ni à Three.js.
