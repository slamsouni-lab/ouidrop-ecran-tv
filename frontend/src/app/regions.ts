import { L } from './leaflet-global';

// ---------------------------------------------------------------------------
// Les 13 régions de France métropolitaine, chargées depuis
// public/geo/regions-france.geo.json (contours simplifiés, ~60 ko).
//
// Elles servent à trois choses à l'écran :
//   1. dessiner les frontières sur la carte ;
//   2. savoir dans quelle région se trouve un Dropper (sans rien demander à
//      l'API : c'est un simple test géométrique fait ici) ;
//   3. griser tout le reste du pays quand une région est sélectionnée.
// ---------------------------------------------------------------------------

/** Code INSEE de l'Île-de-France — c'est la "vue Paris" du bandeau. */
export const PARIS_REGION_CODE = '11';

export interface Region {
  code: string;
  nom: string;
  /** Cadre de la région, pour zoomer dessus. */
  bounds: L.LatLngBounds;
  /** Contours en [longitude, latitude] : sert au test d'appartenance. */
  rings: number[][][];
  /** Les mêmes contours en [latitude, longitude] : sert au masque Leaflet. */
  latLngRings: L.LatLngExpression[][];
}

/** Ce que contient le fichier GeoJSON des régions. */
interface RegionFeature {
  properties: { code: string; nom: string; bounds: [[number, number], [number, number]] };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

export function parseRegions(geo: { features: RegionFeature[] }): Region[] {
  return geo.features.map(feature => {
    const polygons: number[][][][] = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : feature.geometry.coordinates as number[][][][];
    const rings = polygons.flat();
    return {
      code: feature.properties.code,
      nom: feature.properties.nom,
      bounds: L.latLngBounds(feature.properties.bounds[0], feature.properties.bounds[1]),
      rings,
      latLngRings: rings.map(ring => ring.map(([lon, lat]) => [lat, lon] as L.LatLngExpression)),
    };
  });
}

/**
 * Le point est-il dans cette région ?
 *
 * Règle "pair-impair" : on compte combien de fois un rayon parti du point
 * traverse les contours. Un nombre impair = on est dedans. Ça gère tout seul
 * les îles (plusieurs contours) comme les enclaves (un contour dans un autre),
 * sans avoir à distinguer les deux cas.
 */
export function regionContains(region: Region, latitude: number, longitude: number): boolean {
  let inside = false;
  for (const ring of region.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [lonI, latI] = ring[i];
      const [lonJ, latJ] = ring[j];
      const straddles = latI > latitude !== latJ > latitude;
      if (straddles && longitude < ((lonJ - lonI) * (latitude - latI)) / (latJ - latI) + lonI) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** La région qui contient ce point, ou null (point en mer, à l'étranger…). */
export function regionAt(regions: Region[], latitude: number, longitude: number): Region | null {
  return regions.find(region => regionContains(region, latitude, longitude)) ?? null;
}
