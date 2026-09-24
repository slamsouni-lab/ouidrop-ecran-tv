import {
  AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import { DropperDetails, DropperZone } from '../dropper';
import { Droppers } from '../droppers';
import { toDetails } from '../dropper-extras';
import { ANGLE_DROPPER_PATH, O_ICON_PATH } from '../brand-shapes';
import { environment } from '../../environments/environment';

/** Cadre de la France métropolitaine : sert à cadrer la carte au démarrage. */
const FRANCE_BOUNDS = L.latLngBounds([42.33, -4.8], [51.09, 8.23]);
/** À partir de ce niveau de zoom, on affiche le vrai fond MapTiler (rues, villes…). */
const DETAIL_ZOOM = 8;
/** Style MapTiler utilisé quand on zoome (celui que tu as déjà configuré). */
const MAPTILER_STYLE = 'streets-v2';
/** Mode TV : durée d'affichage de chaque dropper dans le volet. */
const CYCLE_MS = 12_000;
/** Après un clic sur un pin, le défilement attend un peu avant de reprendre. */
const MANUAL_PAUSE_MS = 60_000;
/** Longueur du cercle de la jauge (2 × π × rayon 64). */
const GAUGE_LENGTH = 2 * Math.PI * 64;

/** Quelques villes repères, affichées en discret sur la carte. */
const CITIES: [string, number, number][] = [
  ['Lille', 50.6292, 3.0573], ['Rouen', 49.4432, 1.0999], ['Rennes', 48.1173, -1.6778],
  ['Nantes', 47.2184, -1.5536], ['Tours', 47.3941, 0.6848], ['Strasbourg', 48.5734, 7.7521],
  ['Dijon', 47.322, 5.0415], ['Lyon', 45.764, 4.8357], ['Limoges', 45.8336, 1.2611],
  ['Toulouse', 43.6047, 1.4442], ['Montpellier', 43.6108, 3.8767], ['Marseille', 43.2965, 5.3698],
  ['Nice', 43.7102, 7.262], ['Brest', 48.3904, -4.4861],
];

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
  droppers = signal<DropperDetails[]>([]);
  selectedIndex = signal(0);
  selected = computed(() => this.droppers()[this.selectedIndex()] ?? null);
  isPanelOpen = signal(true);

  // ---------- Chiffres réseau (provisoires : seront branchés sur Mercure) ----------
  orderCount = signal(128);
  ordersLastHour = signal(6);
  averageRating = signal(4.6);

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

  // ---------- Valeurs calculées (se recalculent toutes seules) ----------
  inServiceCount = computed(() => this.droppers().filter(d => d.service === 'en-service').length);
  outOfServiceCount = computed(() => this.droppers().length - this.inServiceCount());
  inUseCount = computed(() => this.droppers().filter(d => d.service === 'en-service' && d.inUse).length);

  clock = computed(() => this.formatClock(this.now()));
  today = computed(() =>
    new Date(this.now()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  ratingLabel = computed(() => this.formatDecimal(this.averageRating()));

  occupancy = computed(() => {
    const zones = this.selected()?.zones ?? [];
    const used = zones.reduce((sum, z) => sum + z.used, 0);
    const total = zones.reduce((sum, z) => sum + z.total, 0);
    return { used, total, percent: total ? Math.round((used / total) * 100) : 0 };
  });
  isFull = computed(() => this.occupancy().percent >= 95);
  gaugeDash = computed(() => `${(this.occupancy().percent / 100) * GAUGE_LENGTH} ${GAUGE_LENGTH}`);
  lastUse = computed(() => this.minutesSince(this.selected()?.lastUseMinutesAgo ?? 0));

  /** Fil d'activité du réseau : d'abord les droppers hors service, puis les derniers événements. */
  feed = computed(() => {
    const alerts = this.droppers()
      .filter(d => d.service === 'hors-service')
      .map(d => ({
        key: 'hs-' + d.nom,
        time: this.clockAt(d.outOfServiceMinutesAgo ?? 0),
        site: d.site,
        text: 'Hors service depuis ' + this.formatAgo(this.minutesSince(d.outOfServiceMinutesAgo ?? 0)),
        alert: true,
      }));
    const events = this.droppers()
      .filter(d => d.service === 'en-service')
      .flatMap(d => d.activity.map(a => ({ ...a, site: d.site, nom: d.nom })))
      .sort((a, b) => a.minutesAgo - b.minutesAgo)
      .slice(0, 5 - alerts.length)
      .map(a => ({
        key: a.nom + a.minutesAgo + a.text,
        time: this.clockAt(a.minutesAgo),
        site: a.site,
        text: a.text,
        alert: !!a.alert,
      }));
    return [...alerts, ...events];
  });

  // ---------- Leaflet ----------
  private map!: L.Map;
  private markers = new Map<string, L.Marker>();
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

  constructor(private droppersService: Droppers, private http: HttpClient) {
    // Dès que le dropper affiché (ou l'ouverture du volet) change :
    // on met à jour le pin mis en avant et le trait de rappel.
    effect(() => {
      const current = this.selected();
      const open = this.isPanelOpen();
      this.markers.forEach((marker, nom) => {
        const isCurrent = open && current?.nom === nom;
        marker.getElement()?.classList.toggle('is-selected', isCurrent);
        marker.setZIndexOffset(isCurrent ? 1000 : 0);
      });
      this.updateLeader();
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
    this.fitFrance();

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
    });
    this.addCities();

    // Les droppers (API) + leurs infos d'exploitation (fictives pour l'instant)
    this.droppersService.getDroppers().subscribe(data => {
      const details = data.map(toDetails);
      details.forEach((d, index) => {
        const marker = L.marker([d.latitude, d.longitude], { icon: this.pinIcon(d), keyboard: false })
          .addTo(this.map)
          .on('click', () => this.select(index, true));
        this.markers.set(d.nom, marker);
      });
      this.droppers.set(details);
      this.select(0);
    });

    // Au-delà d'un certain zoom, on bascule sur le vrai fond de carte MapTiler
    this.map.on('zoomend', () => this.syncDetailLayer());
    this.map.on('move zoom', () => this.updateLeader());

    this.clockTimer = setInterval(() => this.now.set(Date.now()), 15_000);
    setTimeout(() => { this.map.invalidateSize(); this.fitFrance(); }, 0);
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
    clearTimeout(this.cycleTimer);
    this.map?.remove();
  }

  @HostListener('window:resize')
  onResize() {
    this.map.invalidateSize();
    this.fitFrance();
  }

  // ---------- Volet & mode TV ----------

  select(index: number, manual = false) {
    this.selectedIndex.set(index);
    this.isPanelOpen.set(true);
    this.manualPause.set(manual);
    this.cycleKey.update(k => k + 1);
    this.scheduleNext();
  }

  closePanel() {
    this.isPanelOpen.set(false);
    clearTimeout(this.cycleTimer);
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
    const count = this.droppers().length;
    if (!this.autoCycle() || !this.isPanelOpen() || count < 2) return;
    const delay = this.manualPause() ? MANUAL_PAUSE_MS : CYCLE_MS;
    this.cycleTimer = setTimeout(() => this.select((this.selectedIndex() + 1) % count), delay);
  }

  // ---------- Petits utilitaires d'affichage ----------

  /** Une case par casier : true = occupé. */
  cells(zone: DropperZone): boolean[] {
    return Array.from({ length: zone.total }, (_, i) => i < zone.used);
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

  private formatClock(time: number): string {
    return new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Carte ----------

  /** Cadre la France dans l'espace libre entre le volet (à gauche) et la colonne de droite. */
  private fitFrance() {
    const width = this.mapContainer.nativeElement.clientWidth;
    const panelRight = this.panel.nativeElement.offsetLeft + this.panel.nativeElement.offsetWidth;
    const railLeft = this.rail.nativeElement.offsetLeft;
    this.map.fitBounds(FRANCE_BOUNDS, {
      paddingTopLeft: [panelRight + 44, 80],
      paddingBottomRight: [width - railLeft + 24, 60],
    });
  }

  private syncDetailLayer() {
    const detailed = this.map.getZoom() >= DETAIL_ZOOM;
    if (detailed && !this.map.hasLayer(this.detailTiles)) this.detailTiles.addTo(this.map);
    if (!detailed && this.map.hasLayer(this.detailTiles)) this.map.removeLayer(this.detailTiles);
    this.mapContainer.nativeElement.classList.toggle('is-detailed', detailed);
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

  /** Le pin d'un dropper : la silhouette "angle Dropper" de la charte + l'icône "O". */
  private pinIcon(d: DropperDetails): L.DivIcon {
    const state = [
      'pin',
      d.service === 'hors-service' ? 'is-out' : 'is-on',
      d.service === 'en-service' && d.inUse ? 'is-busy' : '',
    ].join(' ');
    return L.divIcon({
      className: state,
      iconSize: [38, 52],
      iconAnchor: [19, 52], // le point bas du pin = la position exacte du dropper
      html: `
        <span class="pin__pulse"></span>
        <svg class="pin__badge" viewBox="0 0 100 100" aria-hidden="true">
          <path class="pin__shape" d="${ANGLE_DROPPER_PATH}"/>
          <path class="pin__o" transform="translate(35.5 21.5) scale(0.52)" d="${O_ICON_PATH}"/>
        </svg>
        <span class="pin__stem"></span>
        <span class="pin__label">${this.escapeHtml(d.site)}</span>`,
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
    const panel = this.panel.nativeElement;
    const pin = this.map.latLngToContainerPoint([current.latitude, current.longitude]);
    const start = this.map.containerPointToLatLng([panel.offsetLeft + panel.offsetWidth, panel.offsetTop + 100]);
    const end = this.map.containerPointToLatLng([pin.x - 30, pin.y - 33]); // juste à gauche du pin
    this.leaderLine.setLatLngs([start, end]);
    this.leaderStart.setLatLng(start).addTo(this.map);
    this.leaderEnd.setLatLng(end).addTo(this.map);
  }

  /** Un nom venant de l'API ne doit jamais pouvoir injecter du HTML dans le pin. */
  private escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }
}
