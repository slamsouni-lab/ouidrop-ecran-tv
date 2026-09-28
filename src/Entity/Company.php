<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Le client propriétaire d'un Dropper (table `company` de la base Sauron).
 *
 * On ne mappe que l'identifiant client (ex. "parisnordis", "itm"), le seul
 * champ dont l'écran a besoin pour afficher l'enseigne. Lecture seule, comme
 * Facility : ne jamais lancer schema:update avec cette entité.
 */
#[ORM\Entity]
#[ORM\Table(name: 'company')]
class Company
{
    #[ORM\Id]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    #[ORM\Column(name: 'company_identifier', length: 255, nullable: true)]
    private ?string $companyIdentifier = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCompanyIdentifier(): ?string
    {
        return $this->companyIdentifier;
    }
}
