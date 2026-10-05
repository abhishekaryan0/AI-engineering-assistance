import jwt from 'jsonwebtoken';
import { env } from './src/config/config';

// Create a valid token to bypass the auth middleware
const payload = {
  sub: '12345',
  org_id: '147a92b9-f90a-473d-b443-e6e668c4fbb7',
  org_name: 'Test Org'
};

const token = jwt.sign(payload, env.JWT_SECRET || 'secret');
console.log(token);
