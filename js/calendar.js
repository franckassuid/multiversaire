/**
 * calendar.js – Génération d'exports calendrier
 * Support : fichier .ics (standard RFC 5545), Google Calendar, Apple Calendar
 */

/**
 * Formate une date au format UTC pour ICS (YYYYMMDDTHHMMSSZ)
 * @param {Date} date
 * @returns {string}
 */
function toICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Formate une date au format local pour ICS (YYYYMMDDTHHMMSS sans Z)
 * @param {Date} date
 * @returns {string}
 */
function toICSLocalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/**
 * Génère un UID unique pour l'événement ICS
 * @returns {string}
 */
function generateUID() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@multiversaires.app`;
}

/**
 * Échappe les caractères spéciaux pour ICS
 * @param {string} str
 * @returns {string}
 */
function escapeICS(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Génère le contenu d'un fichier .ics complet
 * @param {Object} eventData
 * @param {string} eventData.title
 * @param {string} eventData.description
 * @param {Date} eventData.startDate
 * @param {Date} eventData.endDate (30 min après startDate)
 * @returns {string} Contenu .ics
 */
function generateICSContent(eventData) {
  const { title, description, startDate, endDate } = eventData;
  const uid = generateUID();
  const now = new Date();

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Multiversaires//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Multiversaires',
    'X-WR-TIMEZONE:Europe/Paris',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(now)}`,
    `DTSTART;TZID=Europe/Paris:${toICSLocalDate(startDate)}`,
    `DTEND;TZID=Europe/Paris:${toICSLocalDate(endDate)}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Rappel : ${escapeICS(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Télécharge un fichier .ics
 * @param {Object} eventData
 */
function downloadICS(eventData) {
  const content = generateICSContent(eventData);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `multiversaires-cap-${eventData.target}-${eventData.unit}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Ouvre Google Calendar avec les données de l'événement
 * @param {Object} eventData
 */
function openGoogleCalendar(eventData) {
  const { title, description, startDate, endDate } = eventData;
  
  const formatGCal = (date) => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description,
    dates: `${formatGCal(startDate)}/${formatGCal(endDate)}`,
    ctz: 'Europe/Paris'
  });

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
}

/**
 * Construit les données d'un événement pour un milestone
 * @param {number} target - Valeur cible
 * @param {string} unit - Unité
 * @param {string} unitLabel - Label en français (ex: "jours")
 * @param {Date} targetDate - Date exacte du franchissement
 * @param {Object} [profile] - Profil actif
 * @returns {Object} eventData
 */
function buildEventData(target, unit, unitLabel, targetDate, profile = null) {
  const formattedTarget = target >= 1_000_000_000
    ? (target / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' milliard(s)'
    : target >= 1_000_000
    ? (target / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' million(s)'
    : target.toLocaleString('fr-FR');

  const timeStr = targetDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const endDate = new Date(targetDate.getTime() + 30 * 60 * 1000);

  const isSelf = !profile || profile.isSelf === true;
  const name = profile && profile.name ? profile.name : 'Moi';

  const title = isSelf
    ? `🎉 Mon cap des ${formattedTarget} ${unitLabel} vécus !`
    : `🎉 Cap des ${formattedTarget} ${unitLabel} de ${name} !`;

  const description = isSelf
    ? `Aujourd'hui à ${timeStr}, tu franchis exactement le cap des ${formattedTarget} ${unitLabel} !`
    : `Aujourd'hui à ${timeStr}, ${name} franchit exactement le cap des ${formattedTarget} ${unitLabel} ! N'oublie pas de lui souhaiter !`;

  return {
    target,
    unit,
    title,
    description,
    startDate: targetDate,
    endDate
  };
}

/**
 * Affiche le modal de choix de calendrier
 * @param {Object} eventData
 */
function showCalendarModal(eventData) {
  // Créer ou réutiliser le modal
  let modal = document.getElementById('modal-calendar');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-calendar';
    modal.className = 'calendar-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="calendar-modal">
      <div class="calendar-modal-header">
        <h3>📅 Ajouter au calendrier</h3>
        <button class="calendar-modal-close" onclick="document.getElementById('modal-calendar').classList.remove('active')">✕</button>
      </div>
      <p class="calendar-modal-event-name">${eventData.title}</p>
      <div class="calendar-modal-actions">
        <button class="btn-calendar btn-gcal" id="btn-gcal">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google Calendar
        </button>
        <button class="btn-calendar btn-ics" id="btn-ics">
          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
          </svg>
          Télécharger .ics
        </button>
      </div>
      <p class="calendar-modal-note">Apple Calendar, Outlook et autres applications compatibles .ics</p>
    </div>
  `;

  modal.classList.add('active');

  modal.querySelector('#btn-gcal').addEventListener('click', () => {
    openGoogleCalendar(eventData);
    modal.classList.remove('active');
  });

  modal.querySelector('#btn-ics').addEventListener('click', () => {
    downloadICS(eventData);
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
  });
}

export { buildEventData, showCalendarModal, downloadICS, openGoogleCalendar };
