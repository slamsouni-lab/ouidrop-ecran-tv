import { Dropper, DropperDetails, DropperExtras } from './dropper';

// ---------------------------------------------------------------------------
// Fusion pure d'un Dropper (API /api/droppers) avec ses infos d'exploitation
// (aujourd'hui fournies par DropperExtrasService::getExtras(), voir ce
// fichier). Ne sait rien de leur origine — mock aujourd'hui, Sauron demain.
// ---------------------------------------------------------------------------

/** Valeurs neutres si un dropper n'a pas (encore) de fiche d'exploitation. */
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

/**
 * Fusionne un dropper de l'API avec sa fiche d'exploitation.
 * `extras` vient de `DropperExtrasService::getExtras()`, indexé par le champ
 * "nom" exact renvoyé par l'API — un dropper absent de cet objet (pas encore
 * de fiche) retombe sur des valeurs neutres plutôt que de planter l'écran.
 */
export function toDetails(dropper: Dropper, extras: Record<string, DropperExtras>): DropperDetails {
  return {
    ...dropper,
    ...(extras[dropper.nom] ?? DEFAULT_EXTRAS),
    ...splitName(dropper.nom),
  };
}
