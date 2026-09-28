/**
 * Ce que renvoie l'API Symfony (GET /api/droppers).
 *
 * `id` et `address` sont facultatifs côté écran : ils existent dans la
 * réponse Sauron comme dans le parc d'exemple actuel, mais l'écran sait
 * fonctionner sans (il retombe alors sur l'adresse de la fiche
 * d'exploitation).
 */
export interface Dropper {
  id?: string;
  nom: string;
  latitude: number;
  longitude: number;
  address?: string;
  /** Le client / enseigne propriétaire (ex. "Parisnordis"). Vient de la base. */
  enseigne?: string;
  /** La ville du dropper. Vient de la base. */
  ville?: string;
  /** Date de mise en service (ISO 8601). Vient de la base. */
  misEnServiceLe?: string;
}

/**
 * L'état d'un Dropper, tel qu'il colore le pin et pilote la liste des pannes.
 * C'est un état de la MACHINE ENTIÈRE, pas un décompte de casiers :
 *   'ok'      → tout fonctionne              → pin bleu, fixe
 *   'partiel' → dropper partiellement bloqué → pin orange, clignotant
 *   'hs'      → dropper entièrement bloqué   → pin rouge, clignotant
 *
 * C'est la seule notion de couleur/gravité de l'écran : pins, pastilles de la
 * liste des pannes et pastilles du volet s'en servent toutes.
 *
 * ⚠️ La vraie source de cet état viendra du monitoring (piste Grafana / base) :
 * un dropper "partiellement" ou "entièrement" bloqué. En attendant, il est
 * simulé (voir dropper-extras.ts et dropper-extras.service.ts).
 */
export type DropperHealth = 'ok' | 'partiel' | 'hs';

/** Une zone de température du Dropper (il est tri-température : sec, frais, surgelé). */
export interface DropperZone {
  label: 'Sec' | 'Frais' | 'Surgelé';
  used: number;    // casiers occupés par une commande
  total: number;   // casiers au total dans cette zone
}

/** Un événement de l'historique d'un Dropper. */
export interface DropperActivity {
  minutesAgo: number; // il y a combien de minutes (au chargement de la page)
  text: string;
  alert?: boolean;    // true = point d'attention (affiché en rouge signal)
}

/**
 * Infos d'exploitation d'un Dropper.
 * FICTIVES pour l'instant (voir dropper-extras.service.ts) : l'API ne les
 * fournit pas encore.
 */
export interface DropperExtras {
  address: string;
  /** État de la machine : ok / partiellement bloqué / entièrement bloqué. */
  status: DropperHealth;
  /** Depuis combien de temps le dropper est bloqué (si status ≠ 'ok'). */
  statusSinceMinutesAgo?: number;
  /** Pourquoi il est bloqué (si status ≠ 'ok'). */
  statusReason?: string;
  inUse: boolean;                  // quelqu'un est en train de l'utiliser en ce moment
  lastUseMinutesAgo: number;       // dernière utilisation, en minutes
  lastUseLabel: string;            // ce qui s'est passé à ce moment-là
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
