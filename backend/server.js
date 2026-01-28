const cors = require('cors');
require('dotenv').config();

const express = require('express');
const app = express();

// Increase payload size limit for large CSV imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware
//app.use(cors());
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:5173',
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      // Allow non-browser requests (like curl/postman) that may have no Origin header
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const emailSettingsRoutes = require('./routes/emailSettings');
const notificationsRoutes = require('./routes/notifications');
const seasonRoutes = require('./routes/seasons');
const playerRoutes = require('./routes/players');
const configurationRoutes = require('./routes/configuration'); // /api/divisions
const teamRoutes = require('./routes/teams');
const familyRoutes = require('./routes/families');
const paymentDataRoutes = require('./routes/paymentData');
const volunteerRoutes = require('./routes/volunteers');
const volunteerImportRoutes = require('./routes/volunteerImport'); // NEW
const boardMemberRoutes = require('./routes/boardMembers');
//const draftRoutes = require('./routes/draft');
const seasonExportRoutes = require('./routes/season-export');
const gamesRoutes = require('./routes/games');
const dashboardRoutes = require('./routes/dashboard');
const workbondRoutes = require('./routes/workbond');
const requestsRoutes = require('./routes/requests');
const publicCheckWorkbondRoutes = require('./routes/publicCheckWorkbond');
const familySeasonWorkbondRoutes = require('./routes/familySeasonWorkbond');
const trainingsRouter = require('./routes/trainings');
const { authMiddleware } = require('./middleware/auth');
const { permissionEnforcer } = require('./middleware/permissionEnforcer');
// const workbondImportRoutes = require('./routes/import-shifts');
//app.use('/api/draft-new', require('./routes/draft-new'));


// Use routes - IMPORTANT: configuration before teams
app.use('/api/draft', authMiddleware, permissionEnforcer, require('./routes/draft-new')); // NEW - use the new code
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/seasons', seasonRoutes);
//app.use('/api/players', playerRoutes);
app.use('/api/players', authMiddleware, permissionEnforcer, playerRoutes);
app.use('/api', configurationRoutes);      // Handles /api/divisions
app.use('/api/teams', authMiddleware, permissionEnforcer, teamRoutes);        // Handles /api/teams
//app.use('/api/teams', teamRoutes); // not using rules
app.use('/api/uniforms', authMiddleware, permissionEnforcer, require('./routes/uniforms'));
app.use('/api/families', familyRoutes);
app.use('/api/payment-data', paymentDataRoutes);
app.use('/api/trainings', trainingsRouter);
app.use('/api/volunteers', authMiddleware, permissionEnforcer, volunteerRoutes);
app.use('/api/volunteer-import', authMiddleware, permissionEnforcer, volunteerImportRoutes); // NEW route base
app.use('/api/board-members', boardMemberRoutes);
//app.use('/api/draft', draftRoutes);
app.use('/api/season-export', seasonExportRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/dashboard', authMiddleware, permissionEnforcer, dashboardRoutes);
app.use('/api/workbond', workbondRoutes);
app.use('/api/requests', authMiddleware, permissionEnforcer, requestsRoutes);
app.use('/api/family-season-workbond', authMiddleware, permissionEnforcer, familySeasonWorkbondRoutes, require('./routes/familySeasonWorkbond'));
app.use('/api/public/checkworkbond', publicCheckWorkbondRoutes);
app.use('/api/public/workbond-status', publicCheckWorkbondRoutes); // backward compat
app.use('/api/families', require('./routes/families'));
//app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/role-permissions', permissionEnforcer, require('./routes/rolePermissions'));
// app.use('/api/workbond', workbondImportRoutes); // enable later if needed

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
  });
});

// In your server.js or app.js
const WebSocket = require('ws');

// Add WebSocket server if not already present
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'start-exemption-check' && data.season_id) {
        // Start exemption check with progress reporting
        await workbondExemptService.startExemptionCheckJob(data.season_id, {
          emit: (event, data) => {
            ws.send(JSON.stringify({ event, data }));
          }
        });
        
        ws.send(JSON.stringify({ event: 'complete', data: { success: true } }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ event: 'error', data: { error: error.message } }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});