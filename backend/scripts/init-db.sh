#!/bin/sh
set -e

echo "Waiting for TiDB to be ready..."

# Wait for TiDB to be available
until mysql -h tidb -P 4000 -u root --connect-timeout=2 -e "SELECT 1" > /dev/null 2>&1; do
  echo "TiDB is not ready yet. Waiting..."
  sleep 2
done

echo "TiDB is ready. Checking if database exists..."

# Create database if it doesn't exist
mysql -h tidb -P 4000 -u root -e "CREATE DATABASE IF NOT EXISTS verta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Database 'verta' is ready."

# Run migrations
echo "Running database migrations..."
cd /app
npm run migrate:latest

echo "Database initialization complete!"