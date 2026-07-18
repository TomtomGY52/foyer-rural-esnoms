# Checklist - Déploiement Cloud Sécurisé & Intégration GitHub

- `[x]` Installation de Node.js et npm sur Linux Mint
- `[x]` Configuration de Git, création du `.gitignore` et premier commit local
- `[ ]` Association avec le dépôt GitHub distant et push initial (À faire manuellement par l'utilisateur)
- `[x]` Connexion au compte Firebase via CLI (`projects:list` ou `login`)
- `[x]` Création du nouveau projet Firebase via CLI (`foyer-rural-esnoms`)
- `[x]` Initialisation locale des fichiers de configuration Firebase (`firebase.json`, `firestore.rules`, `storage.rules`)
- `[x]` Ajout des scripts Firebase Auth & Storage dans `index.html`
- `[x]` Conception et intégration de la structure HTML de l'écran d'authentification dans `index.html`
- `[x]` Ajout du bouton "Se déconnecter" dans la barre latérale gauche
- `[x]` Implémentation du style de l'écran d'authentification dans `index.css`
- `[x]` Implémentation du gestionnaire de connexion/déconnexion et d'écoute d'état Auth dans `app.js`
- `[x]` Migration de `handleFeteFile` et `handleLogoUpload` pour téléverser sur Firebase Storage
- `[x]` Implémentation de la synchronisation en temps réel des paramètres de l'application via la collection Firestore `settings`
- `[x]` Déploiement de l'application sur Firebase Hosting
- `[ ]` Activation de Firestore Database & Firebase Storage dans la console par l'utilisateur
- `[ ]` Déploiement des règles de sécurité Firestore & Storage après activation des services
- `[ ]` Guide de configuration manuelle Firebase Auth pour l'utilisateur
