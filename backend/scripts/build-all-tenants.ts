#!/usr/bin/env tsx
/**
 * Build static sites for all exported tenants
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const DATA_EXPORT_PATH = '_data/data-export';

const execCommand = (
  command: string,
  args: string[],
  cwd?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd,
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
};

async function getExportedTenants(): Promise<string[]> {
  try {
    const entries = await readdir(DATA_EXPORT_PATH, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    console.error('Failed to read export directory:', error);
    return [];
  }
}

async function buildAllTenants() {
  console.log('🏗️  Building static sites for all exported tenants...\n');

  try {
    // Get list of exported tenants
    const tenants = await getExportedTenants();

    if (tenants.length === 0) {
      console.log('⚠️  No exported tenants found.');
      return;
    }

    console.log(
      `Found ${tenants.length} exported tenants: ${tenants.join(', ')}\n`
    );

    // Build each tenant
    let successCount = 0;
    const failedTenants: string[] = [];

    for (const tenant of tenants) {
      console.log(`📦 Building static site for tenant: ${tenant}`);

      try {
        // Check if tenant has valid export (metadata.json exists)
        const metadataPath = join(DATA_EXPORT_PATH, tenant, 'metadata.json');
        await import('fs').then((fs) => fs.promises.access(metadataPath));

        // Run the build command from frontend directory
        await execCommand(
          'npm',
          ['run', 'build:tenant', tenant],
          '../frontend'
        );

        console.log(`✅ Successfully built static site for ${tenant}\n`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to build static site for ${tenant}:`, error);
        failedTenants.push(tenant);
      }
    }

    // Summary
    console.log('\n📊 Build Summary');
    console.log('================');
    console.log(`✅ Successfully built: ${successCount} tenants`);
    if (failedTenants.length > 0) {
      console.log(
        `❌ Failed to build: ${failedTenants.length} tenants (${failedTenants.join(', ')})`
      );
    }
    console.log(`📁 Static sites location: ../_data/next-export/`);

    if (failedTenants.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Build process failed:', error);
    process.exit(1);
  }
}

// Main execution
if (process.argv[1] === new URL(import.meta.url).pathname) {
  buildAllTenants().catch(console.error);
}
