const cors = require('cors');
require('dotenv').config();

const express = require('express');
const app = express();

// Increase payload size limit for large CSV imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware
app.use(cors());
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
const draftRoutes = require('./routes/draft');
const seasonExportRoutes = require('./routes/season-export');
const gamesRoutes = require('./routes/games');
const dashboardRoutes = require('./routes/dashboard');
const workbondRoutes = require('./routes/workbond');
// const workbondImportRoutes = require('./routes/import-shifts');

// Use routes - IMPORTANT: configuration before teams
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/players', playerRoutes);
app.use('/api', configurationRoutes);      // Handles /api/divisions
app.use('/api/teams', teamRoutes);         // Handles /api/teams
app.use('/api/families', familyRoutes);
app.use('/api/payment-data', paymentDataRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/volunteer-import', volunteerImportRoutes); // NEW route base
app.use('/api/board-members', boardMemberRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/season-export', seasonExportRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/workbond', workbondRoutes);
// app.use('/api/workbond', workbondImportRoutes); // enable later if needed

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
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
