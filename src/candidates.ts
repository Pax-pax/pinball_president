// Les six candidats de la table, séparés du code.
// Chaque entrée est un emplacement de jeu (lié à un élément de la table et à un mode).
// Les textes livrés ici sont des archétypes fictifs : remplace `nom`, `surnom` et `slogans`
// par ce que tu veux pour ta version. Le reste du jeu lit uniquement ce fichier.

export type SlotId = 'recompose' | 'union' | 'revenant' | 'tribun' | 'heritiere' | 'creature';

export interface Candidat {
  /** Nom affiché sur la table et à l'écran. */
  nom: string;
  /** Sous-titre court affiché dans les bandeaux. */
  surnom: string;
  /** Monstre de référence (structure de jeu), pour mémoire. */
  reference: string;
  /** Élément de table associé. */
  element: string;
  /** Nom du mode. */
  mode: string;
  /** Phrases affichées en bandeau pendant le mode. */
  slogans: string[];
  /** Couleur des inserts et du texte (hex). */
  couleur: string;
}

export const CANDIDATS: Record<SlotId, Candidat> = {
  recompose: {
    nom: 'Le Recomposé',
    surnom: 'cousu avec des bouts de tous les programmes',
    reference: 'Frankenstein',
    element: 'couloir central fermé par une cible',
    mode: 'Meeting de lancement',
    slogans: ['SYNTHÈSE DES CONTRAIRES', 'ÉLÉMENT DE LANGAGE +1', 'NI GAUCHE NI DROITE, BIEN AU CONTRAIRE'],
    couleur: '#7fd1ff',
  },
  union: {
    nom: "L'Union",
    surnom: 'mariée de force, pour le meilleur et pour le pire',
    reference: 'La Fiancée',
    element: 'rampes gauche et droite',
    mode: 'Union forcée',
    slogans: ['PRIMAIRE DE LA PRIMAIRE', 'ON SE MET D\'ACCORD SUR LE DÉSACCORD', 'MOTION DE SYNTHÈSE'],
    couleur: '#ff6b8a',
  },
  revenant: {
    nom: 'Le Revenant',
    surnom: 'sort de sa retraite tous les cinq ans',
    reference: 'Dracula',
    element: 'cibles R-E-T-O-U-R',
    mode: 'Le Retour',
    slogans: ['CETTE FOIS C\'EST LA BONNE', 'JE NE SUIS JAMAIS PARTI', 'L\'EXPÉRIENCE, ÇA COMPTE'],
    couleur: '#b48cff',
  },
  tribun: {
    nom: 'Le Tribun',
    surnom: 'se transforme dès qu\'on allume les projecteurs',
    reference: 'Loup-garou',
    element: 'orbites',
    mode: 'Fièvre des plateaux',
    slogans: ['COUPEZ PAS, JE N\'AI PAS FINI', 'LE PEUPLE C\'EST MOI', 'CLASH EN DIRECT'],
    couleur: '#ffb14a',
  },
  heritiere: {
    nom: "L'Héritière",
    surnom: 'dynastie embaumée, rebandée à chaque scrutin',
    reference: 'Momie',
    element: 'bumpers',
    mode: 'Opération bandelettes',
    slogans: ['NOUVEAU LOGO, MÊME FAMILLE', 'RAVALEMENT DE FAÇADE', 'L\'ENTREPRISE FAMILIALE'],
    couleur: '#e9d8a6',
  },
  creature: {
    nom: 'La Créature des marais',
    surnom: 'sort de la zone humide',
    reference: 'Créature du lagon',
    element: 'soucoupe (la bassine)',
    mode: 'Méga-bassine',
    slogans: ['SAUVONS LES ZONES HUMIDES', 'VÉLO OBLIGATOIRE', 'COMPOST DE SYNTHÈSE'],
    couleur: '#6fe39a',
  },
};
