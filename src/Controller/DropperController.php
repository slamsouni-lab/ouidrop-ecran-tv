<?php

namespace App\Controller;

use App\Entity\Facility;
use App\Repository\FacilityRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Liste des Droppers affichés sur l'écran OuiWatch (GET /api/droppers).
 *
 * Lit la table `facility` (+ `company`) de la base Sauron. On renvoie TOUT ce
 * qu'on peut tirer de propre de la base : nom de site nettoyé, client,
 * adresse, ville, référence technique, date de mise en service, position.
 *
 * ⚠️ Nettoyage à la LECTURE uniquement : on ne modifie jamais la base (accès
 * lecture seule, ce sont les données de Sauron). Le `display_name` brut reste
 * intact en base ; on l'embellit seulement au moment de le renvoyer.
 *
 * ⚠️ Ce que la base NE donne PAS : le statut (bloqué / en marche), l'occupation
 * des casiers, l'activité récente — ça vient des trames de maintenance
 * (monitoring). Ces infos-là restent simulées côté frontend pour l'instant.
 */
final class DropperController extends AbstractController
{
    #[Route('/api/droppers', name: 'api_droppers', methods: ['GET'])]
    public function list(FacilityRepository $facilities): JsonResponse
    {
        return $this->json(array_map(
            static fn (Facility $f): array => [
                'id' => $f->getFacilityIdentifier(),
                'nom' => self::prettySite($f->getDisplayName()),
                'enseigne' => self::prettyClient($f->getCompany()?->getCompanyIdentifier()),
                'ville' => $f->getCity(),
                'address' => $f->getFullAddress(),
                'latitude' => $f->getLatitude(),
                'longitude' => $f->getLongitude(),
                'misEnServiceLe' => $f->getCreatedAt()?->format('c'),
            ],
            $facilities->findAllOnMap(),
        ));
    }

    /**
     * Rend un `display_name` technique présentable, sans toucher à la base :
     *   "ORDENER_000007"  → "Ordener"
     *   "FLANDRES_000007" → "Flandres"
     *   "LeclercVillette" → "Leclerc Villette"
     *   "Intermarché"     → "Intermarché" (déjà propre, laissé tel quel)
     */
    private static function prettySite(string $raw): string
    {
        $s = $raw;
        $s = preg_replace('/[_-]?\d{3,}$/u', '', $s);          // enlève un suffixe technique (_000007)
        $s = preg_replace('/(?<=\p{Ll})(?=\p{Lu})/u', ' ', $s); // coupe le camelCase : LeclercVillette → Leclerc Villette
        $s = trim(preg_replace('/[\s_-]+/u', ' ', $s));         // séparateurs → espace
        if ($s === '') {
            return $raw; // sécurité : on ne renvoie jamais une chaîne vide
        }
        // Un mot ÉCRIT EN CAPITALES (ORDENER) est remis en "Ordener" ;
        // un mot déjà en casse mixte (Intermarché) est laissé intact.
        $words = array_map(
            static fn (string $w): string => mb_strtoupper($w, 'UTF-8') === $w
                ? mb_convert_case($w, MB_CASE_TITLE, 'UTF-8')
                : $w,
            explode(' ', $s),
        );

        return implode(' ', $words);
    }

    /**
     * Rend l'identifiant client présentable :
     *   "parisnordis" → "Parisnordis" ;  "itm" → "ITM" ;  "OUIDROP" → "OUIDROP"
     */
    private static function prettyClient(?string $raw): string
    {
        if ($raw === null || trim($raw) === '') {
            return '';
        }
        $s = trim(preg_replace('/[\s_-]+/u', ' ', $raw));
        // Sigle court (≤ 4 lettres, ex. "itm") → majuscules ; sinon Capitalisé.
        return mb_strlen($s, 'UTF-8') <= 4
            ? mb_strtoupper($s, 'UTF-8')
            : mb_convert_case($s, MB_CASE_TITLE, 'UTF-8');
    }
}
