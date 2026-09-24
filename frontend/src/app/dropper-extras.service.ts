import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { DropperExtras } from './dropper';

// ---------------------------------------------------------------------------
// INFOS D'EXPLOITATION D'UN DROPPER (statut, casiers, activité récente…).
//
// Aujourd'hui : `getExtras()` renvoie des données d'exemple codées en dur,
// ci-dessous, enveloppées dans un Observable pour avoir déjà la même forme
// qu'un futur appel HTTP.
//
// Demain (Sauron) : ce sera le SEUL fichier à modifier. Remplacer le corps
// de `getExtras()` par un vrai appel (par ex. `this.http.get<...>(...)`
// vers l'API Sauron, ou vers un endpoint du backend Symfony qui la relaie),
// puis transformer sa réponse en `Record<string, DropperExtras>` — un objet
// indexé par le champ "nom" EXACT renvoyé par /api/droppers.
//
// Tant que cette forme de retour est respectée, rien d'autre dans l'app n'a
// besoin de changer : ni dropper-list.ts (qui appelle juste `getExtras()`),
// ni `toDetails()` dans dropper-extras.ts (qui ne connaît que la forme
// `DropperExtras`, jamais d'où elle vient).
// ---------------------------------------------------------------------------
@Injectable({ providedIn: 'root' })
export class DropperExtrasService {
  getExtras(): Observable<Record<string, DropperExtras>> {
    return of(MOCK_EXTRAS);
  }
}

const MOCK_EXTRAS: Record<string, DropperExtras> = {
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
