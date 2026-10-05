require('dotenv').config();
const jwt = require('jsonwebtoken');
const orgId = '147a92b9-f90a-473d-b443-e6e668c4fbb7';
const token = jwt.sign(
  { sub: 'test-user', org_id: orgId, org_name: 'Test Org' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
console.log(token);
