/* ============================================================
   GESTION IMPRESSION — Logique du site
   ============================================================ */

// ============ CONFIGURATION ============
const API_URL = "https://script.google.com/macros/s/AKfycbw1vSzwV7K8KV_lwqWOTcLGot_WCcgUvWGWQ3QvuMdMU8wEJh6lvGbmIRIdp2d6PLj-/exec";
const API_TOKEN = "gj7K2mP9xQ4vL8nR3wT6yH1bN5cF0dS2aE7uJ9iZ4kM8pX3qV6";

// ============ ÉTAT GLOBAL ============
let DATA = { jobs: [], stock: [], kpi: {}, parametres: { tissus: [], etats: [] } };
let PROGRESSION_TIMER = null;
let JOBS_EN_COURS = [];

// ============ AUTH ============
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

// ============ API ============
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
    tbody.innerHTML = '<tr><td colspan="13" class="vide">Aucun job pour le moment.</td></tr>';
    return;
  }
  jobs.forEach(job => {
    const tr = document.createElement("tr");
    const pourcentage = job.pourcentage ? (Number(job.pourcentage) * 100).toFixed(0) + "%" : "0%";
    const l = Number(job.largeur) || 0;
    const h = Number(job.hauteur) || 0;
    const q = Number(job.quantite) || 0;
    const surfaceUnitaire = l * h;
    const surfaceTotale = surfaceUnitaire * q;
    tr.innerHTML = `
      <td>${job.dateReception || ""}</td>
      <td>${job.client || ""}</td>
      <td>${job.jobRef || ""}</td>
      <td>${job.largeur || 0}</td>
      <td>${job.hauteur || 0}</td>
      <td>${job.quantite || 0}</td>
      <td>${surfaceUnitaire.toFixed(2)}</td>
      <td><strong>${surfaceTotale.toFixed(2)}</strong></td>
      <td>${job.tissu || ""}</td>
      <td><span class="badge-etat">${job.etat || ""}</span></td>
      <td>${job.qteImprimee || 0}</td>
      <td>${pourcentage}</td>
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
  const selects = ["stock-tissu"];
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

// ============ SCAN ============
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

    let jobs = Array.isArray(res.data) ? res.data : [res.data];

    if (jobs.length === 0) {
      alert("Aucun job détecté dans le fichier.");
      return;
    }

    afficherLoading(false);
    afficherModaleOCR(jobs);

  } catch (err) {
    arreterProgression();
    alert("Erreur : " + err.message);
  } finally {
    afficherLoading(false);
    btnScanner.disabled = false;
  }
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

// ============ MODALE OCR MULTI-JOBS ============
function afficherModaleOCR(jobs) {
  JOBS_EN_COURS = jobs;

  const titre = document.getElementById("ocr-titre");
  const info = document.getElementById("ocr-info");
  titre.textContent = jobs.length === 1
    ? "📄 Valider le job"
    : "📄 Valider " + jobs.length + " jobs";
  info.textContent = jobs.length === 1
    ? "Vérifiez et corrigez les données extraites avant de valider."
    : "Vérifiez et corrigez les données. Décochez les lignes à ne pas créer.";

  const tbody = document.getElementById("tbody-ocr");
  tbody.innerHTML = "";

  const tissus = (DATA.parametres && DATA.parametres.tissus) ? DATA.parametres.tissus : [];

  jobs.forEach((job, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;

    const l = parseFloat(job.largeur) || 0;
    const h = parseFloat(job.hauteur) || 0;
    const q = parseInt(job.quantite) || 1;
    const surfaceManuelle = (l === 0 && h === 0);

    const surfaceUnitaire = l * h;
    const surfaceTotale = surfaceUnitaire * q;

    let optionsTissu = "";
    tissus.forEach(t => {
      const sel = (t.toLowerCase() === (job.tissu || "").toLowerCase()) ? "selected" : "";
      optionsTissu += `<option value="${escapeHtml(t)}" ${sel}>${escapeHtml(t)}</option>`;
    });

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="check-job" data-index="${idx}" checked></td>
      <td><input type="text" class="inp-client" data-index="${idx}" value="${escapeHtml(job.client || "")}"></td>
      <td><input type="text" class="inp-job" data-index="${idx}" value="${escapeHtml(job.jobRef || "")}"></td>
      <td><input type="text" class="inp-date" data-index="${idx}" value="${escapeHtml(job.dateReception || "")}" style="width:90px;"></td>
      <td><input type="number" step="0.01" class="inp-largeur" data-index="${idx}" value="${l}" style="width:70px;"></td>
      <td><input type="number" step="0.01" class="inp-hauteur" data-index="${idx}" value="${h}" style="width:70px;"></td>
      <td>
        <input type="number" step="0.001" class="inp-surface-unitaire ${surfaceManuelle ? 'surface-manuel' : 'surface-auto'}"
               data-index="${idx}" value="${surfaceUnitaire.toFixed(3)}" style="width:90px;"
               ${surfaceManuelle ? '' : 'readonly'}>
      </td>
      <td><input type="number" step="1" class="inp-quantite" data-index="${idx}" value="${q}" style="width:60px;"></td>
      <td>
        <input type="number" step="0.001" class="inp-surface-totale ${surfaceManuelle ? 'surface-manuel' : 'surface-auto'}"
               data-index="${idx}" value="${surfaceTotale.toFixed(3)}" style="width:100px;"
               ${surfaceManuelle ? '' : 'readonly'}>
      </td>
      <td>
        <select class="inp-tissu" data-index="${idx}" style="width:130px;">
          ${optionsTissu}
        </select>
      </td>
      <td><input type="text" class="inp-designation" data-index="${idx}" value="${escapeHtml(job.designation || "")}"></td>
    `;
    tbody.appendChild(tr);
  });

  attacherEvenementsTableauOCR();
  mettreAJourResume();

  document.getElementById("modale-ocr").style.display = "flex";
}
function attacherEvenementsTableauOCR() {
  // Checkbox individuel
  document.querySelectorAll(".check-job").forEach(cb => {
    cb.addEventListener("change", mettreAJourResume);
  });

  // Checkbox "tout"
  const checkAll = document.getElementById("check-all");
  checkAll.onclick = () => {
    document.querySelectorAll(".check-job").forEach(cb => {
      cb.checked = checkAll.checked;
    });
    mettreAJourResume();
  };

  // Fonction de recalcul (utilisée pour L, H ET Q)
  function recalculerLigne(tr) {
    const l = parseFloat(tr.querySelector(".inp-largeur").value) || 0;
    const h = parseFloat(tr.querySelector(".inp-hauteur").value) || 0;
    const q = parseInt(tr.querySelector(".inp-quantite").value) || 0;

    const surfUnit = l * h;
    const surfTotal = surfUnit * q;

    const inpUnit = tr.querySelector(".inp-surface-unitaire");
    const inpTotal = tr.querySelector(".inp-surface-totale");

    if (l > 0 && h > 0) {
      // Mode auto (readonly)
      inpUnit.value = surfUnit.toFixed(3);
      inpTotal.value = surfTotal.toFixed(3);
      inpUnit.readOnly = true;
      inpTotal.readOnly = true;
      inpUnit.classList.remove("surface-manuel");
      inpUnit.classList.add("surface-auto");
      inpTotal.classList.remove("surface-manuel");
      inpTotal.classList.add("surface-auto");
    } else {
      // Mode manuel : on recalcule la surface totale à partir de la surface unitaire (si elle existe)
      inpUnit.readOnly = false;
      inpTotal.readOnly = false;
      inpUnit.classList.remove("surface-auto");
      inpUnit.classList.add("surface-manuel");
      inpTotal.classList.remove("surface-auto");
      inpTotal.classList.add("surface-manuel");

      // Si la surface unitaire était déjà saisie, on recalcule la surface totale
      const surfUnitActuelle = parseFloat(inpUnit.value) || 0;
      if (surfUnitActuelle > 0 && q > 0) {
        inpTotal.value = (surfUnitActuelle * q).toFixed(3);
      }
    }

    mettreAJourResume();
  }

  // Attacher l'écouteur sur L, H et Qté
  document.querySelectorAll(".inp-largeur, .inp-hauteur, .inp-quantite").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      recalculerLigne(tr);
    });
    inp.addEventListener("change", (e) => {
      const tr = e.target.closest("tr");
      recalculerLigne(tr);
    });
  });

  // Input surface unitaire (modification manuelle)
  document.querySelectorAll(".inp-surface-unitaire").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      const inpTotal = tr.querySelector(".inp-surface-totale");
      const q = parseInt(tr.querySelector(".inp-quantite").value) || 0;

      const surfUnit = parseFloat(e.target.value) || 0;
      inpTotal.value = (surfUnit * q).toFixed(3);

      mettreAJourResume();
    });
  });

  // Input surface totale (modification manuelle)
  document.querySelectorAll(".inp-surface-totale").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      const inpUnit = tr.querySelector(".inp-surface-unitaire");
      const q = parseInt(tr.querySelector(".inp-quantite").value) || 0;

      const surfTotal = parseFloat(e.target.value) || 0;
      if (q > 0) {
        inpUnit.value = (surfTotal / q).toFixed(3);
      }

      mettreAJourResume();
    });
  });
}

function mettreAJourResume() {
  const jobsSelectionnes = [];
  let surfaceTotale = 0;

  document.querySelectorAll("#tbody-ocr tr").forEach(tr => {
    const cb = tr.querySelector(".check-job");
    if (cb && cb.checked) {
      const surface = parseFloat(tr.querySelector(".inp-surface-totale").value) || 0;
      surfaceTotale += surface;
      jobsSelectionnes.push(tr);
    }
  });

  document.getElementById("resume-total").textContent = jobsSelectionnes.length;
  document.getElementById("resume-surface").textContent = (Math.round(surfaceTotale * 100) / 100).toFixed(2);

  const btnValider = document.getElementById("btn-valider-ocr");
  btnValider.textContent = "✅ Tout valider (" + jobsSelectionnes.length + ")";
  btnValider.disabled = jobsSelectionnes.length === 0;
}

// ============ VALIDATION GLOBALE ============
async function validerTousLesJobs() {
  const jobsAValider = [];

  document.querySelectorAll("#tbody-ocr tr").forEach(tr => {
    const cb = tr.querySelector(".check-job");
    if (!cb || !cb.checked) return;

    const l = parseFloat(tr.querySelector(".inp-largeur").value) || 0;
    const h = parseFloat(tr.querySelector(".inp-hauteur").value) || 0;
    const q = parseInt(tr.querySelector(".inp-quantite").value) || 0;

    const surfaceUnitaire = parseFloat(tr.querySelector(".inp-surface-unitaire").value) || 0;
    const surfaceTotale = parseFloat(tr.querySelector(".inp-surface-totale").value) || 0;

    let finalL = l;
    let finalH = h;
    let finalQ = q || 1;

    // Si L/H = 0 mais surface totale > 0 → on met L=1, H=surface/Q
    if (l === 0 && h === 0 && surfaceTotale > 0) {
      finalL = 1;
      if (finalQ > 0) {
        finalH = surfaceTotale / finalQ;
      } else {
        finalH = surfaceTotale;
        finalQ = 1;
      }
    }

    const job = {
      dateReception: tr.querySelector(".inp-date").value,
      client: tr.querySelector(".inp-client").value,
      jobRef: tr.querySelector(".inp-job").value,
      largeur: finalL,
      hauteur: finalH,
      quantite: finalQ,
      tissu: tr.querySelector(".inp-tissu").value,
      commentaire: tr.querySelector(".inp-designation").value,
      designation: tr.querySelector(".inp-designation").value,
      utilisateur: "Admin"
    };

    jobsAValider.push(job);
  });

  if (jobsAValider.length === 0) {
    alert("Aucun job sélectionné.");
    return;
  }

  afficherLoading(true, "💾 Enregistrement des jobs...");

  try {
    const res = await apiPost("validateJobs", { jobs: jobsAValider });
    afficherLoading(false);

    if (res.success) {
      document.getElementById("modale-ocr").style.display = "none";
      chargerDashboard();
      setTimeout(() => {
        alert("✅ " + res.count + " job(s) enregistré(s) avec succès !");
      }, 300);
    } else {
      alert("Erreur : " + (res.error || "inconnue"));
    }
  } catch (err) {
    afficherLoading(false);
    alert("Erreur : " + err.message);
  }
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

function escapeHtml(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============ INIT ============
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

  document.getElementById("btn-fermer-modale").addEventListener("click", () => {
    document.getElementById("modale-ocr").style.display = "none";
  });
  document.getElementById("btn-annuler-ocr").addEventListener("click", () => {
    document.getElementById("modale-ocr").style.display = "none";
  });
  document.getElementById("btn-valider-ocr").addEventListener("click", validerTousLesJobs);

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
