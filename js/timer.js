/**
 * timer.js – Moteur de calcul du temps écoulé depuis la naissance
 * Mise à jour en temps réel toutes les secondes
 */

/**
 * Calcule le nombre de mois entiers et fractionnels écoulés
 * @param {Date} birthDate
 * @param {Date} now
 * @returns {number} mois avec décimales
 */
function calcMonths(birthDate, now) {
  let years = now.getFullYear() - birthDate.getFullYear();
  let months = now.getMonth() - birthDate.getMonth();
  let days = now.getDate() - birthDate.getDate();
  let totalMonths = years * 12 + months;

  // Calcul de la fraction de mois
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayFraction = days / daysInCurrentMonth;
  
  // Ajouter la fraction heure/minute/seconde du jour
  const timeFraction = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / (24 * 3600);
  const totalDayFraction = (days + timeFraction) / daysInCurrentMonth;

  return totalMonths + totalDayFraction;
}

/**
 * Calcule toutes les unités de temps écoulées depuis la naissance
 * @param {Date} birthDate - Date et heure de naissance
 * @returns {Object} { months, weeks, days, hours, minutes, seconds, totalMs }
 */
function calcElapsed(birthDate) {
  const now = new Date();
  const totalMs = now - birthDate;

  if (totalMs < 0) {
    return { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }

  const totalSeconds = Math.floor(totalMs / 1000);
  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const totalHours   = Math.floor(totalMs / (1000 * 60 * 60));
  const totalDays    = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const totalWeeks   = Math.floor(totalDays / 7);
  const totalMonths  = calcMonths(birthDate, now);

  return {
    months:  totalMonths,
    weeks:   totalWeeks,
    days:    totalDays,
    hours:   totalHours,
    minutes: totalMinutes,
    seconds: totalSeconds,
    totalMs: totalMs,
    now:     now
  };
}

/**
 * Formate un nombre en notation localisée française
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
function formatNumber(n, decimals = 0) {
  let str;
  if (decimals > 0) {
    str = n.toLocaleString('fr-FR', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  } else {
    str = Math.floor(n).toLocaleString('fr-FR');
  }
  return str.replace(/\s/g, '\u00A0');
}

/**
 * Démarre le ticker – met à jour le DOM chaque seconde
 * @param {Date} birthDate
 * @param {Function} onTick - callback appelé à chaque seconde avec les données
 * @returns {number} ID de l'intervalle (pour arrêter avec clearInterval)
 */
function startTimer(birthDate, onTick) {
  function tick() {
    const elapsed = calcElapsed(birthDate);
    onTick(elapsed);
  }
  tick(); // Premier appel immédiat
  return setInterval(tick, 1000);
}

export { calcElapsed, calcMonths, formatNumber, startTimer };
