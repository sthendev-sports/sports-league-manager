const express = require('express');
const router = express.Router();

// This is a minimal route just to trigger permission checks
// The actual data is fetched through other API endpoints (players, teams, divisions, seasons)
router.get('/', async (req, res) => {
  try {
    // Just return a success message - the frontend will handle actual data fetching
    res.json({ 
      success: true, 
      message: 'Access to uniforms granted',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Uniforms route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;