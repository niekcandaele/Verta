/* eslint-disable no-console */
import 'dotenv/config';
import { z } from 'zod';

const DevDataConfigSchema = z.object({
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  PORT: z.coerce.number().int().positive().default(25000),
  TEST_DISCORD_GUILD_ID: z.string().min(1, 'TEST_DISCORD_GUILD_ID is required'),
  TEST_DISCORD_TENANT_NAME: z
    .string()
    .min(1, 'TEST_DISCORD_TENANT_NAME is required'),
  TEST_DISCORD_TENANT_SLUG: z
    .string()
    .min(1, 'TEST_DISCORD_TENANT_SLUG is required'),
});

async function createTestTenant() {
  try {
    const config = DevDataConfigSchema.parse(process.env);

    const baseUrl = `http://localhost:${config.PORT}/api`;

    console.log('🔄 Creating test Discord tenant...');

    const tenantData = {
      name: config.TEST_DISCORD_TENANT_NAME,
      slug: config.TEST_DISCORD_TENANT_SLUG,
      platform: 'discord' as const,
      platformId: config.TEST_DISCORD_GUILD_ID,
      status: 'ACTIVE' as const,
    };

    console.log('📋 Tenant data:', {
      ...tenantData,
      platformId: '***' + tenantData.platformId.slice(-4),
    });

    const response = await fetch(`${baseUrl}/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.ADMIN_API_KEY,
      },
      body: JSON.stringify(tenantData),
    });

    const responseData = (await response.json()) as any;

    if (!response.ok) {
      if (response.status === 409) {
        console.log('⚠️  Tenant already exists with this slug or platform ID');
        console.log('   Use npm run dev:reset to remove it first');
      } else {
        console.error('❌ Failed to create tenant:', responseData);
      }
      process.exit(1);
    }

    console.log('✅ Test tenant created successfully!');
    console.log('📊 Tenant details:', {
      id: responseData.id,
      name: responseData.name,
      slug: responseData.slug,
      platform: responseData.platform,
      status: responseData.status,
    });
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
      console.error('   TEST_DISCORD_TENANT_NAME="Your Test Tenant"');
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

createTestTenant();
