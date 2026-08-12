/**
 * app.js – Logique principale de Multiversaires v4.0
 * Nouveautés : Gestion complète des fiches profils (multi-personnes),
 * sélecteur dropdown dans le header, adaptation dynamique du calendrier (.ics / GCal).
 */

import { calcElapsed, formatNumber, startTimer } from './timer.js';
import { getMilestone, getUpcomingMilestones, formatMilestoneTarget } from './milestones.js';
import { buildEventData, showCalendarModal } from './calendar.js';

// ─── Configuration des unités ────────────────────────────────────────────────

const UNITS = [
  { id: 'months',  label: 'Mois',     labelPlural: 'mois',     decimals: 1 },
  { id: 'weeks',   label: 'Semaines', labelPlural: 'semaines', decimals: 0 },
  { id: 'days',    label: 'Jours',    labelPlural: 'jours',    decimals: 0 },
  { id: 'hours',   label: 'Heures',   labelPlural: 'heures',   decimals: 0 },
  { id: 'minutes', label: 'Minutes',  labelPlural: 'minutes',  decimals: 0 },
  { id: 'seconds', label: 'Secondes', labelPlural: 'secondes', decimals: 0 },
];

// ─── State ────────────────────────────────────────────────────────────────────

let profiles = [];
let activeProfileId = null;
let editingProfileId = null;
let birthDate = null;
let timerInterval = null;
let lastMilestoneValues = {};

// Index du cap actuellement affiché par carte (0 = le prochain immédiat)
const milestoneIndexes = {
  months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0,
};

// Cache des caps calculés pour chaque unité (mis à jour à chaque tick)
const upcomingMilestonesCache = {
  months: [], weeks: [], days: [], hours: [], minutes: [], seconds: [],
};

// Mode de tri ('default' ou 'closest')
let sortMode = 'default';
const closestMsRemaining = {};

// ─── Gestion localStorage & Profils ──────────────────────────────────────────

function saveProfiles() {
  localStorage.setItem('multiversaires_profiles', JSON.stringify(profiles));
  if (activeProfileId) {
    localStorage.setItem('multiversaires_active_profile_id', activeProfileId);
  }
}

function loadProfiles() {
  const savedProfiles = localStorage.getItem('multiversaires_profiles') || localStorage.getItem('polyversaires_profiles');
  if (savedProfiles) {
    try {
      profiles = JSON.parse(savedProfiles);
    } catch (e) {
      profiles = [];
    }
  }

  // Migration de l'ancienne clé vers le format profils
  if (!profiles || profiles.length === 0) {
    const legacyBirth = localStorage.getItem('multiversaires_birth') || localStorage.getItem('polyversaires_birth');
    if (legacyBirth) {
      const d = new Date(legacyBirth);
      if (!isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        const birthdate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const birthtime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        profiles = [
          {
            id: 'profil-1',
            isSelf: true,
            name: 'Moi',
            birthdate: birthdate,
            birthtime: birthtime
          }
        ];
        activeProfileId = 'profil-1';
        saveProfiles();
        return;
      }
    }
  }

  const savedActiveId = localStorage.getItem('multiversaires_active_profile_id') || localStorage.getItem('polyversaires_active_profile_id');
  if (savedActiveId && profiles.some(p => p.id === savedActiveId)) {
    activeProfileId = savedActiveId;
  } else if (profiles.length > 0) {
    activeProfileId = profiles[0].id;
  }

  // Pass de déduplication : s'assurer qu'il n'y a qu'UN SEUL profil "Moi" (isSelf: true)
  let foundSelf = false;
  profiles = profiles.filter(p => {
    if (p.isSelf || p.name === 'Moi') {
      if (!foundSelf) {
        p.isSelf = true;
        p.name = 'Moi';
        foundSelf = true;
        return true;
      }
      return false; // Supprimer les doublons "Moi"
    }
    return true;
  });
}

function getActiveProfile() {
  if (!profiles || profiles.length === 0) return null;
  return profiles.find(p => p.id === activeProfileId) || profiles[0];
}

function updateActiveProfileState() {
  const active = getActiveProfile();
  if (!active) {
    birthDate = null;
    return;
  }

  activeProfileId = active.id;
  const timeStr = active.birthtime || '00:00';
  const [y, m, d] = active.birthdate.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  birthDate = new Date(y, m - 1, d, h, min, 0, 0);

  // Mettre à jour le nom affiché dans le bouton du header
  const nameEl = document.getElementById('active-profile-name');
  if (nameEl) {
    nameEl.textContent = active.name || (active.isSelf ? 'Moi' : 'Profil');
  }

  // Mettre à jour le banner de naissance
  updateBirthBanner();
}

// ─── Calcul de l'âge en années entières ──────────────────────────────────────

function calcAgeYears(birth) {
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

function showOnboarding() {
  document.getElementById('view-onboarding').classList.add('active');
  document.getElementById('view-dashboard').classList.remove('active');
}

function showDashboard() {
  document.getElementById('view-onboarding').classList.remove('active');
  document.getElementById('view-dashboard').classList.add('active');
  updateActiveProfileState();
  renderProfileDropdown();
  startDashboard();
}

function updateBirthBanner() {
  const el = document.getElementById('birth-display');
  const active = getActiveProfile();
  if (!el || !birthDate || !active) return;

  const dateStr = birthDate.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = birthDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const age     = calcAgeYears(birthDate);

  if (active.isSelf) {
    el.textContent = `${dateStr} à ${timeStr} (${age} ans)`;
  } else {
    el.textContent = `${active.name} — né·e le ${dateStr} à ${timeStr} (${age} ans)`;
  }
}

// ─── Dropdown Profils dans le Header ──────────────────────────────────────────

function renderProfileDropdown() {
  const listEl = document.getElementById('profile-dropdown-list');
  if (!listEl) return;

  listEl.innerHTML = profiles.map(p => {
    const isActive = p.id === activeProfileId;
    return `
      <div class="profile-item-row ${isActive ? 'active' : ''}">
        <button class="profile-item-btn" data-profile-id="${p.id}">
          <span>👤 ${escapeHTML(p.name)}</span>
        </button>
        <button class="btn-profile-edit" data-edit-profile-id="${p.id}" title="Modifier cette fiche">
          ✏️
        </button>
      </div>
    `;
  }).join('');
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[match]);
}

// ─── Modale Profil (Ajout / Édition) ──────────────────────────────────────────

function toggleNameInputState() {
  const isSelfCb = document.getElementById('profile-isself');
  const groupName = document.getElementById('group-profile-name');
  const nameInput = document.getElementById('profile-name');

  if (!isSelfCb || !groupName || !nameInput) return;

  if (isSelfCb.checked) {
    groupName.style.display = 'none';
    nameInput.removeAttribute('required');
    nameInput.value = 'Moi';
  } else {
    groupName.style.display = 'block';
    nameInput.setAttribute('required', 'true');
    if (nameInput.value === 'Moi') {
      nameInput.value = '';
    }
  }
}

function openProfileModal(profileIdToEdit = null) {
  editingProfileId = profileIdToEdit;
  const modal = document.getElementById('modal-profile');
  const titleEl = document.getElementById('modal-profile-title');
  const nameInput = document.getElementById('profile-name');
  const isSelfCb = document.getElementById('profile-isself');
  const dateInput = document.getElementById('profile-date');
  const timeInput = document.getElementById('profile-time');
  const deleteBtn = document.getElementById('btn-delete-profile');

  if (!modal) return;

  if (profileIdToEdit) {
    const p = profiles.find(pr => pr.id === profileIdToEdit);
    if (p) {
      if (titleEl) titleEl.textContent = p.isSelf ? '✏️ Modifier mon profil ("Moi")' : `✏️ Modifier ${p.name}`;
      if (isSelfCb) isSelfCb.checked = !!p.isSelf;
      if (nameInput) nameInput.value = p.name;
      if (dateInput) dateInput.value = p.birthdate;
      if (timeInput) timeInput.value = p.birthtime || '00:00';
      if (deleteBtn) {
        deleteBtn.style.display = (!p.isSelf && profiles.length > 1) ? 'inline-block' : 'none';
      }
    }
  } else {
    // Mode création d'une tierce personne
    if (titleEl) titleEl.textContent = '➕ Ajouter une personne';
    if (isSelfCb) isSelfCb.checked = false;
    if (nameInput) nameInput.value = '';
    if (dateInput) dateInput.value = '';
    if (timeInput) timeInput.value = '00:00';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  toggleNameInputState();
  modal.classList.add('active');
}

function closeProfileModal() {
  const modal = document.getElementById('modal-profile');
  if (modal) modal.classList.remove('active');
  editingProfileId = null;
}

// ─── Tri des cartes ──────────────────────────────────────────────────────────

function sortAndOrderCards() {
  if (!birthDate) return;
  const elapsed = calcElapsed(birthDate);

  UNITS.forEach(unit => {
    const val = elapsed[unit.id];
    const upcoming = getUpcomingMilestones(birthDate, val, unit.id, 1);
    if (upcoming && upcoming.length > 0) {
      closestMsRemaining[unit.id] = upcoming[0].msRemaining;
    }
  });

  applyCardSorting();
}

function applyCardSorting() {
  if (sortMode === 'closest') {
    const sortedUnits = [...UNITS].sort((a, b) => {
      const msA = closestMsRemaining[a.id] ?? Infinity;
      const msB = closestMsRemaining[b.id] ?? Infinity;
      return msA - msB;
    });

    sortedUnits.forEach((unit, rank) => {
      const card = document.getElementById(`card-${unit.id}`);
      if (card) card.style.order = rank;
    });
  } else {
    UNITS.forEach((unit, index) => {
      const card = document.getElementById(`card-${unit.id}`);
      if (card) card.style.order = index;
    });
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function startDashboard() {
  if (timerInterval) clearInterval(timerInterval);
  if (!birthDate) return;

  // Effectuer le tri 1 SEULE FOIS lors du lancement / changement de profil
  sortAndOrderCards();

  timerInterval = startTimer(birthDate, (elapsed) => {
    UNITS.forEach(unit => updateCard(unit, elapsed[unit.id]));
  });
}

function updateCard(unit, currentValue) {
  const card = document.getElementById(`card-${unit.id}`);
  if (!card) return;

  // ── Compteur actuel
  const formattedVal = formatNumber(currentValue, unit.decimals);
  const counterEl = card.querySelector('.card-counter');
  if (counterEl) counterEl.textContent = formattedVal;

  // ── Résumé compact mobile
  const mobCounter = card.querySelector('.mobile-counter-val');
  if (mobCounter) mobCounter.textContent = `${formattedVal} ${unit.labelPlural}`;

  // ── Recalcul des 6 prochains caps
  const upcoming = getUpcomingMilestones(birthDate, currentValue, unit.id, 6);
  upcomingMilestonesCache[unit.id] = upcoming;

  if (upcoming.length > 0) {
    closestMsRemaining[unit.id] = upcoming[0].msRemaining;

    const mobCap = card.querySelector('.mobile-cap-target');
    if (mobCap) {
      mobCap.textContent = `🎯 ${formatMilestoneTarget(upcoming[0].next)} ${unit.labelPlural}`;
    }

    const mobDate = card.querySelector('.mobile-cap-date');
    if (mobDate) {
      mobDate.textContent = `le ${upcoming[0].targetDateFormatted}`;
    }

    const mobCalBtn = card.querySelector('.btn-mob-cal');
    if (mobCalBtn) {
      mobCalBtn.dataset.target     = upcoming[0].next;
      mobCalBtn.dataset.unit       = unit.id;
      mobCalBtn.dataset.unitLabel  = unit.labelPlural;
      mobCalBtn.dataset.targetDate = upcoming[0].targetDate.toISOString();
    }
  }

  // S'assurer que l'index ne dépasse pas la liste disponible
  if (milestoneIndexes[unit.id] >= upcoming.length) {
    milestoneIndexes[unit.id] = Math.max(0, upcoming.length - 1);
  }

  // ── Détecter franchissement du premier cap
  const prev = lastMilestoneValues[unit.id] || 0;
  if (upcoming.length > 0 && prev > 0 &&
      Math.floor(prev) < upcoming[0].next &&
      Math.floor(currentValue) >= upcoming[0].next) {
    triggerMilestoneReached(unit, upcoming[0].next);
    milestoneIndexes[unit.id] = 0;
  }
  lastMilestoneValues[unit.id] = currentValue;

  // ── Afficher le milestone sélectionné
  const idx = milestoneIndexes[unit.id];
  const milestone = upcoming[idx];
  if (!milestone) return;

  renderMilestoneInCard(card, unit, milestone, idx, upcoming.length);
}

function renderMilestoneInCard(card, unit, milestone, idx, total) {
  // Grand chiffre coloré
  const capNumEl = card.querySelector('.cap-number');
  if (capNumEl) capNumEl.textContent = formatMilestoneTarget(milestone.next);

  // Date exacte (en premier)
  const capDateEl = card.querySelector('.cap-date');
  if (capDateEl) capDateEl.textContent = milestone.targetDateFormatted;

  // Compte à rebours (en second)
  const capCdEl = card.querySelector('.cap-countdown');
  if (capCdEl) capCdEl.textContent = milestone.countdown;

  // Barre de progression (toujours pour le cap immédiat, idx=0)
  if (idx === 0) {
    const fillEl = card.querySelector('.card-progress-fill');
    if (fillEl) fillEl.style.width = `${milestone.progress.toFixed(2)}%`;

    const pctEl = card.querySelector('.progress-pct');
    if (pctEl) pctEl.textContent = `${Math.floor(milestone.progress)}%`;
  }

  // Navigation — numéro du cap
  const capIndexEl = card.querySelector('.cap-nav-index');
  if (capIndexEl) capIndexEl.textContent = `${idx + 1} / ${total}`;

  // Boutons prev/next
  const btnPrev = card.querySelector('.btn-cap-prev');
  const btnNext = card.querySelector('.btn-cap-next');
  if (btnPrev) btnPrev.disabled = idx === 0;
  if (btnNext) btnNext.disabled = idx >= total - 1;

  // Données du bouton calendrier
  const calBtn = card.querySelector('.btn-cal');
  if (calBtn) {
    calBtn.dataset.target     = milestone.next;
    calBtn.dataset.unit       = unit.id;
    calBtn.dataset.unitLabel  = unit.labelPlural;
    calBtn.dataset.targetDate = milestone.targetDate.toISOString();
  }
}

// ─── Célébration de cap ───────────────────────────────────────────────────────

function triggerMilestoneReached(unit, target) {
  const active = getActiveProfile();
  const nameStr = active && !active.isSelf ? ` pour ${active.name}` : '';

  if (typeof confetti !== 'undefined') {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#C2410C', '#15803D', '#1D4ED8', '#7E22CE', '#B45309', '#BE123C'],
    });
  }
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
  } catch (_) {}
  showToast(`🎉 Cap franchi${nameStr} ! ${formatMilestoneTarget(target)} ${unit.labelPlural} !`);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, duration = 4000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), duration);
}

// ─── Événements ───────────────────────────────────────────────────────────────

function bindEvents() {
  // Onboarding
  document.getElementById('form-onboarding')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dateVal = document.getElementById('input-date').value;
    const timeVal = document.getElementById('input-time').value || '00:00';
    if (!dateVal) return;

    const newProfile = {
      id: 'profil-' + Date.now(),
      isSelf: true,
      name: 'Moi',
      birthdate: dateVal,
      birthtime: timeVal
    };

    profiles = [newProfile];
    activeProfileId = newProfile.id;
    saveProfiles();
    showDashboard();
  });

  // Toggle Header Profile Selector Dropdown
  document.getElementById('btn-profile-selector')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    const btn = document.getElementById('btn-profile-selector');
    dropdown?.classList.toggle('active');
    btn?.classList.toggle('active');
  });

  // Clic extérieur pour fermer le dropdown
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    const btn = document.getElementById('btn-profile-selector');
    if (dropdown && !e.target.closest('.profile-selector-wrap')) {
      dropdown.classList.remove('active');
      btn?.classList.remove('active');
    }
  });

  // Clic dans le dropdown profil (Changer ou Éditer)
  document.addEventListener('click', (e) => {
    const switchBtn = e.target.closest('.profile-item-btn');
    if (switchBtn) {
      const pid = switchBtn.dataset.profileId;
      if (pid && pid !== activeProfileId) {
        activeProfileId = pid;
        saveProfiles();
        updateActiveProfileState();
        renderProfileDropdown();
        UNITS.forEach(u => { milestoneIndexes[u.id] = 0; });
        startDashboard();
        const active = getActiveProfile();
        showToast(`👤 Profil actif : ${active ? active.name : ''}`);
      }
      document.getElementById('profile-dropdown')?.classList.remove('active');
      document.getElementById('btn-profile-selector')?.classList.remove('active');
      return;
    }

    const editBtn = e.target.closest('.btn-profile-edit');
    if (editBtn) {
      const pid = editBtn.dataset.editProfileId;
      if (pid) {
        openProfileModal(pid);
      }
      document.getElementById('profile-dropdown')?.classList.remove('active');
      document.getElementById('btn-profile-selector')?.classList.remove('active');
      return;
    }
  });

  // Bouton "Ajouter une personne" dans le dropdown
  document.getElementById('btn-add-person')?.addEventListener('click', () => {
    openProfileModal(null);
    document.getElementById('profile-dropdown')?.classList.remove('active');
    document.getElementById('btn-profile-selector')?.classList.remove('active');
  });

  // Logo clic -> Retour à la page d'accueil / onboarding
  document.getElementById('hdr-logo')?.addEventListener('click', () => {
    if (timerInterval) clearInterval(timerInterval);
    showOnboarding();
  });

  // Checkbox "C'est mon profil (Moi)" -> masque/affiche le champ prénom
  document.getElementById('profile-isself')?.addEventListener('change', toggleNameInputState);

  // Modale Profil — Soumission (Création / Édition)
  document.getElementById('form-profile')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const isSelfVal = document.getElementById('profile-isself').checked;
    const nameInput = document.getElementById('profile-name');
    const dateVal = document.getElementById('profile-date').value;
    const timeVal = document.getElementById('profile-time').value || '00:00';

    const nameVal = isSelfVal ? 'Moi' : nameInput.value.trim();

    if (!isSelfVal && !nameVal) {
      showToast('⚠️ Veuillez renseigner le nom/prénom.');
      return;
    }
    if (!dateVal) {
      showToast('⚠️ Veuillez indiquer la date de naissance.');
      return;
    }

    if (isSelfVal) {
      // Chercher s'il existe déjà un profil principal "Moi"
      const existingSelf = profiles.find(p => p.isSelf || p.name === 'Moi');

      if (existingSelf) {
        // Mettre à jour le profil "Moi" unique au lieu de créer un doublon
        existingSelf.isSelf = true;
        existingSelf.name = 'Moi';
        existingSelf.birthdate = dateVal;
        existingSelf.birthtime = timeVal;
        activeProfileId = existingSelf.id;
      } else if (editingProfileId) {
        const p = profiles.find(pr => pr.id === editingProfileId);
        if (p) {
          p.isSelf = true;
          p.name = 'Moi';
          p.birthdate = dateVal;
          p.birthtime = timeVal;
          activeProfileId = p.id;
        }
      } else {
        const newProfile = {
          id: 'profil-1',
          isSelf: true,
          name: 'Moi',
          birthdate: dateVal,
          birthtime: timeVal
        };
        profiles.unshift(newProfile);
        activeProfileId = newProfile.id;
      }

      // S'assurer qu'aucun autre profil n'est marqué isSelf
      profiles.forEach(p => {
        if (p.id !== activeProfileId) p.isSelf = false;
      });
    } else {
      if (editingProfileId) {
        const p = profiles.find(pr => pr.id === editingProfileId);
        if (p) {
          p.name = nameVal;
          p.isSelf = false;
          p.birthdate = dateVal;
          p.birthtime = timeVal;
        }
      } else {
        const newProfile = {
          id: 'profil-' + Date.now(),
          isSelf: false,
          name: nameVal,
          birthdate: dateVal,
          birthtime: timeVal
        };
        profiles.push(newProfile);
        activeProfileId = newProfile.id;
      }
    }

    saveProfiles();
    closeProfileModal();
    updateActiveProfileState();
    renderProfileDropdown();
    UNITS.forEach(u => { milestoneIndexes[u.id] = 0; });

    if (document.getElementById('view-dashboard').classList.contains('active')) {
      startDashboard();
    } else {
      showDashboard();
    }

    showToast(`✅ Profil "${nameVal}" enregistré !`);
  });

  // Modale Profil — Suppression
  document.getElementById('btn-delete-profile')?.addEventListener('click', () => {
    if (!editingProfileId || profiles.length <= 1) return;

    const p = profiles.find(pr => pr.id === editingProfileId);
    const deletedName = p ? p.name : 'Profil';

    profiles = profiles.filter(pr => pr.id !== editingProfileId);

    if (activeProfileId === editingProfileId) {
      const selfP = profiles.find(pr => pr.isSelf);
      activeProfileId = selfP ? selfP.id : profiles[0].id;
    }

    saveProfiles();
    closeProfileModal();
    updateActiveProfileState();
    renderProfileDropdown();
    UNITS.forEach(u => { milestoneIndexes[u.id] = 0; });
    startDashboard();

    showToast(`🗑 Fiche "${deletedName}" supprimée.`);
  });

  // Modale Profil — Fermeture
  document.getElementById('btn-close-profile')?.addEventListener('click', closeProfileModal);
  document.getElementById('modal-profile')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-profile')) closeProfileModal();
  });

  // Modal Paramètres généraux
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
  document.getElementById('modal-settings')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-settings')) closeSettings();
  });

  document.getElementById('form-settings')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dateVal = document.getElementById('settings-date').value;
    const timeVal = document.getElementById('settings-time').value || '00:00';
    if (!dateVal) return;

    const active = getActiveProfile();
    if (active) {
      active.birthdate = dateVal;
      active.birthtime = timeVal;
      saveProfiles();
      updateActiveProfileState();
      renderProfileDropdown();
      UNITS.forEach(u => { milestoneIndexes[u.id] = 0; });
      if (timerInterval) clearInterval(timerInterval);
      startDashboard();
      showToast('✅ Profil mis à jour !');
    }
    closeSettings();
  });

  // Navigation entre les caps & calendrier rapide mobile
  document.addEventListener('click', (e) => {
    // Bouton calendrier rapide mobile (dans l'en-tête de la tuile)
    const mobCalBtn = e.target.closest('.btn-mob-cal');
    if (mobCalBtn) {
      e.stopPropagation();
      const { target, unit, unitLabel, targetDate } = mobCalBtn.dataset;
      if (!target || !unit || !targetDate) return;
      const activeP = getActiveProfile();
      const eventData = buildEventData(Number(target), unit, unitLabel, new Date(targetDate), activeP);
      showCalendarModal(eventData);
      return;
    }

    // Accordéon mobile header toggle
    const headerToggle = e.target.closest('.card-header-toggle');
    if (headerToggle) {
      const card = headerToggle.closest('.card');
      if (card) {
        card.classList.toggle('expanded');
        const isExpanded = card.classList.contains('expanded');
        headerToggle.setAttribute('aria-expanded', isExpanded);
      }
      return;
    }

    const btnPrev = e.target.closest('.btn-cap-prev');
    if (btnPrev) {
      const unitId = btnPrev.dataset.unit;
      if (milestoneIndexes[unitId] > 0) {
        milestoneIndexes[unitId]--;
        const unit    = UNITS.find(u => u.id === unitId);
        const card    = document.getElementById(`card-${unitId}`);
        const upcoming = upcomingMilestonesCache[unitId];
        const idx      = milestoneIndexes[unitId];
        if (unit && card && upcoming[idx]) {
          renderMilestoneInCard(card, unit, upcoming[idx], idx, upcoming.length);
        }
      }
      return;
    }

    const btnNext = e.target.closest('.btn-cap-next');
    if (btnNext) {
      const unitId  = btnNext.dataset.unit;
      const upcoming = upcomingMilestonesCache[unitId];
      if (milestoneIndexes[unitId] < upcoming.length - 1) {
        milestoneIndexes[unitId]++;
        const unit = UNITS.find(u => u.id === unitId);
        const card = document.getElementById(`card-${unitId}`);
        const idx  = milestoneIndexes[unitId];
        if (unit && card && upcoming[idx]) {
          renderMilestoneInCard(card, unit, upcoming[idx], idx, upcoming.length);
        }
      }
      return;
    }

    // Bouton calendrier
    const calBtn = e.target.closest('.btn-cal');
    if (calBtn) {
      const { target, unit, unitLabel, targetDate } = calBtn.dataset;
      if (!target || !unit || !targetDate) return;
      const activeP = getActiveProfile();
      const eventData = buildEventData(Number(target), unit, unitLabel, new Date(targetDate), activeP);
      showCalendarModal(eventData);
    }
  });

  // Changement de mode de tri
  document.getElementById('select-sort')?.addEventListener('change', (e) => {
    sortMode = e.target.value;
    localStorage.setItem('multiversaires_sort_mode', sortMode);
    sortAndOrderCards();
    if (sortMode === 'closest') {
      showToast('🎯 Tri par cap le plus proche activé');
    } else {
      showToast('📋 Tri par ordre des unités activé');
    }
  });

  // Toggle Déplier / Replier tout (mobile)
  document.getElementById('btn-toggle-expand')?.addEventListener('click', () => {
    const cards = document.querySelectorAll('.card');
    const btnText = document.querySelector('#btn-toggle-expand .expand-text');
    const btnIcon = document.querySelector('#btn-toggle-expand .expand-icon');
    const anyCollapsed = Array.from(cards).some(c => !c.classList.contains('expanded'));

    cards.forEach(card => {
      if (anyCollapsed) card.classList.add('expanded');
      else card.classList.remove('expanded');
    });

    if (btnText && btnIcon) {
      if (anyCollapsed) {
        btnText.textContent = 'Tout replier';
        btnIcon.textContent = '📁';
      } else {
        btnText.textContent = 'Tout déplier';
        btnIcon.textContent = '📂';
      }
    }
  });
}

function openSettings() {
  const modal = document.getElementById('modal-settings');
  if (!modal) return;
  const active = getActiveProfile();
  if (active && active.birthdate) {
    document.getElementById('settings-date').value = active.birthdate;
    document.getElementById('settings-time').value = active.birthtime || '00:00';
  }
  modal.classList.add('active');
}

function closeSettings() {
  document.getElementById('modal-settings')?.classList.remove('active');
}

// ─── Génération des cartes ────────────────────────────────────────────────────

function buildDashboardCards() {
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  grid.innerHTML = UNITS.map(unit => `
    <article class="card card-${unit.id}" id="card-${unit.id}" aria-label="Compteur ${unit.label}">

      <!-- En-tête mobile compact / Accordéon toggle -->
      <div class="card-header-toggle" role="button" aria-expanded="false">
        <div class="mob-header-left">
          <span class="card-unit-label">
            <span class="dot"></span>
            ${unit.label}
          </span>
          <span class="mobile-counter-val">0 ${unit.labelPlural}</span>
        </div>
        <div class="mob-header-right">
          <div class="mobile-cap-info">
            <span class="mobile-cap-target">🎯 –</span>
            <span class="mobile-cap-date">le –</span>
          </div>
          <button
            class="btn-mob-cal"
            aria-label="Ajouter ce cap au calendrier"
            title="Ajouter au calendrier"
            data-target=""
            data-unit="${unit.id}"
            data-unit-label="${unit.labelPlural}"
            data-target-date=""
          >📅</button>
          <span class="accordion-chevron">▾</span>
        </div>
      </div>

      <!-- Corps de carte -->
      <div class="card-body">
        <!-- Section haute : compteur actuel -->
        <div class="card-top">
          <div class="card-unit-label">
            <span class="dot"></span>
            ${unit.label}
          </div>
          <div class="card-counter" aria-live="polite" aria-atomic="true">0</div>
          <div class="card-counter-sub">${unit.labelPlural} vécus</div>
        </div>

        <!-- Barre de progression séparatrice -->
        <div class="card-progress">
          <div class="card-progress-fill"></div>
        </div>

        <!-- Section basse : prochain cap -->
        <div class="card-cap">

          <!-- En-tête de la section cap avec navigation -->
          <div class="cap-nav-bar">
            <span class="cap-label">Prochain cap</span>
            <div class="cap-nav-controls">
              <button
                class="btn-cap-prev"
                data-unit="${unit.id}"
                aria-label="Cap précédent"
                disabled
              >←</button>
              <span class="cap-nav-index">1 / 6</span>
              <button
                class="btn-cap-next"
                data-unit="${unit.id}"
                aria-label="Cap suivant"
              >→</button>
            </div>
          </div>

          <div class="cap-number">–</div>
          <div class="cap-date">–</div>
          <div class="cap-countdown">–</div>
        </div>

        <!-- Pied : % + bouton calendrier -->
        <div class="card-foot">
          <span class="progress-pct">0%</span>
          <button
            class="btn-cal"
            aria-label="Ajouter ce cap au calendrier"
            data-target=""
            data-unit="${unit.id}"
            data-unit-label="${unit.labelPlural}"
            data-target-date=""
          >
            📅 Ajouter au calendrier
          </button>
        </div>
      </div>

    </article>
  `).join('');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('[SW] Enregistré'))
      .catch(err => console.warn('[SW] Échec:', err));
  }

  loadProfiles();
  sortMode = localStorage.getItem('multiversaires_sort_mode') || 'default';
  const sortSelect = document.getElementById('select-sort');
  if (sortSelect) sortSelect.value = sortMode;

  buildDashboardCards();
  bindEvents();

  const active = getActiveProfile();
  if (active) {
    showDashboard();
  } else {
    showOnboarding();
  }

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('input-date')?.setAttribute('max', today);
  document.getElementById('settings-date')?.setAttribute('max', today);
  document.getElementById('profile-date')?.setAttribute('max', today);
}

document.addEventListener('DOMContentLoaded', init);
