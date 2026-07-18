// ============================================================================
// FOYER RURAL ASSOCIATION MANAGEMENT ENGINE - app.js
// Handles State, LocalStorage / Firestore sync, Calendar, Charts, Invoicing, etc.
// ============================================================================

// --- Central State Store ---
let STATE = {
    adherents: [],
    transactions: [],
    categories: [],
    manifestations: [],
    investissements: [],
    produits: [],
    reservations: [],
    notes: [],
    firebaseConfig: null,
    firebaseEnabled: false,
    feteRuraleStands: [],
    feteRuraleReceipts: [],
    feteRuraleExpenses: [],
    feteRuralePartners: [],
    currentPeriod: ""
};

// Mode indicators
let dbMode = 'local'; // 'local' or 'firebase'
let db = null; // Firestore reference
let currentWeekStartDate = new Date(); // Active tennis calendar week
let financeChartInstance = null;
let categoryChartInstance = null;
let manifestationChartInstance = null;
let selectedNoteId = null;
let activeManifestationId = null;

let SORTS = {
    transactions: { field: 'date_transaction', direction: 'desc' },
    depenses: { field: 'date_transaction', direction: 'desc' },
    recettes: { field: 'date_transaction', direction: 'desc' },
    manifestations: { field: 'date_debut', direction: 'asc' },
    produits: { field: 'nom_boisson', direction: 'asc' },
    investissements: { field: 'date_acquisition', direction: 'desc' },
    manifestationExpenses: { field: 'date', direction: 'desc' }
};

function toggleSort(section, field) {
    const current = SORTS[section];
    if (current.field === field) {
        current.direction = current.direction === 'asc' ? 'desc' : 'asc';
    } else {
        current.field = field;
        current.direction = 'asc';
    }
    
    updateSortIndicators(section);
    
    if (section === 'transactions') renderTransactionsList();
    if (section === 'depenses') renderGeneralExpensesList();
    if (section === 'recettes') renderGeneralReceiptsList();
    if (section === 'manifestations') renderManifestationsList();
    if (section === 'produits') renderProduitsList();
    if (section === 'investissements') renderInvestissementsList();
    if (section === 'manifestationExpenses') renderFeteRurale();
}

function updateSortIndicators(section) {
    document.querySelectorAll(`[data-sort-${section}]`).forEach(el => {
        const baseText = el.getAttribute('data-text');
        const field = el.getAttribute(`data-sort-${section}`);
        const current = SORTS[section];
        
        if (current.field === field) {
            el.innerText = baseText + (current.direction === 'asc' ? ' ▲' : ' ▼');
            el.style.color = 'var(--primary)';
        } else {
            el.innerText = baseText;
            el.style.color = '';
        }
    });
}


// --- Default Categories for Seeding ---
const DEFAULT_CATEGORIES = [
    // Recettes
    { id: "cat-1", libelle: "Cotisations & Adhésions", type: "Recette" },
    { id: "cat-2", libelle: "Subventions communales", type: "Recette" },
    { id: "cat-3", libelle: "Dons & Sponsoring", type: "Recette" },
    { id: "cat-4", libelle: "Recettes Diverses", type: "Recette" },
    
    // Dépenses
    { id: "cat-5", libelle: "Entretien des Infrastructures", type: "Dépense" },
    { id: "cat-6", libelle: "Matériel & Fournitures", type: "Dépense" },
    { id: "cat-7", libelle: "Frais de Fonctionnement", type: "Dépense" },
    { id: "cat-8", libelle: "Investissement Amortissable", type: "Dépense" },
    { id: "cat-9", libelle: "Ajustement Inventaire", type: "Dépense" },
    { id: "cat-10", libelle: "Dépenses Diverses", type: "Dépense" },
    
    // Manifestations
    { id: "cat-11", libelle: "Animation", type: "Manifestation" },
    { id: "cat-12", libelle: "Buffet", type: "Manifestation" },
    { id: "cat-13", libelle: "Buvette", type: "Manifestation" },
    { id: "cat-14", libelle: "Chars / Défilé", type: "Manifestation" },
    { id: "cat-15", libelle: "Décoration", type: "Manifestation" },
    { id: "cat-16", libelle: "Autre", type: "Manifestation" }
];

// --- 1. INITIALIZATION & DATA SEEDING ---
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    initPeriod();
    
    // 1. Check if running on Firebase Hosting (auto-initialized by /__/firebase/init.js)
    const isFirebaseHosted = window.location.hostname.endsWith(".web.app") || 
                             window.location.hostname.endsWith(".firebaseapp.com") ||
                             (window.firebase && firebase.apps.length > 0);

    if (isFirebaseHosted) {
        STATE.firebaseEnabled = true;
        document.getElementById("fb-enabled").checked = true;
    } else {
        // Load configuration from localStorage to see if Firebase is configured/enabled locally
        const savedConfig = localStorage.getItem("foyer_firebase_config");
        const savedEnabled = localStorage.getItem("foyer_firebase_enabled");
        
        if (savedConfig) {
            STATE.firebaseConfig = JSON.parse(savedConfig);
            document.getElementById("fb-apiKey").value = STATE.firebaseConfig.apiKey || "";
            document.getElementById("fb-projectId").value = STATE.firebaseConfig.projectId || "";
            document.getElementById("fb-appId").value = STATE.firebaseConfig.appId || "";
        }
        
        if (savedEnabled === "true" && STATE.firebaseConfig) {
            STATE.firebaseEnabled = true;
            document.getElementById("fb-enabled").checked = true;
        }
    }

    // 2. Initialize database connection
    if (STATE.firebaseEnabled && (isFirebaseHosted || STATE.firebaseConfig)) {
        connectFirebase();
    } else {
        connectLocal();
    }

    // 3. Setup UI tabs and subtabs
    setupNavigation();
    setupSubNavigation();
    initLogo();
    
    // Apply saved sidebar collapse preference on desktop
    if (window.innerWidth > 768) {
        const savedCollapsed = localStorage.getItem("foyer_sidebar_collapsed");
        if (savedCollapsed === "true") {
            const appContainer = document.querySelector(".app-container");
            if (appContainer) appContainer.classList.add("sidebar-collapsed");
        }
    }
    
    // 4. Setup tennis week navigation
    setWeekStart(new Date());
    
    // Initialize icons
    lucide.createIcons();
}

// --- Local Storage Database Mode ---
function connectLocal() {
    dbMode = 'local';
    updateDbStatusBadge();
    
    const localData = localStorage.getItem("foyer_rural_db");
    if (localData) {
        STATE = { ...STATE, ...JSON.parse(localData) };
        console.log("Loaded state from LocalStorage", STATE);
        
        // Auto-patch category types for legacy databases
        let patched = false;
        if (!STATE.categories || STATE.categories.length === 0) {
            STATE.categories = [...DEFAULT_CATEGORIES];
            patched = true;
        } else {
            STATE.categories.forEach(c => {
                if (!c.type) {
                    const def2 = DEFAULT_CATEGORIES.find(dc => dc.libelle.toLowerCase() === c.libelle.toLowerCase()) || 
                                 DEFAULT_CATEGORIES.find(dc => dc.id === c.id);
                    c.type = def2 ? def2.type : "Recette";
                    patched = true;
                }
            });
        }
        
        // Ensure new arrays exist and patch missing manifestation_id
        if (!STATE.feteRuraleStands) { STATE.feteRuraleStands = []; patched = true; }
        else {
            STATE.feteRuraleStands.forEach(s => {
                if (!s.manifestation_id) {
                    s.manifestation_id = "man-fete-rurale";
                    patched = true;
                }
            });
        }
        if (!STATE.feteRuraleReceipts) { STATE.feteRuraleReceipts = []; patched = true; }
        else {
            STATE.feteRuraleReceipts.forEach(r => {
                if (!r.manifestation_id) {
                    r.manifestation_id = "man-fete-rurale";
                    patched = true;
                }
            });
        }
        if (!STATE.feteRuraleExpenses) { STATE.feteRuraleExpenses = []; patched = true; }
        else {
            STATE.feteRuraleExpenses.forEach(e => {
                if (!e.manifestation_id) {
                    e.manifestation_id = "man-fete-rurale";
                    patched = true;
                }
            });
        }
        if (!STATE.feteRuralePartners) { STATE.feteRuralePartners = []; patched = true; }
        else {
            STATE.feteRuralePartners.forEach(p => {
                if (!p.manifestation_id) {
                    p.manifestation_id = "man-fete-rurale";
                    patched = true;
                }
            });
        }

        // Ensure "man-fete-rurale" exists
        if (!STATE.manifestations.some(m => m.id === "man-fete-rurale")) {
            STATE.manifestations.push({
                id: "man-fete-rurale",
                nom: "Fête Rurale",
                date_debut: "2026-08-15",
                date_fin: "2026-08-16",
                lieu: "Place du Village",
                special: true
            });
            patched = true;
        }
        
        if (patched) {
            saveState();
        }
        
        refreshAllViews();
    } else {
        // Seed with demo data
        console.log("No data found. Seeding database with demo data...");
        seedDemoData();
    }
}

// --- Firebase Cloud Storage Database Mode ---
let activeFirebaseListeners = [];

function connectFirebase() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(STATE.firebaseConfig);
        }
        db = firebase.firestore();
        dbMode = 'firebase';
        updateDbStatusBadge();
        
        // Listen to Auth State Changes
        firebase.auth().onAuthStateChanged(user => {
            // Unsubscribe all active listeners before creating new ones
            activeFirebaseListeners.forEach(unsub => unsub());
            activeFirebaseListeners = [];
            
            if (user) {
                // User is signed in
                document.getElementById("login-screen").style.display = "none";
                const logoutBtn = document.getElementById("btn-sidebar-logout");
                if (logoutBtn) logoutBtn.style.display = "flex";
                
                const appContainer = document.querySelector(".app-container");
                if (appContainer) appContainer.style.display = "flex";
                
                // 1. Listen to settings collection to synchronize configurations
                const settingsUnsub = db.collection("settings").doc("app").onSnapshot(doc => {
                    if (doc.exists) {
                        const data = doc.data();
                        if (data.foyer_logo_url !== undefined) {
                            localStorage.setItem("foyer_logo_url", data.foyer_logo_url);
                        }
                        if (data.foyer_logo_opacity !== undefined) {
                            localStorage.setItem("foyer_logo_opacity", data.foyer_logo_opacity);
                        }
                        if (data.foyer_cotisation_amount !== undefined) {
                            localStorage.setItem("foyer_cotisation_amount", data.foyer_cotisation_amount);
                        }
                        
                        // Refresh logo in UI
                        const logoUrl = localStorage.getItem("foyer_logo_url") || "logo.png?v=2.2";
                        const opacity = localStorage.getItem("foyer_logo_opacity") !== null ? 
                            Number(localStorage.getItem("foyer_logo_opacity")) : 0.05;
                        renderLogo(logoUrl, opacity);
                        updateLogoControls(logoUrl, opacity);
                        
                        const cotInput = document.getElementById("settings-cotisation-amount");
                        if (cotInput) {
                            cotInput.value = getCotisationAmount();
                        }
                    }
                }, err => {
                    console.warn("Settings fetch failed (likely initial setup):", err);
                });
                activeFirebaseListeners.push(settingsUnsub);
                
                // 2. Listen to data collections in real time
                const collections = [
                    'adherents', 'transactions', 'categories', 'manifestations', 
                    'investissements', 'produits', 'reservations', 'notes',
                    'feteRuraleStands', 'feteRuraleReceipts', 'feteRuraleExpenses', 'feteRuralePartners'
                ];
                
                collections.forEach(col => {
                    const unsub = db.collection(col).onSnapshot(snapshot => {
                        let items = [];
                        snapshot.forEach(doc => {
                            items.push({ id: doc.id, ...doc.data() });
                        });
                        if (col === 'feteRuraleStands' || col === 'feteRuraleReceipts' || col === 'feteRuraleExpenses' || col === 'feteRuralePartners') {
                            items.forEach(item => {
                                if (!item.manifestation_id) item.manifestation_id = "man-fete-rurale";
                            });
                        }
                        if (col === 'categories') {
                            if (items.length === 0) {
                                DEFAULT_CATEGORIES.forEach(dc => {
                                    db.collection("categories").doc(dc.id).set(dc).catch(() => {});
                                });
                            }
                        }
                        STATE[col] = items;
                        refreshAllViews();
                    }, error => {
                        console.error(`Firebase listen error on ${col}:`, error);
                    });
                    activeFirebaseListeners.push(unsub);
                });
                
            } else {
                // User is signed out: display login, hide main app
                document.getElementById("login-screen").style.display = "flex";
                const logoutBtn = document.getElementById("btn-sidebar-logout");
                if (logoutBtn) logoutBtn.style.display = "none";
                
                const appContainer = document.querySelector(".app-container");
                if (appContainer) appContainer.style.display = "none";
                
                const logoUrl = localStorage.getItem("foyer_logo_url") || "logo.png?v=2.2";
                const loginLogoImg = document.getElementById("login-logo-img");
                if (loginLogoImg) loginLogoImg.src = logoUrl;
            }
        });
        
    } catch (e) {
        console.error("Firebase init failed:", e);
        alert("Échec de la connexion à Firebase. Assurez-vous que la configuration est correcte. Utilisation du mode local.");
        STATE.firebaseEnabled = false;
        localStorage.setItem("foyer_firebase_enabled", "false");
        document.getElementById("fb-enabled").checked = false;
        connectLocal();
    }
}

function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorMsg = document.getElementById("login-error-msg");
    const submitBtn = document.getElementById("btn-login-submit");
    
    if (errorMsg) errorMsg.style.display = "none";
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Connexion en cours...";
    }
    
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Se connecter";
            }
            document.getElementById("login-form").reset();
        })
        .catch(err => {
            console.error("Sign in failed:", err);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Se connecter";
            }
            if (errorMsg) {
                errorMsg.innerText = "Identifiants incorrects : " + err.message;
                errorMsg.style.display = "block";
            }
        });
}

function logoutUser() {
    if (confirm("Voulez-vous vraiment vous déconnecter ?")) {
        firebase.auth().signOut()
            .then(() => {
                activeFirebaseListeners.forEach(unsub => unsub());
                activeFirebaseListeners = [];
                // Reset mode to local to allow browsing offline if needed
                const isFirebaseHosted = window.location.hostname.endsWith(".web.app") || 
                                         window.location.hostname.endsWith(".firebaseapp.com");
                if (!isFirebaseHosted) {
                    dbMode = 'local';
                    updateDbStatusBadge();
                }
            })
            .catch(err => alert("Erreur lors de la déconnexion : " + err.message));
    }
}

// --- Seed Demo Data ---
function seedDemoData() {
    STATE.categories = [...DEFAULT_CATEGORIES];
    
    // Seed Adhérents
    STATE.adherents = [
        { id: "adh-1", nom: "Dupont", prenom: "Jean", email: "jean.dupont@gmail.com", date_adhesion: "2025-01-15", cotisation_a_jour: true, numero_adherent: "ADH-2025-0001", gestanet_periods: ["2024-2025", "2025-2026"] },
        { id: "adh-2", nom: "Curie", prenom: "Marie", email: "marie.curie@science.fr", date_adhesion: "2025-02-10", cotisation_a_jour: true, numero_adherent: "ADH-2025-0002", gestanet_periods: ["2025-2026"] },
        { id: "adh-3", nom: "Martin", prenom: "Pierre", email: "pierre.martin@outlook.com", date_adhesion: "2024-09-01", cotisation_a_jour: false, numero_adherent: "ADH-2024-0012", gestanet_periods: [] },
        { id: "adh-4", nom: "Bernard", prenom: "Sophie", email: "sophie.b@gmail.com", date_adhesion: "2025-03-05", cotisation_a_jour: true, numero_adherent: "ADH-2025-0003", gestanet_periods: ["2025-2026"] }
    ];

    // Seed Manifestations
    STATE.manifestations = [
        { id: "man-1", nom: "Loto Annuel du Foyer", date_debut: "2026-03-14", date_fin: "2026-03-14", lieu: "Salle des fêtes du village" },
        { id: "man-2", nom: "Tournoi Tennis d'Été", date_debut: "2026-07-15", date_fin: "2026-07-18", lieu: "Courts municipaux" },
        { id: "man-3", nom: "Fête de la Musique 2026", date_debut: "2026-06-21", date_fin: "2026-06-22", lieu: "Place de la Mairie" },
        { id: "man-fete-rurale", nom: "Fête Rurale", date_debut: "2026-08-15", date_fin: "2026-08-16", lieu: "Place du Village", special: true }
    ];

    // Seed Produits (Boissons)
    STATE.produits = [
        { id: "prod-1", nom_boisson: "Coca-Cola 33cl", quantite_stock: 120, seuil_alerte: 30, prix: 1.50 },
        { id: "prod-2", nom_boisson: "Bière Locale Blonde 25cl", quantite_stock: 18, seuil_alerte: 40, prix: 2.50 }, // Alert!
        { id: "prod-3", nom_boisson: "Jus d'Orange Bio 1L", quantite_stock: 8, seuil_alerte: 10, prix: 3.00 }, // Alert!
        { id: "prod-4", nom_boisson: "Eau Minérale 50cl", quantite_stock: 180, seuil_alerte: 40, prix: 1.00 }
    ];

    // Seed Investissements
    STATE.investissements = [
        { id: "inv-1", libelle: "Tondeuse Gazon Auto", date_acquisition: "2024-05-10", montant_achat: 1500.00, duree_amortissement_ans: 5, etat: "Neuf" },
        { id: "inv-2", libelle: "Réfrigérateur Buvette", date_acquisition: "2025-11-20", montant_achat: 450.00, duree_amortissement_ans: 3, etat: "Occasion" }
    ];

    // Seed Fête Rurale Specific Data
    STATE.feteRuraleStands = [
        { id: "fete-stand-1", nom: "Buvette Principale", fond_de_caisse: 200.00, manifestation_id: "man-fete-rurale" },
        { id: "fete-stand-2", nom: "Stand Restauration (Galettes/Crêpes)", fond_de_caisse: 150.00, manifestation_id: "man-fete-rurale" },
        { id: "fete-stand-3", nom: "Pêche aux canards", fond_de_caisse: 50.00, manifestation_id: "man-fete-rurale" },
        { id: "fete-stand-4", nom: "Tombola", fond_de_caisse: 100.00, manifestation_id: "man-fete-rurale" }
    ];

    STATE.feteRuraleReceipts = [
        { id: "fete-rec-1", stand_id: "fete-stand-1", date: "2026-08-15", montant: 450.00, comment: "Relève caisse après-midi", transaction_id: "tx-fete-r-1", manifestation_id: "man-fete-rurale" },
        { id: "fete-rec-2", stand_id: "fete-stand-1", date: "2026-08-15", montant: 620.00, comment: "Relève fin de journée", transaction_id: "tx-fete-r-2", manifestation_id: "man-fete-rurale" },
        { id: "fete-rec-3", stand_id: "fete-stand-2", date: "2026-08-15", montant: 380.00, comment: "Caisse restauration samedi", transaction_id: "tx-fete-r-3", manifestation_id: "man-fete-rurale" },
        { id: "fete-rec-4", stand_id: "fete-stand-4", date: "2026-08-15", montant: 290.00, comment: "Vente enveloppes et tickets", transaction_id: "tx-fete-r-4", manifestation_id: "man-fete-rurale" }
    ];

    STATE.feteRuraleExpenses = [
        { id: "fete-exp-1", description: "Achat viande et pain (charcuterie locale)", date: "2026-08-14", montant: 320.00, paye: true, moyen_payement: "Carte Bancaire", paye_a: "Boucherie Martin", categorie: "buffet", commentaire: "Facture payée par carte par le trésorier", scan: "", transaction_id: "tx-fete-e-1", manifestation_id: "man-fete-rurale" },
        { id: "fete-exp-2", description: "Prestation groupe de musique folklorique", date: "2026-08-15", montant: 450.00, paye: true, moyen_payement: "Virement", paye_a: "Association MusicArmor", categorie: "animation", commentaire: "Contrat d'engagement artistique", scan: "", transaction_id: "tx-fete-e-2", manifestation_id: "man-fete-rurale" }
    ];

    STATE.feteRuralePartners = [
        { id: "fete-part-1", entreprise: "Boulangerie du Centre", contact: "M. Lefèvre", suivi_par: "Jean Dupont", paye: true, moyen_payement: "Espèces", montant_sponsoring: 100.00, logo: "", transaction_id: "tx-fete-p-1", manifestation_id: "man-fete-rurale" },
        { id: "fete-part-2", entreprise: "Garage de l'Ouest", contact: "Mme. Renard", suivi_par: "Marie Curie", paye: false, moyen_payement: "Virement", montant_sponsoring: 150.00, logo: "", transaction_id: "", manifestation_id: "man-fete-rurale" }
    ];

    // Seed Transactions
    STATE.transactions = [
        { id: "tx-1", date_transaction: "2026-01-15", description: "Cotisation annuelle Jean Dupont", type_flux: "Recette", montant: 20.00, quantite: 1, prix: 20.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-1", adherent_id: "adh-1", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-2", date_transaction: "2026-01-16", description: "Cotisation annuelle Marie Curie", type_flux: "Recette", montant: 20.00, quantite: 1, prix: 20.00, paye: true, moyen_payement: "Chèque", categorie_id: "cat-1", adherent_id: "adh-2", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-3", date_transaction: "2026-03-14", description: "Ventes Entrées Loto 2026", type_flux: "Recette", montant: 1450.00, quantite: 290, prix: 5.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-13", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-4", date_transaction: "2026-03-14", description: "Ventes Buvette Loto 2026", type_flux: "Recette", montant: 820.00, quantite: 1, prix: 820.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-5", date_transaction: "2026-03-12", description: "Achat boissons Métro pour Loto", type_flux: "Dépense", montant: 320.00, quantite: 1, prix: 320.00, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-6", date_transaction: "2026-03-13", description: "Location de la sonorisation Loto", type_flux: "Dépense", montant: 150.00, quantite: 1, prix: 150.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-12", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-7", date_transaction: "2026-04-10", description: "Subvention communale annuelle", type_flux: "Recette", montant: 2500.00, quantite: 1, prix: 2500.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-2", adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-8", date_transaction: "2026-05-15", description: "Achat engrais pour court de tennis", type_flux: "Dépense", montant: 85.00, quantite: 2, prix: 42.50, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-5", adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-9", date_transaction: "2026-02-10", description: "Achat Réfrigérateur Réserve", type_flux: "Dépense", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-8", adherent_id: "", manifestation_id: "", investissement_id: "inv-2", produit_id: "" },
        
        // Synced Fête Rurale Transactions
        { id: "tx-fete-r-1", date_transaction: "2026-08-15", description: "[Stand: Buvette Principale] Relève caisse après-midi", type_flux: "Recette", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-2", date_transaction: "2026-08-15", description: "[Stand: Buvette Principale] Relève fin de journée", type_flux: "Recette", montant: 620.00, quantite: 1, prix: 620.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-3", date_transaction: "2026-08-15", description: "[Stand: Stand Restauration (Galettes/Crêpes)] Caisse restauration samedi", type_flux: "Recette", montant: 380.00, quantite: 1, prix: 380.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-4", date_transaction: "2026-08-15", description: "[Stand: Tombola] Vente enveloppes et tickets", type_flux: "Recette", montant: 290.00, quantite: 1, prix: 290.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-13", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        
        { id: "tx-fete-e-1", date_transaction: "2026-08-14", description: "[Dépense Fête] Achat viande et pain (charcuterie locale)", type_flux: "Dépense", montant: 320.00, quantite: 1, prix: 320.00, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-e-2", date_transaction: "2026-08-15", description: "[Dépense Fête] Prestation groupe de musique folklorique", type_flux: "Dépense", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-12", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        
        { id: "tx-fete-p-1", date_transaction: "2026-08-12", description: "[Partenaire Fête] Boulangerie du Centre (Sponsoring)", type_flux: "Recette", montant: 100.00, quantite: 1, prix: 100.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-3", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" }
    ];

    // Seed Tennis Reservations (Map to active week dates dynamically so they display)
    const today = new Date();
    const mon = getMonday(today);
    
    const resDate1 = formatDate(addDays(mon, 0)); // Monday
    const resDate2 = formatDate(addDays(mon, 2)); // Wednesday
    const resDate3 = formatDate(addDays(mon, 4)); // Friday
    
    STATE.reservations = [
        { id: "res-1", date: resDate1, hour: "14", adherent_id: "adh-1" },
        { id: "res-2", date: resDate2, hour: "17", adherent_id: "adh-2" },
        { id: "res-3", date: resDate3, hour: "10", adherent_id: "adh-4" }
    ];

    // Seed Notes
    STATE.notes = [
        { id: "note-1", date_reunion: "2026-01-20", titre: "Assemblée Générale Annuelle", contenu: "Ordre du jour :\n1. Rapport moral du président.\n2. Bilan financier 2025 approuvé à l'unanimité.\n3. Projets 2026 : Achat tondeuse, loto en Mars, tournoi tennis en Juillet.\n4. Renouvellement des cotisations fixé à 20€ par membre.\n\nSecrétaire de séance : Marie Curie.", manifestation_id: "" },
        { id: "note-2", date_reunion: "2026-03-02", titre: "Préparation du Loto Annuel", contenu: "Décisions prises :\n- Ouverture des portes à 18h00, début des parties à 19h30.\n- Buvette gérée par Sophie et Jean. Commande de boissons chez Métro.\n- Lots principaux : Vélo électrique, Robot de cuisine, Bons d'achats.\n- Publicité : Affiches posées dans les commerces locaux.\n\nManifestation liée : Loto Annuel du Foyer.", manifestation_id: "man-1" }
    ];

    saveState();
    refreshAllViews();
}

function saveState() {
    if (dbMode === 'local') {
        localStorage.setItem("foyer_rural_db", JSON.stringify(STATE));
    }
}

// --- Sync Views ---
function refreshAllViews() {
    // Normalize type_flux values to be accented "Dépense"
    if (STATE.transactions) {
        STATE.transactions.forEach(t => {
            if (t.type_flux === "Depense") {
                t.type_flux = "Dépense";
            }
        });
    }
    renderDashboard();
    renderAdherentsList();
    renderTennisCalendar();
    renderTransactionsList();
    renderBilanAnnuel();
    renderManifestationsList();
    renderProduitsList();
    renderInvestissementsList();
    renderNotesList();
    populateSelectOptions();
    
    // Refresh sorting arrows
    updateSortIndicators('depenses');
    updateSortIndicators('recettes');
    updateSortIndicators('manifestations');
    updateSortIndicators('produits');
    updateSortIndicators('investissements');
    
    // Refresh Settings Categories editor
    renderSettingsCategoriesList();

    // Render Fête Rurale Panel
    renderFeteRurale();
}

// --- Update Database status badge in UI ---
function updateDbStatusBadge() {
    const dot = document.getElementById("db-status-dot");
    const text = document.getElementById("db-status-text");
    const desc = document.getElementById("db-status-desc");
    const btnSync = document.getElementById("btn-sync-local-to-fb");
    
    if (dbMode === 'firebase') {
        dot.className = "status-dot online";
        text.innerText = "Mode Firebase";
        desc.innerText = "Synchronisé en temps réel";
        btnSync.style.display = "none";
    } else {
        dot.className = "status-dot";
        text.innerText = "Mode Local";
        desc.innerText = "Données stockées sur ce PC";
        if (STATE.firebaseConfig) {
            btnSync.style.display = "inline-flex";
        } else {
            btnSync.style.display = "none";
        }
    }
}

// ============================================================================
// --- 2. ROUTING & TABS ---
// ============================================================================
function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");
            
            // Remove active from all nav items and panes
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
            
            // Add active to clicked
            item.classList.add("active");
            document.getElementById(`tab-${tabId}`).classList.add("active");
            
            // Close mobile sidebar if open
            const sidebar = document.querySelector(".sidebar");
            if (sidebar && sidebar.classList.contains("open")) {
                toggleSidebarMenu();
            }
            
            // Special initialization on tab display
            if (tabId === "dashboard") {
                renderDashboard();
            } else if (tabId === "tennis") {
                renderTennisCalendar();
            } else if (tabId === "bilan") {
                renderBilanAnnuel();
            } else if (tabId === "fete-rurale") {
                renderFeteRurale();
            }
            
            lucide.createIcons();
        });
    });
}

function toggleSidebarMenu() {
    const width = window.innerWidth;
    
    if (width <= 768) {
        // Mobile layout: slide in/out fixed drawer
        const sidebar = document.querySelector(".sidebar");
        const backdrop = document.getElementById("sidebar-backdrop");
        if (sidebar) {
            sidebar.classList.toggle("open");
            const isOpen = sidebar.classList.contains("open");
            if (backdrop) backdrop.style.display = isOpen ? "block" : "none";
        }
    } else {
        // Desktop layout: collapse/expand sidebar
        const appContainer = document.querySelector(".app-container");
        if (appContainer) {
            appContainer.classList.toggle("sidebar-collapsed");
            const isCollapsed = appContainer.classList.contains("sidebar-collapsed");
            localStorage.setItem("foyer_sidebar_collapsed", isCollapsed ? "true" : "false");
        }
    }
}

function setupSubNavigation() {
    document.querySelectorAll(".sub-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const subtabId = btn.getAttribute("data-subtab");
            
            // Active state of buttons
            btn.parentElement.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Display active panel
            const parentPane = btn.closest(".tab-pane");
            parentPane.querySelectorAll(".accounting-sub-pane").forEach(p => p.classList.remove("active"));
            parentPane.querySelector(`#subtab-${subtabId}`).classList.add("active");
            
            lucide.createIcons();
        });
    });
}

// ============================================================================
// --- 3. MODALS MANAGER ---
// ============================================================================
function openModal(id) {
    document.getElementById(id).classList.add("active");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("active");
    // Clear forms when closing
    if (id === 'modal-adherent') document.getElementById("form-adherent").reset();
    if (id === 'modal-transaction') document.getElementById("form-transaction").reset();
    if (id === 'modal-manifestation') document.getElementById("form-manifestation").reset();
    if (id === 'modal-produit') document.getElementById("form-produit").reset();
    if (id === 'modal-investissement') document.getElementById("form-investissement").reset();
}

// ============================================================================
// --- 4. TABLEAU DE BORD (DASHBOARD) RENDERING ---
// ============================================================================
function renderDashboard() {
    // 1. Calculate stats
    // Paid transactions or total balance
    let cash = 0;
    STATE.transactions.forEach(t => {
        if (t.paye && isDateInPeriod(t.date_transaction, STATE.currentPeriod)) {
            if (t.type_flux === "Recette") cash += Number(t.montant);
            else cash -= Number(t.montant);
        }
    });
    document.getElementById("dash-cash").innerText = cash.toFixed(2) + " €";
    
    // Up to date cotisants count of the current period
    const activeMembersCount = STATE.adherents.filter(a => isAdherentCotisationUpToDate(a)).length;
    document.getElementById("dash-members").innerText = activeMembersCount;
    
    // Beverage stock alerts count
    const lowStockCount = STATE.produits.filter(p => p.quantite_stock <= p.seuil_alerte).length;
    document.getElementById("dash-stock-alerts").innerText = lowStockCount;
    
    // Active reservations in the next 7 days
    const todayStr = formatDate(new Date());
    const sevenDaysLater = addDays(new Date(), 7);
    const bookingsNext7Days = STATE.reservations.filter(r => {
        return r.date >= todayStr && r.date <= formatDate(sevenDaysLater);
    }).length;
    document.getElementById("dash-tennis").innerText = bookingsNext7Days;

    // 2. Load alerts lists
    renderDashboardAlerts(lowStockCount, activeMembersCount);

    // 3. Render recent transactions in active period
    const recentTxBody = document.getElementById("dash-recent-transactions");
    recentTxBody.innerHTML = "";
    
    const sortedTx = [...STATE.transactions]
        .filter(t => isDateInPeriod(t.date_transaction, STATE.currentPeriod))
        .sort((a,b) => new Date(b.date_transaction) - new Date(a.date_transaction))
        .slice(0, 5);
    if (sortedTx.length === 0) {
        recentTxBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Aucune transaction récente</td></tr>`;
    } else {
        sortedTx.forEach(t => {
            const dateStr = formatDateFrench(new Date(t.date_transaction));
            const amountColor = t.type_flux === "Recette" ? "color: var(--secondary);" : "color: var(--danger);";
            const amountPrefix = t.type_flux === "Recette" ? "+" : "-";
            recentTxBody.innerHTML += `
                <tr>
                    <td>${dateStr}</td>
                    <td>${t.description}</td>
                    <td style="${amountColor} font-weight: 600;">${amountPrefix} ${Number(t.montant).toFixed(2)} €</td>
                </tr>
            `;
        });
    }

    // 4. Render charts
    renderDashboardCharts();
}

function renderDashboardAlerts(lowStocks, activeMembers) {
    const alertsList = document.getElementById("dash-alerts-list");
    alertsList.innerHTML = "";

    // Stock alert
    if (lowStocks > 0) {
        alertsList.innerHTML += `
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--border-radius); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i data-lucide="beer" style="color: var(--warning);"></i>
                    <div>
                        <div style="font-weight: 600;">Alerte de Stock boissons</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${lowStocks} produit(s) en dessous du seuil critique.</div>
                    </div>
                </div>
                <button class="btn btn-secondary btn-icon-only" onclick="document.querySelector('[data-tab=reserve]').click();"><i data-lucide="chevron-right"></i></button>
            </div>
        `;
    }

    // Overdue cotisations alerts
    const unpaidMembers = STATE.adherents.filter(a => !a.cotisation_a_jour);
    if (unpaidMembers.length > 0) {
        alertsList.innerHTML += `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--border-radius); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i data-lucide="users" style="color: var(--danger);"></i>
                    <div>
                        <div style="font-weight: 600;">Cotisations en retard</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${unpaidMembers.length} adhérent(s) n'ont pas régularisé leur cotisation.</div>
                    </div>
                </div>
                <button class="btn btn-secondary btn-icon-only" onclick="document.querySelector('[data-tab=adherents]').click();"><i data-lucide="chevron-right"></i></button>
            </div>
        `;
    }

    // Unpaid transactions alerts
    const unpaidTransactionsCount = STATE.transactions.filter(t => !t.paye).length;
    if (unpaidTransactionsCount > 0) {
        alertsList.innerHTML += `
            <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: var(--border-radius); padding: 14px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i data-lucide="clock" style="color: var(--primary);"></i>
                    <div>
                        <div style="font-weight: 600;">Factures / Transactions en attente</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${unpaidTransactionsCount} transaction(s) saisie(s) non réglée(s).</div>
                    </div>
                </div>
                <button class="btn btn-secondary btn-icon-only" onclick="document.querySelector('[data-tab=comptabilite]').click();"><i data-lucide="chevron-right"></i></button>
            </div>
        `;
    }

    if (alertsList.innerHTML === "") {
        alertsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Aucune alerte en cours. Le Foyer est parfaitement géré !</div>`;
    }
}

function renderDashboardCharts() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js is not loaded. Skipping chart rendering.");
        return;
    }
    // Destroy previous instances to avoid memory leaks
    if (financeChartInstance) financeChartInstance.destroy();
    if (categoryChartInstance) categoryChartInstance.destroy();

    // 1. Chart: Revenues vs Expenses by Month (aligned with fiscal period: Oct to Sept)
    const months = ["Oct", "Nov", "Déc", "Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept"];
    let recByMonth = Array(12).fill(0);
    let depByMonth = Array(12).fill(0);

    STATE.transactions.forEach(t => {
        if (t.paye && isDateInPeriod(t.date_transaction, STATE.currentPeriod)) {
            const d = new Date(t.date_transaction);
            const mIndex = getPeriodMonthIndex(d);
            if (t.type_flux === "Recette") recByMonth[mIndex] += Number(t.montant);
            else depByMonth[mIndex] += Number(t.montant);
        }
    });

    const ctxFinance = document.getElementById("financeChart").getContext("2d");
    financeChartInstance = new Chart(ctxFinance, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Recettes',
                    data: recByMonth,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Dépenses',
                    data: depByMonth,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#475569' } }
            },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { display: false } },
                y: { ticks: { color: '#64748b' }, grid: { color: '#f1f5f9' } }
            }
        }
    });

    // 2. Chart: Category distribution (filtered by period)
    let categoryData = {};
    STATE.transactions.forEach(t => {
        if (t.paye && isDateInPeriod(t.date_transaction, STATE.currentPeriod)) {
            const cat = STATE.categories.find(c => c.id === t.categorie_id);
            const label = cat ? cat.libelle : "Autre";
            categoryData[label] = (categoryData[label] || 0) + Number(t.montant);
        }
    });

    const categoryLabels = Object.keys(categoryData);
    const categoryValues = Object.values(categoryData);

    const ctxCategory = document.getElementById("categoryChart").getContext("2d");
    categoryChartInstance = new Chart(ctxCategory, {
        type: 'doughnut',
        data: {
            labels: categoryLabels.length > 0 ? categoryLabels : ["Aucune donnée"],
            datasets: [{
                data: categoryValues.length > 0 ? categoryValues : [1],
                backgroundColor: [
                    '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#475569', boxWidth: 12 }
                }
            }
        }
    });
}

// ============================================================================
// --- 5. ADHERENTS (MEMBERS) MANAGEMENT ---
// ============================================================================
function isAdherentCotisationUpToDate(a) {
    if (isDateInPeriod(a.date_adhesion, STATE.currentPeriod) && a.cotisation_a_jour) {
        return true;
    }
    return STATE.transactions.some(t => 
        t.adherent_id === a.id && 
        t.categorie_id === "cat-1" && 
        t.paye && 
        isDateInPeriod(t.date_transaction, STATE.currentPeriod)
    );
}

function renderAdherentsList() {
    const listBody = document.getElementById("adherents-table-body");
    if (!listBody) return;
    listBody.innerHTML = "";

    const searchVal = document.getElementById("search-adherent").value.toLowerCase();
    const filterCotis = document.getElementById("filter-cotisation").value;

    const filtered = STATE.adherents.filter(a => {
        const matchesSearch = (
            (a.nom || "").toLowerCase().includes(searchVal) || 
            (a.prenom || "").toLowerCase().includes(searchVal) || 
            (a.email || "").toLowerCase().includes(searchVal) ||
            (a.numero_adherent || "").toLowerCase().includes(searchVal)
        );
        let matchesFilter = true;
        const upToDate = isAdherentCotisationUpToDate(a);
        if (filterCotis === "up-to-date") matchesFilter = upToDate === true;
        if (filterCotis === "overdue") matchesFilter = upToDate === false;
        
        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucun adhérent ne correspond aux critères</td></tr>`;
        return;
    }

    filtered.forEach(a => {
        const dateStr = formatDateFrench(new Date(a.date_adhesion));
        const upToDate = isAdherentCotisationUpToDate(a);
        const badgeClass = upToDate ? 'badge-success' : 'badge-danger';
        const badgeLabel = upToDate ? 'À Jour' : 'En retard';
        
        const isGestanet = a.gestanet_periods && a.gestanet_periods.includes(STATE.currentPeriod);
        const gestanetBadgeClass = isGestanet ? 'badge-success' : 'badge-danger';
        const gestanetBadgeLabel = isGestanet ? 'À Jour' : 'Non à Jour';
        
        listBody.innerHTML += `
            <tr>
                <td style="font-weight: 600; color: var(--text-muted); font-family: monospace;">${a.numero_adherent || '--'}</td>
                <td style="font-weight: 500;">${a.prenom} ${a.nom}</td>
                <td>${a.email}</td>
                <td>${dateStr}</td>
                <td>
                    <span class="badge ${badgeClass}" style="cursor: pointer;" onclick="toggleAdherentCotisation('${a.id}')">
                        ${badgeLabel}
                    </span>
                </td>
                <td>
                    <span class="badge ${gestanetBadgeClass}" style="cursor: pointer;" onclick="toggleAdherentGestanet('${a.id}')">
                        ${gestanetBadgeLabel}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="generateMembershipInvoice('${a.id}')" title="Éditer la facture de cotisation">
                            <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" onclick="editAdherent('${a.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteAdherent('${a.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    lucide.createIcons();
}

function saveAdherent(e) {
    e.preventDefault();
    const id = document.getElementById("adherent-id").value;
    const numero_adherent = document.getElementById("adherent-numero").value.trim();
    const nom = document.getElementById("adherent-nom").value.trim();
    const prenom = document.getElementById("adherent-prenom").value.trim();
    const email = document.getElementById("adherent-email").value.trim();
    const date_adhesion = document.getElementById("adherent-date").value;
    const cotisation_a_jour = document.getElementById("adherent-cotisation").checked;
    const gestanetChecked = document.getElementById("adherent-gestanet").checked;

    // Retrieve or initialize gestanet_periods
    let gestanet_periods = [];
    if (id) {
        const existing = STATE.adherents.find(item => item.id === id);
        if (existing && existing.gestanet_periods) {
            gestanet_periods = [...existing.gestanet_periods];
        }
    }
    if (gestanetChecked) {
        if (!gestanet_periods.includes(STATE.currentPeriod)) {
            gestanet_periods.push(STATE.currentPeriod);
        }
    } else {
        gestanet_periods = gestanet_periods.filter(p => p !== STATE.currentPeriod);
    }

    const data = { numero_adherent, nom, prenom, email, date_adhesion, cotisation_a_jour, gestanet_periods };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("adherents").doc(id).update(data)
                .then(() => closeModal("modal-adherent"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            db.collection("adherents").add(data)
                .then(() => closeModal("modal-adherent"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.adherents.findIndex(a => a.id === id);
            STATE.adherents[idx] = { id, ...data };
        } else {
            const newId = "adh-" + Date.now();
            STATE.adherents.push({ id: newId, ...data });
            
            // Automatically log cotisation transaction if checked and new member
            if (cotisation_a_jour) {
                const txId = "tx-" + Date.now();
                STATE.transactions.push({
                    id: txId,
                    date_transaction: date_adhesion,
                    description: `Cotisation annuelle ${prenom} ${nom}`,
                    type_flux: "Recette",
                    montant: getCotisationAmount(),
                    quantite: 1,
                    prix: getCotisationAmount(),
                    paye: true,
                    moyen_payement: "Espèces",
                    categorie_id: "cat-1",
                    adherent_id: newId,
                    manifestation_id: "",
                    investissement_id: "",
                    produit_id: ""
                });
            }
        }
        saveState();
        closeModal("modal-adherent");
        refreshAllViews();
    }
}

function editAdherent(id) {
    const a = STATE.adherents.find(item => item.id === id);
    if (!a) return;
    
    document.getElementById("adherent-id").value = a.id;
    document.getElementById("adherent-numero").value = a.numero_adherent || "";
    document.getElementById("adherent-nom").value = a.nom;
    document.getElementById("adherent-prenom").value = a.prenom;
    document.getElementById("adherent-email").value = a.email;
    document.getElementById("adherent-date").value = a.date_adhesion;
    document.getElementById("adherent-cotisation").checked = isAdherentCotisationUpToDate(a);
    document.getElementById("adherent-gestanet").checked = a.gestanet_periods && a.gestanet_periods.includes(STATE.currentPeriod);
    
    document.getElementById("adherent-modal-title").innerText = "Modifier l'Adhérent";
    openModal("modal-adherent");
}

function deleteAdherent(id) {
    if (!confirm("Voulez-vous vraiment supprimer cet adhérent ? Cela supprimera également ses réservations de court.")) return;
    
    if (dbMode === 'firebase') {
        // Delete reservations linked
        STATE.reservations.filter(r => r.adherent_id === id).forEach(r => {
            db.collection("reservations").doc(r.id).delete();
        });
        db.collection("adherents").doc(id).delete()
            .catch(err => alert("Erreur de suppression: " + err));
    } else {
        STATE.adherents = STATE.adherents.filter(a => a.id !== id);
        STATE.reservations = STATE.reservations.filter(r => r.adherent_id !== id);
        saveState();
        refreshAllViews();
    }
}

function toggleAdherentCotisation(id) {
    const a = STATE.adherents.find(item => item.id === id);
    if (!a) return;
    
    const wasUpToDate = isAdherentCotisationUpToDate(a);
    const newVal = !wasUpToDate;
    
    if (dbMode === 'firebase') {
        db.collection("adherents").doc(id).update({ cotisation_a_jour: newVal });
        if (newVal) {
            const todayStr = formatDate(new Date());
            db.collection("transactions").add({
                date_transaction: todayStr,
                description: `Cotisation annuelle ${a.prenom} ${a.nom}`,
                type_flux: "Recette",
                montant: getCotisationAmount(),
                quantite: 1,
                prix: getCotisationAmount(),
                paye: true,
                moyen_payement: "Espèces",
                categorie_id: "cat-1",
                adherent_id: a.id,
                manifestation_id: "",
                investissement_id: "",
                produit_id: ""
            });
        }
    } else {
        a.cotisation_a_jour = newVal;
        
        if (newVal) {
            const todayStr = formatDate(new Date());
            STATE.transactions.push({
                id: "tx-" + Date.now(),
                date_transaction: todayStr,
                description: `Cotisation annuelle ${a.prenom} ${a.nom}`,
                type_flux: "Recette",
                montant: getCotisationAmount(),
                quantite: 1,
                prix: getCotisationAmount(),
                paye: true,
                moyen_payement: "Espèces",
                categorie_id: "cat-1",
                adherent_id: a.id,
                manifestation_id: "",
                investissement_id: "",
                produit_id: ""
            });
        } else {
            STATE.transactions = STATE.transactions.filter(t => 
                !(t.adherent_id === a.id && 
                  t.categorie_id === "cat-1" && 
                  isDateInPeriod(t.date_transaction, STATE.currentPeriod))
            );
        }
        saveState();
        refreshAllViews();
    }
}

function openNewAdherentModal() {
    document.getElementById("form-adherent").reset();
    document.getElementById("adherent-id").value = "";
    document.getElementById("adherent-numero").value = "";
    document.getElementById("adherent-nom").value = "";
    document.getElementById("adherent-prenom").value = "";
    document.getElementById("adherent-email").value = "";
    document.getElementById("adherent-date").value = formatDate(new Date());
    document.getElementById("adherent-cotisation").checked = false;
    document.getElementById("adherent-gestanet").checked = false;
    document.getElementById("adherent-modal-title").innerText = "Nouvel Adhérent";
    openModal("modal-adherent");
}

function toggleAdherentGestanet(id) {
    const a = STATE.adherents.find(item => item.id === id);
    if (!a) return;
    
    if (!a.gestanet_periods) a.gestanet_periods = [];
    
    const isUpToDate = a.gestanet_periods.includes(STATE.currentPeriod);
    let newPeriods = [...a.gestanet_periods];
    
    if (isUpToDate) {
        newPeriods = newPeriods.filter(p => p !== STATE.currentPeriod);
    } else {
        newPeriods.push(STATE.currentPeriod);
    }
    
    if (dbMode === 'firebase') {
        db.collection("adherents").doc(id).update({ gestanet_periods: newPeriods })
            .then(() => refreshAllViews())
            .catch(err => alert("Erreur d'enregistrement Gestanet: " + err));
    } else {
        a.gestanet_periods = newPeriods;
        saveState();
        refreshAllViews();
    }
}

// ============================================================================
// --- 6. TENNIS COURT RESERVATIONS (CALENDAR) ---
// ============================================================================
function setWeekStart(d) {
    currentWeekStartDate = getMonday(d);
    document.getElementById("calendar-week-title").innerText = "Semaine du " + formatDateFrench(currentWeekStartDate) + " au " + formatDateFrench(addDays(currentWeekStartDate, 6));
}

function changeWeek(direction) {
    setWeekStart(addDays(currentWeekStartDate, direction * 7));
    renderTennisCalendar();
}

function renderTennisCalendar() {
    const grid = document.getElementById("tennis-calendar-grid");
    grid.innerHTML = "";

    // 1. Time header cell
    grid.innerHTML += `<div class="calendar-header-cell time-header">Heure</div>`;
    
    // 2. Day header cells (Mon - Sun)
    const daysShort = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    for (let i = 0; i < 7; i++) {
        const dayDate = addDays(currentWeekStartDate, i);
        const dayLabel = daysShort[i] + " " + dayDate.getDate() + "/" + (dayDate.getMonth() + 1);
        grid.innerHTML += `<div class="calendar-header-cell">${dayLabel}</div>`;
    }

    // 3. Grid slots (8:00 to 20:00)
    for (let hour = 8; hour <= 20; hour++) {
        // Time label column cell
        grid.innerHTML += `<div class="calendar-time-cell">${hour}h00</div>`;
        
        // Cells for each of the 7 days
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const slotDateStr = formatDate(addDays(currentWeekStartDate, dayOffset));
            const slotHourStr = hour.toString();
            
            // Check if booked
            const booking = STATE.reservations.find(r => r.date === slotDateStr && r.hour === slotHourStr);
            
            if (booking) {
                const member = STATE.adherents.find(a => a.id === booking.adherent_id);
                const memberName = member ? `${member.prenom} ${member.nom}` : "Adhérent inconnu";
                grid.innerHTML += `
                    <div class="calendar-day-cell booked" onclick="deleteTennisBooking('${booking.id}')" title="Cliquer pour supprimer la réservation">
                        <span>Réservé</span>
                        <span class="booked-adherent">${memberName}</span>
                    </div>
                `;
            } else {
                grid.innerHTML += `
                    <div class="calendar-day-cell" onclick="openTennisBookingModal('${slotDateStr}', '${slotHourStr}')" title="Cliquer pour réserver">
                        +
                    </div>
                `;
            }
        }
    }
}

function openTennisBookingModal(dateStr, hourStr) {
    const d = new Date(dateStr);
    const dayLabel = formatDateFrench(d);
    
    document.getElementById("tennis-booking-date").value = dateStr;
    document.getElementById("tennis-booking-hour").value = hourStr;
    document.getElementById("tennis-booking-label").innerText = `${dayLabel} à ${hourStr}h00 - ${Number(hourStr)+1}h00`;
    
    // Populate active cotisants dropdown
    const select = document.getElementById("tennis-booking-adherent");
    select.innerHTML = "";
    
    const activeMembers = STATE.adherents.filter(a => a.cotisation_a_jour);
    
    if (activeMembers.length === 0) {
        select.innerHTML = `<option value="">Aucun adhérent à jour de cotisation !</option>`;
    } else {
        activeMembers.forEach(a => {
            select.innerHTML += `<option value="${a.id}">${a.prenom} ${a.nom}</option>`;
        });
    }
    
    openModal("modal-tennis");
}

function saveTennisBooking(e) {
    e.preventDefault();
    const date = document.getElementById("tennis-booking-date").value;
    const hour = document.getElementById("tennis-booking-hour").value;
    const adherent_id = document.getElementById("tennis-booking-adherent").value;

    if (!adherent_id) {
        alert("Veuillez sélectionner un adhérent.");
        return;
    }

    const data = { date, hour, adherent_id };

    if (dbMode === 'firebase') {
        db.collection("reservations").add(data)
            .then(() => closeModal("modal-tennis"))
            .catch(err => alert("Erreur: " + err));
    } else {
        const id = "res-" + Date.now();
        STATE.reservations.push({ id, ...data });
        saveState();
        closeModal("modal-tennis");
        refreshAllViews();
    }
}

function deleteTennisBooking(id) {
    if (!confirm("Voulez-vous vraiment supprimer cette réservation ?")) return;

    if (dbMode === 'firebase') {
        db.collection("reservations").doc(id).delete()
            .catch(err => alert("Erreur: " + err));
    } else {
        STATE.reservations = STATE.reservations.filter(r => r.id !== id);
        saveState();
        refreshAllViews();
    }
}

// ============================================================================
// --- 7. COMPTABILITE (TRANSACTIONS & INVOICING) ---
// ============================================================================
function renderTransactionsList() {
    renderGeneralExpensesList();
    renderGeneralReceiptsList();
}

function renderGeneralExpensesList() {
    const listBody = document.getElementById("depenses-table-body");
    if (!listBody) return;
    listBody.innerHTML = "";

    const searchInput = document.getElementById("search-depenses");
    const searchVal = searchInput ? searchInput.value.toLowerCase() : "";
    
    const catSelect = document.getElementById("filter-depenses-cat");
    const filterCat = catSelect ? catSelect.value : "all";

    const filtered = STATE.transactions.filter(t => {
        const matchesType = t.type_flux === "Dépense";
        const matchesGeneral = !t.manifestation_id;
        const matchesPeriod = isDateInPeriod(t.date_transaction, STATE.currentPeriod);
        const matchesSearch = t.description.toLowerCase().includes(searchVal);
        const matchesCat = filterCat === "all" || t.categorie_id === filterCat;
        
        return matchesType && matchesGeneral && matchesPeriod && matchesSearch && matchesCat;
    });

    // Sort
    const sortField = SORTS.depenses.field;
    const sortDirection = SORTS.depenses.direction === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
        let valA, valB;
        if (sortField === 'date_transaction') {
            valA = new Date(a.date_transaction);
            valB = new Date(b.date_transaction);
        } else if (sortField === 'montant' || sortField === 'quantite' || sortField === 'prix') {
            valA = Number(a[sortField]) || 0;
            valB = Number(b[sortField]) || 0;
        } else if (sortField === 'categorie_id') {
            const catA = STATE.categories.find(c => c.id === a.categorie_id);
            const catB = STATE.categories.find(c => c.id === b.categorie_id);
            valA = catA ? catA.libelle.toLowerCase() : "";
            valB = catB ? catB.libelle.toLowerCase() : "";
        } else {
            valA = (a[sortField] || "").toString().toLowerCase();
            valB = (b[sortField] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucune dépense générale enregistrée</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const dateStr = formatDateFrench(new Date(t.date_transaction));
        const cat = STATE.categories.find(c => c.id === t.categorie_id);
        const catLabel = cat ? cat.libelle : "Inconnue";
        
        const payeBadgeClass = t.paye ? "badge-success" : "badge-warning";
        const payeLabel = t.paye ? "Réglé" : "En attente";
        
        listBody.innerHTML += `
            <tr>
                <td>${dateStr}</td>
                <td>${catLabel}</td>
                <td style="font-weight: 500;">${t.description}</td>
                <td style="font-weight: 600; text-align: right; color: var(--danger);">${Number(t.montant).toFixed(2)} €</td>
                <td>
                    <span class="badge ${payeBadgeClass}" style="cursor: pointer;" onclick="toggleTransactionPaid('${t.id}')" title="Changer statut de paiement">
                        ${payeLabel}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="generateInvoiceFromTransaction('${t.id}')" title="Générer Facture">
                            <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" onclick="editTransaction('${t.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteTransaction('${t.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    lucide.createIcons();
    updateSortIndicators('depenses');
}

function renderGeneralReceiptsList() {
    const listBody = document.getElementById("recettes-table-body");
    if (!listBody) return;
    listBody.innerHTML = "";

    const searchInput = document.getElementById("search-recettes");
    const searchVal = searchInput ? searchInput.value.toLowerCase() : "";
    
    const catSelect = document.getElementById("filter-recettes-cat");
    const filterCat = catSelect ? catSelect.value : "all";

    const filtered = STATE.transactions.filter(t => {
        const matchesType = t.type_flux === "Recette";
        const matchesGeneral = !t.manifestation_id;
        const matchesPeriod = isDateInPeriod(t.date_transaction, STATE.currentPeriod);
        const matchesSearch = t.description.toLowerCase().includes(searchVal);
        const matchesCat = filterCat === "all" || t.categorie_id === filterCat;
        
        return matchesType && matchesGeneral && matchesPeriod && matchesSearch && matchesCat;
    });

    // Sort
    const sortField = SORTS.recettes.field;
    const sortDirection = SORTS.recettes.direction === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
        let valA, valB;
        if (sortField === 'date_transaction') {
            valA = new Date(a.date_transaction);
            valB = new Date(b.date_transaction);
        } else if (sortField === 'montant' || sortField === 'quantite' || sortField === 'prix') {
            valA = Number(a[sortField]) || 0;
            valB = Number(b[sortField]) || 0;
        } else if (sortField === 'categorie_id') {
            const catA = STATE.categories.find(c => c.id === a.categorie_id);
            const catB = STATE.categories.find(c => c.id === b.categorie_id);
            valA = catA ? catA.libelle.toLowerCase() : "";
            valB = catB ? catB.libelle.toLowerCase() : "";
        } else {
            valA = (a[sortField] || "").toString().toLowerCase();
            valB = (b[sortField] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucune recette générale enregistrée</td></tr>`;
        return;
    }

    filtered.forEach(t => {
        const dateStr = formatDateFrench(new Date(t.date_transaction));
        const cat = STATE.categories.find(c => c.id === t.categorie_id);
        const catLabel = cat ? cat.libelle : "Inconnue";
        
        const payeBadgeClass = t.paye ? "badge-success" : "badge-warning";
        const payeLabel = t.paye ? "Réglé" : "En attente";
        
        listBody.innerHTML += `
            <tr>
                <td>${dateStr}</td>
                <td>${catLabel}</td>
                <td style="font-weight: 500;">${t.description}</td>
                <td style="font-weight: 600; text-align: right; color: var(--secondary);">${Number(t.montant).toFixed(2)} €</td>
                <td>
                    <span class="badge ${payeBadgeClass}" style="cursor: pointer;" onclick="toggleTransactionPaid('${t.id}')" title="Changer statut de paiement">
                        ${payeLabel}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="generateInvoiceFromTransaction('${t.id}')" title="Générer Facture">
                            <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" onclick="editTransaction('${t.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteTransaction('${t.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    lucide.createIcons();
    updateSortIndicators('recettes');
}

function calcTransactionMontant() {
    const qte = Number(document.getElementById("transaction-quantite").value) || 0;
    const prix = Number(document.getElementById("transaction-prix").value) || 0;
    document.getElementById("transaction-montant").value = (qte * prix).toFixed(2);
}

function saveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById("transaction-id").value;
    const type_flux = document.getElementById("transaction-flux").value;
    const date_transaction = document.getElementById("transaction-date").value;
    const categorie_id = document.getElementById("transaction-categorie").value;
    const moyen_payement = document.getElementById("transaction-moyen").value;
    const prix = Number(document.getElementById("transaction-prix").value) || 0;
    const quantite = Number(document.getElementById("transaction-quantite").value) || 1;
    const montant = Number(document.getElementById("transaction-montant").value) || 0;
    const paye = document.getElementById("transaction-paye").checked;
    const description = document.getElementById("transaction-desc").value;
    
    const adherent_id = document.getElementById("transaction-adherent").value;
    const manifestation_id = document.getElementById("transaction-manifestation").value;
    const investissement_id = document.getElementById("transaction-investissement").value;
    const produit_id = document.getElementById("transaction-produit").value;

    const data = {
        type_flux, date_transaction, categorie_id, moyen_payement,
        prix, quantite, montant, paye, description,
        adherent_id, manifestation_id, investissement_id, produit_id
    };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("transactions").doc(id).update(data)
                .then(() => {
                    adjustStockIfProductLinked(produit_id, quantite, type_flux, id);
                    closeModal("modal-transaction");
                    refreshAllViews();
                })
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            db.collection("transactions").add(data)
                .then((docRef) => {
                    adjustStockIfProductLinked(produit_id, quantite, type_flux, docRef.id);
                    closeModal("modal-transaction");
                    refreshAllViews();
                })
                .catch(err => alert("Erreur d'enregistrement: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.transactions.findIndex(t => t.id === id);
            STATE.transactions[idx] = { id, ...data };
        } else {
            const newId = "tx-" + Date.now();
            STATE.transactions.push({ id: newId, ...data });
            adjustStockIfProductLinked(produit_id, quantite, type_flux, newId);
        }
        saveState();
        closeModal("modal-transaction");
        refreshAllViews();
    }
}

// Adjust stock level of a beverage automatically when a transaction is recorded
function adjustStockIfProductLinked(prodId, qte, typeFlux, txId) {
    if (!prodId) return;
    
    const p = STATE.produits.find(item => item.id === prodId);
    if (!p) return;
    
    let newStock = p.quantite_stock;
    if (typeFlux === "Recette") {
        // Selling drinks: stocks decrease
        newStock -= Number(qte);
    } else {
        // Buying drinks: stocks increase
        newStock += Number(qte);
    }
    
    if (dbMode === 'firebase') {
        db.collection("produits").doc(prodId).update({ quantite_stock: newStock });
    } else {
        p.quantite_stock = newStock;
        saveState();
    }
}

function editTransaction(id) {
    const t = STATE.transactions.find(item => item.id === id);
    if (!t) return;
    
    document.getElementById("transaction-id").value = t.id;
    document.getElementById("transaction-flux").value = t.type_flux;
    document.getElementById("transaction-date").value = t.date_transaction;
    document.getElementById("transaction-moyen").value = t.moyen_payement;
    document.getElementById("transaction-prix").value = t.prix;
    document.getElementById("transaction-quantite").value = t.quantite;
    document.getElementById("transaction-montant").value = t.montant;
    document.getElementById("transaction-paye").checked = t.paye;
    document.getElementById("transaction-desc").value = t.description;
    
    document.getElementById("transaction-adherent").value = t.adherent_id || "";
    document.getElementById("transaction-manifestation").value = t.manifestation_id || "";
    document.getElementById("transaction-investissement").value = t.investissement_id || "";
    document.getElementById("transaction-produit").value = t.produit_id || "";
    
    // Dynamically filter categories based on the context of this transaction
    updateTransactionCategoriesDropdown();
    // Then set the selected category ID
    document.getElementById("transaction-categorie").value = t.categorie_id;
    
    document.getElementById("transaction-modal-title").innerText = "Modifier la Transaction";
    openModal("modal-transaction");
}

function deleteTransaction(id) {
    if (!confirm("Voulez-vous vraiment supprimer cette transaction ?")) return;

    if (dbMode === 'firebase') {
        db.collection("transactions").doc(id).delete()
            .catch(err => alert("Erreur de suppression: " + err));
    } else {
        STATE.transactions = STATE.transactions.filter(t => t.id !== id);
        saveState();
        refreshAllViews();
    }
}

function toggleTransactionPaid(id) {
    const t = STATE.transactions.find(item => item.id === id);
    if (!t) return;
    
    const newVal = !t.paye;
    
    if (dbMode === 'firebase') {
        db.collection("transactions").doc(id).update({ paye: newVal });
    } else {
        t.paye = newVal;
        saveState();
        refreshAllViews();
    }
}

// Show/hide fields depending on transaction type
function toggleTransactionDetails() {
    const flux = document.getElementById("transaction-flux").value;
    const catSelect = document.getElementById("transaction-categorie");
    
    // Autofill category suggestions depending on flow
    if (flux === "Recette") {
        catSelect.value = "cat-1"; // Cotisations
    } else {
        catSelect.value = "cat-9"; // Dépenses Générales
    }
}

// ============================================================================
// --- 8. ANNUAL FINANCIAL BALANCE SHEET (BILAN) ---
// ============================================================================
function renderBilanAnnuel() {
    let recTotal = 0;
    let depTotal = 0;
    
    let catRecTotals = {};
    let catDepTotals = {};
    let manifTotals = {};

    // 1. Process active transactions (filtered by period)
    STATE.transactions.forEach(t => {
        if (t.paye && isDateInPeriod(t.date_transaction, STATE.currentPeriod)) {
            const amount = Number(t.montant);
            const cat = STATE.categories.find(c => c.id === t.categorie_id);
            const catName = cat ? cat.libelle : "Autre";

            if (t.type_flux === "Recette") {
                recTotal += amount;
                catRecTotals[catName] = (catRecTotals[catName] || 0) + amount;
            } else {
                depTotal += amount;
                catDepTotals[catName] = (catDepTotals[catName] || 0) + amount;
            }

            // Manifestations link
            if (t.manifestation_id) {
                const manif = STATE.manifestations.find(m => m.id === t.manifestation_id);
                if (manif) {
                    if (!manifTotals[manif.id]) {
                        manifTotals[manif.id] = { nom: manif.nom, date: manif.date_debut, recettes: 0, depenses: 0 };
                    }
                    if (t.type_flux === "Recette") {
                        manifTotals[manif.id].recettes += amount;
                    } else {
                        manifTotals[manif.id].depenses += amount;
                    }
                }
            }
        }
    });

    // 1.b Process cash floats as baseline expenses for active period manifestations
    STATE.manifestations.forEach(m => {
        if (isDateInPeriod(m.date_debut, STATE.currentPeriod)) {
            const stands = (STATE.feteRuraleStands || []).filter(s => s.manifestation_id === m.id);
            let mFondTotal = 0;
            stands.forEach(s => {
                mFondTotal += Number(s.fond_de_caisse) || 0;
            });
            
            if (mFondTotal > 0) {
                // Add to overall annual expenses
                depTotal += mFondTotal;
                catDepTotals["Fonds de caisse (Stands)"] = (catDepTotals["Fonds de caisse (Stands)"] || 0) + mFondTotal;
                
                // Add to the specific manifestation totals
                if (!manifTotals[m.id]) {
                    manifTotals[m.id] = { nom: m.nom, date: m.date_debut, recettes: 0, depenses: 0 };
                }
                manifTotals[m.id].depenses += mFondTotal;
            }
        }
    });

    // 2. Set stats widgets
    document.getElementById("bilan-total-recettes").innerText = recTotal.toFixed(2) + " €";
    document.getElementById("bilan-total-depenses").innerText = depTotal.toFixed(2) + " €";
    const net = recTotal - depTotal;
    const netWidget = document.getElementById("bilan-net");
    netWidget.innerText = net.toFixed(2) + " €";
    if (net >= 0) {
        netWidget.parentElement.parentElement.className = "glass-panel metric-card success";
    } else {
        netWidget.parentElement.parentElement.className = "glass-panel metric-card danger";
    }

    // 3. Render Recettes Categories table
    const recCatTable = document.getElementById("bilan-recettes-categories");
    recCatTable.innerHTML = "";
    if (Object.keys(catRecTotals).length === 0) {
        recCatTable.innerHTML = `<tr><td colspan="2" style="color: var(--text-muted); text-align: center;">Aucune recette enregistrée</td></tr>`;
    } else {
        Object.keys(catRecTotals).forEach(name => {
            recCatTable.innerHTML += `
                <tr>
                    <td>${name}</td>
                    <td style="font-weight: 600; text-align: right; color: var(--secondary);">${catRecTotals[name].toFixed(2)} €</td>
                </tr>
            `;
        });
    }

    // 4. Render Depenses Categories table
    const depCatTable = document.getElementById("bilan-depenses-categories");
    depCatTable.innerHTML = "";
    if (Object.keys(catDepTotals).length === 0) {
        depCatTable.innerHTML = `<tr><td colspan="2" style="color: var(--text-muted); text-align: center;">Aucune dépense enregistrée</td></tr>`;
    } else {
        Object.keys(catDepTotals).forEach(name => {
            depCatTable.innerHTML += `
                <tr>
                    <td>${name}</td>
                    <td style="font-weight: 600; text-align: right; color: var(--danger);">${catDepTotals[name].toFixed(2)} €</td>
                </tr>
            `;
        });
    }

    // 5. Render Manifestations list
    const manifSummaryTable = document.getElementById("bilan-manifestations-summary");
    manifSummaryTable.innerHTML = "";
    if (Object.keys(manifTotals).length === 0) {
        manifSummaryTable.innerHTML = `<tr><td colspan="5" style="color: var(--text-muted); text-align: center;">Aucune manifestation liée à des flux financiers</td></tr>`;
    } else {
        Object.keys(manifTotals).forEach(id => {
            const m = manifTotals[id];
            const mNet = m.recettes - m.depenses;
            const netColor = mNet >= 0 ? "color: var(--secondary);" : "color: var(--danger);";
            manifSummaryTable.innerHTML += `
                <tr>
                    <td style="font-weight: 500;">${m.nom}</td>
                    <td>${formatDateFrench(new Date(m.date))}</td>
                    <td style="color: var(--secondary);">${m.recettes.toFixed(2)} €</td>
                    <td style="color: var(--danger);">${m.depenses.toFixed(2)} €</td>
                    <td style="${netColor} font-weight: 600;">${mNet.toFixed(2)} €</td>
                </tr>
            `;
        });
    }

    // 6. Set headers totals
    const recHeaderTotal = document.getElementById("bilan-recettes-header-total");
    if (recHeaderTotal) recHeaderTotal.innerText = recTotal.toFixed(2) + " €";

    const depHeaderTotal = document.getElementById("bilan-depenses-header-total");
    if (depHeaderTotal) depHeaderTotal.innerText = depTotal.toFixed(2) + " €";

    let totalManifRec = 0;
    let totalManifDep = 0;
    Object.keys(manifTotals).forEach(id => {
        totalManifRec += manifTotals[id].recettes;
        totalManifDep += manifTotals[id].depenses;
    });
    const totalManifNet = totalManifRec - totalManifDep;
    const manifHeaderTotal = document.getElementById("bilan-manifestations-header-total");
    if (manifHeaderTotal) {
        manifHeaderTotal.innerText = totalManifNet.toFixed(2) + " €";
        if (totalManifNet > 0) {
            manifHeaderTotal.style.color = "var(--secondary)";
        } else if (totalManifNet < 0) {
            manifHeaderTotal.style.color = "var(--danger)";
        } else {
            manifHeaderTotal.style.color = "var(--text-main)";
        }
    }
}

// ============================================================================
// --- 9. MANIFESTATIONS (EVENTS) MANAGEMENT ---
// ============================================================================
function renderManifestationsList() {
    const listBody = document.getElementById("manifestations-table-body");
    listBody.innerHTML = "";

    if (STATE.manifestations.length === 0) {
        listBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucun événement créé</td></tr>`;
        return;
    }

    // Calculate finances and clone for sorting (filtered by period)
    const list = STATE.manifestations.filter(m => isDateInPeriod(m.date_debut, STATE.currentPeriod)).map(m => {
        let rSum = 0;
        let dSum = 0;
        STATE.transactions.forEach(t => {
            if (t.manifestation_id === m.id && t.paye) {
                if (t.type_flux === "Recette") rSum += Number(t.montant);
                else dSum += Number(t.montant);
            }
        });
        
        // Include cash floats of stands in the event's expenses
        const stands = (STATE.feteRuraleStands || []).filter(s => s.manifestation_id === m.id);
        stands.forEach(s => {
            dSum += Number(s.fond_de_caisse) || 0;
        });

        return {
            ...m,
            recettes: rSum,
            depenses: dSum,
            bilan: rSum - dSum
        };
    });

    // Sort manifestations dynamically
    const sortField = SORTS.manifestations.field;
    const sortDirection = SORTS.manifestations.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        let valA, valB;
        if (sortField === 'date_debut' || sortField === 'date_fin') {
            valA = new Date(a[sortField]);
            valB = new Date(b[sortField]);
        } else if (sortField === 'recettes' || sortField === 'depenses' || sortField === 'bilan') {
            valA = Number(a[sortField]) || 0;
            valB = Number(b[sortField]) || 0;
        } else {
            valA = (a[sortField] || "").toString().toLowerCase();
            valB = (b[sortField] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });

    list.forEach(m => {
        const rSum = m.recettes;
        const dSum = m.depenses;
        const net = m.bilan;
        const netColor = net >= 0 ? "color: var(--secondary);" : "color: var(--danger);";
        
        listBody.innerHTML += `
            <tr>
                <td style="font-weight: 500;">${m.nom}</td>
                <td>${formatDateFrench(new Date(m.date_debut))}</td>
                <td>${formatDateFrench(new Date(m.date_fin))}</td>
                <td>${m.lieu}</td>
                <td style="color: var(--secondary);">${rSum.toFixed(2)} €</td>
                <td style="color: var(--danger);">${dSum.toFixed(2)} €</td>
                <td style="${netColor} font-weight: 600;">${net.toFixed(2)} €</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-success btn-icon-only" onclick="openManifestationExpenseModalDirectly('${m.id}')" title="Ajouter une dépense">
                            <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" onclick="showManifestationDetails('${m.id}')" title="Voir bilan analytique détaillé">
                            <i data-lucide="bar-chart-2" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" onclick="editManifestation('${m.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteManifestation('${m.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    lucide.createIcons();
    updateSortIndicators('manifestations');
}

function openTransactionModalWithManifestation(manifestationId) {
    // 1. Reset form
    document.getElementById("form-transaction").reset();
    document.getElementById("transaction-id").value = "";
    document.getElementById("transaction-modal-title").innerText = "Saisir Transaction";
    
    // 2. Set default date to today
    document.getElementById("transaction-date").value = formatDate(new Date());
    
    // 3. Set default amounts and state
    document.getElementById("transaction-flux").value = "Recette";
    document.getElementById("transaction-quantite").value = 1;
    document.getElementById("transaction-prix").value = "";
    document.getElementById("transaction-montant").value = "";
    document.getElementById("transaction-paye").checked = true;
    
    // 4. Pre-select manifestation
    document.getElementById("transaction-manifestation").value = manifestationId;
    
    // 5. Populate and select dynamic category
    updateTransactionCategoriesDropdown();
    document.getElementById("transaction-categorie").value = "cat-11"; // "Buvette & Restauration (Événement)"
    
    // 6. Open modal
    openModal("modal-transaction");
}

function showManifestationDetails(id) {
    const m = STATE.manifestations.find(item => item.id === id);
    if (!m) return;
    
    document.getElementById("manifestation-details-title").innerText = `Bilan détaillé : ${m.nom}`;
    
    activeManifestationId = id;
    
    const normalLayout = document.getElementById("normal-manif-details-layout");
    const specialLayout = document.getElementById("special-manif-details-layout");
    
    if (normalLayout) normalLayout.style.display = "none";
    if (specialLayout) {
        specialLayout.style.display = "block";
        // Reset subtabs to dashboard active
        specialLayout.querySelectorAll(".sub-tab-btn").forEach(b => {
            if (b.getAttribute("data-subtab") === "manif-dashboard") {
                b.classList.add("active");
            } else {
                b.classList.remove("active");
            }
        });
        specialLayout.querySelectorAll(".accounting-sub-pane").forEach(p => {
            if (p.id === "subtab-manif-dashboard") {
                p.classList.add("active");
            } else {
                p.classList.remove("active");
            }
        });
    }
    
    renderFeteRurale();

    document.getElementById("manifestation-details-panel").style.display = "block";
}

function saveManifestation(e) {
    e.preventDefault();
    const id = document.getElementById("manifestation-id").value;
    const nom = document.getElementById("manifestation-nom").value;
    const date_debut = document.getElementById("manifestation-debut").value;
    const date_fin = document.getElementById("manifestation-fin").value;
    const lieu = document.getElementById("manifestation-lieu").value;

    const data = { nom, date_debut, date_fin, lieu };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("manifestations").doc(id).update(data)
                .then(() => closeModal("modal-manifestation"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            db.collection("manifestations").add(data)
                .then(() => closeModal("modal-manifestation"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.manifestations.findIndex(m => m.id === id);
            STATE.manifestations[idx] = { id, ...data };
        } else {
            const newId = "man-" + Date.now();
            STATE.manifestations.push({ id: newId, ...data });
        }
        saveState();
        closeModal("modal-manifestation");
        refreshAllViews();
    }
}

function editManifestation(id) {
    const m = STATE.manifestations.find(item => item.id === id);
    if (!m) return;
    
    document.getElementById("manifestation-id").value = m.id;
    document.getElementById("manifestation-nom").value = m.nom;
    document.getElementById("manifestation-debut").value = m.date_debut;
    document.getElementById("manifestation-fin").value = m.date_fin;
    document.getElementById("manifestation-lieu").value = m.lieu;
    
    document.getElementById("manifestation-modal-title").innerText = "Modifier la Manifestation";
    openModal("modal-manifestation");
}

function deleteManifestation(id) {
    if (!confirm("Voulez-vous vraiment supprimer cet événement ?")) return;

    if (dbMode === 'firebase') {
        db.collection("manifestations").doc(id).delete()
            .catch(err => alert("Erreur: " + err));
    } else {
        STATE.manifestations = STATE.manifestations.filter(m => m.id !== id);
        saveState();
        refreshAllViews();
    }
}

// ============================================================================
// --- 10. STOCKS & BEVERAGES (RESERVE BOISSONS) ---
// ============================================================================
function renderProduitsList() {
    const listBody = document.getElementById("produits-table-body");
    listBody.innerHTML = "";

    if (STATE.produits.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucune boisson enregistrée</td></tr>`;
        return;
    }

    // Clone and calculate status for sorting
    const list = STATE.produits.map(p => {
        const isCritical = p.quantite_stock <= p.seuil_alerte;
        return {
            ...p,
            statut: isCritical ? 1 : 0
        };
    });

    // Sort products dynamically
    const sortField = SORTS.produits.field;
    const sortDirection = SORTS.produits.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        let valA, valB;
        if (sortField === 'prix' || sortField === 'quantite_stock' || sortField === 'seuil_alerte' || sortField === 'statut') {
            valA = Number(a[sortField]) || 0;
            valB = Number(b[sortField]) || 0;
        } else {
            valA = (a[sortField] || "").toString().toLowerCase();
            valB = (b[sortField] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });

    list.forEach(p => {
        const isCritical = p.quantite_stock <= p.seuil_alerte;
        const statusBadgeClass = isCritical ? 'badge-danger' : 'badge-success';
        const statusLabel = isCritical ? 'Alerte Stock' : 'Stock OK';
        
        // Progress bar percentage (cap at double threshold)
        const doubleSeuil = p.seuil_alerte * 2 || 1;
        const percent = Math.min(100, (p.quantite_stock / doubleSeuil) * 100);
        const progressFillColor = isCritical ? 'var(--danger)' : 'var(--secondary)';
        
        listBody.innerHTML += `
            <tr class="stock-item-row-tr">
                <td style="font-weight: 500;">${p.nom_boisson}</td>
                <td>${Number(p.prix).toFixed(2)} €</td>
                <td>
                    <div style="display: flex; align-items: center;">
                        <span style="font-weight: 600; min-width: 40px;">${p.quantite_stock}</span>
                        <div class="stock-progress-bar-bg">
                            <div class="stock-progress-bar-fill" style="width: ${percent}%; background-color: ${progressFillColor};"></div>
                        </div>
                    </div>
                </td>
                <td>${p.seuil_alerte}</td>
                <td><span class="badge ${statusBadgeClass}">${statusLabel}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="editProduit('${p.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteProduit('${p.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    lucide.createIcons();
    updateSortIndicators('produits');
}

function saveProduit(e) {
    e.preventDefault();
    const id = document.getElementById("produit-id").value;
    const nom_boisson = document.getElementById("produit-nom").value;
    const prix = Number(document.getElementById("produit-prix").value) || 0;
    const quantite_stock = Number(document.getElementById("produit-stock").value) || 0;
    const seuil_alerte = Number(document.getElementById("produit-seuil").value) || 0;

    const data = { nom_boisson, prix, quantite_stock, seuil_alerte };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("produits").doc(id).update(data)
                .then(() => closeModal("modal-produit"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            db.collection("produits").add(data)
                .then(() => closeModal("modal-produit"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.produits.findIndex(p => p.id === id);
            STATE.produits[idx] = { id, ...data };
        } else {
            const newId = "prod-" + Date.now();
            STATE.produits.push({ id: newId, ...data });
        }
        saveState();
        closeModal("modal-produit");
        refreshAllViews();
    }
}

function editProduit(id) {
    const p = STATE.produits.find(item => item.id === id);
    if (!p) return;
    
    document.getElementById("produit-id").value = p.id;
    document.getElementById("produit-nom").value = p.nom_boisson;
    document.getElementById("produit-prix").value = p.prix;
    document.getElementById("produit-stock").value = p.quantite_stock;
    document.getElementById("produit-seuil").value = p.seuil_alerte;
    
    document.getElementById("produit-modal-title").innerText = "Modifier le Produit";
    openModal("modal-produit");
}

function deleteProduit(id) {
    if (!confirm("Voulez-vous vraiment supprimer ce produit de la réserve ?")) return;

    if (dbMode === 'firebase') {
        db.collection("produits").doc(id).delete()
            .catch(err => alert("Erreur de suppression: " + err));
    } else {
        STATE.produits = STATE.produits.filter(p => p.id !== id);
        saveState();
        refreshAllViews();
    }
}

// --- YEAR-END INVENTORY ADJUSTMENT PROCESS ---
function openInventoryModal() {
    const tableBody = document.getElementById("inventory-table-body");
    tableBody.innerHTML = "";

    if (STATE.produits.length === 0) {
        alert("Aucun produit enregistré à inventorier.");
        return;
    }

    STATE.produits.forEach(p => {
        tableBody.innerHTML += `
            <tr data-prod-id="${p.id}">
                <td style="font-weight: 500;">${p.nom_boisson}</td>
                <td id="inv-theo-${p.id}">${p.quantite_stock}</td>
                <td>
                    <input type="number" style="width: 100px; padding: 6px;" id="inv-real-${p.id}" value="${p.quantite_stock}" min="0" oninput="calcInventoryDiff('${p.id}')">
                </td>
                <td id="inv-diff-qty-${p.id}" style="font-weight: 600;">0</td>
                <td id="inv-diff-val-${p.id}" style="font-weight: 600;">0.00 €</td>
            </tr>
        `;
    });

    openModal("modal-inventory");
}

function calcInventoryDiff(id) {
    const theo = Number(document.getElementById(`inv-theo-${id}`).innerText);
    const real = Number(document.getElementById(`inv-real-${id}`).value) || 0;
    const diff = real - theo;
    
    const p = STATE.produits.find(item => item.id === id);
    const price = p ? p.prix : 0;
    const diffVal = diff * price;

    const diffQtyCell = document.getElementById(`inv-diff-qty-${id}`);
    const diffValCell = document.getElementById(`inv-diff-val-${id}`);
    
    diffQtyCell.innerText = (diff > 0 ? "+" : "") + diff;
    diffValCell.innerText = (diffVal > 0 ? "+" : "") + diffVal.toFixed(2) + " €";
    
    if (diff > 0) {
        diffQtyCell.style.color = "var(--secondary)";
        diffValCell.style.color = "var(--secondary)";
    } else if (diff < 0) {
        diffQtyCell.style.color = "var(--danger)";
        diffValCell.style.color = "var(--danger)";
    } else {
        diffQtyCell.style.color = "var(--text-main)";
        diffValCell.style.color = "var(--text-main)";
    }
}

function saveInventoryAdjustments(e) {
    e.preventDefault();
    const rows = document.querySelectorAll("#inventory-table-body tr");
    const todayStr = formatDate(new Date());
    
    let totalAdjustmentVal = 0;
    let adjustmentsMade = [];

    rows.forEach(row => {
        const prodId = row.getAttribute("data-prod-id");
        const theo = Number(document.getElementById(`inv-theo-${prodId}`).innerText);
        const real = Number(document.getElementById(`inv-real-${prodId}`).value) || 0;
        const diff = real - theo;
        
        if (diff !== 0) {
            const p = STATE.produits.find(item => item.id === prodId);
            const price = p ? p.prix : 0;
            const value = diff * price;
            totalAdjustmentVal += value;
            
            adjustmentsMade.push({
                prodId: prodId,
                name: p.nom_boisson,
                newQty: real,
                diffQty: diff,
                diffVal: value
            });
        }
    });

    if (adjustmentsMade.length === 0) {
        alert("Aucun écart de stock constaté. Aucun ajustement requis.");
        closeModal("modal-inventory");
        return;
    }

    // Save actual inventories and log correction transactions
    if (dbMode === 'firebase') {
        adjustmentsMade.forEach(adj => {
            // Update stock
            db.collection("produits").doc(adj.prodId).update({ quantite_stock: adj.newQty });
            
            // Log accounting adjustment transaction
            const flux = adj.diffVal > 0 ? "Recette" : "Dépense";
            const amt = Math.abs(adj.diffVal);
            
            db.collection("transactions").add({
                type_flux: flux,
                date_transaction: todayStr,
                categorie_id: "cat-9", // Ajustement Inventaire
                moyen_payement: "Virement",
                prix: amt,
                quantite: 1,
                montant: amt,
                paye: true,
                description: `Ajustement inventaire fin d'année - ${adj.name} (Écart: ${adj.diffQty})`,
                adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: adj.prodId
            });
        });
    } else {
        adjustmentsMade.forEach(adj => {
            // Update stock
            const p = STATE.produits.find(item => item.id === adj.prodId);
            p.quantite_stock = adj.newQty;
            
            // Log transaction
            const flux = adj.diffVal > 0 ? "Recette" : "Dépense";
            const amt = Math.abs(adj.diffVal);
            
            STATE.transactions.push({
                id: "tx-" + Date.now() + Math.random().toString(36).substr(2, 4),
                type_flux: flux,
                date_transaction: todayStr,
                categorie_id: "cat-9", // Ajustement Inventaire
                moyen_payement: "Virement",
                prix: amt,
                quantite: 1,
                montant: amt,
                paye: true,
                description: `Ajustement inventaire fin d'année - ${adj.name} (Écart: ${adj.diffQty})`,
                adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: adj.prodId
            });
        });
        saveState();
        refreshAllViews();
    }

    alert(`Inventaire validé ! ${adjustmentsMade.length} boissons ajustées. Impact comptable : ${totalAdjustmentVal.toFixed(2)} €`);
    closeModal("modal-inventory");
}

// ============================================================================
// --- 11. INVESTISSEMENTS (ASSETS & AMORTIZATION) ---
// ============================================================================
function renderInvestissementsList() {
    const listBody = document.getElementById("investissements-table-body");
    listBody.innerHTML = "";

    // Clone and calculate values for sorting (filtered by period)
    const list = STATE.investissements.filter(inv => isDateInPeriod(inv.date_acquisition, STATE.currentPeriod)).map(inv => {
        const dateAchat = new Date(inv.date_acquisition);
        const duration = Number(inv.duree_amortissement_ans) || 0;
        const cost = Number(inv.montant_achat);
        const yearsElapsed = getYearsSince(dateAchat);
        
        let residualValue = cost;
        if (duration > 0) {
            if (yearsElapsed < duration) {
                residualValue = cost * (1 - (yearsElapsed / duration));
            } else {
                residualValue = 0;
            }
        }
        return {
            ...inv,
            valeur_residuelle: residualValue
        };
    });

    if (list.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">Aucun investissement enregistré pour cette période</td></tr>`;
        return;
    }

    // Sort investments dynamically
    const sortField = SORTS.investissements.field;
    const sortDirection = SORTS.investissements.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
        let valA, valB;
        if (sortField === 'date_acquisition') {
            valA = new Date(a[sortField]);
            valB = new Date(b[sortField]);
        } else if (sortField === 'montant_achat' || sortField === 'duree_amortissement_ans' || sortField === 'valeur_residuelle') {
            valA = Number(a[sortField]) || 0;
            valB = Number(b[sortField]) || 0;
        } else {
            valA = (a[sortField] || "").toString().toLowerCase();
            valB = (b[sortField] || "").toString().toLowerCase();
        }
        
        if (valA < valB) return -1 * sortDirection;
        if (valA > valB) return 1 * sortDirection;
        return 0;
    });

    list.forEach(inv => {
        const dateAchat = new Date(inv.date_acquisition);
        const dateStr = formatDateFrench(dateAchat);
        const duration = Number(inv.duree_amortissement_ans) || 0;
        const cost = Number(inv.montant_achat);
        const residualValue = inv.valeur_residuelle;
        
        const durationStr = duration > 0 ? `${duration} ans` : "Non amorti";

        listBody.innerHTML += `
            <tr>
                <td style="font-weight: 500;">${inv.libelle}</td>
                <td>${dateStr}</td>
                <td>${cost.toFixed(2)} €</td>
                <td>${durationStr}</td>
                <td style="font-weight: 600; color: var(--primary);">${residualValue.toFixed(2)} €</td>
                <td><span class="badge badge-primary">${inv.etat}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="editInvestissement('${inv.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteInvestissement('${inv.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    lucide.createIcons();
    updateSortIndicators('investissements');
}

function saveInvestissement(e) {
    e.preventDefault();
    const id = document.getElementById("investissement-id").value;
    const libelle = document.getElementById("invest-libelle").value;
    const date_acquisition = document.getElementById("invest-date").value;
    const montant_achat = Number(document.getElementById("invest-montant").value) || 0;
    const rawAmortVal = document.getElementById("invest-amort").value;
    const duree_amortissement_ans = rawAmortVal !== "" ? (Number(rawAmortVal) || 0) : 0;
    const etat = document.getElementById("invest-etat").value;

    const data = { libelle, date_acquisition, montant_achat, duree_amortissement_ans, etat };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("investissements").doc(id).update(data)
                .then(() => closeModal("modal-investissement"))
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            // Also log an automated accounting transaction when investment is created
            db.collection("investissements").add(data)
                .then(docRef => {
                    db.collection("transactions").add({
                        type_flux: "Dépense",
                        date_transaction: date_acquisition,
                        categorie_id: "cat-8", // Investissement Amortissable
                        moyen_payement: "Virement",
                        prix: montant_achat,
                        quantite: 1,
                        montant: montant_achat,
                        paye: true,
                        description: `Achat investissement - ${libelle}`,
                        adherent_id: "", manifestation_id: "", investissement_id: docRef.id, produit_id: ""
                    });
                    closeModal("modal-investissement");
                })
                .catch(err => alert("Erreur: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.investissements.findIndex(inv => inv.id === id);
            STATE.investissements[idx] = { id, ...data };
        } else {
            const newId = "inv-" + Date.now();
            STATE.investissements.push({ id: newId, ...data });
            
            // Log automatic transaction
            STATE.transactions.push({
                id: "tx-" + Date.now(),
                type_flux: "Dépense",
                date_transaction: date_acquisition,
                categorie_id: "cat-8", // Investissement Amortissable
                moyen_payement: "Virement",
                prix: montant_achat,
                quantite: 1,
                montant: montant_achat,
                paye: true,
                description: `Achat investissement - ${libelle}`,
                adherent_id: "", manifestation_id: "", investissement_id: newId, produit_id: ""
            });
        }
        saveState();
        closeModal("modal-investissement");
        refreshAllViews();
    }
}

function editInvestissement(id) {
    const inv = STATE.investissements.find(item => item.id === id);
    if (!inv) return;
    
    document.getElementById("investissement-id").value = inv.id;
    document.getElementById("invest-libelle").value = inv.libelle;
    document.getElementById("invest-date").value = inv.date_acquisition;
    document.getElementById("invest-montant").value = inv.montant_achat;
    document.getElementById("invest-amort").value = inv.duree_amortissement_ans;
    document.getElementById("invest-etat").value = inv.etat;
    
    document.getElementById("investissement-modal-title").innerText = "Modifier l'Investissement";
    openModal("modal-investissement");
}

function deleteInvestissement(id) {
    if (!confirm("Voulez-vous vraiment supprimer cet investissement ?")) return;

    if (dbMode === 'firebase') {
        db.collection("investissements").doc(id).delete()
            .catch(err => alert("Erreur: " + err));
    } else {
        STATE.investissements = STATE.investissements.filter(inv => inv.id !== id);
        saveState();
        refreshAllViews();
    }
}

// ============================================================================
// --- 12. MEETING NOTES (REUNIONS & NOTES) ---
// ============================================================================
function renderNotesList() {
    const listBody = document.getElementById("notes-sidebar-list");
    listBody.innerHTML = "";

    // Sort notes descending by date (filtered by period)
    const sortedNotes = [...STATE.notes]
        .filter(n => isDateInPeriod(n.date_reunion, STATE.currentPeriod))
        .sort((a,b) => new Date(b.date_reunion) - new Date(a.date_reunion));

    if (sortedNotes.length === 0) {
        listBody.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Aucune note rédigée pour cette période</div>`;
        return;
    }

    sortedNotes.forEach(n => {
        const activeClass = selectedNoteId === n.id ? "active" : "";
        listBody.innerHTML += `
            <div class="note-item-card ${activeClass}" onclick="selectNote('${n.id}')">
                <h3>${n.titre}</h3>
                <div class="note-date">${formatDateFrench(new Date(n.date_reunion))}</div>
            </div>
        `;
    });
}

function selectNote(id) {
    selectedNoteId = id;
    renderNotesList();

    const n = STATE.notes.find(item => item.id === id);
    if (!n) return;

    document.getElementById("note-view-title").innerText = n.titre;
    document.getElementById("note-view-date").innerText = "Date de réunion : " + formatDateFrench(new Date(n.date_reunion));
    
    // Tag display
    const tagSpan = document.getElementById("note-view-tag");
    tagSpan.innerText = "";
    if (n.manifestation_id) {
        const m = STATE.manifestations.find(item => item.id === n.manifestation_id);
        if (m) {
            tagSpan.innerHTML = `<span class="badge badge-primary">🎁 Manifestation : ${m.nom}</span>`;
        }
    }

    document.getElementById("note-view-body").innerText = n.contenu;
    
    document.getElementById("note-view-actions").innerHTML = `
        <button class="btn btn-secondary" onclick="editNote('${n.id}')">Modifier</button>
        <button class="btn btn-danger" onclick="deleteNote('${n.id}')">Supprimer</button>
    `;

    // Ensure editor panel shows read mode
    document.getElementById("note-read-view").style.display = "flex";
    document.getElementById("note-edit-view").style.display = "none";
}

function createNewNote() {
    selectedNoteId = null;
    
    document.getElementById("edit-note-id").value = "";
    document.getElementById("edit-note-title").value = "";
    document.getElementById("edit-note-date").value = formatDate(new Date());
    document.getElementById("edit-note-content").value = "";
    document.getElementById("edit-note-manif").value = "";

    // Show edit layout
    document.getElementById("note-read-view").style.display = "none";
    document.getElementById("note-edit-view").style.display = "flex";
}

function editNote(id) {
    const n = STATE.notes.find(item => item.id === id);
    if (!n) return;

    document.getElementById("edit-note-id").value = n.id;
    document.getElementById("edit-note-title").value = n.titre;
    document.getElementById("edit-note-date").value = n.date_reunion;
    document.getElementById("edit-note-content").value = n.contenu;
    document.getElementById("edit-note-manif").value = n.manifestation_id || "";

    document.getElementById("note-read-view").style.display = "none";
    document.getElementById("note-edit-view").style.display = "flex";
}

function cancelNoteEdit() {
    if (selectedNoteId) {
        selectNote(selectedNoteId);
    } else {
        document.getElementById("note-read-view").style.display = "flex";
        document.getElementById("note-edit-view").style.display = "none";
        document.getElementById("note-view-title").innerText = "Sélectionnez une note";
        document.getElementById("note-view-date").innerText = "";
        document.getElementById("note-view-tag").innerText = "";
        document.getElementById("note-view-body").innerText = "Sélectionnez ou créez une note pour commencer la rédaction.";
        document.getElementById("note-view-actions").innerHTML = "";
    }
}

function saveNote() {
    const id = document.getElementById("edit-note-id").value;
    const titre = document.getElementById("edit-note-title").value;
    const date_reunion = document.getElementById("edit-note-date").value;
    const contenu = document.getElementById("edit-note-content").value;
    const manifestation_id = document.getElementById("edit-note-manif").value;

    if (!titre || !date_reunion) {
        alert("Le titre et la date sont requis.");
        return;
    }

    const data = { titre, date_reunion, contenu, manifestation_id };

    if (dbMode === 'firebase') {
        if (id) {
            db.collection("notes").doc(id).update(data)
                .then(() => {
                    selectedNoteId = id;
                    selectNote(id);
                })
                .catch(err => alert("Erreur: " + err));
        } else {
            db.collection("notes").add(data)
                .then(docRef => {
                    selectedNoteId = docRef.id;
                    selectNote(docRef.id);
                })
                .catch(err => alert("Erreur: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.notes.findIndex(n => n.id === id);
            STATE.notes[idx] = { id, ...data };
            selectedNoteId = id;
        } else {
            const newId = "note-" + Date.now();
            STATE.notes.push({ id: newId, ...data });
            selectedNoteId = newId;
        }
        saveState();
        refreshAllViews();
        selectNote(selectedNoteId);
    }
}

function deleteNote(id) {
    if (!confirm("Voulez-vous vraiment supprimer cette note ?")) return;

    if (dbMode === 'firebase') {
        db.collection("notes").doc(id).delete()
            .then(() => {
                selectedNoteId = null;
                cancelNoteEdit();
            })
            .catch(err => alert("Erreur: " + err));
    } else {
        STATE.notes = STATE.notes.filter(n => n.id !== id);
        saveState();
        selectedNoteId = null;
        cancelNoteEdit();
        renderNotesList();
    }
}

// ============================================================================
// --- 13. PROFESSIONAL INVOICES (FACTURATON GENERATOR) ---
// ============================================================================
function generateMembershipInvoice(adherentId) {
    const a = STATE.adherents.find(item => item.id === adherentId);
    if (!a) return;
    
    // Find or create membership transaction for billing info
    let tx = STATE.transactions.find(t => t.adherent_id === adherentId && t.categorie_id === "cat-1");
    if (!tx) {
        tx = {
            id: "tx-temp-" + Date.now(),
            date_transaction: a.date_adhesion,
            description: "Cotisation annuelle Foyer Rural",
            montant: getCotisationAmount(),
            quantite: 1,
            prix: getCotisationAmount(),
            paye: a.cotisation_a_jour
        };
    }
    
    buildAndShowInvoice(a, tx);
}

function generateInvoiceFromTransaction(txId) {
    const tx = STATE.transactions.find(item => item.id === txId);
    if (!tx) return;
    
    // Find linked member or create dummy customer info
    let customer = { nom: "Client", prenom: "Divers", email: "divers@foyer.rural", date_adhesion: tx.date_transaction };
    if (tx.adherent_id) {
        const a = STATE.adherents.find(item => item.id === tx.adherent_id);
        if (a) customer = a;
    }
    
    buildAndShowInvoice(customer, tx);
}

let currentInvoiceTx = null;
let currentInvoiceCustomer = null;

function buildAndShowInvoice(customer, tx) {
    currentInvoiceTx = tx;
    currentInvoiceCustomer = customer;
    
    const invoiceNum = "FAC-" + new Date(tx.date_transaction).getFullYear() + "-" + String(Math.abs(tx.id.hashCode() % 10000)).padStart(4, '0');
    const invoiceDate = formatDateFrench(new Date(tx.date_transaction));
    const qty = tx.quantite || 1;
    const uPrice = Number(tx.prix || tx.montant || 0).toFixed(2);
    const totalAmount = Number(qty * uPrice).toFixed(2);
    
    const invoiceHtml = `
        <div class="invoice-header" style="border-bottom: 2px solid var(--primary); padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between;">
            <div class="invoice-logo-area" style="text-align: left;">
                <h1 style="color: var(--primary); font-size: 1.6rem; font-weight: 700; margin-bottom: 4px;">FOYER RURAL</h1>
                <p style="color: #475569; font-size: 0.8rem;">Association Loi 1901 à but non lucratif</p>
                <p style="color: #475569; font-size: 0.8rem;">12 Rue du Petit Foyer, 34000 Village-sur-Tennis</p>
                <p style="color: #475569; font-size: 0.8rem;">Email: contact@foyerrural.org</p>
            </div>
            <div class="invoice-meta" style="text-align: right;">
                <h2 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 4px;">FACTURE</h2>
                <p style="font-size: 0.8rem; color: #475569;"><strong>N° Facture :</strong> ${invoiceNum}</p>
                <p style="font-size: 0.8rem; color: #475569;"><strong>Date d'émission :</strong> ${invoiceDate}</p>
                <p style="font-size: 0.8rem; color: #475569;"><strong>Statut :</strong> ${tx.paye ? "PAYÉ" : "EN ATTENTE DE PAIEMENT"}</p>
            </div>
        </div>
        
        <div class="invoice-addresses" style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 24px;">
            <div class="invoice-address-block" style="text-align: left;">
                <h3 style="font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 6px; font-weight: 600; letter-spacing: 0.5px;">Émetteur</h3>
                <p style="font-size: 0.9rem; color: #1e293b; line-height: 1.5;"><strong>Foyer Rural de l'Association</strong></p>
                <p style="font-size: 0.9rem; color: #1e293b; line-height: 1.5;">Trésorerie générale</p>
                <p style="font-size: 0.9rem; color: #1e293b; line-height: 1.5;">Village-sur-Tennis, France</p>
            </div>
            <div class="invoice-address-block" style="text-align: left;">
                <h3 style="font-size: 0.8rem; text-transform: uppercase; color: #475569; margin-bottom: 6px; font-weight: 600; letter-spacing: 0.5px;">Facturé à</h3>
                <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                    <input type="text" id="invoice-edit-customer-prenom" value="${customer.prenom || ''}" placeholder="Prénom" style="border: 1px dashed #cbd5e1; background: transparent; padding: 2px 4px; font-weight: 600; font-family: inherit; font-size: 0.9rem; width: 90px;" />
                    <input type="text" id="invoice-edit-customer-nom" value="${customer.nom || ''}" placeholder="Nom" style="border: 1px dashed #cbd5e1; background: transparent; padding: 2px 4px; font-weight: 600; font-family: inherit; font-size: 0.9rem; width: 110px;" />
                </div>
                <div style="margin-bottom: 4px;">
                    <input type="text" id="invoice-edit-customer-email" value="${customer.email || ''}" placeholder="Email" style="border: 1px dashed #cbd5e1; background: transparent; padding: 2px 4px; font-family: inherit; font-size: 0.85rem; width: 200px;" />
                </div>
                <p style="font-size: 0.85rem; color: #475569; margin-top: 4px;">Date d'adhésion: ${customer.date_adhesion ? formatDateFrench(new Date(customer.date_adhesion)) : '--'}</p>
            </div>
        </div>
        
        <table class="invoice-table" style="width: 100%; margin-bottom: 24px; border-collapse: collapse;">
            <thead>
                <tr style="background-color: #f8fafc;">
                    <th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #475569;">Description de la Prestation</th>
                    <th style="text-align: center; width: 100px; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #475569;">Quantité</th>
                    <th style="text-align: right; width: 120px; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #475569;">Prix Unitaire (€)</th>
                    <th style="text-align: right; width: 120px; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #475569;">Total H.T. (€)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                        <input type="text" id="invoice-edit-desc" value="${tx.description}" style="border: 1px dashed #cbd5e1; background: transparent; padding: 4px; font-family: inherit; font-size: 0.9rem; width: 100%;" oninput="updateInvoiceTotalsRealTime()" />
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                        <input type="number" id="invoice-edit-qty" value="${qty}" min="1" style="border: 1px dashed #cbd5e1; background: transparent; padding: 4px; font-family: inherit; font-size: 0.9rem; text-align: center; width: 70px;" oninput="updateInvoiceTotalsRealTime()" />
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                        <input type="number" id="invoice-edit-price" value="${uPrice}" min="0" step="0.01" style="border: 1px dashed #cbd5e1; background: transparent; padding: 4px; font-family: inherit; font-size: 0.9rem; text-align: right; width: 90px;" oninput="updateInvoiceTotalsRealTime()" />
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;" id="invoice-total-ht-cell">
                        ${totalAmount} €
                    </td>
                </tr>
            </tbody>
        </table>
        
        <div class="invoice-totals" style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
            <table class="invoice-totals-table" style="width: 220px; border-collapse: collapse;">
                <tr>
                    <td style="text-align: left; font-weight: 600; padding: 6px 10px;">Total Net H.T.</td>
                    <td style="text-align: right; padding: 6px 10px;" id="invoice-total-net-ht-cell">${totalAmount} €</td>
                </tr>
                <tr>
                    <td style="text-align: left; font-weight: 600; padding: 6px 10px;">TVA (Exonéré)</td>
                    <td style="text-align: right; padding: 6px 10px;">0.00 €</td>
                </tr>
                <tr class="grand-total" style="border-top: 2px solid var(--primary); font-weight: 700; color: #0f172a;">
                    <td style="text-align: left; padding: 6px 10px;">NET À PAYER TTC</td>
                    <td style="text-align: right; padding: 6px 10px;" id="invoice-total-net-ttc-cell">${totalAmount} €</td>
                </tr>
            </table>
        </div>
        
        <div class="invoice-footer" style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 0.75rem; color: #94a3b8;">
            <p>TVA non applicable, art. 293 B du CGI. Association sans but lucratif.</p>
            <p>Merci pour votre soutien et votre participation active à la vie du Foyer Rural !</p>
        </div>
    `;
    
    document.getElementById("invoice-modal-content").innerHTML = invoiceHtml;
    openModal("modal-invoice");
}

function updateInvoiceTotalsRealTime() {
    const qtyInput = document.getElementById("invoice-edit-qty");
    const priceInput = document.getElementById("invoice-edit-price");
    
    const qty = qtyInput ? (Number(qtyInput.value) || 1) : 1;
    const price = priceInput ? (Number(priceInput.value) || 0) : 0;
    const total = (qty * price).toFixed(2);
    
    const cellHT = document.getElementById("invoice-total-ht-cell");
    if (cellHT) cellHT.innerText = total + " €";
    
    const netHT = document.getElementById("invoice-total-net-ht-cell");
    if (netHT) netHT.innerText = total + " €";
    
    const netTTC = document.getElementById("invoice-total-net-ttc-cell");
    if (netTTC) netTTC.innerText = total + " €";
}

function saveInvoiceEdits() {
    if (!currentInvoiceTx) return;
    
    const prenomInput = document.getElementById("invoice-edit-customer-prenom");
    const nomInput = document.getElementById("invoice-edit-customer-nom");
    const emailInput = document.getElementById("invoice-edit-customer-email");
    
    const prenom = prenomInput ? prenomInput.value.trim() : "";
    const nom = nomInput ? nomInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    
    const descInput = document.getElementById("invoice-edit-desc");
    const qtyInput = document.getElementById("invoice-edit-qty");
    const priceInput = document.getElementById("invoice-edit-price");
    
    const desc = descInput ? descInput.value.trim() : currentInvoiceTx.description;
    const qty = qtyInput ? (Number(qtyInput.value) || 1) : 1;
    const price = priceInput ? (Number(priceInput.value) || 0) : 0;
    const total = qty * price;
    
    // 1. Update customer if linked to adherent
    if (currentInvoiceTx.adherent_id) {
        const a = STATE.adherents.find(item => item.id === currentInvoiceTx.adherent_id);
        if (a) {
            a.prenom = prenom;
            a.nom = nom;
            a.email = email;
            
            // Save adherent changes
            if (dbMode === 'firebase') {
                db.collection("adherents").doc(a.id).set(a).catch(err => console.error(err));
            }
        }
    }
    
    // 2. Update transaction
    if (currentInvoiceTx.id.startsWith("tx-temp-")) {
        // Convert to a real transaction and push to state
        currentInvoiceTx.id = "tx-" + Date.now();
        currentInvoiceTx.description = desc;
        currentInvoiceTx.quantite = qty;
        currentInvoiceTx.prix = price;
        currentInvoiceTx.montant = total;
        STATE.transactions.push(currentInvoiceTx);
        
        if (dbMode === 'firebase') {
            db.collection("transactions").doc(currentInvoiceTx.id).set(currentInvoiceTx).catch(err => console.error(err));
        }
    } else {
        // Update existing transaction
        const tx = STATE.transactions.find(t => t.id === currentInvoiceTx.id);
        if (tx) {
            tx.description = desc;
            tx.quantite = qty;
            tx.prix = price;
            tx.montant = total;
            
            if (dbMode === 'firebase') {
                db.collection("transactions").doc(tx.id).set(tx).catch(err => console.error(err));
            }
        }
    }
    
    if (dbMode === 'local') {
        saveState();
    }
    
    closeModal("modal-invoice");
    refreshAllViews();
    alert("Facture et transaction associées enregistrées avec succès !");
}

// Simple hash generator for invoice auto-numbering
String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
};

// ============================================================================
// --- 14. SETTINGS & FIREBASE CONFIGURATION & BACKUP ---
// ============================================================================
function exportDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(STATE));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", `foyer_rural_db_sauvegarde_${formatDate(new Date())}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.adherents && imported.transactions && imported.produits) {
                if (dbMode === 'firebase') {
                    // Perform sequential cloud sets
                    alert("Importation vers Firebase initiée. Les collections locales vont écraser Cloud Firestore.");
                    performFullFirebaseImport(imported);
                } else {
                    STATE = { ...STATE, ...imported };
                    saveState();
                    refreshAllViews();
                    alert("Base de données restaurée avec succès !");
                }
            } else {
                alert("Le fichier de sauvegarde est invalide.");
            }
        } catch (err) {
            alert("Erreur de lecture du fichier JSON: " + err);
        }
    };
    reader.readAsText(file);
}

function resetDatabaseWithDemo() {
    if (confirm("Voulez-vous réinitialiser toute la base de données avec les données de démonstration ? Cela écrasera vos modifications actuelles.")) {
        if (dbMode === 'firebase') {
            performFullFirebaseImport(null); // Seeds cloud
        } else {
            seedDemoData();
            alert("Données de démonstration chargées.");
        }
    }
}

function saveFirebaseConfig(e) {
    e.preventDefault();
    const apiKey = document.getElementById("fb-apiKey").value;
    const projectId = document.getElementById("fb-projectId").value;
    const appId = document.getElementById("fb-appId").value;
    const enabled = document.getElementById("fb-enabled").checked;
    
    const config = { apiKey, projectId, appId, authDomain: `${projectId}.firebaseapp.com` };
    
    localStorage.setItem("foyer_firebase_config", JSON.stringify(config));
    localStorage.setItem("foyer_firebase_enabled", enabled ? "true" : "false");
    
    STATE.firebaseConfig = config;
    STATE.firebaseEnabled = enabled;

    alert("Configuration Firebase enregistrée !");
    
    // Reboot database connection mode
    if (enabled) {
        connectFirebase();
    } else {
        connectLocal();
    }
}

// Push local browser data to cloud database
function migrateLocalToFirebase() {
    if (!STATE.firebaseConfig || dbMode !== 'firebase') {
        alert("Veuillez d'abord configurer et activer la synchronisation Firebase.");
        return;
    }
    
    if (confirm("Voulez-vous pousser toutes vos données locales actuelles vers Firebase Firestore ? Les données existantes sur Firestore seront écrasées.")) {
        performFullFirebaseImport(STATE);
    }
}

// Helper to push a complete state into firestore (creates or resets firestore database)
function performFullFirebaseImport(dataToImport) {
    const data = dataToImport || getDemoDataStateObj(); // If null, seeds demo data
    
    const collections = [
        'adherents', 'transactions', 'categories', 'manifestations', 
        'investissements', 'produits', 'reservations', 'notes',
        'feteRuraleStands', 'feteRuraleReceipts', 'feteRuraleExpenses', 'feteRuralePartners'
    ];
    
    let promises = [];
    
    // Clear and upload helper
    collections.forEach(col => {
        // Fetch existing docs to delete them first
        const p = db.collection(col).get().then(snapshot => {
            let batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            return batch.commit();
        }).then(() => {
            // Write new docs
            let batch = db.batch();
            const items = data[col] || [];
            items.forEach(item => {
                const docId = item.id;
                const uploadItem = { ...item };
                delete uploadItem.id; // Doc id is mapped as key
                
                const ref = db.collection(col).doc(docId);
                batch.set(ref, uploadItem);
            });
            return batch.commit();
        });
        promises.push(p);
    });

    Promise.all(promises).then(() => {
        alert("Migration terminée avec succès sur Firebase Firestore !");
        refreshAllViews();
    }).catch(err => {
        console.error("Migration error:", err);
        alert("Erreur lors de la migration Cloud: " + err);
    });
}

// Mock seed helper for cloud imports
function getDemoDataStateObj() {
    const tempState = {};
    // Seed standard datasets
    tempState.categories = [...DEFAULT_CATEGORIES];
    tempState.adherents = [
        { id: "adh-1", nom: "Dupont", prenom: "Jean", email: "jean.dupont@gmail.com", date_adhesion: "2025-01-15", cotisation_a_jour: true, numero_adherent: "ADH-2025-0001", gestanet_periods: ["2024-2025", "2025-2026"] },
        { id: "adh-2", nom: "Curie", prenom: "Marie", email: "marie.curie@science.fr", date_adhesion: "2025-02-10", cotisation_a_jour: true, numero_adherent: "ADH-2025-0002", gestanet_periods: ["2025-2026"] },
        { id: "adh-3", nom: "Martin", prenom: "Pierre", email: "pierre.martin@outlook.com", date_adhesion: "2024-09-01", cotisation_a_jour: false, numero_adherent: "ADH-2024-0012", gestanet_periods: [] },
        { id: "adh-4", nom: "Bernard", prenom: "Sophie", email: "sophie.b@gmail.com", date_adhesion: "2025-03-05", cotisation_a_jour: true, numero_adherent: "ADH-2025-0003", gestanet_periods: ["2025-2026"] }
    ];
    tempState.manifestations = [
        { id: "man-1", nom: "Loto Annuel du Foyer", date_debut: "2026-03-14", date_fin: "2026-03-14", lieu: "Salle des fêtes du village" },
        { id: "man-2", nom: "Tournoi Tennis d'Été", date_debut: "2026-07-15", date_fin: "2026-07-18", lieu: "Courts municipaux" },
        { id: "man-3", nom: "Fête de la Musique 2026", date_debut: "2026-06-21", date_fin: "2026-06-22", lieu: "Place de la Mairie" },
        { id: "man-fete-rurale", nom: "Fête Rurale", date_debut: "2026-08-15", date_fin: "2026-08-16", lieu: "Place du Village", special: true }
    ];
    tempState.produits = [
        { id: "prod-1", nom_boisson: "Coca-Cola 33cl", quantite_stock: 120, seuil_alerte: 30, prix: 1.50 },
        { id: "prod-2", nom_boisson: "Bière Locale Blonde 25cl", quantite_stock: 18, seuil_alerte: 40, prix: 2.50 },
        { id: "prod-3", nom_boisson: "Jus d'Orange Bio 1L", quantite_stock: 8, seuil_alerte: 10, prix: 3.00 },
        { id: "prod-4", nom_boisson: "Eau Minérale 50cl", quantite_stock: 180, seuil_alerte: 40, prix: 1.00 }
    ];
    tempState.investissements = [
        { id: "inv-1", libelle: "Tondeuse Gazon Auto", date_acquisition: "2024-05-10", montant_achat: 1500.00, duree_amortissement_ans: 5, etat: "Neuf" },
        { id: "inv-2", libelle: "Réfrigérateur Buvette", date_acquisition: "2025-11-20", montant_achat: 450.00, duree_amortissement_ans: 3, etat: "Occasion" }
    ];

    // Seed Fête Rurale Specific Data
    tempState.feteRuraleStands = [
        { id: "fete-stand-1", nom: "Buvette Principale", fond_de_caisse: 200.00 },
        { id: "fete-stand-2", nom: "Stand Restauration (Galettes/Crêpes)", fond_de_caisse: 150.00 },
        { id: "fete-stand-3", nom: "Pêche aux canards", fond_de_caisse: 50.00 },
        { id: "fete-stand-4", nom: "Tombola", fond_de_caisse: 100.00 }
    ];

    tempState.feteRuraleReceipts = [
        { id: "fete-rec-1", stand_id: "fete-stand-1", date: "2026-08-15", montant: 450.00, comment: "Relève caisse après-midi", transaction_id: "tx-fete-r-1" },
        { id: "fete-rec-2", stand_id: "fete-stand-1", date: "2026-08-15", montant: 620.00, comment: "Relève fin de journée", transaction_id: "tx-fete-r-2" },
        { id: "fete-rec-3", stand_id: "fete-stand-2", date: "2026-08-15", montant: 380.00, comment: "Caisse restauration samedi", transaction_id: "tx-fete-r-3" },
        { id: "fete-rec-4", stand_id: "fete-stand-4", date: "2026-08-15", montant: 290.00, comment: "Vente enveloppes et tickets", transaction_id: "tx-fete-r-4" }
    ];

    tempState.feteRuraleExpenses = [
        { id: "fete-exp-1", description: "Achat viande et pain (charcuterie locale)", date: "2026-08-14", montant: 320.00, paye: true, moyen_payement: "Carte Bancaire", paye_a: "Boucherie Martin", categorie: "buffet", commentaire: "Facture payée par carte par le trésorier", scan: "", transaction_id: "tx-fete-e-1" },
        { id: "fete-exp-2", description: "Prestation groupe de musique folklorique", date: "2026-08-15", montant: 450.00, paye: true, moyen_payement: "Virement", paye_a: "Association MusicArmor", categorie: "animation", commentaire: "Contrat d'engagement artistique", scan: "", transaction_id: "tx-fete-e-2" }
    ];

    tempState.feteRuralePartners = [
        { id: "fete-part-1", entreprise: "Boulangerie du Centre", contact: "M. Lefèvre", suivi_par: "Jean Dupont", paye: true, moyen_payement: "Espèces", montant_sponsoring: 100.00, logo: "", transaction_id: "tx-fete-p-1" },
        { id: "fete-part-2", entreprise: "Garage de l'Ouest", contact: "Mme. Renard", suivi_par: "Marie Curie", paye: false, moyen_payement: "Virement", montant_sponsoring: 150.00, logo: "", transaction_id: "" }
    ];

    tempState.transactions = [
        { id: "tx-1", date_transaction: "2026-01-15", description: "Cotisation annuelle Jean Dupont", type_flux: "Recette", montant: 20.00, quantite: 1, prix: 20.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-1", adherent_id: "adh-1", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-2", date_transaction: "2026-01-16", description: "Cotisation annuelle Marie Curie", type_flux: "Recette", montant: 20.00, quantite: 1, prix: 20.00, paye: true, moyen_payement: "Chèque", categorie_id: "cat-1", adherent_id: "adh-2", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-3", date_transaction: "2026-03-14", description: "Ventes Entrées Loto 2026", type_flux: "Recette", montant: 1450.00, quantite: 290, prix: 5.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-13", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-4", date_transaction: "2026-03-14", description: "Ventes Buvette Loto 2026", type_flux: "Recette", montant: 820.00, quantite: 1, prix: 820.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-5", date_transaction: "2026-03-12", description: "Achat boissons Métro pour Loto", type_flux: "Dépense", montant: 320.00, quantite: 1, prix: 320.00, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-6", date_transaction: "2026-03-13", description: "Location de la sonorisation Loto", type_flux: "Dépense", montant: 150.00, quantite: 1, prix: 150.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-12", adherent_id: "", manifestation_id: "man-1", investissement_id: "", produit_id: "" },
        { id: "tx-7", date_transaction: "2026-04-10", description: "Subvention communale annuelle", type_flux: "Recette", montant: 2500.00, quantite: 1, prix: 2500.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-2", adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-8", date_transaction: "2026-05-15", description: "Achat engrais pour court de tennis", type_flux: "Dépense", montant: 85.00, quantite: 2, prix: 42.50, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-5", adherent_id: "", manifestation_id: "", investissement_id: "", produit_id: "" },
        { id: "tx-9", date_transaction: "2026-02-10", description: "Achat Réfrigérateur Réserve", type_flux: "Dépense", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-8", adherent_id: "", manifestation_id: "", investissement_id: "inv-2", produit_id: "" },
        
        // Synced Fête Rurale Transactions
        { id: "tx-fete-r-1", date_transaction: "2026-08-15", description: "[Stand: Buvette Principale] Relève caisse après-midi", type_flux: "Recette", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-2", date_transaction: "2026-08-15", description: "[Stand: Buvette Principale] Relève fin de journée", type_flux: "Recette", montant: 620.00, quantite: 1, prix: 620.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-3", date_transaction: "2026-08-15", description: "[Stand: Stand Restauration (Galettes/Crêpes)] Caisse restauration samedi", type_flux: "Recette", montant: 380.00, quantite: 1, prix: 380.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-r-4", date_transaction: "2026-08-15", description: "[Stand: Tombola] Vente enveloppes et tickets", type_flux: "Recette", montant: 290.00, quantite: 1, prix: 290.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-13", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        
        { id: "tx-fete-e-1", date_transaction: "2026-08-14", description: "[Dépense Fête] Achat viande et pain (charcuterie locale)", type_flux: "Dépense", montant: 320.00, quantite: 1, prix: 320.00, paye: true, moyen_payement: "Carte Bancaire", categorie_id: "cat-11", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        { id: "tx-fete-e-2", date_transaction: "2026-08-15", description: "[Dépense Fête] Prestation groupe de musique folklorique", type_flux: "Dépense", montant: 450.00, quantite: 1, prix: 450.00, paye: true, moyen_payement: "Virement", categorie_id: "cat-12", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" },
        
        { id: "tx-fete-p-1", date_transaction: "2026-08-12", description: "[Partenaire Fête] Boulangerie du Centre (Sponsoring)", type_flux: "Recette", montant: 100.00, quantite: 1, prix: 100.00, paye: true, moyen_payement: "Espèces", categorie_id: "cat-3", adherent_id: "", manifestation_id: "man-fete-rurale", investissement_id: "", produit_id: "" }
    ];
    
    const mon = getMonday(new Date());
    tempState.reservations = [
        { id: "res-1", date: formatDate(addDays(mon, 0)), hour: "14", adherent_id: "adh-1" },
        { id: "res-2", date: formatDate(addDays(mon, 2)), hour: "17", adherent_id: "adh-2" },
        { id: "res-3", date: formatDate(addDays(mon, 4)), hour: "10", adherent_id: "adh-4" }
    ];
    tempState.notes = [
        { id: "note-1", date_reunion: "2026-01-20", titre: "Assemblée Générale Annuelle", contenu: "Ordre du jour :\n1. Rapport moral du président.\n2. Bilan financier 2025 approuvé à l'unanimité.\n3. Projets 2026 : Achat tondeuse, loto en Mars, tournoi tennis en Juillet.\n4. Renouvellement des cotisations fixé à 20€ par membre.\n\nSecrétaire de séance : Marie Curie.", manifestation_id: "" },
        { id: "note-2", date_reunion: "2026-03-02", titre: "Préparation du Loto Annuel", contenu: "Décisions prises :\n- Ouverture des portes à 18h00, début des parties à 19h30.\n- Buvette gérée par Sophie et Jean. Commande de boissons chez Métro.\n- Lots principaux : Vélo électrique, Robot de cuisine, Bons d'achats.\n- Publicité : Affiches posées dans les commerces locaux.\n\nManifestation liée : Loto Annuel du Foyer.", manifestation_id: "man-1" }
    ];
    
    return tempState;
}

// ============================================================================
// --- 15. SELECT DROPDOWNS POPULATION ---
// ============================================================================
function populateSelectOptions() {
    updateTransactionCategoriesDropdown();

    // 2. Transaction form links
    const txAdherent = document.getElementById("transaction-adherent");
    txAdherent.innerHTML = `<option value="">-- Aucun --</option>`;
    STATE.adherents.forEach(a => {
        txAdherent.innerHTML += `<option value="${a.id}">👤 Adhérent: ${a.prenom} ${a.nom}</option>`;
    });

    const txManif = document.getElementById("transaction-manifestation");
    txManif.innerHTML = `<option value="">-- Aucun --</option>`;
    STATE.manifestations.forEach(m => {
        txManif.innerHTML += `<option value="${m.id}">🎁 Événement: ${m.nom}</option>`;
    });

    const txInvest = document.getElementById("transaction-investissement");
    txInvest.innerHTML = `<option value="">-- Aucun --</option>`;
    STATE.investissements.forEach(inv => {
        txInvest.innerHTML += `<option value="${inv.id}">🔧 Invest: ${inv.libelle}</option>`;
    });

    const txProd = document.getElementById("transaction-produit");
    txProd.innerHTML = `<option value="">-- Aucun --</option>`;
    STATE.produits.forEach(p => {
        txProd.innerHTML += `<option value="${p.id}">🍺 Boisson: ${p.nom_boisson}</option>`;
    });

    // 3. Filter dropdowns in Accounting list
    const filterCat = document.getElementById("filter-categorie");
    if (filterCat) {
        filterCat.innerHTML = `<option value="all">Toutes les catégories</option>`;
        const types = ["Recette", "Dépense", "Manifestation"];
        const typeLabels = { "Recette": "Recettes", "Dépense": "Dépenses", "Manifestation": "Manifestations" };
        types.forEach(t => {
            const catsOfType = STATE.categories.filter(c => c.type === t);
            if (catsOfType.length > 0) {
                let optGroup = `<optgroup label="${typeLabels[t]}">`;
                catsOfType.forEach(c => {
                    optGroup += `<option value="${c.id}">${c.libelle}</option>`;
                });
                optGroup += `</optgroup>`;
                filterCat.innerHTML += optGroup;
            }
        });
    }

    // Populate filter-depenses-cat
    const filterDepCat = document.getElementById("filter-depenses-cat");
    if (filterDepCat) {
        const val = filterDepCat.value;
        filterDepCat.innerHTML = `<option value="all">Toutes les catégories</option>`;
        STATE.categories.filter(c => c.type === "Dépense").forEach(c => {
            filterDepCat.innerHTML += `<option value="${c.id}">${c.libelle}</option>`;
        });
        if (val) filterDepCat.value = val;
    }

    // Populate filter-recettes-cat
    const filterRecCat = document.getElementById("filter-recettes-cat");
    if (filterRecCat) {
        const val = filterRecCat.value;
        filterRecCat.innerHTML = `<option value="all">Toutes les catégories</option>`;
        STATE.categories.filter(c => c.type === "Recette").forEach(c => {
            filterRecCat.innerHTML += `<option value="${c.id}">${c.libelle}</option>`;
        });
        if (val) filterRecCat.value = val;
    }

    const filterManif = document.getElementById("filter-manifestation");
    if (filterManif) {
        filterManif.innerHTML = `<option value="all">Toutes les manifestations</option>`;
        STATE.manifestations.forEach(m => {
            filterManif.innerHTML += `<option value="${m.id}">${m.nom}</option>`;
        });
    }

    // 4. Meeting Notes manifestations link options
    const noteManif = document.getElementById("edit-note-manif");
    noteManif.innerHTML = `<option value="">-- Aucun événement lié --</option>`;
    STATE.manifestations.forEach(m => {
        noteManif.innerHTML += `<option value="${m.id}">${m.nom}</option>`;
    });

    // 5. Populate manifestation fete-expense-cat dropdown dynamically
    const feteExpenseCat = document.getElementById("fete-expense-cat");
    if (feteExpenseCat) {
        const val = feteExpenseCat.value;
        feteExpenseCat.innerHTML = "";
        STATE.categories.filter(c => c.type === "Manifestation").forEach(c => {
            feteExpenseCat.innerHTML += `<option value="${c.id}">${c.libelle}</option>`;
        });
        if (val && STATE.categories.some(c => c.id === val)) {
            feteExpenseCat.value = val;
        }
    }
}

function updateTransactionCategoriesDropdown() {
    const txCat = document.getElementById("transaction-categorie");
    if (!txCat) return;
    
    const fluxSelect = document.getElementById("transaction-flux");
    const manifSelect = document.getElementById("transaction-manifestation");
    
    const flux = fluxSelect ? fluxSelect.value : "Recette";
    const manifId = manifSelect ? manifSelect.value : "";
    
    const currentSelectedCat = txCat.value;
    txCat.innerHTML = "";
    
    let filteredCats = [];
    if (manifId) {
        // If linked to a manifestation, only show Manifestation type categories
        filteredCats = STATE.categories.filter(c => c.type === "Manifestation");
    } else {
        // Else, show categories matching flow type
        const typeQuery = flux === "Recette" ? "Recette" : "Dépense";
        filteredCats = STATE.categories.filter(c => c.type === typeQuery);
    }
    
    filteredCats.forEach(c => {
        txCat.innerHTML += `<option value="${c.id}">${c.libelle}</option>`;
    });
    
    // Try to restore previous selection if valid
    if (currentSelectedCat && filteredCats.some(c => c.id === currentSelectedCat)) {
        txCat.value = currentSelectedCat;
    }
}

function openNewTransactionModal() {
    document.getElementById("form-transaction").reset();
    document.getElementById("transaction-id").value = "";
    document.getElementById("transaction-modal-title").innerText = "Nouvelle Transaction";
    
    document.getElementById("transaction-date").value = formatDate(new Date());
    document.getElementById("transaction-quantite").value = 1;
    document.getElementById("transaction-prix").value = "";
    document.getElementById("transaction-montant").value = "";
    document.getElementById("transaction-paye").checked = true;
    
    toggleTransactionDetails();
    updateTransactionCategoriesDropdown();
    openModal("modal-transaction");
}

// ============================================================================
// --- 16. UTILITY METHODS (DATES, CALCULATIONS) ---
// ============================================================================
function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
        diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
    return new Date(d.setDate(diff));
}

function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

function formatDateFrench(date) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
}

function getYearsSince(date) {
    const diffMs = Date.now() - date.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970) + (ageDate.getUTCMonth() / 12) + (ageDate.getUTCDate() / 365);
}

// ============================================================================
// --- 17. CATEGORIES MANAGEMENT (SETTINGS) ---
// ============================================================================
function renderSettingsCategoriesList() {
    const listBody = document.getElementById("settings-categories-list");
    if (!listBody) return;
    listBody.innerHTML = "";
    
    STATE.categories.forEach(c => {
        const isDefault = DEFAULT_CATEGORIES.some(dc => dc.id === c.id);
        const badgeClass = c.type === 'Recette' ? 'badge-success' : (c.type === 'Dépense' ? 'badge-danger' : 'badge-primary');
        const typeLabel = c.type || 'Recette';
        
        listBody.innerHTML += `
            <tr>
                <td style="font-weight: 500;">
                    ${c.libelle} ${isDefault ? '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">(Système)</span>' : ''}
                </td>
                <td>
                    <span class="badge ${badgeClass}">${typeLabel}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-icon-only" onclick="editCategory('${c.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only" style="color: var(--danger);" onclick="deleteCategory('${c.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

function editCategory(id) {
    const c = STATE.categories.find(item => item.id === id);
    if (!c) return;
    
    document.getElementById("category-id").value = c.id;
    document.getElementById("category-libelle").value = c.libelle;
    document.getElementById("category-type").value = c.type || "Recette";
    
    document.getElementById("category-form-title").innerText = "Modifier la Catégorie";
    document.getElementById("btn-cancel-category-edit").style.display = "inline-flex";
}

function cancelCategoryEdit() {
    document.getElementById("form-category").reset();
    document.getElementById("category-id").value = "";
    document.getElementById("category-form-title").innerText = "Ajouter une Catégorie";
    document.getElementById("btn-cancel-category-edit").style.display = "none";
}

function saveCategory(e) {
    e.preventDefault();
    const id = document.getElementById("category-id").value;
    const libelle = document.getElementById("category-libelle").value.trim();
    const type = document.getElementById("category-type").value;
    
    if (!libelle || !type) return;
    
    const data = { libelle, type };
    
    if (dbMode === 'firebase') {
        if (id) {
            db.collection("categories").doc(id).update(data)
                .then(() => {
                    cancelCategoryEdit();
                })
                .catch(err => alert("Erreur d'enregistrement: " + err));
        } else {
            db.collection("categories").add(data)
                .then(() => {
                    cancelCategoryEdit();
                })
                .catch(err => alert("Erreur d'enregistrement: " + err));
        }
    } else {
        if (id) {
            const idx = STATE.categories.findIndex(c => c.id === id);
            STATE.categories[idx] = { id, ...data };
        } else {
            const newId = "cat-" + Date.now();
            STATE.categories.push({ id: newId, ...data });
        }
        saveState();
        cancelCategoryEdit();
        refreshAllViews();
    }
}

function deleteCategory(id) {
    
    const inUseCount = STATE.transactions.filter(t => t.categorie_id === id).length;
    if (inUseCount > 0) {
        if (!confirm(`Cette catégorie est utilisée par ${inUseCount} transaction(s). Sa suppression dissociera ces transactions. Voulez-vous continuer ?`)) {
            return;
        }
    }
    
    if (dbMode === 'firebase') {
        // Dissociate transactions first in Cloud
        STATE.transactions.filter(t => t.categorie_id === id).forEach(t => {
            db.collection("transactions").doc(t.id).update({ categorie_id: "" });
        });
        
        db.collection("categories").doc(id).delete()
            .catch(err => alert("Erreur de suppression: " + err));
    } else {
        STATE.transactions.forEach(t => {
            if (t.categorie_id === id) t.categorie_id = "";
        });
        STATE.categories = STATE.categories.filter(c => c.id !== id);
        saveState();
        refreshAllViews();
    }
}

// ============================================================================
// --- 24. FETE RURALE MODULE CONTROLLER & HANDLERS ---
// ============================================================================

// Helper to save data either locally or on Firebase
function saveFeteData(collectionName, item, callback) {
    if (dbMode === 'firebase') {
        const id = item.id;
        db.collection(collectionName).doc(id).set(item)
            .then(() => {
                if (callback) callback();
            })
            .catch(err => {
                console.error("Firebase error writing to " + collectionName, err);
                alert("Erreur lors de la sauvegarde sur Firebase : " + err.message);
            });
    } else {
        const index = STATE[collectionName].findIndex(x => x.id === item.id);
        if (index > -1) {
            STATE[collectionName][index] = item;
        } else {
            STATE[collectionName].push(item);
        }
        saveState();
        if (callback) callback();
    }
}

// Helper to delete data either locally or on Firebase
function deleteFeteData(collectionName, id, callback) {
    if (dbMode === 'firebase') {
        db.collection(collectionName).doc(id).delete()
            .then(() => {
                if (callback) callback();
            })
            .catch(err => {
                console.error("Firebase error deleting from " + collectionName, err);
                alert("Erreur lors de la suppression sur Firebase : " + err.message);
            });
    } else {
        STATE[collectionName] = STATE[collectionName].filter(x => x.id !== id);
        saveState();
        if (callback) callback();
    }
}


// Synchronize Fête financial transactions to general transactions ledger
function syncFeteFinancialToTransactions(txId, txData, callback) {
    if (!txId) {
        // Create new transaction
        const newTxId = "tx-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
        const txObj = {
            id: newTxId,
            date_transaction: txData.date,
            description: txData.description,
            type_flux: txData.type_flux,
            montant: Number(txData.montant),
            quantite: 1,
            prix: Number(txData.montant),
            paye: txData.paye !== undefined ? txData.paye : true,
            moyen_payement: txData.moyen_payement || "Espèces",
            categorie_id: txData.categorie_id,
            adherent_id: "",
            manifestation_id: txData.manifestation_id || "man-fete-rurale",
            investissement_id: "",
            produit_id: ""
        };

        if (dbMode === 'firebase') {
            db.collection("transactions").doc(newTxId).set(txObj)
                .then(() => {
                    if (callback) callback(newTxId);
                })
                .catch(err => alert("Erreur de synchronisation comptable: " + err));
        } else {
            STATE.transactions.push(txObj);
            saveState();
            if (callback) callback(newTxId);
        }
    } else {
        // Update existing transaction
        if (dbMode === 'firebase') {
            db.collection("transactions").doc(txId).get()
                .then(doc => {
                    if (doc.exists) {
                        const existing = doc.data();
                        const updatedTx = {
                            ...existing,
                            date_transaction: txData.date,
                            description: txData.description,
                            type_flux: txData.type_flux,
                            montant: Number(txData.montant),
                            prix: Number(txData.montant),
                            paye: txData.paye !== undefined ? txData.paye : true,
                            moyen_payement: txData.moyen_payement || "Espèces",
                            categorie_id: txData.categorie_id,
                            manifestation_id: txData.manifestation_id || existing.manifestation_id || "man-fete-rurale"
                        };
                        db.collection("transactions").doc(txId).set(updatedTx)
                            .then(() => {
                                if (callback) callback(txId);
                            })
                            .catch(err => alert("Erreur d'édition comptable: " + err));
                    } else {
                        // Recreate if deleted
                        syncFeteFinancialToTransactions("", txData, callback);
                    }
                });
        } else {
            const idx = STATE.transactions.findIndex(t => t.id === txId);
            if (idx > -1) {
                STATE.transactions[idx] = {
                    ...STATE.transactions[idx],
                    date_transaction: txData.date,
                    description: txData.description,
                    type_flux: txData.type_flux,
                    montant: Number(txData.montant),
                    prix: Number(txData.montant),
                    paye: txData.paye !== undefined ? txData.paye : true,
                    moyen_payement: txData.moyen_payement || "Espèces",
                    categorie_id: txData.categorie_id,
                    manifestation_id: txData.manifestation_id || STATE.transactions[idx].manifestation_id || "man-fete-rurale"
                };
                saveState();
                if (callback) callback(txId);
            } else {
                syncFeteFinancialToTransactions("", txData, callback);
            }
        }
    }
}

// Delete synchronized transaction
function deleteFeteFinancialTransaction(txId, callback) {
    if (!txId) {
        if (callback) callback();
        return;
    }
    if (dbMode === 'firebase') {
        db.collection("transactions").doc(txId).delete()
            .then(() => {
                if (callback) callback();
            })
            .catch(err => console.error("Error deleting synced transaction: ", err));
    } else {
        STATE.transactions = STATE.transactions.filter(t => t.id !== txId);
        saveState();
        if (callback) callback();
    }
}

// Convert files to base64 dynamically
function handleFeteFile(event, hiddenInputId) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        alert("L'image est trop volumineuse (maximum 2 Mo). Veuillez choisir une autre image ou la compresser.");
        event.target.value = "";
        return;
    }

    if (dbMode === 'firebase') {
        const fileInput = event.target;
        const fileInputLabel = fileInput.nextElementSibling;
        const originalText = fileInputLabel ? fileInputLabel.innerText : "";
        if (fileInputLabel) {
            fileInputLabel.innerText = "Téléchargement en cours...";
        }
        
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`uploads/${Date.now()}_${file.name}`);
        
        fileRef.put(file).then(snapshot => {
            return snapshot.ref.getDownloadURL();
        }).then(url => {
            document.getElementById(hiddenInputId).value = url;
            if (fileInputLabel) {
                fileInputLabel.innerText = "Fichier prêt !";
            }
        }).catch(err => {
            console.error("Storage upload failed:", err);
            alert("Échec du téléchargement de l'image sur Firebase Storage : " + err.message);
            if (fileInputLabel) {
                fileInputLabel.innerText = originalText || "Choisir un fichier";
            }
            fileInput.value = "";
        });
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(hiddenInputId).value = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Image Viewer modal trigger
function openFeteImageViewer(title, dataUrl) {
    if (!dataUrl) return;
    document.getElementById("fete-viewer-title").innerText = title;
    document.getElementById("fete-viewer-img").src = dataUrl;
    openModal("modal-fete-viewer");
}

// --- STANDS CRUD & HANDLERS ---
function openFeteStandModal() {
    document.getElementById("form-fete-stand").reset();
    document.getElementById("fete-stand-id").value = "";
    const m = STATE.manifestations.find(item => item.id === activeManifestationId);
    const mName = m ? m.nom : "Manifestation";
    document.getElementById("fete-stand-modal-title").innerText = "Nouveau Stand - " + mName;
    openModal("modal-fete-stand");
}

function editFeteStand(id) {
    const stand = STATE.feteRuraleStands.find(s => s.id === id);
    if (!stand) return;
    
    document.getElementById("fete-stand-id").value = stand.id;
    document.getElementById("fete-stand-nom").value = stand.nom;
    document.getElementById("fete-stand-fond").value = stand.fond_de_caisse;
    document.getElementById("fete-stand-modal-title").innerText = "Modifier le Stand";
    
    openModal("modal-fete-stand");
}

function saveFeteStand(e) {
    e.preventDefault();
    const id = document.getElementById("fete-stand-id").value || "stand-" + Date.now();
    const nom = document.getElementById("fete-stand-nom").value;
    const fond = Number(document.getElementById("fete-stand-fond").value) || 0;
    
    const standObj = { id, nom, fond_de_caisse: fond, manifestation_id: activeManifestationId };
    saveFeteData("feteRuraleStands", standObj, () => {
        closeModal("modal-fete-stand");
        document.getElementById("form-fete-stand").reset();
        document.getElementById("fete-stand-id").value = "";
        refreshAllViews();
    });
}

function deleteFeteStand(id) {
    const stand = STATE.feteRuraleStands.find(s => s.id === id);
    if (!stand) return;
    
    const receiptsCount = STATE.feteRuraleReceipts.filter(r => r.stand_id === id).length;
    if (receiptsCount > 0) {
        if (!confirm(`Ce stand contient ${receiptsCount} relevé(s) de caisse. Les supprimer supprimera également les transactions comptables associées. Voulez-vous continuer ?`)) {
            return;
        }
    }
    
    const relatedReceipts = STATE.feteRuraleReceipts.filter(r => r.stand_id === id);
    let deletedCount = 0;
    
    function deleteNext() {
        if (deletedCount < relatedReceipts.length) {
            const rec = relatedReceipts[deletedCount];
            deleteFeteFinancialTransaction(rec.transaction_id, () => {
                deleteFeteData("feteRuraleReceipts", rec.id, () => {
                    deletedCount++;
                    deleteNext();
                });
            });
        } else {
            deleteFeteData("feteRuraleStands", id, () => {
                refreshAllViews();
            });
        }
    }
    deleteNext();
}

// --- RECEIPTS CRUD & HANDLERS ---
function openFeteReceiptModalForStand(standId) {
    const stand = STATE.feteRuraleStands.find(s => s.id === standId);
    if (!stand) return;
    
    document.getElementById("form-fete-receipt").reset();
    document.getElementById("fete-receipt-id").value = "";
    document.getElementById("fete-receipt-stand-id").value = standId;
    document.getElementById("fete-receipt-stand-nom").value = stand.nom;
    document.getElementById("fete-receipt-date").value = new Date().toISOString().split('T')[0];
    
    openModal("modal-fete-receipt");
}

function editFeteReceipt(id) {
    const rec = STATE.feteRuraleReceipts.find(r => r.id === id);
    if (!rec) return;
    const stand = STATE.feteRuraleStands.find(s => s.id === rec.stand_id);
    if (!stand) return;
    
    document.getElementById("fete-receipt-id").value = rec.id;
    document.getElementById("fete-receipt-stand-id").value = rec.stand_id;
    document.getElementById("fete-receipt-stand-nom").value = stand.nom;
    document.getElementById("fete-receipt-date").value = rec.date;
    document.getElementById("fete-receipt-montant").value = rec.montant;
    document.getElementById("fete-receipt-comment").value = rec.comment || "";
    
    openModal("modal-fete-receipt");
}

function saveFeteReceipt(e) {
    e.preventDefault();
    const id = document.getElementById("fete-receipt-id").value || "rec-" + Date.now();
    const standId = document.getElementById("fete-receipt-stand-id").value;
    const date = document.getElementById("fete-receipt-date").value;
    const montant = Number(document.getElementById("fete-receipt-montant").value) || 0;
    const comment = document.getElementById("fete-receipt-comment").value;
    
    const standObj = STATE.feteRuraleStands.find(s => s.id === standId);
    const standNom = standObj ? standObj.nom : "Stand";
    
    const rec = STATE.feteRuraleReceipts.find(r => r.id === id);
    const existingTxId = rec ? rec.transaction_id : "";
    
    const containsLoto = standNom.toLowerCase().includes("loto") || standNom.toLowerCase().includes("tombola") || standNom.toLowerCase().includes("enveloppe");
    
    const txData = {
        date,
        description: `[Stand: ${standNom}] ${comment || 'Relève caisse'}`,
        type_flux: 'Recette',
        montant,
        paye: true,
        moyen_payement: 'Espèces',
        categorie_id: containsLoto ? 'cat-13' : 'cat-11',
        manifestation_id: activeManifestationId
    };
    
    syncFeteFinancialToTransactions(existingTxId, txData, (newTxId) => {
        const receiptObj = {
            id,
            stand_id: standId,
            date,
            montant,
            comment,
            transaction_id: newTxId,
            manifestation_id: activeManifestationId
        };
        saveFeteData("feteRuraleReceipts", receiptObj, () => {
            closeModal("modal-fete-receipt");
            document.getElementById("form-fete-receipt").reset();
            document.getElementById("fete-receipt-id").value = "";
            refreshAllViews();
        });
    });
}

function deleteFeteReceipt(id) {
    const rec = STATE.feteRuraleReceipts.find(r => r.id === id);
    if (!rec) return;
    if (!confirm("Voulez-vous vraiment supprimer ce relevé de caisse ? La transaction comptable associée sera également supprimée.")) return;
    
    deleteFeteFinancialTransaction(rec.transaction_id, () => {
        deleteFeteData("feteRuraleReceipts", id, () => {
            refreshAllViews();
        });
    });
}

// --- EXPENSES CRUD & HANDLERS ---
function openFeteExpenseModal() {
    document.getElementById("form-fete-expense").reset();
    document.getElementById("fete-expense-id").value = "";
    document.getElementById("fete-expense-date").value = new Date().toISOString().split('T')[0];
    document.getElementById("fete-expense-scan-data").value = "";
    const m = STATE.manifestations.find(item => item.id === activeManifestationId);
    const mName = m ? m.nom : "Manifestation";
    document.getElementById("fete-expense-modal-title").innerText = "Nouvelle Dépense - " + mName;
    
    openModal("modal-fete-expense");
}

function openManifestationExpenseModalDirectly(id) {
    activeManifestationId = id;
    openFeteExpenseModal();
}

function editFeteExpense(id) {
    const exp = STATE.feteRuraleExpenses.find(e => e.id === id);
    if (!exp) return;
    
    document.getElementById("fete-expense-id").value = exp.id;
    document.getElementById("fete-expense-desc").value = exp.description;
    document.getElementById("fete-expense-date").value = exp.date;
    document.getElementById("fete-expense-montant").value = exp.montant;
    let targetCatId = exp.categorie;
    if (!STATE.categories.some(c => c.id === targetCatId)) {
        const found = STATE.categories.find(c => c.type === "Manifestation" && c.libelle.toLowerCase() === (exp.categorie || "").toLowerCase());
        if (found) targetCatId = found.id;
    }
    document.getElementById("fete-expense-cat").value = targetCatId;
    document.getElementById("fete-expense-moyen").value = exp.moyen_payement;
    document.getElementById("fete-expense-payea").value = exp.paye_a;
    document.getElementById("fete-expense-paye").checked = exp.paye;
    document.getElementById("fete-expense-comment").value = exp.commentaire || "";
    document.getElementById("fete-expense-scan-data").value = exp.scan || "";
    document.getElementById("fete-expense-modal-title").innerText = "Modifier la Dépense";
    
    openModal("modal-fete-expense");
}

function saveFeteExpense(e) {
    e.preventDefault();
    const id = document.getElementById("fete-expense-id").value || "exp-" + Date.now();
    const description = document.getElementById("fete-expense-desc").value;
    const date = document.getElementById("fete-expense-date").value;
    const montant = Number(document.getElementById("fete-expense-montant").value) || 0;
    const feteCat = document.getElementById("fete-expense-cat").value;
    const moyen = document.getElementById("fete-expense-moyen").value;
    const payea = document.getElementById("fete-expense-payea").value;
    const paye = document.getElementById("fete-expense-paye").checked;
    const comment = document.getElementById("fete-expense-comment").value;
    const scan = document.getElementById("fete-expense-scan-data").value;
    
    const exp = STATE.feteRuraleExpenses.find(x => x.id === id);
    const existingTxId = exp ? exp.transaction_id : "";
    
    const txData = {
        date,
        description: `[Dépense Fête] ${description}`,
        type_flux: 'Dépense',
        montant,
        paye,
        moyen_payement: moyen,
        categorie_id: feteCat,
        manifestation_id: activeManifestationId
    };
    
    syncFeteFinancialToTransactions(existingTxId, txData, (newTxId) => {
        const expenseObj = {
            id,
            description,
            date,
            montant,
            paye,
            moyen_payement: moyen,
            paye_a: payea,
            categorie: feteCat,
            commentaire: comment,
            scan,
            transaction_id: newTxId,
            manifestation_id: activeManifestationId
        };
        saveFeteData("feteRuraleExpenses", expenseObj, () => {
            closeModal("modal-fete-expense");
            document.getElementById("form-fete-expense").reset();
            document.getElementById("fete-expense-id").value = "";
            refreshAllViews();
        });
    });
}

function deleteFeteExpense(id) {
    const exp = STATE.feteRuraleExpenses.find(e => e.id === id);
    if (!exp) return;
    if (!confirm("Voulez-vous vraiment supprimer cette dépense ? La transaction comptable associée sera également supprimée.")) return;
    
    deleteFeteFinancialTransaction(exp.transaction_id, () => {
        deleteFeteData("feteRuraleExpenses", id, () => {
            refreshAllViews();
        });
    });
}

// --- PARTNERS CRUD & HANDLERS ---
function openFetePartnerModal() {
    document.getElementById("form-fete-partner").reset();
    document.getElementById("fete-partner-id").value = "";
    document.getElementById("fete-partner-logo-data").value = "";
    const m = STATE.manifestations.find(item => item.id === activeManifestationId);
    const mName = m ? m.nom : "Manifestation";
    document.getElementById("fete-partner-modal-title").innerText = "Nouveau Partenaire - " + mName;
    
    openModal("modal-fete-partner");
}

function editFetePartner(id) {
    const part = STATE.feteRuralePartners.find(p => p.id === id);
    if (!part) return;
    
    document.getElementById("fete-partner-id").value = part.id;
    document.getElementById("fete-partner-entreprise").value = part.entreprise;
    document.getElementById("fete-partner-contact").value = part.contact;
    document.getElementById("fete-partner-suivi").value = part.suivi_par;
    document.getElementById("fete-partner-montant").value = part.montant_sponsoring;
    document.getElementById("fete-partner-moyen").value = part.moyen_payement;
    document.getElementById("fete-partner-paye").checked = part.paye;
    document.getElementById("fete-partner-logo-data").value = part.logo || "";
    document.getElementById("fete-partner-modal-title").innerText = "Modifier le Partenaire";
    
    openModal("modal-fete-partner");
}

function saveFetePartner(e) {
    e.preventDefault();
    const id = document.getElementById("fete-partner-id").value || "part-" + Date.now();
    const entreprise = document.getElementById("fete-partner-entreprise").value;
    const contact = document.getElementById("fete-partner-contact").value;
    const suivi = document.getElementById("fete-partner-suivi").value;
    const montant = Number(document.getElementById("fete-partner-montant").value) || 0;
    const moyen = document.getElementById("fete-partner-moyen").value;
    const paye = document.getElementById("fete-partner-paye").checked;
    const logo = document.getElementById("fete-partner-logo-data").value;
    
    const part = STATE.feteRuralePartners.find(x => x.id === id);
    const existingTxId = part ? part.transaction_id : "";
    
    const txData = {
        date: new Date().toISOString().split('T')[0],
        description: `[Partenaire Fête] ${entreprise} (Sponsoring)`,
        type_flux: 'Recette',
        montant,
        paye,
        moyen_payement: moyen,
        categorie_id: 'cat-3', // Sponsoring / Partenariats
        manifestation_id: activeManifestationId
    };
    
    if (paye) {
        syncFeteFinancialToTransactions(existingTxId, txData, (newTxId) => {
            const partnerObj = {
                id,
                entreprise,
                contact,
                suivi_par: suivi,
                paye,
                moyen_payement: moyen,
                montant_sponsoring: montant,
                logo,
                transaction_id: newTxId,
                manifestation_id: activeManifestationId
            };
            saveFeteData("feteRuralePartners", partnerObj, () => {
                closeModal("modal-fete-partner");
                document.getElementById("form-fete-partner").reset();
                document.getElementById("fete-partner-id").value = "";
                refreshAllViews();
            });
        });
    } else {
        deleteFeteFinancialTransaction(existingTxId, () => {
            const partnerObj = {
                id,
                entreprise,
                contact,
                suivi_par: suivi,
                paye,
                moyen_payement: moyen,
                montant_sponsoring: montant,
                logo,
                transaction_id: "",
                manifestation_id: activeManifestationId
            };
            saveFeteData("feteRuralePartners", partnerObj, () => {
                closeModal("modal-fete-partner");
                document.getElementById("form-fete-partner").reset();
                document.getElementById("fete-partner-id").value = "";
                refreshAllViews();
            });
        });
    }
}

function deleteFetePartner(id) {
    const part = STATE.feteRuralePartners.find(p => p.id === id);
    if (!part) return;
    if (!confirm("Voulez-vous vraiment supprimer ce partenaire ? La transaction comptable associée sera également supprimée.")) return;
    
    deleteFeteFinancialTransaction(part.transaction_id, () => {
        deleteFeteData("feteRuralePartners", id, () => {
            refreshAllViews();
        });
    });
}

// --- FETE RURALE RENDERER ---
function renderFeteRurale() {
    // Check if containers exist (handles cases before full HTML parse or testing)
    if (!document.getElementById("fete-stands-total-recettes")) return;

    // Filter local collections for the active manifestation
    const stands = (STATE.feteRuraleStands || []).filter(s => s.manifestation_id === activeManifestationId);
    const receipts = (STATE.feteRuraleReceipts || []).filter(r => r.manifestation_id === activeManifestationId);
    const expenses = (STATE.feteRuraleExpenses || []).filter(e => e.manifestation_id === activeManifestationId);
    const partners = (STATE.feteRuralePartners || []).filter(p => p.manifestation_id === activeManifestationId);

    // A. Calculate global manifestation dashboard metrics
    let totalRecList = {};
    let totalDepList = {};
    let grandTotalRec = 0;
    let grandTotalDep = 0;

    // 1. Stands receipts & cash float baseline expenses
    let totalFondsDeCaisse = 0;
    stands.forEach(s => {
        let standRec = 0;
        receipts.forEach(r => {
            if (r.stand_id === s.id) {
                standRec += Number(r.montant) || 0;
            }
        });
        if (standRec > 0) {
            const label = `Stand : ${s.nom}`;
            totalRecList[label] = (totalRecList[label] || 0) + standRec;
            grandTotalRec += standRec;
        }

        totalFondsDeCaisse += Number(s.fond_de_caisse) || 0;
    });

    if (totalFondsDeCaisse > 0) {
        const label = "Fonds de caisse (Stands)";
        totalDepList[label] = (totalDepList[label] || 0) + totalFondsDeCaisse;
        grandTotalDep += totalFondsDeCaisse;
    }

    // 2. Partners paid sponsorships
    let partnerRecTotal = 0;
    partners.forEach(p => {
        if (p.paye) {
            partnerRecTotal += Number(p.montant_sponsoring) || 0;
        }
    });
    if (partnerRecTotal > 0) {
        totalRecList["Partenaires (Sponsors)"] = partnerRecTotal;
        grandTotalRec += partnerRecTotal;
    }

    // 3. Other recettes from general transactions linked to this manifestation
    const syncedRecTxIds = new Set([
        ...receipts.map(r => r.transaction_id),
        ...partners.map(p => p.transaction_id)
    ]);
    STATE.transactions.forEach(t => {
        if (t.manifestation_id === activeManifestationId && t.type_flux === "Recette" && t.paye) {
            if (!syncedRecTxIds.has(t.id)) {
                const cat = STATE.categories.find(c => c.id === t.categorie_id);
                const label = cat ? cat.libelle : "Autre recette";
                totalRecList[label] = (totalRecList[label] || 0) + Number(t.montant);
                grandTotalRec += Number(t.montant);
            }
        }
    });

    // 4. Expenses specific to this manifestation (resolving category name)
    expenses.forEach(e => {
        const cat = STATE.categories.find(c => c.id === e.categorie);
        const label = cat ? cat.libelle : (e.categorie ? e.categorie.charAt(0).toUpperCase() + e.categorie.slice(1) : "Autre");
        totalDepList[label] = (totalDepList[label] || 0) + Number(e.montant);
        grandTotalDep += Number(e.montant);
    });

    // 5. Other expenses from general transactions linked to this manifestation
    const syncedExpTxIds = new Set(expenses.map(e => e.transaction_id));
    STATE.transactions.forEach(t => {
        if (t.manifestation_id === activeManifestationId && t.type_flux === "Dépense" && t.paye) {
            if (!syncedExpTxIds.has(t.id)) {
                const cat = STATE.categories.find(c => c.id === t.categorie_id);
                const label = cat ? cat.libelle : "Autre dépense";
                totalDepList[label] = (totalDepList[label] || 0) + Number(t.montant);
                grandTotalDep += Number(t.montant);
            }
        }
    });

    // Render Dashboard Cards
    const dashRec = document.getElementById("manif-dash-total-recettes");
    const dashDep = document.getElementById("manif-dash-total-depenses");
    const dashBilan = document.getElementById("manif-dash-total-bilan");

    if (dashRec) dashRec.innerText = grandTotalRec.toFixed(2) + " €";
    if (dashDep) dashDep.innerText = grandTotalDep.toFixed(2) + " €";
    if (dashBilan) {
        const netBilan = grandTotalRec - grandTotalDep;
        dashBilan.innerText = netBilan.toFixed(2) + " €";
        if (netBilan > 0) {
            dashBilan.style.color = "var(--secondary)";
        } else if (netBilan < 0) {
            dashBilan.style.color = "var(--danger)";
        } else {
            dashBilan.style.color = "var(--text-main)";
        }
    }

    // Render Dashboard Tables
    const dashRecBody = document.getElementById("manif-dash-recettes-breakdown");
    if (dashRecBody) {
        dashRecBody.innerHTML = "";
        const keys = Object.keys(totalRecList);
        if (keys.length === 0) {
            dashRecBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 12px;">Aucune recette</td></tr>`;
        } else {
            keys.forEach(k => {
                dashRecBody.innerHTML += `
                    <tr>
                        <td style="font-weight: 500;">${k}</td>
                        <td style="text-align: right; font-weight: 600; color: var(--secondary);">${totalRecList[k].toFixed(2)} €</td>
                    </tr>
                `;
            });
        }
    }

    const dashDepBody = document.getElementById("manif-dash-depenses-breakdown");
    if (dashDepBody) {
        dashDepBody.innerHTML = "";
        const keys = Object.keys(totalDepList);
        if (keys.length === 0) {
            dashDepBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 12px;">Aucune dépense</td></tr>`;
        } else {
            keys.forEach(k => {
                dashDepBody.innerHTML += `
                    <tr>
                        <td style="font-weight: 500;">${k}</td>
                        <td style="text-align: right; font-weight: 600; color: var(--danger);">${totalDepList[k].toFixed(2)} €</td>
                    </tr>
                `;
            });
        }
    }

    // Render Expenses Chart (Doughnut / Pie)
    const ctxCanvas = document.getElementById("manif-dash-expenses-chart");
    const emptyPlaceholder = document.getElementById("manif-dash-expenses-chart-empty");
    
    if (ctxCanvas) {
        // Destroy existing instance to prevent hover bugs
        if (manifestationChartInstance) {
            manifestationChartInstance.destroy();
            manifestationChartInstance = null;
        }

        if (typeof Chart === 'undefined') {
            console.warn("Chart.js is not loaded. Skipping manifestation chart rendering.");
            if (emptyPlaceholder) emptyPlaceholder.style.display = "block";
            return;
        }

        const labels = Object.keys(totalDepList);
        const dataValues = labels.map(k => totalDepList[k]);
        
        if (labels.length === 0 || grandTotalDep === 0) {
            ctxCanvas.style.display = "none";
            if (emptyPlaceholder) emptyPlaceholder.style.display = "block";
        } else {
            ctxCanvas.style.display = "block";
            if (emptyPlaceholder) emptyPlaceholder.style.display = "none";
            
            manifestationChartInstance = new Chart(ctxCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: [
                            '#ef4444', // Red
                            '#f59e0b', // Amber/Orange
                            '#10b981', // Emerald/Green
                            '#3b82f6', // Blue
                            '#8b5cf6', // Violet
                            '#ec4899', // Pink
                            '#6b7280'  // Gray
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const val = context.raw || 0;
                                    const percentage = ((val / grandTotalDep) * 100).toFixed(0);
                                    return ` ${context.label}: ${val.toFixed(2)} € (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    }

    // 1. Calculate metrics
    let totalRecettesStands = 0;
    receipts.forEach(r => {
        totalRecettesStands += Number(r.montant) || 0;
    });
    
    let totalFondsCaisse = 0;
    stands.forEach(s => {
        totalFondsCaisse += Number(s.fond_de_caisse) || 0;
    });
    
    const beneficeNetGlobal = totalRecettesStands - totalFondsCaisse;
    
    document.getElementById("fete-stands-total-recettes").innerText = totalRecettesStands.toFixed(2) + " €";
    document.getElementById("fete-stands-total-fonds").innerText = totalFondsCaisse.toFixed(2) + " €";
    
    const benefEl = document.getElementById("fete-stands-total-benefice");
    benefEl.innerText = beneficeNetGlobal.toFixed(2) + " €";
    if (beneficeNetGlobal > 0) {
        benefEl.style.color = "var(--secondary)";
    } else if (beneficeNetGlobal < 0) {
        benefEl.style.color = "var(--danger)";
    } else {
        benefEl.style.color = "var(--text-main)";
    }
    
    // 2. Render stands cards
    const standsGrid = document.getElementById("fete-stands-grid");
    standsGrid.innerHTML = "";
    
    if (stands.length === 0) {
        standsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">Aucun stand enregistré pour cette manifestation.</div>`;
    } else {
        stands.forEach(s => {
            let standRec = 0;
            receipts.forEach(r => {
                if (r.stand_id === s.id) {
                    standRec += Number(r.montant) || 0;
                }
            });
            const standNet = standRec - Number(s.fond_de_caisse);
            const netColor = standNet > 0 ? "color: var(--secondary);" : (standNet < 0 ? "color: var(--danger);" : "");
            
            standsGrid.innerHTML += `
                <div class="stand-card">
                    <div class="stand-card-header">
                        <div class="stand-card-title">${s.nom}</div>
                        <button class="btn btn-success btn-sm" onclick="openFeteReceiptModalForStand('${s.id}')" title="Récupérer de l'argent">
                            <i data-lucide="plus" style="width: 14px; height: 14px; margin-right: 4px;"></i> Récupérer
                        </button>
                    </div>
                    <div class="stand-card-metrics">
                        <div class="stand-metric-row">
                            <span class="metric-label">Fond de Caisse :</span>
                            <span class="metric-val">${Number(s.fond_de_caisse).toFixed(2)} €</span>
                        </div>
                        <div class="stand-metric-row">
                            <span class="metric-label">Recettes :</span>
                            <span class="metric-val" style="color: var(--secondary);">${standRec.toFixed(2)} €</span>
                        </div>
                        <div class="stand-metric-row profit">
                            <span class="metric-label">Bénéfice Net :</span>
                            <span class="metric-val" style="${netColor} font-weight: 600;">${standNet.toFixed(2)} €</span>
                        </div>
                    </div>
                    <div class="stand-card-actions">
                        <button class="btn btn-secondary btn-icon-only btn-sm" onclick="editFeteStand('${s.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-sm" style="color: var(--danger);" onclick="deleteFeteStand('${s.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    // 3. Render receipts history table
    const receiptsTable = document.getElementById("fete-receipts-table-body");
    receiptsTable.innerHTML = "";
    
    if (receipts.length === 0) {
        receiptsTable.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Aucune récupération de caisse enregistrée</td></tr>`;
    } else {
        const sortedRecs = [...receipts].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedRecs.forEach(r => {
            const stand = STATE.feteRuraleStands.find(s => s.id === r.stand_id);
            const standName = stand ? stand.nom : "Stand inconnu";
            receiptsTable.innerHTML += `
                <tr>
                    <td>${formatDateFrench(new Date(r.date))}</td>
                    <td style="font-weight: 500;">${standName}</td>
                    <td style="color: var(--secondary); font-weight: 600;">${Number(r.montant).toFixed(2)} €</td>
                    <td>${r.comment || '<span style="color: var(--text-muted);">--</span>'}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary btn-icon-only btn-sm" onclick="editFeteReceipt('${r.id}')" title="Modifier">
                                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only btn-sm" style="color: var(--danger);" onclick="deleteFeteReceipt('${r.id}')" title="Supprimer">
                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    
    // 4. Render expenses table
    const expensesTable = document.getElementById("fete-expenses-table-body");
    expensesTable.innerHTML = "";
    
    // Calculate total expenses for the badge
    let sumExpenses = 0;
    expenses.forEach(e => {
        sumExpenses += Number(e.montant) || 0;
    });
    const expTotalBadge = document.getElementById("fete-expenses-total-badge");
    if (expTotalBadge) {
        expTotalBadge.innerText = `Total : ${sumExpenses.toFixed(2)} €`;
    }
    
    if (expenses.length === 0) {
        expensesTable.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">Aucune dépense enregistrée</td></tr>`;
    } else {
        const sortField = SORTS.manifestationExpenses.field;
        const sortDirection = SORTS.manifestationExpenses.direction === 'asc' ? 1 : -1;
        const sortedExps = [...expenses].sort((a, b) => {
            let valA, valB;
            if (sortField === 'date') {
                valA = new Date(a.date);
                valB = new Date(b.date);
            } else if (sortField === 'montant' || sortField === 'paye') {
                valA = Number(a[sortField]) || 0;
                valB = Number(b[sortField]) || 0;
            } else {
                valA = (a[sortField] || "").toString().toLowerCase();
                valB = (b[sortField] || "").toString().toLowerCase();
            }
            if (valA < valB) return -1 * sortDirection;
            if (valA > valB) return 1 * sortDirection;
            return 0;
        });
        sortedExps.forEach(e => {
            const paidBadge = e.paye ? 
                `<span class="badge badge-success">Payé</span>` : 
                `<span class="badge badge-danger">À payer</span>`;
                
            const scanBtn = e.scan ? 
                `<img class="table-thumbnail" src="${e.scan}" onclick="openFeteImageViewer('${e.description.replace(/'/g, "\\'")}', '${e.scan}')" title="Voir le scan">` : 
                `<span class="table-no-thumbnail">Aucun</span>`;
                
            const catObj = STATE.categories.find(c => c.id === e.categorie);
            const catLabel = catObj ? catObj.libelle : (e.categorie ? e.categorie.charAt(0).toUpperCase() + e.categorie.slice(1) : "Autre");
                
            expensesTable.innerHTML += `
                <tr>
                    <td>${formatDateFrench(new Date(e.date))}</td>
                    <td style="font-weight: 500;">${e.description}</td>
                    <td>${catLabel}</td>
                    <td>${e.paye_a}</td>
                    <td style="color: var(--danger); font-weight: 600;">${Number(e.montant).toFixed(2)} €</td>
                    <td>${e.moyen_payement}</td>
                    <td>${paidBadge}</td>
                    <td>${scanBtn}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary btn-icon-only btn-sm" onclick="editFeteExpense('${e.id}')" title="Modifier">
                                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                            </button>
                            <button class="btn btn-secondary btn-icon-only btn-sm" style="color: var(--danger);" onclick="deleteFeteExpense('${e.id}')" title="Supprimer">
                                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    
    // 5. Render partners grid
    const partnersGrid = document.getElementById("fete-partners-grid");
    partnersGrid.innerHTML = "";
    
    if (partners.length === 0) {
        partnersGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">Aucun partenaire enregistré.</div>`;
    } else {
        partners.forEach(p => {
            const paidBadge = p.paye ? 
                `<span class="badge badge-success">Financement Reçu</span>` : 
                `<span class="badge badge-warning">Promesse en attente</span>`;
                
            const logoContent = p.logo ? 
                `<img class="partner-logo-img" src="${p.logo}" onclick="openFeteImageViewer('${p.entreprise.replace(/'/g, "\\'")}', '${p.logo}')" style="cursor: pointer;" title="Agrandir le logo">` : 
                `<div class="partner-logo-placeholder">${p.entreprise.charAt(0)}</div>`;
                
            partnersGrid.innerHTML += `
                <div class="partner-card">
                    <div class="partner-actions">
                        <button class="btn btn-secondary btn-icon-only btn-sm" onclick="editFetePartner('${p.id}')" title="Modifier">
                            <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon-only btn-sm" style="color: var(--danger);" onclick="deleteFetePartner('${p.id}')" title="Supprimer">
                            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                        </button>
                    </div>
                    <div class="partner-logo-container">
                        ${logoContent}
                    </div>
                    <div class="partner-name">${p.entreprise}</div>
                    <div class="partner-contact">Contact: ${p.contact}</div>
                    <div class="partner-details">
                        <div class="partner-detail-row">
                            <span class="lbl">Suivi par :</span>
                            <span class="val">${p.suivi_par}</span>
                        </div>
                        <div class="partner-detail-row">
                            <span class="lbl">Sponsoring :</span>
                            <span class="val" style="color: var(--secondary); font-weight: 600;">${Number(p.montant_sponsoring).toFixed(2)} €</span>
                        </div>
                        <div class="partner-detail-row">
                            <span class="lbl">Moyen :</span>
                            <span class="val">${p.moyen_payement}</span>
                        </div>
                        <div style="text-align: center; margin-top: 8px;">
                            ${paidBadge}
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    lucide.createIcons();
}

// ============================================================================
// --- 16. PERIOD SELECTION HELPERS ---
// ============================================================================
function initPeriod() {
    if (!STATE.currentPeriod) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed: 9 is October
        if (month >= 9) { // October - December
            STATE.currentPeriod = `${year}-${year+1}`;
        } else { // January - September
            STATE.currentPeriod = `${year-1}-${year}`;
        }
    }
    updatePeriodDisplay();
}

function changePeriod(direction) {
    const parts = STATE.currentPeriod.split('-');
    const startYear = parseInt(parts[0]) + direction;
    const endYear = parseInt(parts[1]) + direction;
    
    // Limit to reasonable bounds
    if (startYear < 2018 || startYear > 2030) return;
    
    STATE.currentPeriod = `${startYear}-${endYear}`;
    
    // Reset tennis week start date to the beginning of the selected period (October 1st)
    currentWeekStartDate = getMonday(new Date(startYear, 9, 1));
    
    saveState();
    updatePeriodDisplay();
    refreshAllViews();
}

function updatePeriodDisplay() {
    const el = document.getElementById("global-period-display");
    if (el) {
        const parts = STATE.currentPeriod.split('-');
        el.innerText = `${parts[0]} / ${parts[1]}`;
    }
}

function isDateInPeriod(dateStr, period) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const parts = period.split('-');
    const startYear = parseInt(parts[0]);
    const endYear = parseInt(parts[1]);
    
    const start = new Date(startYear, 9, 1); // October 1st (month 9)
    const end = new Date(endYear, 8, 30, 23, 59, 59); // September 30th (month 8)
    
    return d >= start && d <= end;
}

function getPeriodMonthIndex(d) {
    const m = d.getMonth(); // 0-11
    // October is index 0, November is index 1, ..., September is index 11
    if (m >= 9) {
        return m - 9;
    } else {
        return m + 3;
    }
}

// --- LOGO PERSONALIZATION HELPERS ---
function initLogo() {
    const logoUrl = localStorage.getItem("foyer_logo_url") || "logo.png?v=2.2";
    const logoOpacityVal = localStorage.getItem("foyer_logo_opacity") !== null ? 
        Number(localStorage.getItem("foyer_logo_opacity")) : 0.05;
        
    renderLogo(logoUrl, logoOpacityVal);
    updateLogoControls(logoUrl, logoOpacityVal);
    
    // Initialize cotisation input value
    const cotInput = document.getElementById("settings-cotisation-amount");
    if (cotInput) {
        cotInput.value = getCotisationAmount();
    }
}

function renderLogo(logoUrl, opacity) {
    const sidebarLogo = document.getElementById("sidebar-logo");
    if (sidebarLogo) sidebarLogo.src = logoUrl;
    
    const watermark = document.getElementById("main-bg-watermark");
    if (watermark) {
        watermark.style.backgroundImage = `url('${logoUrl}')`;
        watermark.style.opacity = opacity;
    }
}

function updateLogoControls(logoUrl, opacity) {
    const opacityRange = document.getElementById("logo-opacity-range");
    if (opacityRange) opacityRange.value = Math.round(opacity * 100);
    
    const opacityValue = document.getElementById("logo-opacity-value");
    if (opacityValue) opacityValue.innerText = Math.round(opacity * 100) + "%";
    
    const fileName = document.getElementById("logo-file-name");
    if (fileName) {
        if (logoUrl.startsWith("data:")) {
            fileName.innerText = "Image personnalisée";
        } else {
            fileName.innerText = logoUrl;
        }
    }
}

function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (dbMode === 'firebase') {
        const fileName = document.getElementById("logo-file-name");
        if (fileName) fileName.innerText = "Téléversement...";
        
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`logo/${Date.now()}_${file.name}`);
        fileRef.put(file).then(snapshot => {
            return snapshot.ref.getDownloadURL();
        }).then(url => {
            return db.collection("settings").doc("app").set({ foyer_logo_url: url }, { merge: true });
        }).catch(err => {
            console.error("Logo upload failed:", err);
            alert("Échec du téléversement du logo : " + err.message);
            initLogo();
        });
    } else {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const dataUrl = evt.target.result;
            
            localStorage.setItem("foyer_logo_url", dataUrl);
            
            const opacity = localStorage.getItem("foyer_logo_opacity") !== null ? 
                Number(localStorage.getItem("foyer_logo_opacity")) : 0.05;
            renderLogo(dataUrl, opacity);
            updateLogoControls(dataUrl, opacity);
        };
        reader.readAsDataURL(file);
    }
}

function updateLogoOpacityFromRange(val) {
    const opacity = Number(val) / 100;
    localStorage.setItem("foyer_logo_opacity", opacity);
    
    const logoUrl = localStorage.getItem("foyer_logo_url") || "logo.png?v=2.2";
    renderLogo(logoUrl, opacity);
    
    const opacityValue = document.getElementById("logo-opacity-value");
    if (opacityValue) opacityValue.innerText = val + "%";
    
    if (dbMode === 'firebase') {
        db.collection("settings").doc("app").set({ foyer_logo_opacity: opacity }, { merge: true })
            .catch(err => console.error("Failed to sync logo opacity:", err));
    }
}

function resetLogoSettings() {
    localStorage.removeItem("foyer_logo_url");
    localStorage.removeItem("foyer_logo_opacity");
    
    if (dbMode === 'firebase') {
        db.collection("settings").doc("app").set({ 
            foyer_logo_url: firebase.firestore.FieldValue.delete(), 
            foyer_logo_opacity: firebase.firestore.FieldValue.delete() 
        }, { merge: true })
        .then(() => initLogo())
        .catch(err => {
            console.error("Failed to reset Cloud settings:", err);
            initLogo();
        });
    } else {
        initLogo();
    }
}

// --- MEMBERSHIP COTISATION HELPERS ---
function getCotisationAmount() {
    const val = localStorage.getItem("foyer_cotisation_amount");
    return val !== null ? Number(val) : 20.00;
}

function saveCotisationAmountSetting(val) {
    const amount = Number(val) || 20.00;
    localStorage.setItem("foyer_cotisation_amount", amount);
    if (dbMode === 'firebase') {
        db.collection("settings").doc("app").set({ foyer_cotisation_amount: amount }, { merge: true })
            .catch(err => console.error("Failed to sync cotisation amount:", err));
    }
}

