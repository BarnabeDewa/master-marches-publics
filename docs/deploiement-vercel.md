# Déploiement sur Vercel

Cette configuration publie le frontend Mukanda sur Vercel tout en gardant le contrat connecté à Polygon Amoy. Elle ne déploie pas le contrat Solidity et ne convient pas à un déploiement avec des fonds réels.

## Préparer le projet

1. Pousse le dépôt sur GitHub, puis importe-le dans Vercel avec le dossier racine comme répertoire du projet.
2. Dans **Settings > Environment Variables**, ajoute les variables suivantes pour l’environnement Production :

| Variable | Valeur | Visibilité |
| --- | --- | --- |
| `NEXT_PUBLIC_AMOY_RPC_URL` | `https://polygon-amoy-bor-rpc.publicnode.com` | Publique, utilisée par le navigateur |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0x15Ba0b28c6DAc1d865F891c083A61d3E6808b982` | Publique, adresse du contrat |
| `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | `51909186` | Publique, bloc de départ des événements |
| `PINATA_JWT` | JWT du compte Pinata | Secrète, uniquement pour l’API serveur d’upload |

`PINATA_JWT` est facultative si le téléversement IPFS n’est pas utilisé. Ne préfixe jamais cette clé par `NEXT_PUBLIC_`.

## Construire et publier

Vercel détecte Next.js via `vercel.json`. La commande de build exécute les tests du contrat, ESLint, le typecheck TypeScript et le build de production. Une erreur à l’une de ces étapes bloque la publication.

Après le premier déploiement, ouvre l’URL HTTPS de Vercel et vérifie :

- le portail public charge les marchés depuis Polygon Amoy ;
- MetaMask est sur Polygon Amoy (chain ID `80002`) et affiche le bon compte pour le profil choisi ;
- un portefeuille Entreprise peut confirmer `registerCompany()` puis retrouve son rôle après actualisation ;
- l’autorité, le contrôleur et l’administrateur utilisent chacun leur portefeuille distinct ;
- le téléversement Pinata fonctionne si `PINATA_JWT` est configurée.

Les variables `DEPLOYER_PRIVATE_KEY`, `AUTHORITY_ADDRESS` et `CONTROLLER_ADDRESS` servent aux opérations locales de déploiement Hardhat et ne sont pas nécessaires sur Vercel. N’ajoute jamais de clé privée de portefeuille à Vercel. Les comptes actuels sont réservés au testnet ; n’utilise aucun fonds réels.