/**
 * Age Calculation Utilities for All-Star Eligibility
 * 
 * Baseball: League age is determined by age on August 31 of the current year
 * Softball: League age is determined by age on December 31 of the previous year
 */

/**
 * Calculate age at a given cutoff date
 * @param {string|Date} birthDate - Player's birth date
 * @param {Date} cutoffDate - Date to calculate age at
 * @returns {number} Age at cutoff date
 */
function calculateAge(birthDate, cutoffDate) {
  if (!birthDate) return null;
  
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  
  let age = cutoffDate.getFullYear() - birth.getFullYear();
  const monthDiff = cutoffDate.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Calculate Baseball League Age
 * Age on August 31 of the current year
 * @param {string|Date} birthDate - Player's birth date
 * @returns {number} Baseball league age
 */
export function calculateBaseballLeagueAge(birthDate) {
  if (!birthDate) return null;
  
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), 7, 31); // August 31 (month is 0-indexed)
  
  return calculateAge(birthDate, cutoff);
}

/**
 * Calculate Softball League Age
 * Age on December 31 of the previous year
 * @param {string|Date} birthDate - Player's birth date
 * @returns {number} Softball league age
 */
export function calculateSoftballLeagueAge(birthDate) {
  if (!birthDate) return null;
  
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - 1, 11, 31); // December 31 of previous year
  
  return calculateAge(birthDate, cutoff);
}

/**
 * Get league age display string (e.g., "10U")
 * @param {string|Date} birthDate - Player's birth date
 * @param {string} sport - 'baseball' or 'softball'
 * @returns {string} League age display (e.g., "10U") or "N/A"
 */
export function getLeagueAgeDisplay(birthDate, sport) {
  if (!birthDate) return 'N/A';
  
  let age;
  if (sport === 'baseball') {
    age = calculateBaseballLeagueAge(birthDate);
  } else if (sport === 'softball') {
    age = calculateSoftballLeagueAge(birthDate);
  } else {
    return 'N/A';
  }
  
  if (age === null || age === undefined) return 'N/A';
  return `${age}U`;
}

/**
 * Get league age as integer
 * @param {string|Date} birthDate - Player's birth date
 * @param {string} sport - 'baseball' or 'softball'
 * @returns {number} League age integer
 */
export function getLeagueAgeValue(birthDate, sport) {
  if (!birthDate) return null;
  
  if (sport === 'baseball') {
    return calculateBaseballLeagueAge(birthDate);
  } else if (sport === 'softball') {
    return calculateSoftballLeagueAge(birthDate);
  }
  return null;
}

/**
 * Determine sport from division name
 * @param {string} divisionName - Division name (e.g., "Baseball - Majors")
 * @returns {string} 'baseball', 'softball', or 'unknown'
 */
export function determineSportFromDivision(divisionName) {
  if (!divisionName) return 'unknown';
  
  const name = divisionName.toLowerCase();
  if (name.includes('baseball')) return 'baseball';
  if (name.includes('softball')) return 'softball';
  return 'unknown';
}

/**
 * Get available age groups
 * @returns {string[]} List of age groups
 */
export function getAvailableAgeGroups() {
  return ['8U', '9U', '10U', '11U', '12U'];
}

/**
 * Validate if player is eligible for age group
 * @param {string|Date} birthDate - Player's birth date
 * @param {string} sport - 'baseball' or 'softball'
 * @param {string} ageGroup - '8U', '9U', etc.
 * @returns {boolean} True if eligible
 */
export function isEligibleForAgeGroup(birthDate, sport, ageGroup) {
  const leagueAge = getLeagueAgeValue(birthDate, sport);
  if (leagueAge === null) return false;
  
  const targetAge = parseInt(ageGroup.replace('U', ''));
  return leagueAge === targetAge;
}