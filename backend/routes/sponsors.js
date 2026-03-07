const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all sponsors
router.get('/', async (req, res) => {
  try {
    console.log('=== GET /api/sponsors ===');
    
    const { is_active } = req.query;
    
    let query = supabase
      .from('sponsors')
      .select('*')
      .order('company_name', { ascending: true });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Parse locations JSON for each sponsor
    const parsedData = (data || []).map(sponsor => ({
      ...sponsor,
      locations: typeof sponsor.locations === 'string' 
        ? JSON.parse(sponsor.locations) 
        : (sponsor.locations || [])
    }));
    
    console.log(`Found ${parsedData.length} sponsors`);
    res.json(parsedData);
  } catch (error) {
    console.error('Error loading sponsors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single sponsor by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    // Parse locations JSON
    const parsedData = {
      ...data,
      locations: typeof data.locations === 'string' 
        ? JSON.parse(data.locations) 
        : (data.locations || [])
    };
    
    res.json(parsedData);
  } catch (error) {
    console.error('Error loading sponsor:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get location configuration
router.get('/locations/config', async (req, res) => {
  try {
    console.log('=== GET /api/sponsors/locations/config ===');
    
    const { data, error } = await supabase
      .from('sponsor_locations')
      .select('*')
      .order('field_name', { ascending: true })
      .order('location_name', { ascending: true });

    if (error) throw error;
    
    // Get unique fields
    const fields = [...new Set(data.map(item => item.field_name))];
    
    // Separate standalone locations from regular fields
    const standaloneLocationTypes = ['Batting Cages', 'Bullpen Fence', 'Concession Stand', 'Park Entrance'];
    const standaloneLocations = fields.filter(f => standaloneLocationTypes.includes(f));
    const regularFields = fields.filter(f => !standaloneLocationTypes.includes(f));
    
    // Build location options - store as strings for dropdown display
    const locationOptions = {};
    const locationDetails = {}; // Store full details for reference
    
    data.forEach(item => {
      if (!locationOptions[item.field_name]) {
        locationOptions[item.field_name] = [];
        locationDetails[item.field_name] = [];
      }
      // Store just the name for dropdown display
      locationOptions[item.field_name].push(item.location_name);
      // Store full details for reference (id, price, etc.)
      locationDetails[item.field_name].push({
        id: item.id,
        name: item.location_name,
        price: item.price,
        is_active: item.is_active
      });
    });
    
    // Build price lookup
    const locationPrices = {};
    data.forEach(item => {
      locationPrices[item.location_name] = item.price;
    });
    
    console.log(`Found ${data?.length || 0} location configs`);
    res.json({
      fields: regularFields,
      standaloneLocations: standaloneLocations,
      locationOptions: locationOptions,
      locationDetails: locationDetails, // Send full details separately
      locationPrices: locationPrices,
      allConfigs: data
    });
  } catch (error) {
    console.error('Error loading location config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new sponsor
router.post('/', async (req, res) => {
  try {
    console.log('=== POST /api/sponsors ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const sponsorData = req.body;
    
    // Ensure locations is properly stringified for database
    let locationsJson = '[]';
    if (sponsorData.locations && Array.isArray(sponsorData.locations)) {
      // Make sure each location has an id
      const locationsWithIds = sponsorData.locations.map(loc => ({
        ...loc,
        id: loc.id || Date.now() + Math.random() // Temporary ID if not present
      }));
      locationsJson = JSON.stringify(locationsWithIds);
    }

    const { data, error } = await supabase
      .from('sponsors')
      .insert([{
        company_name: sponsorData.company_name,
        contact_name: sponsorData.contact_name,
        phone: sponsorData.phone,
        email: sponsorData.email,
        notes: sponsorData.notes,
        contacted_this_season: sponsorData.contacted_this_season || false,
        is_new_sponsor: sponsorData.is_new_sponsor || false,
        is_returning: sponsorData.is_returning || false,
        has_paid: sponsorData.has_paid || false,
        years_sponsoring: sponsorData.years_sponsoring || 1,
        has_website_ad: sponsorData.has_website_ad || false,
        has_concession_ad: sponsorData.has_concession_ad || false,
        purchased_new_sign: sponsorData.purchased_new_sign || false,
        upgraded_location: sponsorData.upgraded_location || false,
        downgraded_location: sponsorData.downgraded_location || false,
        total_amount: sponsorData.total_amount || 0,
        is_active: sponsorData.is_active !== undefined ? sponsorData.is_active : true,
        locations: locationsJson
      }])
      .select()
      .single();

    if (error) throw error;
    
    // Parse locations back for response
    const responseData = {
      ...data,
      locations: JSON.parse(data.locations || '[]')
    };
    
    console.log('Sponsor created successfully:', data.id);
    res.status(201).json(responseData);
  } catch (error) {
    console.error('Error creating sponsor:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update sponsor
router.put('/:id', async (req, res) => {
  try {
    console.log('=== PUT /api/sponsors/:id ===');
    console.log('Params:', req.params);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { id } = req.params;
    const sponsorData = req.body;
    
    // Ensure locations is properly stringified for database
    let locationsJson = '[]';
    if (sponsorData.locations && Array.isArray(sponsorData.locations)) {
      locationsJson = JSON.stringify(sponsorData.locations);
    }

    const { data, error } = await supabase
      .from('sponsors')
      .update({
        company_name: sponsorData.company_name,
        contact_name: sponsorData.contact_name,
        phone: sponsorData.phone,
        email: sponsorData.email,
        notes: sponsorData.notes,
        contacted_this_season: sponsorData.contacted_this_season,
        is_new_sponsor: sponsorData.is_new_sponsor,
        is_returning: sponsorData.is_returning,
        has_paid: sponsorData.has_paid,
        years_sponsoring: sponsorData.years_sponsoring,
        has_website_ad: sponsorData.has_website_ad,
        has_concession_ad: sponsorData.has_concession_ad,
        purchased_new_sign: sponsorData.purchased_new_sign,
        upgraded_location: sponsorData.upgraded_location,
        downgraded_location: sponsorData.downgraded_location,
        total_amount: sponsorData.total_amount,
        is_active: sponsorData.is_active,
        locations: locationsJson,
        updated_at: new Date()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    // Parse locations back for response
    const responseData = {
      ...data,
      locations: JSON.parse(data.locations || '[]')
    };
    
    console.log('Sponsor updated successfully:', id);
    res.json(responseData);
  } catch (error) {
    console.error('Error updating sponsor:', error);
    res.status(500).json({ error: error.message });
  }
});



// Delete sponsor
router.delete('/:id', async (req, res) => {
  try {
    console.log('=== DELETE /api/sponsors/:id ===');
    console.log('Params:', req.params);
    
    const { id } = req.params;
    
    const { error } = await supabase
      .from('sponsors')
      .delete()
      .eq('id', id);

    if (error) throw error;
    console.log('Sponsor deleted successfully:', id);
    res.json({ message: 'Sponsor deleted successfully' });
  } catch (error) {
    console.error('Error deleting sponsor:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new location configuration
router.post('/locations/config', async (req, res) => {
  try {
    console.log('=== POST /api/sponsors/locations/config ===');
    console.log('Request body:', req.body);
    
    const { field_name, location_name, price } = req.body;
    
    if (!field_name || !location_name || !price) {
      return res.status(400).json({ error: 'Field name, location name, and price are required' });
    }

    const { data, error } = await supabase
      .from('sponsor_locations')
      .insert([{
        field_name,
        location_name,
        cost: parseFloat(price),  // Changed from 'price' to 'cost'
        is_active: true
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ error: 'This location combination already exists' });
      }
      throw error;
    }
    
    console.log('Location config created successfully:', data.id);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding location config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update location configuration
router.put('/locations/config/:id', async (req, res) => {
  try {
    console.log('=== PUT /api/sponsors/locations/config/:id ===');
    console.log('Params:', req.params);
    console.log('Request body:', req.body);
    
    const { id } = req.params;
    const { location_name, price, is_active } = req.body;
    
    const updates = {};
    if (location_name !== undefined) updates.location_name = location_name;
    if (price !== undefined) updates.cost = parseFloat(price); // Changed from price to cost
    if (is_active !== undefined) updates.is_active = is_active;
    
    const { data, error } = await supabase
      .from('sponsor_locations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    console.log('Location config updated successfully:', id);
    res.json(data);
  } catch (error) {
    console.error('Error updating location config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete location configuration
router.delete('/locations/config/:id', async (req, res) => {
  try {
    console.log('=== DELETE /api/sponsors/locations/config/:id ===');
    console.log('Params:', req.params);
    
    const { id } = req.params;
    
    // Check if any sponsors are using this location
    const { data: sponsors, error: checkError } = await supabase
      .from('sponsors')
      .select('id, company_name, locations');

    if (checkError) throw checkError;

    // Parse locations JSON for each sponsor and check if location is used
    const usingSponsors = sponsors.filter(sponsor => {
      if (!sponsor.locations) return false;
      try {
        const locations = typeof sponsor.locations === 'string' 
          ? JSON.parse(sponsor.locations) 
          : (sponsor.locations || []);
        return locations.some(loc => loc.id === parseInt(id));
      } catch (e) {
        console.error('Error parsing locations for sponsor', sponsor.id, e);
        return false;
      }
    });

    if (usingSponsors && usingSponsors.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete location that is in use by sponsors',
        sponsors: usingSponsors.map(s => s.company_name)
      });
    }
    
    const { error } = await supabase
      .from('sponsor_locations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    console.log('Location config deleted successfully:', id);
    res.json({ message: 'Location configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting location config:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;