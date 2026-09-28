<?php

namespace App\Repository;

use App\Entity\Facility;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * Point d'accès aux Droppers en base. C'est ici, et nulle part ailleurs, que
 * vivent les requêtes sur la table `facility` : le contrôleur ne fait que
 * demander "donne-moi les droppers de la carte", sans savoir comment.
 *
 * @extends ServiceEntityRepository<Facility>
 */
class FacilityRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Facility::class);
    }

    /**
     * Les Droppers à afficher sur la carte : actifs et géolocalisés.
     * Un Dropper sans latitude/longitude ne peut pas être placé sur la carte
     * (dans le dump de validation, seuls quelques-uns ont des coordonnées),
     * donc on le laisse de côté.
     *
     * @return list<Facility>
     */
    public function findAllOnMap(): array
    {
        return $this->createQueryBuilder('f')
            // On ramène le client dans la même requête (évite une requête par
            // dropper au moment d'afficher l'enseigne).
            ->leftJoin('f.company', 'c')->addSelect('c')
            ->andWhere('f.isActive = true')
            ->andWhere('f.latitude IS NOT NULL')
            ->andWhere('f.longitude IS NOT NULL')
            ->orderBy('f.displayName', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
