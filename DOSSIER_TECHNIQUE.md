# 📋 DOSSIER TECHNIQUE : APPLICATION FOYER RURAL D'ESNOMS AU VAL

> **Document de référence technique et fonctionnel**  
> Ce document rassemble l'ensemble des connaissances, architectures, configurations, règles métier et procédures de déploiement de l'application. Il permet de repartir à tout moment sur une conversation vierge sans perte de contexte.

---

## 1. Vue d'ensemble du Projet

- **Nom de l'application** : Foyer Rural d'Esnoms au Val
- **Objet** : Application web complète de gestion associative (adhérents, comptabilité générale, bilans annuels, gestion analytique des manifestations/fêtes, réservations tennis, stocks buvette/réserve, investissements, équipements partagés).
- **Version actuelle** : **`v8.10`** (datée du *24 novembre 2026*).
- **Hébergement & URL de production** : [https://foyer-rural-esnoms.web.app](https://foyer-rural-esnoms.web.app) (Firebase Hosting).
- **Nature du projet** : PWA (Progressive Web App) "Single Page Application", installable sur mobile/ordinateur, synchronisée en temps réel avec le Cloud et dotée d'un Service Worker offline.

---

## 2. Architecture & Stack Technique

- **Frontend** : 
  - `index.html` : Structure SPA, tous les conteneurs d'onglets et modales.
  - `app.js` : Moteur applicatif Vanilla JS (~8 400 lignes), gestionnaire d'état réactif (`STATE`), adaptateur de base de données, calculs et rendu DOM direct.
  - `index.css` : Styles CSS3 personnalisés (thème moderne, badges, responsive mobile/desktop).
- **Backend & Base de Données** : 
  - **100% Supabase (PostgreSQL 17)**. L'application a totalement migré hors de Firebase Firestore vers Supabase Cloud.
  - Client Supabase officiel : SDK `@supabase/supabase-js@2` via CDN.
  - **Adaptateur Pattern Firestore** : `app.js` intègre une couche de compatibilité (`db.collection(...).doc(...).get/set/update/delete/onSnapshot`) qui traduit les appels classiques en requêtes SQL Supabase temps réel sans altérer le reste du code.
- **Librairies tierces locales & CDN** :
  - `lucide.min.js` : Icônes vectorielles légères.
  - `xlsx.full.min.js` : SheetJS pour les exports et imports de fichiers Excel (`.xlsx`).
  - `html2pdf.bundle.min.js` : Moteur de génération PDF client pour les factures et bilans.

---

## 3. Configuration & Schéma Base de Données (Supabase)

- **URL Supabase** : `https://rdnxnksdgrxidmrlgotz.supabase.co`
- **Project Ref** : `rdnxnksdgrxidmrlgotz`
- **Anon Key (Publique)** :  
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkbnhua3NkZ3J4aWRtcmxnb3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTk0NjEsImV4cCI6MjEwODc5NTQ2MX0.Iug7ZmxXY-ME43wZo_PhPT8KXfZ4idz92tZ4kiL5HVQ`

### Tables Relationnelles (Schéma `public`) :

1. **`transactions`** :
   - `id` (text, PK)
   - `date_transaction` (date)
   - `type_flux` (`Recette` ou `Dépense`)
   - `categorie_id` (text, FK logique vers `categories.id`)
   - `moyen_payement` (`Espèces`, `Chèque`, `Carte Bancaire`, `Virement`, `Réserve`)
   - `prix` (numeric)
   - `quantite` (integer, valeur par défaut `1`)
   - `montant` (numeric)
   - `paye` (boolean)
   - `description` (text)
   - `adherent_id` (text, nullable)
   - `manifestation_id` (text, nullable)
   - `investissement_id` (text, nullable)
   - `produit_id` (text, nullable)
   - `equipement_id` (text, nullable)
   - `num_cheque` (text, nullable)
   - `cheque_encaisse` (boolean)

2. **`manifestations`** :
   - `id` (text, PK)
   - `nom` (text)
   - `date_debut` (date, nullable)
   - `date_fin` (date, nullable)
   - `lieu` (text, nullable)

3. **`fete_rurale_stands`** :
   - `id` (text, PK)
   - `manifestation_id` (text, FK logique vers `manifestations.id`)
   - `nom` (text, ex: "Buvette", "Restauration", "Samedi", "Dimanche")
   - `fond_de_caisse` (numeric, initialisé au début de la fête)

4. **`fete_rurale_receipts`** :
   - `id` (text, PK)
   - `manifestation_id` (text)
   - `stand_id` (text, FK vers `fete_rurale_stands.id`)
   - `date` (date)
   - `montant` (numeric, relève de caisse du stand)
   - `comment` (text)
   - `transaction_id` (text, nullable)

5. **`fete_rurale_expenses`** :
   - `id` (text, PK)
   - `manifestation_id` (text)
   - `description` (text)
   - `date` (date)
   - `montant` (numeric)
   - `paye` (boolean)
   - `moyen_payement` (text)
   - `paye_a` (text)
   - `categorie` (text)
   - `commentaire` (text)
   - `scan` (text / base64)
   - `transaction_id` (text, nullable)

6. **`fete_rurale_partners`** :
   - `id` (text, PK)
   - `manifestation_id` (text)
   - `entreprise` (text)
   - `contact` (text)
   - `suivi_par` (text)
   - `montant_sponsoring` (numeric)
   - `moyen_payement` (text)
   - `paye` (boolean)
   - `logo` (text, nullable)
   - `transaction_id` (text, nullable)

7. **Autres Tables de Gestion** :
   - `adherents` : Adhésions, coordonnées, date cotisation, statut à jour.
   - `categories` : Nomenclature comptable analytique (`Recette`, `Dépense`, `Manifestation`).
   - `produits` : Boissons et réserve, prix vente, stock réel, seuils d'alerte.
   - `investissements` : Biens amortissables, matériel durable, date achat, état.
   - `reservations` : Réservations du court de tennis par créneau d'1h.
   - `shared_equipments` : Matériel partagé (barnums, friteuses...), grille tarifaire, caution.
   - `partner_associations` : Associations partenaires empruntant du matériel.
   - `notes` : Notes et comptes-rendus de réunions.
   - `profiles` : Profils d'utilisateurs et rôles applicatifs.
   - `settings` : Configuration de l'application (émetteur, RIB, coordonnées).
   - `evolution_notes` : Boîte à idées et demandes d'évolutions.

---

## 4. Règles Métier & Logique Financière Fondamentales

### A. Règle d'Or : Isolation Manifestation vs Comptabilité Générale
- **Principe** : Une manifestation (ex: Fête Patronale) possède sa propre comptabilité autonome (fonds de caisse, relèves, achats directs, sponsors).
- **Règle absolue pour `transactions`** :
  - Les relèves de stands (`fete_rurale_receipts`), les sponsors (`fete_rurale_partners`) et les dépenses en Espèces, Chèque, CB ou Virement **NE CRÉENT AUCUNE LIGNE** dans la table générale `transactions`.
  - **SEULE exception** : lorsque le moyen de paiement d'une dépense de fête est **« Réserve »** (ex: bouteilles de champagne ou boissons prélevées sur le stock associatif).
  - Dans ce cas unique : **une seule ligne en négatif** est inscrite dans `transactions` (`montant = -Math.abs(montant)`, ex: `-58.00 €`, `description = [Déduction Réserve] champagne`, badge visuel `📦 Réserve (Déduit)`).
  - Cela permet de déduire le stock/créditer la réserve sans jamais créer de doublon.

### B. Unification des Calculs (`getManifestationFinances`)
Pour garantir que le tableau récapitulatif supérieur (**« Liste des Événements »**) et le bilan analytique inférieur (**« Bilan détaillé »**) affichent toujours des montants 100% identiques :
- **Recettes Manifestation** = Somme des relèves de stands + Sponsoring payé + Éventuelles recettes directes liées.
- **Dépenses Manifestation** = Fonds de caisse de tous les stands + Dépenses directes de l'événement + Éventuelles dépenses directes liées (hors déduction réserve négative).
- **Bilan Net** = `Recettes - Dépenses`.
- La fonction `getManifestationFinances(manifId)` dans `app.js` est la source unique de vérité partagée par :
  1. `renderManifestationsList()` (tableau de bord des événements).
  2. `renderBilanAnnuel()` (synthèse financière globale de l'exercice).

### C. Règles de Saisie des Formulaires (depuis v8.7)
- **Seul le montant/prix est obligatoire** (`required`).
- Tous les autres champs (date, description, catégorie, moyen de paiement, bénéficiaire) sont facultatifs et dotés de valeurs de repli automatiques (ex: date du jour, description `"Dépense"` ou `"Recette"`).
- Le champ **Quantité** est automatiquement initialisé à **`1`** par défaut. Le calcul total utilise `1` si le champ est vide.

### D. Périodes & Exercices Associatifs
- Les exercices comptables courent du **1er octobre au 30 septembre** (ex : `2025 / 2026`, `2026 / 2027`).
- La fonction `isDateInPeriod(dateStr, periodStr)` filtre systématiquement les écritures selon la période active sélectionnée.

---

## 5. Règle Impérative de Versioning & Déploiement

À **chaque modification ou correction de code**, appliquer rigoureusement la procédure suivante :

1. **Incrémenter le numéro de version** (ex : passer de `v8.9` à `v8.10` ou `v9.0`) dans les 4 fichiers :
   - `sw.js` :
     ```javascript
     const CACHE_NAME = 'foyer-rural-cache-vX.X';
     // et les query params '?v=X.X' dans ASSETS
     ```
   - `manifest.json` :
     ```json
     "start_url": "/index.html?v=X.X",
     // et les query params des icônes '?v=X.X'
     ```
   - `index.html` :
     - Mettre à jour tous les tags `<link>` et `<script>` (`?v=X.X`).
     - Mettre à jour le badge visuel et le texte sous **Paramètres & Configuration Supabase** -> **Version & Dernières Modifications** :
       - Nouveau numéro de version (ex: `v8.10`).
       - Date courante en français (ex: `23 novembre 2026`).
       - Résumé concis et clair de la modification.
   - `app.js` :
     ```javascript
     const APP_VERSION = "X.X";
     ```

2. **Validation de syntaxe (zéro tolérance d'erreur)** :
   ```bash
   node -c app.js && node -c sw.js
   ```

3. **Commit Git** :
   ```bash
   git add app.js index.html manifest.json sw.js DOSSIER_TECHNIQUE.md
   git commit -m "vX.X: Description claire de la modification"
   ```

4. **Déploiement en production** :
   ```bash
   npx firebase-tools deploy --only hosting
   ```
   *L'URL de production [https://foyer-rural-esnoms.web.app](https://foyer-rural-esnoms.web.app) est mise à jour immédiatement.*

---

## 6. Structure des Fichiers Clés du Dépôt

```
/home/gythomas/Antigravity/Foyer Rural/
├── index.html            # Interface utilisateur complète (SPA, modales, formulaires)
├── app.js                # Logique applicative, moteur financier, adaptateur Supabase
├── index.css             # Feuille de styles CSS3 responsive
├── sw.js                 # Service Worker (Cache PWA & offline)
├── manifest.json         # Manifeste PWA
├── firebase.json         # Configuration Firebase Hosting
├── DOSSIER_TECHNIQUE.md  # Ce dossier technique de référence
└── .agents/
    └── AGENTS.md         # Règles de projet obligatoires (versioning & badge)
```
