const jwt = require('jsonwebtoken');
require('dotenv').config();

const payload = {
  sub: '12345',
  org_id: '147a92b9-f90a-473d-b443-e6e668c4fbb7',
  org_name: 'Test Org'
};

const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret');
console.log(token);
