<?php 

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

class DropperController extends AbstractController
{
    #[Route('/api/droppers', name: 'api_droppers')]
    public function list(): Response
    {
        return $this->json([
                [
                    "nom" => "Drive Piéton Intermarché (Saint-Jean-de-Luz)",
                    "latitude" => 43.3892,
                    "longitude" => -1.6585,
                ],
                [
                    "nom" => "Drive Piéton E.Leclerc (Bordeaux Chartrons)",
                    "latitude" => 44.8543,
                    "longitude" => -0.5670,
                ],
                [
                    "nom" => "Point Relais E.Leclerc (Paris Ordener)",
                    "latitude" => 48.8925,
                    "longitude" => 2.3481,
                ],
                [
                    "nom" => "Hyper U (Pontarlier)",
                    "latitude" => 46.9061,
                    "longitude" => 6.3478,
                ],
                [
                    "nom" => "Super U (Marignier)",
                    "latitude" => 46.0890,
                    "longitude" => 6.5015,
                ],
                [
                    "nom" => "Drive E.Leclerc (Sourdeval / Vire)",
                    "latitude" => 48.7231,
                    "longitude" => -0.9118,
                ]
        ]);
    }
}