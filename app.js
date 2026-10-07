/* ============================================================
   GESTION IMPRESSION — Logique du site
   ============================================================ */

// ============ CONFIGURATION ============
const API_URL = "https://script.google.com/macros/s/AKfycbw1vSzwV7K8KV_lwqWOTcLGot_WCcgUvWGWQ3QvuMdMU8wEJh6lvGbmIRIdp2d6PLj-/exec";
const API_TOKEN = "gj7K2mP9xQ4vL8nR3wT6yH1bN5cF0dS2aE7uJ9iZ4kM8pX3qV6";

// ============ ÉTAT GLOBAL ============
let DATA = { jobs: [], stock: [], kpi: {}, parametres: { tissus: [], etats: [] } };
let PROGRESSION_TIMER = null;

// ============ AUTHENTIFICATION ============
function estAdmin() { return sessionStorage.getItem("admin") === "ok"; }
function getAdminPassword() { return sessionStorage.getItem("adminPwd") || ""; }
function setAdmin(password) {
  sessionStorage.setItem("admin", "ok");
  sessionStorage.setItem("adminPwd", password);
}
function logoutAdmin() {
  sessionStorage.removeItem("admin");
  sessionStorage.removeItem("adminPwd");
}

// ============ APPELS API ============
async function apiGet(action, extraParams = {}) {
  const params = new URLSearchParams({ action: action, token: API_TOKEN, ...extraParams });
  const res = await fetch(`${API_URL}?${params.toString()}`);
  return await res.json();
}

async function apiPost(action, payload = {}) {
  const adminPassword = getAdminPassword();
  const res = await fetch(`${API_URL}?action=${action}&token=${API_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, token: API_TOKEN, adminPassword: adminPassword })
  });
  return await res.json();
}

// ============ CHARGEMENT ============
async function chargerDashboard() {
  try {
    const data = await apiGet("dashboard");
    if (data.error) { afficherErreur("Erreur API : " + data.error); return; }
    DATA = data;
    afficherKPI(data.kpi);
    afficherJobs(data.jobs);
    afficherStock(data.stock);
    remplirListesDeroulantes(data.parametres);
  } catch (err) {
    afficherErreur("Erreur de connexion : " + err.message);
  }
}

async function chargerHistorique() {
  try {
    const data = await apiGet("getHistorique");
    if (data.error) return;
    afficherHistorique(data.historique);
  } catch (err) { console.error(err); }
}

// ============ AFFICHAGE ============
function afficherKPI(kpi) {
  document.getElementById("kpi-attente").textContent = kpi.enAttente || 0;
  document.getElementById("kpi-encours").textContent = kpi.enCours || 0;
  document.getElementById("kpi-rupture").textContent = kpi.ruptures || 0;
  document.getElementById("kpi-accompli").textContent = kpi.accomplis || 0;
  document.getElementById("kpi-m2").textContent = (kpi.m2Aujourdhui || 0).toFixed(2);
  document.getElementById("kpi-stock").textContent = kpi.stockCritique || 0;
}

function afficherJobs(jobs) {
  const tbody = document.getElementById("tbody-jobs");
  tbody.innerHTML = "";
  if (!jobs || jobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="vide">Aucun job pour le moment.</td></tr>';
    return;
  }
  jobs.forEach(job => {
    const tr = document.createElement("tr");
    const pourcentage = job.pourcentage ? (Number(job.pourcentage) * 100).toFixed(0) + "%" : "0%";
    const m2 = job.m2Total ? Number(job.m2Total).toFixed(2) : "0.00";
    tr.innerHTML = `
      <td>${job.dateReception || ""}</td>
      <td>${job.client || ""}</td>
      <td>${job.jobRef || ""}</td>
      <td>${job.largeur || 0}</td>
      <td>${job.hauteur || 0}</td>
      <td>${job.quantite || 0}</td>
      <td>${job.tissu || ""}</td>
      <td><span class="badge-etat">${job.etat || ""}</span></td>
      <td>${job.qteImprimee || 0}</td>
      <td>${pourcentage}</td>
      <td>${m2}</td>
      <td class="col-actions">${genererBoutonsActions(job)}</td>
    `;
    tbody.appendChild(tr);
  });
  if (estAdmin()) {
    document.querySelectorAll("[data-action-job]").forEach(btn => {
      btn.addEventListener("click", gererActionJob);
    });
  }
}

function genererBoutonsActions(job) {
  if (!estAdmin()) return '<span style="color:#999;font-size:12px;">👁️ Lecture seule</span>';
  const ligne = job.ligne;
  return `
    <button class="btn btn-statut btn-statut-encours" data-action-job="encours" data-ligne="${ligne}">En cours</button>
    <button class="btn btn-statut btn-statut-rupture" data-action-job="rupture" data-ligne="${ligne}">Rupture</button>
    <button class="btn btn-statut btn-statut-accompli" data-action-job="accompli" data-ligne="${ligne}">Accompli</button>
    <button class="btn btn-statut btn-statut-transfert" data-action-job="transfert" data-ligne="${ligne}">Transfert</button>
    <button class="btn btn-statut btn-statut-cloturer" data-action-job="cloturer" data-ligne="${ligne}">Clôturer</button>
    <button class="btn btn-statut btn-statut-suppr" data-action-job="supprimer" data-ligne="${ligne}">🗑️</button>
  `;
}

function afficherStock(stock) {
  const tbody = document.getElementById("tbody-stock");
  tbody.innerHTML = "";
  if (!stock || stock.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="vide">Aucun tissu.</td></tr>';
    return;
  }
  stock.forEach(t => {
    const tr = document.createElement("tr");
    if (t.alerte) tr.style.background = "#fce8e6";
    tr.innerHTML = `
      <td><strong>${t.tissu || ""}</strong></td>
      <td>${formatNum(t.stockInitial)}</td>
      <td>${formatNum(t.totalAchete)}</td>
      <td>${formatNum(t.totalUtilise)}</td>
      <td><strong>${formatNum(t.stockRestant)}</strong></td>
      <td>${formatNum(t.seuilAlerte)}</td>
      <td>${t.derniereEntree || ""}</td>
      <td>${t.fournisseur || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

function afficherHistorique(histo) {
  const tbody = document.getElementById("tbody-historique");
  tbody.innerHTML = "";
  if (!histo || histo.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="vide">Aucune action enregistrée.</td></tr>';
    return;
  }
  histo.forEach(h => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${h.dateHeure || ""}</td>
      <td>${h.utilisateur || ""}</td>
      <td>${h.action || ""}</td>
      <td>${h.cible || ""}</td>
      <td>${h.detail || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

function remplirListesDeroulantes(params) {
  const selects = ["ocr-tissu", "stock-tissu"];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = "";
    (params.tissus || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  });
}

// ============ ACTIONS SUR LES JOBS ============
async function gererActionJob(event) {
  const btn = event.currentTarget;
  const action = btn.dataset.actionJob;
  const ligne = parseInt(btn.dataset.ligne);

  if (action === "supprimer") {
    if (!confirm("Supprimer ce job ?")) return;
    const res = await apiPost("deleteJob", { ligne: ligne, utilisateur: "Admin" });
    if (res.success) chargerDashboard();
    else alert("Erreur : " + (res.error || "inconnue"));
    return;
  }

  let etat = "";
  if (action === "encours") etat = "En cours";
  else if (action === "rupture") etat = "Rupture";
  else if (action === "accompli") etat = "Accompli";
  else if (action === "transfert") etat = "Transfert effectué";
  else if (action === "cloturer") etat = "Clôturer";

  const payload = { ligne: ligne, etat: etat, utilisateur: "Admin" };

  if (action === "encours" || action === "accompli") {
    const qte = prompt("Quantité imprimée (laisser vide pour la quantité totale) :");
    if (qte !== null && qte !== "") payload.qteImprimee = Number(qte);
  }

  const res = await apiPost("updateJob", payload);
  if (res.success) chargerDashboard();
  else alert("Erreur : " + (res.error || "inconnue"));
}

// ============ AJOUT DE STOCK ============
async function ajouterStock() {
  const tissu = document.getElementById("stock-tissu").value;
  const quantite = parseFloat(document.getElementById("stock-quantite").value);
  const prix = parseFloat(document.getElementById("stock-prix").value) || "";
  const fournisseur = document.getElementById("stock-fournisseur").value;
  const date = document.getElementById("stock-date").value;
  const commentaire = document.getElementById("stock-commentaire").value;

  if (!tissu || !quantite || quantite <= 0) {
    alert("Veuillez sélectionner un tissu et saisir une quantité valide.");
    return;
  }

  const res = await apiPost("addStock", {
    tissu: tissu, quantite: quantite, prixUnitaire: prix,
    fournisseur: fournisseur, date: date, commentaire: commentaire, utilisateur: "Admin"
  });

  if (res.success) {
    alert("✅ Stock ajouté !");
    document.getElementById("stock-quantite").value = "";
    document.getElementById("stock-prix").value = "";
    document.getElementById("stock-fournisseur").value = "";
    document.getElementById("stock-commentaire").value = "";
    chargerDashboard();
  } else {
    alert("Erreur : " + (res.error || "inconnue"));
  }
}

// ============ PROGRESSION ============
function demarrerProgression() {
  const etapes = [
    { pct: 10, msg: "📤 Envoi du fichier...", detail: "Transfert en cours" },
    { pct: 30, msg: "📥 Réception par le serveur...", detail: "Préparation de l'analyse" },
    { pct: 50, msg: "🔍 Analyse OCR en cours...", detail: "Google lit votre document" },
    { pct: 75, msg: "⚙️ Extraction des données...", detail: "Identification des champs" },
    { pct: 90, msg: "📊 Finalisation...", detail: "Presque terminé" }
  ];
  
  let i = 0;
  mettreAJourProgression(0, "⏳ Démarrage...", "Initialisation");
  
  PROGRESSION_TIMER = setInterval(() => {
    if (i < etapes.length) {
      mettreAJourProgression(etapes[i].pct, etapes[i].msg, etapes[i].detail);
      i++;
    }
  }, 1500);
}

function mettreAJourProgression(pct, msg, detail) {
  document.getElementById("progress-bar").style.width = pct + "%";
  document.getElementById("progress-text").textContent = pct + "%";
  document.getElementById("loading-message").textContent = msg;
  if (detail) document.getElementById("loading-detail").textContent = detail;
}

function arreterProgression() {
  if (PROGRESSION_TIMER) {
    clearInterval(PROGRESSION_TIMER);
    PROGRESSION_TIMER = null;
  }
  mettreAJourProgression(100, "✅ Terminé !", "");
}

// ============ SCAN + UPLOAD ============
function scannerBAT() {
  document.getElementById("input-fichier").click();
}

async function traiterFichier(file) {
  if (!file) return;
  
  const btnScanner = document.getElementById("btn-scanner");
  btnScanner.disabled = true;
  
  afficherLoading(true);
  demarrerProgression();
  
  try {
    const base64 = await fileToBase64(file);
    const res = await apiPost("ocr", {
      fileName: file.name,
      mimeType: file.type,
      fileBase64: base64,
      utilisateur: "Admin"
    });

    arreterProgression();
    
    if (res.error) {
      alert("Erreur OCR : " + res.error);
      return;
    }

    // Normaliser en tableau
    let jobs = Array.isArray(res.data) ? res.data : [res.data];
    
    if (jobs.length === 0) {
      alert("Aucun job détecté dans le fichier.");
      return;
    }
    
    // Masquer l'overlay AVANT d'afficher les modales
    afficherLoading(false);
    
    // Traiter les jobs un par un
    await traiterJobsEnBoucle(jobs);
    
  } catch (err) {
    arreterProgression();
    alert("Erreur : " + err.message);
  } finally {
    afficherLoading(false);
    btnScanner.disabled = false;
  }
}

/**
 * Traite une liste de jobs un par un.
 */
async function traiterJobsEnBoucle(jobs) {
  let nbValides = 0;
  let nbAnnules = 0;
  
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    job._progression = { actuel: i + 1, total: jobs.length };
    
    const valide = await afficherModaleOCRAsync(job);
    
    if (valide) {
      nbValides++;
    } else {
      nbAnnules++;
      if (i < jobs.length - 1) {
        if (!confirm("Voulez-vous continuer avec les jobs restants ?")) {
          break;
        }
      }
    }
  }
  
  // Rafraîchir le dashboard
  chargerDashboard();
  
  // Message final
  if (jobs.length > 1) {
    setTimeout(() => {
      alert("✅ Traitement terminé !\n" + nbValides + " job(s) validé(s), " + nbAnnules + " annulé(s).");
    }, 500);
  }
}

/**
 * Affiche la modale OCR en mode "promesse".
 * Résout `true` si le job est validé, `false` si annulé.
 */
function afficherModaleOCRAsync(data) {
  return new Promise((resolve) => {
    // ==== Remplir les champs ====
    document.getElementById("ocr-client").value = data.client || "";
    document.getElementById("ocr-job").value = data.jobRef || "";
    document.getElementById("ocr-date").value = data.dateReception || "";
    document.getElementById("ocr-largeur").value = data.largeur || 0;
    document.getElementById("ocr-hauteur").value = data.hauteur || 0;
    document.getElementById("ocr-quantite").value = data.quantite || 1;
    document.getElementById("ocr-commentaire").value = data.designation || "";
    
    // ==== Tissu ====
    const selTissu = document.getElementById("ocr-tissu");
    const tissuExtrait = (data.tissu || "").toLowerCase();
    for (let i = 0; i < selTissu.options.length; i++) {
      if (selTissu.options[i].value.toLowerCase() === tissuExtrait) {
        selTissu.selectedIndex = i;
        break;
      }
    }
    
    // ==== Titre et info ====
    const titre = document.getElementById("ocr-titre");
    const info = document.getElementById("ocr-info");
    
    if (data._progression && data._progression.total > 1) {
      titre.textContent = "📄 Valider le job (" + data._progression.actuel + " / " + data._progression.total + ")";
      info.textContent = "Vérifiez et corrigez les données de ce job. Après validation, vous passerez au suivant.";
    } else {
      titre.textContent = "📄 Valider le job";
      info.textContent = "Vérifiez et corrigez les données extraites avant de valider.";
    }
    
    // ==== Afficher la modale ====
    document.getElementById("modale-ocr").style.display = "flex";
    
    // ==== Boutons : on remplace par clone pour supprimer les anciens handlers ====
    const btnValiderOld = document.getElementById("btn-valider-ocr");
    const btnAnnulerOld = document.getElementById("btn-annuler-ocr");
    const btnFermerOld = document.getElementById("btn-fermer-modale");
    
    const btnValider = btnValiderOld.cloneNode(true);
    const btnAnnuler = btnAnnulerOld.cloneNode(true);
    const btnFermer = btnFermerOld.cloneNode(true);
    
    btnValiderOld.replaceWith(btnValider);
    btnAnnulerOld.replaceWith(btnAnnuler);
    btnFermerOld.replaceWith(btnFermer);
    
    // ==== Action Valider ====
    btnValider.onclick = async () => {
      const payload = {
        dateReception: document.getElementById("ocr-date").value,
        client: document.getElementById("ocr-client").value,
        jobRef: document.getElementById("ocr-job").value,
        largeur: parseFloat(document.getElementById("ocr-largeur").value) || 0,
        hauteur: parseFloat(document.getElementById("ocr-hauteur").value) || 0,
        quantite: parseInt(document.getElementById("ocr-quantite").value) || 0,
        tissu: document.getElementById("ocr-tissu").value,
        commentaire: document.getElementById("ocr-commentaire").value,
        utilisateur: "Admin"
      };
      
      afficherLoading(true, "💾 Enregistrement du job...");
      const res = await apiPost("validateJob", payload);
      afficherLoading(false);
      
      if (res.success) {
        document.getElementById("modale-ocr").style.display = "none";
        resolve(true);
      } else {
        alert("Erreur : " + (res.error || "inconnue"));
      }
    };
    
    // ==== Action Annuler ====
    btnAnnuler.onclick = () => {
      document.getElementById("modale-ocr").style.display = "none";
      resolve(false);
    };
    
    btnFermer.onclick = () => {
      document.getElementById("modale-ocr").style.display = "none";
      resolve(false);
    };
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============ DRAG & DROP ============
function initialiserDragDrop() {
  const dropZone = document.getElementById("drop-zone");
  const zoneScan = document.getElementById("zone-scan");
  const inputFichier = document.getElementById("input-fichier");
  const btnScanner = document.getElementById("btn-scanner");

  btnScanner.addEventListener("click", (e) => {
    e.stopPropagation();
    scannerBAT();
  });

  dropZone.addEventListener("click", () => {
    inputFichier.click();
  });

  inputFichier.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) traiterFichier(file);
    e.target.value = "";
  });

  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    document.body.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    zoneScan.classList.add("dragover");
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  dropZone.addEventListener("dragleave", (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      zoneScan.classList.remove("dragover");
      dropZone.classList.remove("dragover");
    }
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    zoneScan.classList.remove("dragover");
    dropZone.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.type === "application/pdf" || file.type.startsWith("image/")) {
        traiterFichier(file);
      } else {
        alert("Format non supporté. Envoyez un PDF ou une image.");
      }
    }
  });
}

// ============ ADMIN ============
function afficherModaleAdmin() {
  document.getElementById("input-password").value = "";
  document.getElementById("admin-erreur").style.display = "none";
  document.getElementById("modale-admin").style.display = "flex";
  setTimeout(() => document.getElementById("input-password").focus(), 100);
}

async function tenterConnexionAdmin() {
  const pwd = document.getElementById("input-password").value;
  if (!pwd) return;

  afficherLoading(true, "🔐 Vérification...");
  const res = await apiGet("checkAdmin", { adminPassword: pwd });
  afficherLoading(false);

  if (res.success) {
    setAdmin(pwd);
    document.getElementById("modale-admin").style.display = "none";
    majInterfaceAdmin();
    chargerDashboard();
  } else {
    document.getElementById("admin-erreur").textContent = "❌ Mot de passe incorrect";
    document.getElementById("admin-erreur").style.display = "block";
  }
}

function majInterfaceAdmin() {
  const admin = estAdmin();
  document.getElementById("btn-admin").style.display = admin ? "none" : "inline-block";
  document.getElementById("btn-deconnexion").style.display = admin ? "inline-block" : "none";
  document.getElementById("zone-scan").style.display = admin ? "block" : "none";
  document.getElementById("zone-ajout-stock").style.display = admin ? "block" : "none";
  document.querySelector(".statut-lecture").textContent = admin ? "🔓 Admin connecté" : "👁️ Consultation libre";
}

function deconnecterAdmin() {
  logoutAdmin();
  majInterfaceAdmin();
  chargerDashboard();
}

// ============ UTILITAIRES ============
function afficherLoading(show, message) {
  const el = document.getElementById("loading");
  el.style.display = show ? "flex" : "none";
  if (show) {
    if (message) document.getElementById("loading-message").textContent = message;
    if (!PROGRESSION_TIMER) {
      document.getElementById("progress-bar").style.width = "0%";
      document.getElementById("progress-text").textContent = "0%";
    }
  } else {
    arreterProgression();
  }
}

function afficherErreur(msg) {
  const el = document.getElementById("erreur");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

function formatNum(n) {
  if (n === "" || n === null || n === undefined) return "0";
  const num = Number(n);
  if (isNaN(num)) return "0";
  return num.toFixed(2).replace(/\.00$/, "");
}

function slug(str) {
  if (!str) return "";
  return str.toString().toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a")
    .replace(/[îï]/g, "i").replace(/[ôö]/g, "o")
    .replace(/[ûü]/g, "u").replace(/[ç]/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

// ============ INITIALISATION ============
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-rafraichir").addEventListener("click", () => {
    chargerDashboard();
    chargerHistorique();
  });
  document.getElementById("btn-admin").addEventListener("click", afficherModaleAdmin);
  document.getElementById("btn-deconnexion").addEventListener("click", deconnecterAdmin);

  document.getElementById("btn-fermer-admin").addEventListener("click", () => {
    document.getElementById("modale-admin").style.display = "none";
  });
  document.getElementById("btn-annuler-admin").addEventListener("click", () => {
    document.getElementById("modale-admin").style.display = "none";
  });
  document.getElementById("btn-valider-admin").addEventListener("click", tenterConnexionAdmin);
  document.getElementById("input-password").addEventListener("keypress", e => {
    if (e.key === "Enter") tenterConnexionAdmin();
  });

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "historique") chargerHistorique();
    });
  });

  initialiserDragDrop();

  document.getElementById("btn-ajouter-stock").addEventListener("click", ajouterStock);
  document.getElementById("stock-date").valueAsDate = new Date();

  majInterfaceAdmin();
  chargerDashboard();
});
