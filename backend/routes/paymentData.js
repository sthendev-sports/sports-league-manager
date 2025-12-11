const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all payment data
router.get('/', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    let query = supabase
      .from('payment_data')
      .select('*')
      .order('order_date', { ascending: false });

    if (season_id) query = query.eq('season_id', season_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import payment data from CSV
router.post('/import', async (req, res) => {
  try {
    const { paymentData, season_id } = req.body;
    
    const processedData = paymentData.map(item => ({
      ...item,
      season_id: season_id,
      order_date: item.order_date ? new Date(item.order_date) : null,
      order_item_amount_paid: parseFloat(item.order_item_amount_paid) || 0
    }));

    const { data, error } = await supabase
      .from('payment_data')
      .insert(processedData)
      .select();

    if (error) throw error;
    res.status(201).json({ 
      message: `${data.length} payment records imported successfully`, 
      data 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;