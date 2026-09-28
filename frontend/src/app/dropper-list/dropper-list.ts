import {
  AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { combineLatest, EMPTY, Subscription, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
// ⚠️ On importe `L` depuis '../leaflet-global', jamais directement depuis
// 'leaflet' : c'est ce module qui expose `L` sur `window` pour le plugin
// "leaflet.markercluster" (voir son commentaire), et il faut réutiliser
// EXACTEMENT le même objet `L`, pas un second objet d'interop équivalent
// mais distinct (voir l'explication détaillée dans leaflet-global.ts).
import { L } from '../leaflet-global';
import 'leaflet.markercluster';
import { DropperDetails, DropperHealth, DropperZone } from '../dropper';
import { Droppers } from '../droppers';
import { health, toDetails } from '../dropper-extras';
import { DropperExtrasService } from '../dropper-extras.service';
import { PARIS_REGION_CODE, Region, parseRegions, regionAt } from '../regions';
import { ANGLE_DROPPER_PATH, O_ICON_PATH } from '../brand-shapes';
import { environment } from '../../environments/environment';

/** Cadre de la France métropolitaine : sert à cadrer la carte au démarrage. */
const FRANCE_BOUNDS = L.latLngBounds([42.33, -4.8], [51.09, 8.23]);
/**
 * Cadrage de la "vue Paris". Les chiffres, eux, portent bien sur toute
 * l'Île-de-France : c'est seulement la carte qui se serre sur Paris et
 * sa proche couronne, là où les droppers sont si
 * proches qu'ils resteraient sinon agglomérés en un seul pin, ce qui était
 * exactement le problème à régler.
 */
const PARIS_BOUNDS = L.latLngBounds([48.8, 2.25], [48.98, 2.67]); // Paris, Épinay et Lognes
/** À partir de ce niveau de zoom, on affiche le vrai fond MapTiler (rues, villes…). */
const DETAIL_ZOOM = 8;
/** À partir de ce niveau de zoom, chaque dropper a son propre pin (plus de regroupement). */
const CLUSTER_MAX_ZOOM = 11;
/**
 * Style MapTiler du fond de carte détaillé.
 *
 * "dataviz" (et non "streets-v2") : c'est un fond conçu pour porter des
 * données par-dessus, sans les noms de commerces, d'hôtels et de restaurants
 * qui saturaient la carte dès qu'on zoomait. Variante sombre si besoin :
 * "dataviz-dark" (le filtre duotone de la charte est alors à retirer).
 */
const MAPTILER_STYLE = 'dataviz';
/** Mode TV : durée d'affichage de chaque dropper dans le volet. */
const CYCLE_MS = 12_000;
/**
 * Fréquence de sondage de la LISTE des droppers (/api/droppers — un point
 * installé ou retiré). Les infos d'exploitation (statut, casiers, activité),
 * elles, arrivent en direct par Mercure et ne dépendent pas de cette valeur
 * — voir DropperExtrasService.
 */
const REFRESH_MS = 30_000;
/** Après un clic sur un pin, le défilement attend un peu avant de reprendre. */
const MANUAL_PAUSE_MS = 60_000;
/** Longueur du cercle de la jauge (2 × π × rayon 64). */
const GAUGE_LENGTH = 2 * Math.PI * 64;
/**
 * Au-delà de ce nombre de pins affichés, les noms sous les pins sont masqués
 * tant qu'on n'a pas zoomé : avec plusieurs dizaines de droppers, les
 * étiquettes se chevauchent et cachent la carte. Le dropper affiché dans le
 * volet garde toujours son nom.
 */
const LABEL_LIMIT = 12;
const LABEL_ZOOM = 9;

/**
 * MODE TV — l'écran est dessiné pour cette taille de référence (un écran
 * d'ordinateur classique), puis agrandi proportionnellement sur plus grand.
 * Sur une télé 4K (3840 × 2160), tout est donc exactement deux fois plus
 * grand qu'ici, sans qu'aucune proportion ne change. On n'applique jamais de
 * réduction en dessous de 1 : sur un écran plus petit que la référence,
 * l'affichage reste celui d'aujourd'hui.
 */
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const MAX_UI_SCALE = 3;

/** Mémorise le choix "son activé / coupé" d'une session à l'autre. */
const SOUND_STORAGE_KEY = 'ouiwatch.alerte-sonore';

/** Quelques villes repères, affichées en discret sur la carte. */
const CITIES: [string, number, number][] = [
  ['Lille', 50.6292, 3.0573], ['Rouen', 49.4432, 1.0999], ['Rennes', 48.1173, -1.6778],
  ['Nantes', 47.2184, -1.5536], ['Tours', 47.3941, 0.6848], ['Strasbourg', 48.5734, 7.7521],
  ['Dijon', 47.322, 5.0415], ['Lyon', 45.764, 4.8357], ['Limoges', 45.8336, 1.2611],
  ['Toulouse', 43.6047, 1.4442], ['Montpellier', 43.6108, 3.8767], ['Marseille', 43.2965, 5.3698],
  ['Nice', 43.7102, 7.262], ['Brest', 48.3904, -4.4861],
];

/** Une panne en cours, telle qu'elle apparaît dans la colonne de droite. */
export interface Panne {
  nom: string;
  health: Exclude<DropperHealth, 'ok'>;
  startedAt: string;      // heure de début (HH:MM)
  sinceLabel: string;     // "depuis 1 h 12"
  enseigne: string;
  site: string;
  text: string;           // ce qui se passe, en une ligne
}

@Component({
  imports: [],
  selector: 'app-dropper-list',
  styleUrl: './dropper-list.css',
  templateUrl: './dropper-list.html',
})
export class DropperList implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('panel') panel!: ElementRef<HTMLElement>; // le conteneur du volet (positionné sur l'écran)
  @ViewChild('rail') rail!: ElementRef<HTMLElement>;

  // ---------- Données ----------
  /** Tout le réseau, tel que renvoyé par l'API. */
  allDroppers = signal<DropperDetails[]>([]);
  /** Les 13 régions métropolitaines (chargées au démarrage, voir regions.ts). */
  regions = signal<Region[]>([]);
  /** Région affichée en ce moment ; null = France entière. */
  regionCode = signal<string | null>(null);
  /** Dropper affiché dans le volet, repéré par son nom (et pas par sa position :
   *  la liste change quand on filtre par région). */
  selectedName = signal<string | null>(null);
  isPanelOpen = signal(true);
  readonly parisCode = PARIS_REGION_CODE;

  /** La région sélectionnée, ou null pour la France entière. */
  region = computed(() => this.regions().find(r => r.code === this.regionCode()) ?? null);

  /** À quelle région appartient chaque dropper (calculé une fois, pas à chaque filtrage). */
  private regionByDropper = computed(() => {
    const regions = this.regions();
    const map = new Map<string, string>();
    if (!regions.length) return map;
    for (const d of this.allDroppers()) {
      const region = regionAt(regions, d.latitude, d.longitude);
      if (region) map.set(d.nom, region.code);
    }
    return map;
  });

  /**
   * Les droppers réellement affichés. TOUT l'écran part de là — carte,
   * compteurs, liste des pannes, défilement du volet — donc sélectionner une
   * région suffit à faire basculer l'écran entier sur cette région.
   */
  droppers = computed(() => {
    const code = this.regionCode();
    if (!code) return this.allDroppers();
    const parRegion = this.regionByDropper();
    return this.allDroppers().filter(d => parRegion.get(d.nom) === code);
  });

  selected = computed(() => {
    const list = this.droppers();
    return list.find(d => d.nom === this.selectedName()) ?? list[0] ?? null;
  });

  /**
   * true si la dernière tentative de rafraîchissement a échoué. On ne vide
   * jamais `allDroppers` dans ce cas : l'écran garde les dernières données
   * connues (mieux vaut un statut vieux de quelques dizaines de secondes
   * qu'un écran noir), on affiche juste un signal discret dans l'en-tête.
   */
  connectionError = signal(false);
  /**
   * Popup fermable, affichée en plus du badge discret au tout début d'une
   * panne (transition ok → erreur). L'utilisateur peut la fermer sans faire
   * disparaître `connectionError` : le badge rouge, lui, reste tant que la
   * panne dure. Elle ne réapparaît pas à chaque tentative ratée tant que la
   * panne est la même — seulement si la connexion revient puis retombe.
   */
  showErrorPopup = signal(false);
  /** Empêche de revenir au 1er dropper à chaque rafraîchissement — seulement au tout premier chargement. */
  private hasLoadedOnce = false;

  // ---------- Horloge : "now" avance toutes les 15 s, tout ce qui en dépend suit ----------
  now = signal(Date.now());
  private readonly loadedAt = Date.now();

  // ---------- Mode TV (défilement automatique du volet) ----------
  autoCycle = signal(true);
  manualPause = signal(false);
  cycleKey = signal(0); // +1 à chaque nouveau dropper → relance la barre de progression
  readonly cycleMs = CYCLE_MS;
  readonly manualPauseMs = MANUAL_PAUSE_MS;
  readonly anglePath = ANGLE_DROPPER_PATH; // forme des pins, réutilisée dans la légende

  /**
   * Facteur d'agrandissement de l'interface (1 sur un écran de référence,
   * 2 sur une télé 4K…). Appliqué en CSS par les variables `--ui-zoom` (tout
   * ce qui est posé sur la carte) et `--pin-scale` (les pins, qui vivent dans
   * la carte elle-même).
   */
  uiScale = signal(1);

  // ---------- Alerte sonore ----------
  soundOn = signal(this.loadSoundPreference());
  private audio?: AudioContext;
  /** Dernier état connu de chaque dropper : sert à repérer une NOUVELLE panne. */
  private previousHealth = new Map<string, DropperHealth>();

  // ---------- Chiffres du réseau (recalculés pour la région affichée) ----------
  orderCount = computed(() => this.droppers().reduce((sum, d) => sum + d.ordersToday, 0));
  ordersLastHour = computed(() => {
    const total = this.orderCount();
    return total > 0 ? Math.max(1, Math.round(total * 0.06)) : 0;
  });
  averageRating = computed(() => {
    const list = this.droppers().filter(d => d.satisfaction > 0);
    if (!list.length) return 0;
    return list.reduce((sum, d) => sum + d.satisfaction, 0) / list.length;
  });

  inServiceCount = computed(() => this.droppers().filter(d => health(d) !== 'hs').length);
  outOfServiceCount = computed(() => this.droppers().filter(d => health(d) === 'hs').length);
  partialCount = computed(() => this.droppers().filter(d => health(d) === 'partiel').length);
  inUseCount = computed(() => this.droppers().filter(d => health(d) !== 'hs' && d.inUse).length);

  clock = computed(() => this.formatClock(this.now()));
  today = computed(() =>
    new Date(this.now()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  ratingLabel = computed(() => (this.averageRating() > 0 ? this.formatDecimal(this.averageRating()) : '—'));
  /** "aucun dropper", "1 dropper", "7 droppers" */
  droppersLabel = computed(() => {
    const n = this.droppers().length;
    return n === 0 ? 'aucun dropper' : `${n} dropper${n > 1 ? 's' : ''}`;
  });

  /** État du dropper affiché dans le volet : 'ok' | 'partiel' | 'hs'. */
  selectedHealth = computed<DropperHealth>(() => {
    const d = this.selected();
    return d ? health(d) : 'ok';
  });

  /** Occupation des casiers (combien sont occupés par une commande). */
  occupancy = computed(() => {
    const zones = this.selected()?.zones ?? [];
    const used = zones.reduce((sum, z) => sum + z.used, 0);
    const total = zones.reduce((sum, z) => sum + z.total, 0);
    return { used, total, percent: total ? Math.round((used / total) * 100) : 0 };
  });
  isFull = computed(() => this.occupancy().percent >= 95);
  gaugeDash = computed(() => `${(this.occupancy().percent / 100) * GAUGE_LENGTH} ${GAUGE_LENGTH}`);
  lastUse = computed(() => this.minutesSince(this.selected()?.lastUseMinutesAgo ?? 0));

  /**
   * LES PANNES EN COURS — c'est tout ce qu'affiche la colonne de droite.
   * Les droppers complètement bloqués passent devant les blocages partiels,
   * et à gravité égale la panne la plus ancienne est en haut (c'est elle qui
   * traîne le plus).
   */
  pannes = computed<Panne[]>(() =>
    this.droppers()
      .map(d => ({ d, state: health(d) }))
      .filter((row): row is { d: DropperDetails; state: Exclude<DropperHealth, 'ok'> } => row.state !== 'ok')
      .map(({ d, state }) => {
        const startedMinutesAgo = d.statusSinceMinutesAgo ?? 0;
        return {
          nom: d.nom,
          health: state,
          startedAt: this.clockAt(startedMinutesAgo),
          sinceLabel: 'depuis ' + this.formatAgo(this.minutesSince(startedMinutesAgo)),
          enseigne: d.enseigne,
          site: d.site,
          text: d.statusReason ?? (state === 'hs' ? 'Dropper entièrement bloqué.' : 'Dropper partiellement bloqué.'),
          startedMinutesAgo,
        };
      })
      .sort((a, b) =>
        a.health === b.health ? b.startedMinutesAgo - a.startedMinutesAgo : a.health === 'hs' ? -1 : 1)
      .map(({ startedMinutesAgo, ...panne }) => panne));

  // ---------- Leaflet ----------
  private map!: L.Map;
  private markers = new Map<string, L.Marker>();
  private markerData = new Map<L.Marker, DropperDetails>();
  // Regroupe les pins proches en un seul pin "nombre" tant qu'on n'est pas assez zoomé.
  private clusterGroup!: L.MarkerClusterGroup;
  /** Contours des régions, et le masque qui grise tout sauf la région choisie. */
  private regionLayers = new Map<string, L.Path>();
  private maskLayer?: L.Polygon;
  // Trait de rappel entre le volet et le pin affiché (façon cote de plan technique)
  private leaderLine!: L.Polyline;
  private leaderStart!: L.CircleMarker;
  private leaderEnd!: L.CircleMarker;
  private detailTiles = L.tileLayer(
    `https://api.maptiler.com/maps/${MAPTILER_STYLE}/256/{z}/{x}/{y}{r}.png?key=${environment.maptilerKey}`,
    {
      minZoom: DETAIL_ZOOM,
      crossOrigin: true,
      attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  );
  private clockTimer?: ReturnType<typeof setInterval>;
  private cycleTimer?: ReturnType<typeof setTimeout>;
  private refreshSubscription?: Subscription;
  private liveStatusSubscription?: Subscription;

  constructor(
    private droppersService: Droppers,
    private extrasService: DropperExtrasService,
    private http: HttpClient,
  ) {
    this.applyScale();

    // Dès que le dropper affiché (ou l'ouverture du volet) change :
    // on met à jour le pin mis en avant et le trait de rappel.
    effect(() => {
      const current = this.selected();
      const open = this.isPanelOpen();
      this.markers.forEach((marker, nom) => {
        // Si le pin est actuellement regroupé (invisible en tant que tel), on ne le
        // met pas en avant lui-même : c'est le pin de regroupement qui le représente.
        const isVisible = this.clusterGroup?.getVisibleParent(marker) === marker;
        const isCurrent = open && current?.nom === nom;
        if (isVisible) {
          marker.getElement()?.classList.toggle('is-selected', isCurrent);
          marker.setZIndexOffset(isCurrent ? 1000 : 0);
        }
      });
      this.updateLeader();
    });

    // Nouvel épisode de panne (la connexion passe de OK à en erreur) :
    // on réaffiche la popup, même si l'utilisateur avait fermé la précédente.
    // Un `set(true)` répété (tant que la panne dure) ne redéclenche pas cet
    // effet : les signaux Angular ignorent une écriture qui ne change rien.
    effect(() => {
      if (this.connectionError()) {
        this.showErrorPopup.set(true);
      }
    });
  }

  ngAfterViewInit() {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.1,             // zooms "fractionnaires" : la France remplit mieux l'écran
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      minZoom: 5,
      maxZoom: 17,
      maxBounds: [[34, -16], [59, 24]],
      maxBoundsViscosity: 0.8,
    });
    L.control.attribution({ prefix: false }).addTo(this.map);
    this.fitCurrentView();

    // Regroupement des pins : tant qu'on n'est pas zoomé sur une zone précise, les
    // droppers proches (même ville, même quartier) sont fusionnés en un seul pin
    // qui affiche leur nombre. Au-delà de CLUSTER_MAX_ZOOM, chaque dropper reprend
    // son pin individuel habituel.
    this.clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: cluster => this.clusterIcon(cluster),
    });

    // Calque dédié au trait de rappel : entre le fond de carte (400) et les pins (600),
    // pour que le trait passe SOUS les pins et leurs noms.
    this.map.createPane('leader').style.zIndex = '550';
    this.leaderLine = L.polyline([], { pane: 'leader', className: 'leader', interactive: false }).addTo(this.map);
    this.leaderStart = L.circleMarker([0, 0], { pane: 'leader', className: 'leader-start', radius: 4, interactive: false });
    this.leaderEnd = L.circleMarker([0, 0], { pane: 'leader', className: 'leader-end', radius: 4, interactive: false });

    // Fond de carte "blueprint" : pays + France dessinés en vectoriel aux couleurs de la charte
    this.http.get<GeoJSON.FeatureCollection>('geo/europe-ouest.geo.json').subscribe(geo => {
      L.geoJSON(geo, {
        interactive: false,
        style: feature => ({ className: feature?.properties?.fr ? 'land land--fr' : 'land' }),
      }).addTo(this.map);
      this.addGraticule();
      this.addRegions();
    });
    this.addCities();

    // Un clic à côté de toute région (la mer, un pays voisin) ramène à la France entière.
    this.map.on('click', () => this.showFrance());

    // La LISTE des droppers (API /api/droppers) change rarement — un nouveau
    // point installé, un retiré — donc un simple sondage périodique suffit.
    const droppers$ = timer(0, REFRESH_MS).pipe(
      switchMap(() =>
        this.droppersService.getDroppers().pipe(
          catchError(err => {
            console.error('Échec du rafraîchissement de la liste des droppers :', err);
            this.connectionError.set(true);
            return EMPTY;
          }),
        ),
      ),
    );

    // Les infos d'EXPLOITATION (statut, casiers, activité) changent tout le
    // temps, elles : on ne les sonde plus nous-mêmes, `getExtras()` est
    // souscrit UNE SEULE FOIS et pousse un nouvel instantané dès que Mercure
    // signale un changement (voir DropperExtrasService). C'est ça, le vrai
    // rafraîchissement "en direct" de l'écran.
    //
    // ⚠️ Ne PAS mettre `extrasService.getExtras()` dans le `switchMap`
    // ci-dessus : ça couperait et rouvrirait la connexion Mercure à chaque
    // tick du minuteur, ce qui viderait le "direct" de son intérêt.
    const extras$ = this.extrasService.getExtras();

    // Statut de la connexion Mercure elle-même (indépendant des données) :
    // dès qu'elle tombe, on lève le badge — `combineLatest` ci-dessous le
    // rabaissera de lui-même à la prochaine émission réussie (droppers OU
    // extras, peu importe laquelle).
    this.liveStatusSubscription = this.extrasService.liveStatus().subscribe(ok => {
      if (!ok) this.connectionError.set(true);
    });

    this.refreshSubscription = combineLatest([droppers$, extras$]).subscribe(([data, extras]) => {
      this.connectionError.set(false);
      const details = data.map(d => toDetails(d, extras));
      this.announceNewPannes(details);
      this.allDroppers.set(details);
      this.refreshMap();
      // Le volet ne saute sur le 1er dropper qu'au tout premier chargement :
      // sur les rafraîchissements suivants, on ne dérange pas ce qui est affiché.
      if (!this.hasLoadedOnce) {
        this.hasLoadedOnce = true;
        this.select(this.droppers()[0]?.nom ?? null);
      }
    });

    // Au-delà d'un certain zoom, on bascule sur le vrai fond de carte MapTiler
    this.map.on('zoomend', () => { this.syncDetailLayer(); this.syncLabelDensity(); });
    this.map.on('move zoom', () => this.updateLeader());

    this.clockTimer = setInterval(() => this.now.set(Date.now()), 15_000);
    setTimeout(() => { this.map.invalidateSize(); this.fitCurrentView(); }, 0);
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
    clearTimeout(this.cycleTimer);
    this.refreshSubscription?.unsubscribe();
    this.liveStatusSubscription?.unsubscribe();
    this.audio?.close();
    this.map?.remove();
  }

  @HostListener('window:resize')
  onResize() {
    this.applyScale();
    this.map.invalidateSize();
    this.fitCurrentView();
  }

  // ---------- Régions ----------

  private addRegions() {
    this.http.get<Parameters<typeof parseRegions>[0]>('geo/regions-france.geo.json').subscribe(geo => {
      const regions = parseRegions(geo);
      this.regions.set(regions);
      for (const region of regions) {
        const layer = L.polygon(region.latLngRings, {
          className: 'region',
          // Un remplissage (même totalement transparent) est nécessaire pour
          // que le clic soit capté à l'intérieur de la région, et pas
          // seulement sur le trait de sa frontière.
          fillOpacity: 0,
          interactive: true,
        }).addTo(this.map);
        layer.on('click', event => {
          L.DomEvent.stopPropagation(event);
          this.selectRegion(region.code);
        });
        this.regionLayers.set(region.code, layer);
      }
      this.refreshMap();
    });
  }

  /** Bascule l'écran entier sur une région (carte, compteurs, pannes, défilement). */
  selectRegion(code: string | null) {
    if (this.regionCode() === code) return;
    this.regionCode.set(code);
    this.manualPause.set(true); // laisse le temps de regarder avant que le défilement reprenne
    this.refreshMap();
    this.fitCurrentView();
    this.select(this.droppers()[0]?.nom ?? null, true);
  }

  showFrance() { this.selectRegion(null); }
  showParis() { this.selectRegion(PARIS_REGION_CODE); }

  /** Combien de droppers dans cette région (sert à griser un bouton vide). */
  countIn(code: string): number {
    const parRegion = this.regionByDropper();
    return this.allDroppers().filter(d => parRegion.get(d.nom) === code).length;
  }

  /**
   * Grise tout le pays sauf la région choisie : un immense rectangle sombre
   * dans lequel la région est découpée (les contours passés après le premier
   * font des trous, règle "pair-impair" du SVG).
   */
  private applyRegionMask() {
    this.maskLayer?.remove();
    this.maskLayer = undefined;
    const region = this.region();
    this.regionLayers.forEach((layer, code) =>
      layer.getElement()?.classList.toggle('is-selected', code === region?.code));
    this.mapContainer.nativeElement.classList.toggle('is-region', !!region);
    if (!region) return;
    const monde: L.LatLngExpression[] = [[-85, -179], [85, -179], [85, 179], [-85, 179]];
    this.maskLayer = L.polygon([monde, ...region.latLngRings], {
      className: 'region-mask',
      interactive: false,
      stroke: false,
    }).addTo(this.map);
  }

  // ---------- Mode TV : mise à l'échelle ----------

  /**
   * Calcule le facteur d'agrandissement et le pose en variables CSS sur la
   * racine du document. `--ui-zoom` agrandit tout ce qui est posé PAR-DESSUS
   * la carte (en-tête, volet, colonne, légende) ; `--pin-scale` agrandit les
   * pins, qui eux sont dessinés par Leaflet À L'INTÉRIEUR de la carte et ne
   * peuvent donc pas être zoomés avec le reste sans casser leur position.
   */
  private applyScale() {
    const scale = this.forcedScale() ?? Math.min(
      MAX_UI_SCALE,
      Math.max(1, Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT)),
    );
    const rounded = Math.round(scale * 100) / 100;
    this.uiScale.set(rounded);
    const root = document.documentElement.style;
    root.setProperty('--ui-zoom', String(rounded));
    // Les pins montent moins vite que le reste : à taille réelle ils
    // deviendraient énormes et masqueraient la carte.
    root.setProperty('--pin-scale', String(Math.round((1 + (rounded - 1) * 0.7) * 100) / 100));
  }

  /**
   * Réglage manuel du grossissement, via l'adresse de la page : `?zoom=1.4`.
   * Utile si la télé a la même définition que l'écran du bureau (l'automatique
   * ne peut alors rien deviner) mais qu'on la regarde de loin : il suffit
   * d'ouvrir l'écran avec ce paramètre sur la télé, et de ne rien changer
   * ailleurs. `?zoom=auto` (ou pas de paramètre) = calcul automatique.
   */
  private forcedScale(): number | null {
    const raw = new URLSearchParams(window.location.search).get('zoom');
    if (!raw || raw === 'auto') return null;
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) && value >= 0.5 && value <= 4 ? value : null;
  }

  // ---------- Alerte sonore ----------

  /**
   * Compare l'état de chaque dropper à l'instantané précédent et joue
   * l'alerte si l'un d'eux vient de se dégrader (tout va bien → bloqué, ou
   * partiellement bloqué → complètement bloqué). Rien au tout premier
   * chargement : les pannes déjà en cours ne sont pas des nouveautés.
   *
   * Volontairement calculé sur TOUT le réseau, même quand l'écran est filtré
   * sur une région : une panne ailleurs reste une panne, et personne ne doit
   * la rater parce que l'écran était resté sur la vue Paris.
   */
  private announceNewPannes(details: DropperDetails[]) {
    const severity: Record<DropperHealth, number> = { ok: 0, partiel: 1, hs: 2 };
    let worst: DropperHealth = 'ok';
    for (const d of details) {
      const state = health(d);
      const before = this.previousHealth.get(d.nom) ?? 'ok';
      if (this.hasLoadedOnce && severity[state] > severity[before] && severity[state] > severity[worst]) {
        worst = state;
      }
      this.previousHealth.set(d.nom, state);
    }
    if (worst !== 'ok') this.playAlert(worst);
  }

  toggleSound() {
    const on = !this.soundOn();
    this.soundOn.set(on);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Navigation privée ou stockage bloqué : tant pis pour la mémorisation.
    }
    // Ce clic est le geste utilisateur qui autorise le son dans le
    // navigateur : on en profite pour débloquer l'audio et faire entendre
    // à quoi ressemble l'alerte.
    if (on) this.playAlert('partiel', true);
  }

  private loadSoundPreference(): boolean {
    try {
      return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  /**
   * Un petit carillon descendant, volontairement doux : deux notes pour un
   * blocage partiel, trois (plus graves) pour un dropper complètement bloqué.
   * Synthétisé à la volée — aucun fichier son à charger, donc rien à gérer
   * côté build, et le volume reste sous contrôle.
   */
  private playAlert(state: Exclude<DropperHealth, 'ok'>, force = false) {
    if (!this.soundOn() && !force) return;
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      if (ctx.state === 'suspended') void ctx.resume();

      // Sol dièse / mi / la : intervalle descendant qui "retombe", sans être strident.
      const notes = state === 'hs' ? [830.6, 622.3, 415.3] : [830.6, 622.3];
      const master = ctx.createGain();
      master.gain.value = 0.14;
      // Coupe les harmoniques hautes : c'est ce qui évite le côté "bip d'ordinateur".
      const softener = ctx.createBiquadFilter();
      softener.type = 'lowpass';
      softener.frequency.value = 2200;
      master.connect(softener).connect(ctx.destination);

      notes.forEach((frequency, i) => {
        const startAt = ctx.currentTime + i * 0.17;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        const envelope = ctx.createGain();
        // Attaque douce puis longue décroissance : une cloche, pas une sonnerie.
        envelope.gain.setValueAtTime(0.0001, startAt);
        envelope.gain.exponentialRampToValueAtTime(1, startAt + 0.03);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.9);
        osc.connect(envelope).connect(master);
        osc.start(startAt);
        osc.stop(startAt + 1);
      });
    } catch (err) {
      // Son refusé par le navigateur (pas encore de geste utilisateur, onglet
      // en arrière-plan…) : l'écran continue normalement, le clignotement
      // suffit à signaler la panne.
      console.warn('Alerte sonore indisponible :', err);
    }
  }

  // ---------- Volet & mode TV ----------

  /** Affiche un dropper dans le volet. `manual` = déclenché par un clic. */
  select(nom: string | null, manual = false) {
    // Un dropper choisi hors de la région affichée (clic sur une panne
    // d'ailleurs) fait d'abord revenir à la France entière, sinon il serait
    // invisible.
    if (nom && !this.droppers().some(d => d.nom === nom)) {
      this.regionCode.set(null);
      this.refreshMap();
      this.fitCurrentView();
    }
    this.selectedName.set(nom);
    this.isPanelOpen.set(true);
    this.manualPause.set(manual);
    this.cycleKey.update(k => k + 1);
    this.scheduleNext();
  }

  closePanel() {
    this.isPanelOpen.set(false);
    clearTimeout(this.cycleTimer);
  }

  /** Ferme juste la popup de panne — le badge discret dans l'en-tête reste affiché tant que la panne dure. */
  dismissErrorPopup() {
    this.showErrorPopup.set(false);
  }

  toggleAutoCycle() {
    this.autoCycle.update(on => !on);
    this.manualPause.set(false);
    this.cycleKey.update(k => k + 1);
    this.scheduleNext();
  }

  /** Programme le passage au dropper suivant (mode TV). */
  private scheduleNext() {
    clearTimeout(this.cycleTimer);
    const list = this.droppers();
    if (!this.autoCycle() || !this.isPanelOpen() || list.length < 2) return;
    const delay = this.manualPause() ? MANUAL_PAUSE_MS : CYCLE_MS;
    this.cycleTimer = setTimeout(() => {
      const current = list.findIndex(d => d.nom === this.selected()?.nom);
      const next = this.droppers()[(current + 1) % this.droppers().length];
      this.select(next?.nom ?? null);
    }, delay);
  }

  // ---------- Petits utilitaires d'affichage ----------

  /** Une case par casier : occupé par une commande, ou libre. */
  cells(zone: DropperZone): ('used' | 'free')[] {
    return Array.from({ length: zone.total }, (_, i) => (i < zone.used ? 'used' : 'free'));
  }

  /** Minutes écoulées depuis un événement, en tenant compte du temps passé depuis le chargement. */
  minutesSince(minutesAgoAtLoad: number): number {
    return minutesAgoAtLoad + Math.floor((this.now() - this.loadedAt) / 60_000);
  }

  /** 4 → "4 min", 72 → "1 h 12", 3000 → "2 j" */
  formatAgo(minutes: number): string {
    if (minutes < 1) return "moins d'1 min";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
    return `${Math.floor(hours / 24)} j`;
  }

  /** Heure (HH:MM) à laquelle a eu lieu un événement. */
  clockAt(minutesAgoAtLoad: number): string {
    return this.formatClock(this.now() - this.minutesSince(minutesAgoAtLoad) * 60_000);
  }

  formatDecimal(value: number): string {
    return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** Date de mise en service → "mai 2024". Vide si la date est absente/invalide. */
  commissioned(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  private formatClock(time: number): string {
    return new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Carte ----------

  /** Remet la carte en accord avec les données et la région affichées. */
  private refreshMap() {
    if (!this.map) return;
    this.syncMarkers(this.droppers());
    this.applyRegionMask();
    this.syncLabelDensity();
  }

  /** Cadre la carte sur la région affichée, ou sur la France entière. */
  private fitCurrentView() {
    const region = this.region();
    if (!region) return this.fitTo(FRANCE_BOUNDS);
    this.fitTo(region.code === PARIS_REGION_CODE ? PARIS_BOUNDS : region.bounds);
  }

  /**
   * Cadre la carte sur une zone, dans l'espace libre entre le volet (à
   * gauche) et la colonne de droite. Les marges sont lues à l'écran
   * (getBoundingClientRect) et non sur la mise en page : en mode TV,
   * l'interface est agrandie par un `zoom` CSS, et seul le rectangle
   * réellement affiché donne la bonne valeur.
   */
  private fitTo(bounds: L.LatLngBounds) {
    const mapRect = this.mapContainer.nativeElement.getBoundingClientRect();
    const panelRect = this.panel.nativeElement.getBoundingClientRect();
    const railRect = this.rail.nativeElement.getBoundingClientRect();
    const scale = this.uiScale();
    this.map.fitBounds(bounds, {
      paddingTopLeft: [panelRect.right - mapRect.left + 44 * scale, 80 * scale],
      paddingBottomRight: [mapRect.right - railRect.left + 24 * scale, 90 * scale],
    });
  }

  private syncDetailLayer() {
    const detailed = this.map.getZoom() >= DETAIL_ZOOM;
    if (detailed && !this.map.hasLayer(this.detailTiles)) this.detailTiles.addTo(this.map);
    if (!detailed && this.map.hasLayer(this.detailTiles)) this.map.removeLayer(this.detailTiles);
    this.mapContainer.nativeElement.classList.toggle('is-detailed', detailed);
  }

  /**
   * Masque les noms sous les pins quand il y en a trop à l'écran : avec
   * plusieurs dizaines de droppers, les étiquettes se chevauchent et cachent
   * la carte. Elles réapparaissent dès qu'on zoome sur une zone précise (ou
   * qu'on filtre sur une région peu dense) — et le dropper affiché dans le
   * volet garde toujours son nom, lui.
   */
  private syncLabelDensity() {
    if (!this.map) return;
    const dense = this.droppers().length > LABEL_LIMIT && this.map.getZoom() < LABEL_ZOOM;
    this.mapContainer.nativeElement.classList.toggle('is-dense', dense);
  }

  /** Quadrillage "plan technique" : un trait par degré + une petite croix à chaque intersection. */
  private addGraticule() {
    const lines: L.LatLngExpression[][] = [];
    const crosses: L.LatLngExpression[][] = [];
    for (let lon = -14; lon <= 22; lon++) lines.push([[34, lon], [59, lon]]);
    for (let lat = 34; lat <= 59; lat++) lines.push([[lat, -16], [lat, 24]]);
    for (let lon = -14; lon <= 22; lon++) {
      for (let lat = 35; lat <= 58; lat++) {
        crosses.push([[lat, lon - 0.07], [lat, lon + 0.07]], [[lat - 0.05, lon], [lat + 0.05, lon]]);
      }
    }
    L.polyline(lines, { className: 'map-graticule', interactive: false }).addTo(this.map);
    L.polyline(crosses, { className: 'map-cross', interactive: false }).addTo(this.map);
  }

  private addCities() {
    for (const [name, lat, lon] of CITIES) {
      L.marker([lat, lon], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'city', iconSize: [6, 6], iconAnchor: [3, 3], html: `<span class="city__label">${name}</span>` }),
      }).addTo(this.map);
    }
  }

  /**
   * Le pin d'un dropper : la silhouette "angle Dropper" de la charte + l'icône "O".
   *
   * Trois états seulement, et ce sont les mêmes partout sur l'écran :
   * bleu (tout va bien), orange clignotant (une partie des casiers est
   * bloquée), rouge clignotant (tout le dropper est bloqué). Le fait qu'un
   * dropper soit en cours d'utilisation ne change plus rien ici : c'est une
   * information de confort, elle reste dans le volet de détail et n'a pas à
   * animer la carte en permanence.
   */
  private pinIcon(d: DropperDetails): L.DivIcon {
    return L.divIcon({
      className: ['pin', 'pin--' + health(d)].join(' '),
      iconSize: [38, 52],
      iconAnchor: [19, 52], // le point bas du pin = la position exacte du dropper
      html: `
        <span class="pin__scale">
          <svg class="pin__badge" viewBox="0 0 100 100" aria-hidden="true">
            <path class="pin__shape" d="${ANGLE_DROPPER_PATH}"/>
            <path class="pin__o" transform="translate(35.5 21.5) scale(0.52)" d="${O_ICON_PATH}"/>
          </svg>
          <span class="pin__stem"></span>
          <span class="pin__label">${this.escapeHtml(d.site)}</span>
        </span>`,
    });
  }

  /**
   * Met à jour les pins de la carte à partir des dernières données reçues.
   * Les pins déjà présents sont rafraîchis sur place (icône, données liées) —
   * jamais détruits puis recréés, sinon on perdrait la sélection en cours et
   * ça clignoterait à l'écran à chaque rafraîchissement automatique.
   *
   * Cette même méthode sert au filtrage par région : elle retire les pins
   * absents de la liste qu'on lui passe, donc la carte ne montre jamais que
   * les droppers de la région affichée.
   */
  private syncMarkers(details: DropperDetails[]) {
    const seen = new Set<string>();
    let clusterNeedsRefresh = false;
    details.forEach(d => {
      seen.add(d.nom);
      const existing = this.markers.get(d.nom);
      if (existing) {
        const before = this.markerData.get(existing);
        if (before && health(before) !== health(d)) clusterNeedsRefresh = true;
        existing.setIcon(this.pinIcon(d));
        existing.off('click').on('click', () => this.select(d.nom, true));
        this.markerData.set(existing, d);
        return;
      }
      const marker = L.marker([d.latitude, d.longitude], { icon: this.pinIcon(d), keyboard: false })
        .on('click', () => this.select(d.nom, true));
      this.markers.set(d.nom, marker);
      this.markerData.set(marker, d);
      this.clusterGroup.addLayer(marker);
    });

    // Dropper retiré de l'API, ou simplement hors de la région affichée.
    for (const [nom, marker] of this.markers) {
      if (!seen.has(nom)) {
        this.clusterGroup.removeLayer(marker);
        this.markerData.delete(marker);
        this.markers.delete(nom);
      }
    }

    if (!this.map.hasLayer(this.clusterGroup)) {
      this.clusterGroup.addTo(this.map);
    }
    // Un pin regroupé ne se redessine pas tout seul quand l'état d'un de ses
    // membres change : sans ça, un groupe resterait bleu alors qu'un de ses
    // droppers vient de tomber en panne.
    if (clusterNeedsRefresh) this.clusterGroup.refreshClusters();
  }

  /**
   * Le pin de regroupement : même silhouette "angle Dropper" que les pins normaux,
   * mais avec le nombre de droppers du groupe à la place du "O".
   *
   * Même règle de couleur que pour un pin individuel, appliquée au groupe :
   * rouge seulement si TOUS les droppers du groupe sont bloqués, orange dès
   * qu'une partie l'est, bleu sinon. Le chiffre affiché est le total du
   * groupe, donc un pin rouge avec "2" veut bien dire "2 droppers, 2 en
   * panne" ; dans un groupe mixte, le petit badge du coin donne le nombre
   * exact de droppers concernés.
   */
  private clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
    const members = cluster.getAllChildMarkers()
      .map(m => this.markerData.get(m))
      .filter((d): d is DropperDetails => !!d);
    const states = members.map(d => health(d));
    const impacted = states.filter(s => s !== 'ok').length;
    const allOut = states.length > 0 && states.every(s => s === 'hs');
    const state = allOut ? 'hs' : impacted > 0 ? 'partiel' : 'ok';
    return L.divIcon({
      className: ['pin', 'pin--cluster', 'pin--' + state].join(' '),
      iconSize: [38, 52],
      iconAnchor: [19, 52],
      html: `
        <span class="pin__scale">
          <svg class="pin__badge" viewBox="0 0 100 100" aria-hidden="true">
            <path class="pin__shape" d="${ANGLE_DROPPER_PATH}"/>
            <text class="pin__count" x="52" y="56" text-anchor="middle" dominant-baseline="central">${cluster.getChildCount()}</text>
          </svg>
          ${!allOut && impacted > 0 ? `<span class="pin__alert" title="${impacted} dropper(s) en panne dans ce groupe">${impacted}</span>` : ''}
          <span class="pin__stem"></span>
        </span>`,
    });
  }

  /**
   * Relie le bord du volet au pin affiché.
   * Le départ est un point fixe de l'ÉCRAN (le bord du volet) : on le convertit en
   * coordonnées GPS à chaque mouvement de carte pour que le trait suive.
   */
  private updateLeader() {
    if (!this.leaderLine) return; // la carte n'est pas encore prête
    const current = this.selected();
    if (!current || !this.isPanelOpen()) {
      this.leaderLine.setLatLngs([]);
      this.leaderStart.remove();
      this.leaderEnd.remove();
      return;
    }
    // Si le pin du dropper sélectionné est regroupé, le trait pointe vers le pin
    // de regroupement qui le représente actuellement à l'écran.
    const marker = this.markers.get(current.nom);
    const target = (marker && this.clusterGroup?.getVisibleParent(marker)) || marker;
    if (!target) return;
    const scale = this.uiScale();
    const mapRect = this.mapContainer.nativeElement.getBoundingClientRect();
    const panelRect = this.panel.nativeElement.getBoundingClientRect();
    const pin = this.map.latLngToContainerPoint(target.getLatLng());
    const start = this.map.containerPointToLatLng([
      panelRect.right - mapRect.left,
      panelRect.top - mapRect.top + 100 * scale,
    ]);
    const end = this.map.containerPointToLatLng([pin.x - 30 * scale, pin.y - 33 * scale]); // juste à gauche du pin
    this.leaderLine.setLatLngs([start, end]);
    this.leaderStart.setLatLng(start).addTo(this.map);
    this.leaderEnd.setLatLng(end).addTo(this.map);
  }

  /** Un nom venant de l'API ne doit jamais pouvoir injecter du HTML dans le pin. */
  private escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }
}
