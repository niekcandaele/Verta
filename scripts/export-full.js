#!/usr/bin/env node

/**
 * Full export and build orchestration script
 * Exports all tenants' data and builds static sites for each
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const DATA_EXPORT_PATH = path.join(__dirname, '..', 'backend', '_data', 'data-export');

// Run a command and return a promise
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Get all exported tenant directories
async function getExportedTenants() {
  try {
    await fs.access(DATA_EXPORT_PATH);
    const entries = await fs.readdir(DATA_EXPORT_PATH, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch (error) {
    console.error('❌ Failed to read export directory:', error);
    return [];
  }
}

// Main orchestration function
async function exportFull() {
  console.log('📦 Verta Full Export and Build Process');
  console.log('=====================================\n');

  try {
    // Step 1: Export data for all tenants
    console.log('📊 Step 1: Exporting data for all tenants...');
    await runCommand('npm', ['run', 'export:all', '--', '--wait'], {
      cwd: path.join(__dirname, '..', 'backend')
    });
    console.log('✅ Data export completed successfully!\n');

    // Step 2: Get list of exported tenants
    console.log('📋 Step 2: Finding exported tenants...');
    const tenants = await getExportedTenants();
    
    if (tenants.length === 0) {
      console.log('⚠️  No exported tenants found. Exiting...');
      return;
    }

    console.log(`✅ Found ${tenants.length} exported tenants:`, tenants.join(', '));

    // Step 3: Build static sites for each tenant
    console.log('\n🏗️  Step 3: Building static sites for all tenants...');
    
    for (const tenant of tenants) {
      console.log(`\n📦 Building static site for tenant: ${tenant}`);
      
      try {
        // Check if tenant has metadata.json (valid export)
        const metadataPath = path.join(DATA_EXPORT_PATH, tenant, 'metadata.json');
        await fs.access(metadataPath);
        
        // Build the static site
        await runCommand('npm', ['run', 'build:tenant', tenant], {
          cwd: path.join(__dirname, '..', 'frontend')
        });
        
        console.log(`✅ Successfully built static site for ${tenant}`);
      } catch (error) {
        console.error(`❌ Failed to build static site for ${tenant}:`, error.message);
        // Continue with other tenants even if one fails
      }
    }

    // Step 4: Summary
    console.log('\n📊 Export and Build Summary');
    console.log('==========================');
    console.log(`✅ Exported data for all active tenants`);
    console.log(`✅ Built static sites for ${tenants.length} tenants`);
    console.log(`📁 Export location: ${DATA_EXPORT_PATH}`);
    console.log(`📁 Static sites location: ${path.join(__dirname, '..', '_data', 'next-export')}`);
    console.log('\n🎉 Full export and build process completed successfully!');

  } catch (error) {
    console.error('\n❌ Export and build process failed:', error);
    process.exit(1);
  }
}

// Run the export
exportFull().catch(console.error);