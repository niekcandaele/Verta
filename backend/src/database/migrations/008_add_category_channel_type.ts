import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop the existing CHECK constraint on channel type
  await sql`
    ALTER TABLE channels 
    DROP CONSTRAINT IF EXISTS check_channel_type
  `.execute(db);

  // Add a new CHECK constraint that includes 'category'
  await sql`
    ALTER TABLE channels 
    ADD CONSTRAINT check_channel_type 
    CHECK (type IN ('text', 'thread', 'forum', 'category'))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // First, we need to handle any existing category channels
  // Option 1: Delete them (data loss)
  // Option 2: Convert them to another type
  // For safety, we'll throw an error if category channels exist
  
  const categoryChannels = await db
    .selectFrom('channels')
    .select('id')
    .where('type', '=', 'category')
    .execute();

  if (categoryChannels.length > 0) {
    throw new Error(
      `Cannot revert migration: ${categoryChannels.length} category channels exist. ` +
      'Please manually handle these channels before reverting.'
    );
  }

  // Drop the current constraint
  await sql`
    ALTER TABLE channels 
    DROP CONSTRAINT IF EXISTS check_channel_type
  `.execute(db);

  // Add back the original constraint without 'category'
  await sql`
    ALTER TABLE channels 
    ADD CONSTRAINT check_channel_type 
    CHECK (type IN ('text', 'thread', 'forum'))
  `.execute(db);
}