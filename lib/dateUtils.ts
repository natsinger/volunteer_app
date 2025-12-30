/**
 * Date formatting utilities for consistent date display across the app
 */

/**
 * Format a date string from YYYY-MM-DD to DD/MM/YYYY
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns Date in DD/MM/YYYY format
 */
export const formatDateDDMMYYYY = (dateStr: string): string => {
  if (!dateStr) return '';

  // Handle both YYYY-MM-DD and Date objects
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;

  // Get day, month, year
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

/**
 * Format a Date object or ISO string to DD/MM/YYYY HH:MM
 * @param date - Date object or ISO string
 * @returns Date in DD/MM/YYYY HH:MM format
 */
export const formatDateTimeDDMMYYYY = (date: Date | string): string => {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Format month and year for display (e.g., "January 2025")
 * @param month - Month number (1-12)
 * @param year - Full year (e.g., 2025)
 * @returns Formatted month and year
 */
export const formatMonthYear = (month: number, year: number): string => {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
