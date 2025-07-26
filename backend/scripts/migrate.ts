#!/usr/bin/env node
import { config } from 'dotenv';

// Load environment variables before importing anything else
if (process.env.NODE_ENV !== 'production') {
  config();
}

// Now import the actual migration logic
import('../src/database/migrate.js');
