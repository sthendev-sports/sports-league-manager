// backend/routes/volunteerImport.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

// We only allow authenticated Admin/President to import volunteers
router.use(authMiddleware);
router.use(requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, just in case
});

// --- Simple CSV helpers (similar idea to frontend) ---

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : null;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function cleanHeaderName(header) {
  const map = {
    'name': 'name',
    'volunteer name': 'name',
    'guardian name': 'name',
    'email': 'email',
    'volunteer email': 'email',
    'guardian email': 'email',
    'phone': 'phone',
    'volunteer phone': 'phone',
    'guardian phone': 'phone',
    'roles': 'interested_roles',
    'volunteer roles': 'interested_roles',
    'interested roles': 'interested_roles',
  };

  const normalized = header.trim().toLowerCase();
  return map[normalized] || normalized.replace(/\s+/g, '_');
}

function parseCSV(content) {
  if (!content) return [];

  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headerCells = parseCSVLine(headerLine);
  const headers = headerCells.map(cleanHeaderName);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

// --- Route: POST /api/volunteer-import (multipart CSV) ---

/**
 * Expects multipart/form-data with:
 *  - file: CSV file
 *  - season_id: the season ID these interests apply to
 *
 * CSV expected columns (case-insensitive; order doesn't matter):
 *  - Volunteer Name / Name
 *  - Volunteer Email / Email
 *  - Volunteer Phone / Phone  (optional)
 *  - Volunteer Roles / Roles / Interested Roles (e.g. "Manager, Team Parent")
 *
 * Behavior:
 *  - Find volunteers in this season by email or phone.
 *  - If found, update interested_roles (do NOT overwrite assigned role).
 *  - If not found, create a new volunteer row with interested_roles filled,
 *    basic contact info, season_id set, and role left NULL/unchanged.
 */
router.post(
  '/',
  upload.single('file'),
  async (req, res) => {
    try {
      const seasonId = req.body.season_id;
      if (!seasonId) {
        return res.status(400).json({
          error: 'season_id is required in the form data.',
        });
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          error: 'CSV file is required.',
        });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const rows = parseCSV(csvContent);

      if (!rows.length) {
        return res.status(400).json({
          error: 'CSV file appears to be empty or has no data rows.',
        });
      }

      let updatedCount = 0;
      let insertedCount = 0;
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row.name || '').trim();
        const email = (row.email || '').trim();
        const phone = (row.phone || '').trim();
        const interestedRoles = (row.interested_roles || '').trim();

        if (!email && !phone) {
          errors.push(
            `Row ${i + 2}: Missing email and phone; cannot match or create volunteer.`
          );
          continue;
        }

        // Find existing volunteer by season + email/phone
        const filters = supabase
          .from('volunteers')
          .select('*')
          .eq('season_id', seasonId)
          .limit(1);

        let matchQuery = filters;

        if (email && phone) {
          matchQuery = matchQuery.or(
            `email.eq.${email},phone.eq.${phone}`
          );
        } else if (email) {
          matchQuery = matchQuery.eq('email', email);
        } else if (phone) {
          matchQuery = matchQuery.eq('phone', phone);
        }

        const { data: existing, error: findError } = await matchQuery;

        if (findError) {
          console.error(
            `Error finding volunteer for row ${i + 2}:`,
            findError
          );
          errors.push(
            `Row ${i + 2}: Error checking for existing volunteer.`
          );
          continue;
        }

        if (existing && existing.length > 0) {
          const volunteer = existing[0];

          const updatePayload = {
            interested_roles: interestedRoles || volunteer.interested_roles || null,
          };

          // If the existing record has no name/email/phone, fill them from CSV
          if (!volunteer.name && name) updatePayload.name = name;
          if (!volunteer.email && email) updatePayload.email = email;
          if (!volunteer.phone && phone) updatePayload.phone = phone;

          const { error: updateError } = await supabase
            .from('volunteers')
            .update(updatePayload)
            .eq('id', volunteer.id);

          if (updateError) {
            console.error(
              `Error updating volunteer for row ${i + 2}:`,
              updateError
            );
            errors.push(
              `Row ${i + 2}: Failed to update volunteer ${volunteer.id}.`
            );
            continue;
          }

          updatedCount++;
        } else {
          // Create a new volunteer row with interested roles
          const insertPayload = {
            season_id: seasonId,
            name: name || null,
            email: email || null,
            phone: phone || null,
            interested_roles: interestedRoles || null,
            // role (assigned role) is left null; will be set by draft or manual assignment
          };

          const { error: insertError } = await supabase
            .from('volunteers')
            .insert(insertPayload);

          if (insertError) {
            console.error(
              `Error inserting volunteer for row ${i + 2}:`,
              insertError
            );
            errors.push(`Row ${i + 2}: Failed to insert new volunteer.`);
            continue;
          }

          insertedCount++;
        }
      }

      return res.json({
        success: true,
        updated: updatedCount,
        inserted: insertedCount,
        errors,
      });
    } catch (err) {
      console.error('Error in POST /api/volunteer-import:', err);
      return res
        .status(500)
        .json({ error: 'Failed to import volunteers. Check server logs.' });
    }
  }
);

module.exports = router;
