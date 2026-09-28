<?php

namespace App\Entity;

use App\Repository\FacilityRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Un Dropper (une "facility") tel qu'il est stocké dans la base Sauron.
 *
 * Cette classe est le MIROIR de la table `facility` de la vraie base de
 * validation (importée localement depuis le dump de Joel). Les noms de
 * colonnes sont donc les VRAIS noms de la base ; ils sont indiqués
 * explicitement (`name: '...'`) pour ne dépendre d'aucune convention de
 * nommage. On ne mappe que les colonnes dont l'écran a besoin — les autres
 * (company_id, ip, port, created_at…) existent en base mais sont simplement
 * ignorées à la lecture.
 *
 * ⚠️ Lecture seule : ne JAMAIS lancer `doctrine:schema:update` avec cette
 * entité. La table est gérée par Sauron et contient plus de colonnes que ce
 * qu'on mappe ici ; schema:update voudrait supprimer celles qu'on ne connaît
 * pas. On lit, on ne modifie pas.
 */
#[ORM\Entity(repositoryClass: FacilityRepository::class)]
#[ORM\Table(name: 'facility')]
class Facility
{
    #[ORM\Id]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id = null;

    /** Le client propriétaire du Dropper (table company). */
    #[ORM\ManyToOne(targetEntity: Company::class)]
    #[ORM\JoinColumn(name: 'company_id', referencedColumnName: 'id')]
    private ?Company $company = null;

    /** Identifiant métier du Dropper (ex. "ORDENER_000007"). */
    #[ORM\Column(name: 'facility_identifier', length: 255)]
    private string $facilityIdentifier = '';

    /** Date de mise en service (première apparition en base). */
    #[ORM\Column(name: 'created_at', type: Types::DATETIME_IMMUTABLE)]
    private ?\DateTimeImmutable $createdAt = null;

    /** Nom affiché du Dropper (ex. "Intermarché", "Demonstrateur Accueil"). */
    #[ORM\Column(name: 'display_name', length: 255)]
    private string $displayName = '';

    #[ORM\Column(length: 255)]
    private string $address = '';

    #[ORM\Column(name: 'zip_code', length: 10)]
    private string $zipCode = '';

    #[ORM\Column(length: 100)]
    private string $city = '';

    #[ORM\Column(type: Types::FLOAT, nullable: true)]
    private ?float $latitude = null;

    #[ORM\Column(type: Types::FLOAT, nullable: true)]
    private ?float $longitude = null;

    /** Un Dropper désactivé n'a pas à apparaître sur l'écran. */
    #[ORM\Column(name: 'is_active', type: Types::BOOLEAN)]
    private bool $isActive = true;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getCompany(): ?Company
    {
        return $this->company;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getFacilityIdentifier(): string
    {
        return $this->facilityIdentifier;
    }

    public function getDisplayName(): string
    {
        return $this->displayName;
    }

    public function getAddress(): string
    {
        return $this->address;
    }

    public function getZipCode(): string
    {
        return $this->zipCode;
    }

    public function getCity(): string
    {
        return $this->city;
    }

    /** L'adresse complète, prête à afficher : "162 Rue Ordener, 75018 Paris". */
    public function getFullAddress(): string
    {
        return trim(sprintf('%s, %s %s', $this->address, $this->zipCode, $this->city));
    }

    public function getLatitude(): ?float
    {
        return $this->latitude;
    }

    public function getLongitude(): ?float
    {
        return $this->longitude;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }
}
