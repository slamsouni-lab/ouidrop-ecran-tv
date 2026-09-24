import { Dropper, DropperDetails, DropperExtras } from './dropper';

// ---------------------------------------------------------------------------
// DONNÉES D'EXEMPLE — pour que l'écran ait quelque chose de réaliste à montrer.
// Quand l'API fournira ces infos (statut, casiers, activité…), supprime ce
// fichier et récupère-les depuis le back à la place.
// Les clés doivent correspondre EXACTEMENT au champ "nom" renvoyé par l'API.
// ---------------------------------------------------------------------------
export const DROPPER_EXTRAS: Record<string, DropperExtras> = {
  'Drive Piéton Intermarché (Saint-Jean-de-Luz)': {
    address: '12 Avenue de la Concorde, 64500 Saint-Jean-de-Luz',
    service: 'en-service',
    inUse: false,
    lastUseMinutesAgo: 12,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 8, total: 10 },
      { label: 'Frais', used: 6, total: 8 },
      { label: 'Surgelé', used: 4, total: 6 },
    ],
    ordersToday: 34,
    avgPickup: '32 s',
    satisfaction: 4.8,
    activity: [
      { minutesAgo: 12, text: 'Retrait client' },
      { minutesAgo: 47, text: 'Dépôt livreur — 6 commandes' },
      { minutesAgo: 70, text: 'Réapprovisionnement zone Frais' },
      { minutesAgo: 104, text: 'Retrait client' },
    ],
  },
  'Drive Piéton E.Leclerc (Bordeaux Chartrons)': {
    address: '8 Quai des Chartrons, 33000 Bordeaux',
    service: 'en-service',
    inUse: true,
    lastUseMinutesAgo: 1,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 9, total: 10 },
      { label: 'Frais', used: 8, total: 8 },
      { label: 'Surgelé', used: 5, total: 6 },
    ],
    ordersToday: 51,
    avgPickup: '29 s',
    satisfaction: 4.6,
    activity: [
      { minutesAgo: 1, text: 'Retrait client' },
      { minutesAgo: 4, text: 'Retrait client' },
      { minutesAgo: 20, text: 'Dépôt livreur — 9 commandes' },
      { minutesAgo: 33, text: 'Retrait client' },
    ],
  },
  'Point Relais E.Leclerc (Paris Ordener)': {
    address: '45 Rue Ordener, 75018 Paris',
    service: 'en-service',
    inUse: true,
    lastUseMinutesAgo: 2,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 10, total: 10 },
      { label: 'Frais', used: 8, total: 8 },
      { label: 'Surgelé', used: 6, total: 6 },
    ],
    ordersToday: 76,
    avgPickup: '34 s',
    satisfaction: 4.5,
    activity: [
      { minutesAgo: 2, text: 'Casiers pleins — réappro demandé', alert: true },
      { minutesAgo: 9, text: 'Retrait client' },
      { minutesAgo: 25, text: 'Dépôt livreur — 12 commandes' },
      { minutesAgo: 31, text: 'Retrait client' },
    ],
  },
  'Hyper U (Pontarlier)': {
    address: '3 Rue de la République, 25300 Pontarlier',
    service: 'hors-service',
    inUse: false,
    lastUseMinutesAgo: 86,
    lastUseLabel: 'Retrait client',
    outOfServiceMinutesAgo: 72,
    outOfServiceReason: 'Capteur de porte en défaut. Intervention technique planifiée.',
    zones: [
      { label: 'Sec', used: 4, total: 8 },
      { label: 'Frais', used: 3, total: 7 },
      { label: 'Surgelé', used: 2, total: 5 },
    ],
    ordersToday: 15,
    avgPickup: '31 s',
    satisfaction: 4.9,
    activity: [
      { minutesAgo: 72, text: 'Mise hors service — capteur de porte', alert: true },
      { minutesAgo: 86, text: 'Retrait client' },
      { minutesAgo: 150, text: 'Dépôt livreur — 4 commandes' },
      { minutesAgo: 188, text: 'Retrait client' },
    ],
  },
  'Super U (Marignier)': {
    address: '17 Rue des Alpes, 74970 Marignier',
    service: 'en-service',
    inUse: false,
    lastUseMinutesAgo: 18,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 5, total: 8 },
      { label: 'Frais', used: 4, total: 7 },
      { label: 'Surgelé', used: 3, total: 5 },
    ],
    ordersToday: 19,
    avgPickup: '36 s',
    satisfaction: 4.7,
    activity: [
      { minutesAgo: 18, text: 'Retrait client' },
      { minutesAgo: 55, text: 'Dépôt livreur — 5 commandes' },
      { minutesAgo: 97, text: 'Retrait client' },
      { minutesAgo: 195, text: 'Maintenance préventive effectuée' },
    ],
  },
  'Drive E.Leclerc (Sourdeval / Vire)': {
    address: '2 Place du Marché, 50150 Sourdeval',
    service: 'en-service',
    inUse: false,
    lastUseMinutesAgo: 62,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 3, total: 7 },
      { label: 'Frais', used: 2, total: 5 },
      { label: 'Surgelé', used: 1, total: 4 },
    ],
    ordersToday: 8,
    avgPickup: '27 s',
    satisfaction: 4.9,
    activity: [
      { minutesAgo: 62, text: 'Retrait client' },
      { minutesAgo: 138, text: 'Dépôt livreur — 3 commandes' },
      { minutesAgo: 270, text: 'Réapprovisionnement zone Sec' },
      { minutesAgo: 312, text: 'Retrait client' },
    ],
  },
};

/** Valeurs neutres si un dropper de l'API n'a pas (encore) de fiche ci-dessus. */
const DEFAULT_EXTRAS: DropperExtras = {
  address: 'Adresse à venir',
  service: 'en-service',
  inUse: false,
  lastUseMinutesAgo: 0,
  lastUseLabel: 'Aucune donnée',
  zones: [
    { label: 'Sec', used: 0, total: 8 },
    { label: 'Frais', used: 0, total: 6 },
    { label: 'Surgelé', used: 0, total: 6 },
  ],
  ordersToday: 0,
  avgPickup: '—',
  satisfaction: 0,
  activity: [],
};

/**
 * "Drive Piéton E.Leclerc (Bordeaux Chartrons)"
 *   → { enseigne: "Drive Piéton E.Leclerc", site: "Bordeaux Chartrons" }
 */
export function splitName(nom: string): { enseigne: string; site: string } {
  const match = nom.match(/^(.*?)\s*\((.+)\)\s*$/);
  return match ? { enseigne: match[1], site: match[2] } : { enseigne: '', site: nom };
}

/** Fusionne un dropper de l'API avec sa fiche d'exploitation. */
export function toDetails(dropper: Dropper): DropperDetails {
  return {
    ...dropper,
    ...(DROPPER_EXTRAS[dropper.nom] ?? DEFAULT_EXTRAS),
    ...splitName(dropper.nom),
  };
}
