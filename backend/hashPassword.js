// backend/hashPassword.js
const bcrypt = require('bcryptjs');

const password = 'Squall!0!'; // <-- put the password you want to use here

bcrypt.hash(password, 10).then((hash) => {
  console.log('Plain password:', password);
  console.log('HASH:', hash);
}).catch((err) => {
  console.error('Error hashing password:', err);
});
