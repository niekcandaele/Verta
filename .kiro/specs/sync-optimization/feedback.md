Do not handle rate limits ourselves. Discord.js already has mechanisms for this. Leverage these. Eg, just an idea please research and think yourself but we could listen for a rate limit event, if we receive that then pause the workers until the timestamp that the limits are reset.

For dev UX, we should also include some scripts here.
- Script to start a sync
- Script that resets the database
- We already have a script that sets up a test tenant (?)

Make sure these scripts are available as npm scripts and are mentioned in the CLAUDE.md file.

Do not make a 'EnhancedSyncJobResult' Just edit the existing SyncJobResult. You were specifically instructed to avoid changes like tehis.

Describe the database migrations we will create better.
