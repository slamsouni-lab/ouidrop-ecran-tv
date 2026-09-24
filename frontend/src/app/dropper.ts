/** Ce que renvoie l'API Symfony (GET /api/droppers). */
export interface Dropper {
  nom: string;
  latitude: number;
  longitude: number;
}

/** Statut de service d'un Dropper. */
export type ServiceStatus = 'en-service' | 'hors-service';

/** Une zone de température du Dropper (il est tri-température : sec, frais, surgelé). */
export interface DropperZone {
  label: 'Sec' | 'Frais' | 'Surgelé';
  used: number;  // casiers occupés dans cette zone
  total: number; // casiers au total dans cette zone
}

/** Un événement de l'historique d'un Dropper. */
export interface DropperActivity {
  minutesAgo: number; // il y a combien de minutes (au chargement de la page)
  text: string;
  alert?: boolean;    // true = point d'attention (affiché en rouge signal)
}

/**
 * Infos d'exploitation d'un Dropper.
 * FICTIVES pour l'instant (voir dropper-extras.ts) : l'API ne les fournit pas encore.
 */
export interface DropperExtras {
  address: string;
  service: ServiceStatus;
  inUse: boolean;                  // quelqu'un est en train de l'utiliser en ce moment
  lastUseMinutesAgo: number;       // dernière utilisation, en minutes
  lastUseLabel: string;            // ce qui s'est passé à ce moment-là
  outOfServiceMinutesAgo?: number; // seulement si hors service : depuis combien de temps
  outOfServiceReason?: string;     // seulement si hors service : pourquoi
  zones: DropperZone[];
  ordersToday: number;
  avgPickup: string;               // temps de retrait moyen
  satisfaction: number;            // note client sur 5
  activity: DropperActivity[];
}

/** Ce que l'écran affiche : les données de l'API + les infos d'exploitation + le nom découpé. */
export type DropperDetails = Dropper & DropperExtras & {
  enseigne: string; // "Drive Piéton E.Leclerc"
  site: string;     // "Bordeaux Chartrons"
};
