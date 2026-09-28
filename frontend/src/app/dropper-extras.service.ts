import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, EMPTY, interval, merge, Observable, of } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import { DropperExtras } from './dropper';
import { environment } from '../environments/environment';

// ---------------------------------------------------------------------------
// INFOS D'EXPLOITATION D'UN DROPPER (statut, casiers, activité récente…).
//
// `getExtras()` émet :
//  1. un premier instantané tout de suite (aujourd'hui : les données
//     d'exemple ci-dessous — demain, au tout premier chargement, ce sera
//     plutôt une réponse Sauron via un appel HTTP classique) ;
//  2. puis un nouvel instantané à chaque poussée du hub MERCURE, dès qu'un
//     Dropper change côté backend — voir `mercureUpdates()` plus bas. C'est
//     ÇA le "rafraîchissement auto" de l'écran : plus besoin d'interroger
//     l'API nous-mêmes à intervalles réguliers, on est prévenus en direct.
//
// ⚠️ À CONFIGURER avant que ça marche pour de vrai : src/environments/
// environment.ts (`mercureHubUrl`, `mercureTopic`). Tant que c'est vide,
// `getExtras()` reste sur les données d'exemple, sans planter.
//
// ⚠️ HYPOTHÈSE À VALIDER avec le backend : on suppose ici que chaque message
// Mercure contient un `Record<string, DropperExtras>` — soit l'instantané
// complet du réseau, soit juste les Droppers qui ont changé (les deux
// marchent avec le `scan` ci-dessous, qui fusionne chaque message reçu dans
// le dernier instantané connu). Si le backend envoie autre chose (un seul
// Dropper à plat, un diff dans un autre format…), c'est le seul endroit à
// adapter : `mercureUpdates()`.
//
// Tant que `getExtras()` garde cette forme de retour, rien d'autre dans
// l'app n'a besoin de changer : ni dropper-list.ts (qui appelle juste
// `getExtras()`), ni `toDetails()` dans dropper-extras.ts (qui ne connaît
// que la forme `DropperExtras`, jamais d'où elle vient ni à quel rythme).
// ---------------------------------------------------------------------------

/**
 * DÉMONSTRATION UNIQUEMENT — à passer à `false` (ou à supprimer avec
 * `demoUpdates()` plus bas) dès que Mercure enverra de vraies mises à jour.
 *
 * Tant que les données sont fictives, aucune panne n'apparaît jamais en cours
 * de route : la liste des pannes et le son d'alerte ne se déclencheraient donc
 * jamais à l'écran. Ce scénario fait tomber puis revenir un dropper en boucle
 * pour pouvoir les montrer.
 */
const DEMO_PANNES = true;
/** Durée de chaque étape du scénario de démonstration. */
const DEMO_STEP_MS = 45_000;

@Injectable({ providedIn: 'root' })
export class DropperExtrasService {
  /**
   * true = dernier événement Mercure connu positif (connexion ouverte ou
   * message reçu) ; false = la connexion vient de tomber. EventSource se
   * reconnecte tout seul (comportement natif du navigateur), donc ce statut
   * remonte tout seul dès que le flux reprend.
   */
  private readonly mercureOk = new BehaviorSubject(true);

  constructor(private zone: NgZone) {}

  getExtras(): Observable<Record<string, DropperExtras>> {
    return merge(of(MOCK_EXTRAS), this.mercureUpdates(), this.demoUpdates()).pipe(
      // Fusionne chaque instantané/patch reçu dans le dernier connu, plutôt
      // que de l'écraser : un message Mercure partiel ne fait pas disparaître
      // les Droppers qu'il ne mentionne pas.
      scan((snapshot, patch) => ({ ...snapshot, ...patch }), {} as Record<string, DropperExtras>),
    );
  }

  /** true = flux Mercure en bonne santé (ou pas encore configuré, ce n'est pas une panne). */
  liveStatus(): Observable<boolean> {
    return this.mercureOk.asObservable();
  }

  private mercureUpdates(): Observable<Record<string, DropperExtras>> {
    if (!environment.mercureHubUrl) return EMPTY; // pas encore configuré : pas d'erreur, juste pas de direct.

    return new Observable<Record<string, DropperExtras>>(subscriber => {
      const url = new URL(environment.mercureHubUrl, window.location.origin);
      url.searchParams.append('topic', environment.mercureTopic);
      const source = new EventSource(url);

      source.onopen = () => this.zone.run(() => this.mercureOk.next(true));

      source.onmessage = event => {
        this.zone.run(() => {
          try {
            subscriber.next(JSON.parse(event.data));
            this.mercureOk.next(true);
          } catch (err) {
            console.error('Message Mercure illisible :', event.data, err);
          }
        });
      };

      source.onerror = () => {
        // Pas d'action manuelle : EventSource retente la connexion tout
        // seul. On se contente de lever le signal pour l'écran.
        this.zone.run(() => this.mercureOk.next(false));
      };

      return () => source.close();
    });
  }

  /**
   * Scénario de démonstration (voir DEMO_PANNES) : Vougy tombe en panne
   * partielle, puis complète, puis se rétablit — en boucle. Émet exactement
   * la même forme de patch que Mercure, donc le reste de l'écran ne fait
   * aucune différence entre les deux.
   */
  private demoUpdates(): Observable<Record<string, DropperExtras>> {
    if (!DEMO_PANNES || environment.mercureHubUrl) return EMPTY;
    return interval(DEMO_STEP_MS).pipe(map(step => DEMO_STEPS[step % DEMO_STEPS.length]));
  }
}

const VOUGY = 'U Marignier (Vougy)';

const MOCK_EXTRAS: Record<string, DropperExtras> = {
  'Intermarché Saint-Pée-sur-Nivelle (Saint-Jean-de-Luz)': {
    address: '24 Boulevard Thiers, 64500 Saint-Jean-de-Luz',
    status: 'ok',
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
  'Leclerc Bordeaux (Chartrons)': {
    address: '38 Quai des Chartrons, 33000 Bordeaux',
    status: 'ok',
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
  // Dropper PARTIELLEMENT bloqué → pin orange clignotant, ligne orange dans la
  // liste des pannes.
  'Leclerc Parinordis (Ordener)': {
    address: '162 Rue Ordener, 75018 Paris',
    status: 'partiel',
    statusSinceMinutesAgo: 26,
    statusReason: 'Une colonne de casiers Frais est neutralisée. Le reste du dropper fonctionne.',
    inUse: true,
    lastUseMinutesAgo: 2,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 9, total: 10 },
      { label: 'Frais', used: 6, total: 8 },
      { label: 'Surgelé', used: 5, total: 6 },
    ],
    ordersToday: 76,
    avgPickup: '34 s',
    satisfaction: 4.5,
    activity: [
      { minutesAgo: 26, text: 'Dropper partiellement bloqué', alert: true },
      { minutesAgo: 9, text: 'Retrait client' },
      { minutesAgo: 25, text: 'Dépôt livreur — 12 commandes' },
      { minutesAgo: 31, text: 'Retrait client' },
    ],
  },
  // Dropper ENTIÈREMENT bloqué → pin rouge clignotant.
  'U Pontarlier (Pontarlier)': {
    address: '1 Rue de Besançon, 25300 Doubs',
    status: 'hs',
    statusSinceMinutesAgo: 72,
    statusReason: 'Capteur de porte en défaut. Intervention technique planifiée.',
    inUse: false,
    lastUseMinutesAgo: 86,
    lastUseLabel: 'Retrait client',
    zones: [
      { label: 'Sec', used: 4, total: 8 },
      { label: 'Frais', used: 3, total: 7 },
      { label: 'Surgelé', used: 2, total: 5 },
    ],
    ordersToday: 15,
    avgPickup: '31 s',
    satisfaction: 4.9,
    activity: [
      { minutesAgo: 72, text: 'Dropper entièrement bloqué', alert: true },
      { minutesAgo: 86, text: 'Retrait client' },
      { minutesAgo: 150, text: 'Dépôt livreur — 4 commandes' },
      { minutesAgo: 188, text: 'Retrait client' },
    ],
  },
  [VOUGY]: {
    address: '1576 Route du Mont Blanc, 74130 Vougy',
    status: 'ok',
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
  'Leclerc Vire (Sourdeval)': {
    address: '11 Avenue Bernardin le Neuf, 50150 Sourdeval',
    status: 'ok',
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

/** Les trois étapes du scénario de démonstration, jouées en boucle (voir DEMO_PANNES). */
const DEMO_STEPS: Record<string, DropperExtras>[] = [
  // 1. Le dropper passe partiellement bloqué.
  {
    [VOUGY]: {
      ...MOCK_EXTRAS[VOUGY],
      status: 'partiel',
      statusSinceMinutesAgo: 0,
      statusReason: 'Une rangée de casiers est bloquée. Diagnostic en cours.',
      activity: [{ minutesAgo: 0, text: 'Dropper partiellement bloqué', alert: true }, ...MOCK_EXTRAS[VOUGY].activity],
    },
  },
  // 2. La panne s'étend : dropper entièrement bloqué.
  {
    [VOUGY]: {
      ...MOCK_EXTRAS[VOUGY],
      status: 'hs',
      inUse: false,
      statusSinceMinutesAgo: 0,
      statusReason: 'Arrêt automatique après blocage répété. Intervention technique demandée.',
      activity: [{ minutesAgo: 0, text: 'Dropper entièrement bloqué', alert: true }, ...MOCK_EXTRAS[VOUGY].activity],
    },
  },
  // 3. Retour à la normale.
  { [VOUGY]: MOCK_EXTRAS[VOUGY] },
];
