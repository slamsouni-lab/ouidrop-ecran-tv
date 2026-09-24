export const environment = {
  maptilerKey: 'TA_CLE_MAPTILER',

  // Hub Mercure d'où l'écran reçoit les mises à jour en direct (statut,
  // casiers, activité) — voir DropperExtrasService. Laisser vide tant que ce
  // n'est pas configuré : l'écran reste sur les données d'exemple, sans
  // planter, en attendant. Convention Symfony habituelle pour l'URL du hub :
  // '/.well-known/mercure' (même domaine que le backend) — à confirmer.
  mercureHubUrl: '',
  // Topic Mercure auquel s'abonner. À confirmer avec le backend : un seul
  // topic pour tout le réseau (ex. 'https://ouidrop.fr/droppers'), ou un
  // topic par Dropper ? DropperExtrasService suppose ici un topic unique.
  mercureTopic: '',
};
