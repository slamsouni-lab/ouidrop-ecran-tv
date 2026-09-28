import { Dropper, DropperActivity, DropperDetails, DropperExtras, DropperHealth, DropperZone } from './dropper';

// ---------------------------------------------------------------------------
// Fusion pure d'un Dropper (API /api/droppers) avec ses infos d'exploitation
// (aujourd'hui fournies par DropperExtrasService::getExtras(), voir ce
// fichier). Ne sait rien de leur origine — mock aujourd'hui, base/monitoring
// demain.
// ---------------------------------------------------------------------------

/**
 * "Drive Piéton E.Leclerc (Bordeaux Chartrons)"
 *   → { enseigne: "Drive Piéton E.Leclerc", site: "Bordeaux Chartrons" }
 */
export function splitName(nom: string): { enseigne: string; site: string } {
  const match = nom.match(/^(.*?)\s*\((.+)\)\s*$/);
  return match ? { enseigne: match[1], site: match[2] } : { enseigne: '', site: nom };
}

/**
 * LA règle de couleur de l'écran, à un seul endroit : c'est directement l'état
 * de la machine (ok / partiellement bloqué / entièrement bloqué). Le jour où
 * cet état viendra du monitoring, c'est la seule ligne à rebrancher.
 */
export function health(d: Pick<DropperExtras, 'status'>): DropperHealth {
  return d.status;
}

/**
 * Fusionne un dropper de l'API avec sa fiche d'exploitation.
 * `extras` vient de `DropperExtrasService::getExtras()`, indexé par le champ
 * "nom" exact renvoyé par l'API. Un dropper absent de cet objet reçoit une
 * fiche d'exemple fabriquée à partir de son nom (voir `sampleExtras`) : avec
 * un parc de plusieurs dizaines de points, remplir chaque fiche à la main
 * n'aurait aucun sens, et des cases vides à l'écran feraient croire à une
 * panne de l'écran lui-même.
 *
 * L'adresse renvoyée par l'API (elle existe côté Sauron) prime sur celle de
 * la fiche d'exploitation.
 */
export function toDetails(dropper: Dropper, extras: Record<string, DropperExtras>): DropperDetails {
  const fiche = extras[dropper.nom] ?? sampleExtras(dropper.nom);
  const split = splitName(dropper.nom);
  return {
    ...dropper,
    ...fiche,
    address: dropper.address ?? fiche.address,
    // L'enseigne vient de la base quand elle existe (jointure `company`) ;
    // sinon on retombe sur le découpage du nom "Enseigne (Site)".
    enseigne: dropper.enseigne || split.enseigne,
    site: split.site,
  };
}

// ---------------------------------------------------------------------------
// FICHES D'EXEMPLE FABRIQUÉES — à supprimer le jour où on aura les vraies
// infos d'exploitation.
//
// Tout est tiré du NOM du dropper : le même dropper obtient donc toujours
// exactement les mêmes valeurs, d'un rafraîchissement à l'autre comme d'un
// poste à l'autre. C'est indispensable ici : si ces chiffres changeaient à
// chaque appel, l'écran ferait clignoter des pannes imaginaires toutes les
// 30 secondes (et déclencherait l'alerte sonore avec).
// ---------------------------------------------------------------------------

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
function seedFrom(text: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONE_LABELS: DropperZone['label'][] = ['Sec', 'Frais', 'Surgelé'];
/** Raisons de blocage TOTAL (dropper entièrement bloqué). */
const RAISONS_TOTAL = [
  'Capteur de porte en défaut. Intervention technique planifiée.',
  'Module de paiement injoignable. Redémarrage à distance en cours.',
  'Coupure réseau sur site. Opérateur contacté.',
  'Groupe froid en sécurité. Technicien dépêché sur place.',
];
/** Raisons de blocage PARTIEL (une partie du dropper bloquée). */
const RAISONS_PARTIEL = [
  'Une colonne de casiers est neutralisée. Intervention demandée.',
  'Serrure défectueuse sur une porte. Reste du dropper opérationnel.',
  'Zone surgelé en défaut, le reste fonctionne.',
  'Capteur de présence HS sur une rangée.',
];

export function sampleExtras(nom: string): DropperExtras {
  const rand = seedFrom(nom);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  // Pannes rares dans les fiches fabriquées : sur un petit parc, les pannes
  // d'exemple viennent surtout des fiches écrites à la main et du scénario
  // de démonstration (voir dropper-extras.service.ts).
  const tirage = rand();
  const status: DropperHealth = tirage < 0.03 ? 'hs' : tirage < 0.07 ? 'partiel' : 'ok';

  const zones: DropperZone[] = ZONE_LABELS.map((label, index) => {
    const total = [between(8, 12), between(6, 9), between(4, 7)][index];
    return { label, total, used: between(0, total) };
  });

  const lastUseMinutesAgo = between(1, status === 'hs' ? 240 : 90);
  const activity: DropperActivity[] = [
    { minutesAgo: lastUseMinutesAgo, text: 'Retrait client' },
    { minutesAgo: lastUseMinutesAgo + between(10, 40), text: `Dépôt livreur — ${between(3, 14)} commandes` },
    { minutesAgo: lastUseMinutesAgo + between(50, 120), text: 'Retrait client' },
    { minutesAgo: lastUseMinutesAgo + between(130, 260), text: pick(['Réapprovisionnement zone Frais', 'Maintenance préventive effectuée', 'Retrait client']) },
  ];

  const base: DropperExtras = {
    address: 'Adresse à venir',
    status,
    inUse: status !== 'hs' && rand() < 0.25,
    lastUseMinutesAgo,
    lastUseLabel: 'Retrait client',
    zones,
    ordersToday: between(6, 88),
    avgPickup: `${between(24, 48)} s`,
    satisfaction: Math.round((4.1 + rand() * 0.9) * 10) / 10,
    activity,
  };

  if (status === 'ok') return base;

  const depuis = between(10, status === 'hs' ? 300 : 220);
  const label = status === 'hs' ? 'Dropper entièrement bloqué' : 'Dropper partiellement bloqué';
  return {
    ...base,
    statusSinceMinutesAgo: depuis,
    statusReason: pick(status === 'hs' ? RAISONS_TOTAL : RAISONS_PARTIEL),
    activity: [{ minutesAgo: depuis, text: label, alert: true }, ...activity],
  };
}
