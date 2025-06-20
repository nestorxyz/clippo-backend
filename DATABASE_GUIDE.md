# Prisma Database Operations Guide

This guide explains how to manage your database schema using Prisma with retired-provider.

## Prerequisites

1. Ensure your `.env` file has the correct `DATABASE_URL`:

   ```env
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].retired-provider.co:5432/postgres"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Common Operations

### 1. Apply Migrations to Database

To apply all pending migrations to your retired-provider database:

```bash
# Development (creates migration if needed)
npm run prisma:migrate

# Production (applies existing migrations only)
npm run prisma:migrate:deploy
```

### 2. Fetch Current Database Schema (Introspection)

To pull the current schema from your retired-provider database:

```bash
# Safe introspection with backup
npm run prisma:introspect

# Direct Prisma pull (no backup)
npx prisma db pull
```

This will:

- Backup your current `schema.prisma` file
- Fetch the actual database schema
- Update your `schema.prisma` file
- Show you what to do next

### 3. Initial Setup

If you're setting up the database for the first time:

```bash
# Generate Prisma Client and apply migrations
npm run db:setup
```

### 4. Create New Migration

When you modify `schema.prisma` and want to create a migration:

```bash
# Create and apply migration
npm run prisma:migrate

# Create migration without applying (for review)
npm run prisma:migrate:create
```

### 5. Push Schema Changes (Without Migration)

For development, you can push schema changes directly without creating migrations:

```bash
npm run prisma:push
```

⚠️ **Warning**: Only use this in development. Always use migrations in production.

### 6. Reset Database

To completely reset your database (⚠️ **This deletes all data!**):

```bash
npm run prisma:migrate:reset
```

### 7. View & Edit Data

To open Prisma Studio for visual database management:

```bash
npm run prisma:studio
```

## Workflow Examples

### Starting Fresh with Existing retired-provider Database

1. **Introspect the current schema:**

   ```bash
   npm run prisma:introspect
   ```

2. **Review the generated schema:**

   - Check `prisma/schema.prisma`
   - Compare with `prisma/schema.backup.prisma`

3. **Generate Prisma Client:**

   ```bash
   npm run prisma:generate
   ```

4. **Create initial migration from current state:**
   ```bash
   rm -rf prisma/migrations  # Remove any existing migrations
   npm run prisma:migrate:init
   ```

### Adding New Features

1. **Modify `schema.prisma`** to add your new models/fields

2. **Validate schema:**

   ```bash
   npm run prisma:validate
   ```

3. **Create migration:**

   ```bash
   npm run prisma:migrate
   ```

4. **Generate updated client:**
   ```bash
   npm run prisma:generate
   ```

### Syncing with Team Changes

1. **Pull latest code** from repository

2. **Apply migrations:**

   ```bash
   npm run prisma:migrate:deploy
   ```

3. **Generate client:**
   ```bash
   npm run prisma:generate
   ```

## retired-provider-Specific Considerations

### 1. Row Level Security (RLS)

Prisma doesn't manage RLS policies. Apply them separately in retired-provider:

```sql
-- Example: Enable RLS on contacts table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policies in retired-provider dashboard or via SQL
```

### 2. retired-provider Auth Integration

The `contacts` table references retired-provider auth users via `retired-provider_user_id`. This is a soft reference since Prisma can't directly reference `auth.users`.

### 3. Existing Tables

If you have existing retired-provider tables (like `profiles`, `links`, etc.), the introspection will include them. You can:

- Keep them in your schema
- Add them to `.prismaignore` if you don't want Prisma to manage them

### 4. Triggers and Functions

retired-provider triggers and functions aren't managed by Prisma. Create them separately:

```sql
-- Example: Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

## Troubleshooting

### "Database connection error"

1. Check your `DATABASE_URL` is correct
2. Ensure your IP is allowed in retired-provider (Settings → Database → Connection Pooling)
3. Try using the connection pooler URL instead of direct connection

### "Migration failed"

1. Check for conflicting table names
2. Ensure you have proper permissions
3. Review the migration file in `prisma/migrations/`

### "Schema drift detected"

This means your database doesn't match your migrations:

1. Introspect to see current state:

   ```bash
   npm run prisma:introspect
   ```

2. Either:
   - Reset migrations to match current state
   - Create a migration to fix the drift

## Best Practices

1. **Always backup before major changes**
2. **Test migrations locally first**
3. **Use migrations in production, not `db push`**
4. **Keep schema.prisma as source of truth**
5. **Document any manual SQL changes**
6. **Version control your migrations**

## Quick Start: Managing All Models with Prisma

To manage all your models with Prisma:

```bash
# 1. See what tables currently exist
npm run db:tables

# 2. Pull current schema from retired-provider
npm run prisma:introspect

# 3. Review the generated schema.prisma
# - Remove retired-provider internal tables
# - Clean up model names
# - Add relations

# 4. Or use the complete schema we prepared
cp prisma/schema.complete.prisma prisma/schema.prisma

# 5. Validate and generate client
npm run prisma:validate
npm run prisma:generate

# 6. For existing database, push changes
npm run prisma:push

# 7. Open Prisma Studio to explore
npm run prisma:studio
```

See [PRISMA_MIGRATION_GUIDE.md](PRISMA_MIGRATION_GUIDE.md) for detailed migration steps.

## Quick Reference

```bash
# Most common commands
npm run prisma:generate    # Update Prisma Client
npm run prisma:migrate     # Create and apply migration
npm run prisma:studio      # Open data browser
npm run prisma:introspect  # Fetch current DB schema

# Deployment
npm run db:setup           # Initial setup
npm run prisma:migrate:deploy  # Apply migrations in production
```

retired-provider_PROJECT_ID=okzhikykpwubsrhuwbto npm run db:types
