/* eslint-disable no-console */
import 'dotenv/config';
import { z } from 'zod';

const DevDataConfigSchema = z.object({
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  PORT: z.coerce.number().int().positive().default(25000),
  TEST_DISCORD_GUILD_ID: z.string().min(1, 'TEST_DISCORD_GUILD_ID is required'),
  TEST_DISCORD_TENANT_SLUG: z
    .string()
    .min(1, 'TEST_DISCORD_TENANT_SLUG is required'),
});

async function resetTestData() {
  try {
    const config = DevDataConfigSchema.parse(process.env);

    const baseUrl = `http://localhost:${config.PORT}/api`;

    console.log('🔍 Looking for test tenant to remove...');

    const listResponse = await fetch(`${baseUrl}/tenants?limit=100`, {
      method: 'GET',
      headers: {
        'X-API-KEY': config.ADMIN_API_KEY,
      },
    });

    if (!listResponse.ok) {
      const errorData = await listResponse.json();
      console.error('❌ Failed to list tenants:', errorData);
      process.exit(1);
    }

    const { data: tenants } = (await listResponse.json()) as any;

    const testTenant = tenants.find(
      (tenant: { slug: string; platformId: string }) =>
        tenant.slug === config.TEST_DISCORD_TENANT_SLUG ||
        tenant.platformId === config.TEST_DISCORD_GUILD_ID
    );

    if (!testTenant) {
      console.log('✅ No test tenant found - nothing to remove');
      return;
    }

    console.log('🗑️  Removing test tenant:', {
      id: testTenant.id,
      name: testTenant.name,
      slug: testTenant.slug,
    });

    const deleteResponse = await fetch(`${baseUrl}/tenants/${testTenant.id}`, {
      method: 'DELETE',
      headers: {
        'X-API-KEY': config.ADMIN_API_KEY,
      },
    });

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.text();
      console.error(
        '❌ Failed to delete tenant:',
        errorData || deleteResponse.statusText
      );
      process.exit(1);
    }

    console.log('✅ Test tenant removed successfully!');
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment configuration error:');
      error.issues.forEach((issue) => {
        console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
      });
      console.error(
        '\n💡 Make sure to set these environment variables in your .env file:'
      );
      console.error('   TEST_DISCORD_GUILD_ID=your-discord-guild-id');
      console.error('   TEST_DISCORD_TENANT_SLUG=your-test-tenant');
    } else if (
      error instanceof Error &&
      error.message.includes('ECONNREFUSED')
    ) {
      console.error('❌ Could not connect to the server');
      console.error('   Make sure the server is running: npm run dev');
    } else {
      console.error('❌ Unexpected error:', error);
    }
    process.exit(1);
  }
}

resetTestData();
