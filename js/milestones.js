/**
 * milestones.js – Algorithme de calcul des prochains caps symboliques
 */

/**
 * Configuration des paliers par unité
 */
const MILESTONE_STEPS = {
  months:  [50, 100],
  weeks:   [250, 500],
  days:    [1000, 5000],
  hours:   [25000, 50000],
  minutes: [1000000, 5000000],
  seconds: [100000000, 500000000]
};

/**
 * Trouve le prochain palier pour une valeur et une unité données
 * @param {number} current - Valeur actuelle
 * @param {string} unit - Unité (months, weeks, days, hours, minutes, seconds)
 * @returns {Object} { prev, next } - palier précédent et suivant
 */
function findMilestonePair(current, unit) {
  const steps = MILESTONE_STEPS[unit];
  if (!steps) return null;

  // Essayer chaque step pour trouver le prochain multiple
  let bestNext = null;
  let bestPrev = null;
  let bestStep = null;

  for (const step of steps) {
    const nextMultiple = Math.ceil((current + 0.0001) / step) * step;
    const prevMultiple = Math.floor(current / step) * step;
    
    if (bestNext === null || nextMultiple < bestNext) {
      bestNext = nextMultiple;
      bestPrev = prevMultiple === nextMultiple ? nextMultiple - step : prevMultiple;
      bestStep = step;
    }
  }

  return { prev: Math.max(0, bestPrev), next: bestNext, step: bestStep };
}

/**
 * Calcule la date exacte à laquelle un cap sera franchi
 * @param {Date} birthDate
 * @param {number} target - Valeur cible du cap
 * @param {string} unit - Unité de temps
 * @returns {Date}
 */
function calcTargetDate(birthDate, target, unit) {
  let ms;
  switch (unit) {
    case 'seconds': ms = target * 1000; break;
    case 'minutes': ms = target * 60 * 1000; break;
    case 'hours':   ms = target * 3600 * 1000; break;
    case 'days':    ms = target * 24 * 3600 * 1000; break;
    case 'weeks':   ms = target * 7 * 24 * 3600 * 1000; break;
    case 'months': {
      // Pour les mois, calcul précis par ajout calendaire
      const fullMonths = Math.floor(target);
      const fracMonths = target - fullMonths;
      const targetDate = new Date(birthDate);
      targetDate.setMonth(targetDate.getMonth() + fullMonths);
      
      if (fracMonths > 0) {
        const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
        const extraDays = fracMonths * daysInMonth;
        targetDate.setTime(targetDate.getTime() + extraDays * 24 * 3600 * 1000);
      }
      return targetDate;
    }
    default: ms = 0;
  }
  return new Date(birthDate.getTime() + ms);
}

/**
 * Formate un compte à rebours en millisecondes vers une chaîne lisible
 * @param {number} ms - Millisecondes restantes
 * @returns {string} "X an(s), X jour(s), Xh Xm Xs"
 */
function formatCountdown(ms) {
  if (ms <= 0) return 'Maintenant ! 🎉';
  
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  const years = Math.floor(totalDays / 365.25);
  const days = Math.floor(totalDays - years * 365.25);

  const parts = [];
  if (years > 0) parts.push(`${years}\u00A0an${years > 1 ? 's' : ''}`);
  if (days > 0) parts.push(`${days}\u00A0j`);
  if (hours > 0 || days > 0 || years > 0) parts.push(`${hours}h`);
  parts.push(`${String(minutes).padStart(2, '0')}m`);
  parts.push(`${String(seconds).padStart(2, '0')}s`);

  return 'Dans\u00A0' + parts.join('\u00A0');
}

/**
 * Formate une date en français
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Formate une date + heure en français
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${dateStr} à ${timeStr}`;
}

/**
 * Calcule le pourcentage de progression entre deux caps
 * @param {number} prev - Cap précédent
 * @param {number} current - Valeur actuelle
 * @param {number} next - Prochain cap
 * @returns {number} 0-100
 */
function progressPercent(prev, current, next) {
  if (next === prev) return 100;
  const p = ((current - prev) / (next - prev)) * 100;
  return Math.min(100, Math.max(0, p));
}

/**
 * Calcule les données complètes du prochain milestone pour une unité
 * @param {Date} birthDate
 * @param {number} currentValue - Valeur actuelle de l'unité
 * @param {string} unit
 * @returns {Object} milestone data
 */
function getMilestone(birthDate, currentValue, unit) {
  const pair = findMilestonePair(currentValue, unit);
  if (!pair) return null;

  const targetDate = calcTargetDate(birthDate, pair.next, unit);
  const now = new Date();
  const msRemaining = targetDate - now;
  const progress = progressPercent(pair.prev, currentValue, pair.next);

  return {
    prev: pair.prev,
    next: pair.next,
    targetDate: targetDate,
    targetDateFormatted: formatDateTime(targetDate),
    countdown: formatCountdown(msRemaining),
    msRemaining: msRemaining,
    progress: progress,
    unit: unit,
    isPast: msRemaining <= 0
  };
}

/**
 * Formate un grand nombre (millisecondes, secondes...) de façon lisible
 * @param {number} n
 * @returns {string}
 */
function formatMilestoneTarget(n) {
  let str;
  if (n >= 1_000_000_000) str = (n / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + '\u00A0Md';
  else if (n >= 1_000_000) str = (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + '\u00A0M';
  else str = n.toLocaleString('fr-FR');
  return str.replace(/\s/g, '\u00A0');
}

/**
 * Retourne les N prochains caps pour une unité, en partant du suivant immédiat.
 * Limite raisonnable : 6 caps (le prochain + 5 suivants).
 * @param {Date} birthDate
 * @param {number} currentValue
 * @param {string} unit
 * @param {number} count - nombre de caps à retourner (défaut 6)
 * @returns {Array} tableau de milestone objects
 */
function getUpcomingMilestones(birthDate, currentValue, unit, count = 6) {
  const results = [];
  let searchFrom = currentValue;

  for (let i = 0; i < count; i++) {
    const ms = getMilestone(birthDate, searchFrom, unit);
    if (!ms || ms.next === searchFrom) break;
    results.push(ms);
    // Le prochain tour cherche à partir du cap qui vient d'être trouvé
    searchFrom = ms.next;
  }

  return results;
}

export {
  getMilestone,
  getUpcomingMilestones,
  calcTargetDate,
  formatCountdown,
  formatDateTime,
  formatMilestoneTarget,
  MILESTONE_STEPS,
};
