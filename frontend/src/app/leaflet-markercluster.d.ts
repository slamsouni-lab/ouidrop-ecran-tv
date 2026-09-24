// ---------------------------------------------------------------------------
// Déclarations de types pour "leaflet.markercluster".
// Ce paquet ne fournit pas ses propres types, et on n'a pas besoin d'installer
// un paquet @types séparé : on déclare ici juste ce qu'on utilise vraiment.
// ---------------------------------------------------------------------------
import * as L from 'leaflet';

declare module 'leaflet' {
  interface MarkerClusterGroupOptions extends L.LayerOptions {
    maxClusterRadius?: number;
    disableClusteringAtZoom?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    iconCreateFunction?: (cluster: MarkerCluster) => L.DivIcon;
  }

  interface MarkerCluster extends L.Marker {
    getChildCount(): number;
    getAllChildMarkers(): L.Marker[];
  }

  interface MarkerClusterGroup extends L.FeatureGroup {
    addLayer(layer: L.Layer): this;
    getVisibleParent(marker: L.Marker): L.Marker | null;
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}

declare module 'leaflet.markercluster';
