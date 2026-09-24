import * as L from 'leaflet';

// ---------------------------------------------------------------------------
// "leaflet.markercluster" est un plugin écrit avant les modules ES : il ne
// fait pas `import 'leaflet'`, il s'attend juste à trouver `window.L` déjà
// présent au moment où il s'exécute, pour lui accrocher `markerClusterGroup`.
//
// Point important : avec le bundler (esbuild), chaque `import * as L from
// 'leaflet'` écrit dans un fichier différent produit un objet DIFFÉRENT (un
// nouvel objet d'interop ES créé à partir des exports CommonJS de Leaflet,
// pas une référence partagée). Si on exposait `window.L` depuis un objet et
// qu'on appelait ensuite `L.markerClusterGroup(...)` depuis un `L` importé
// ailleurs, ce serait deux objets distincts : le plugin aurait bien modifié
// le premier, mais le second — utilisé pour l'appel — ne verrait rien.
//
// D'où ce module central : c'est LE SEUL endroit qui importe 'leaflet'. Tout
// le reste de l'app doit importer `L` d'ICI (jamais directement de
// 'leaflet'), pour garantir qu'on manipule partout le même objet — celui-là
// même que le plugin, une fois chargé, vient compléter.
//
// L'ordre d'exécution est garanti par les règles d'évaluation des modules ES
// (tous les imports statiques d'un fichier s'évaluent, dans l'ordre du
// fichier, avant le corps de ce fichier) : tant que ce module est importé
// AVANT tout import de 'leaflet.markercluster', `window.L` est prêt à temps.
// ---------------------------------------------------------------------------
(window as unknown as { L: typeof L }).L = L;

export { L };
