# Prisma Migration Guide: Managing All Models

This guide helps you migrate from a mixed approach (some tables in retired-provider, some in Prisma) to managing all models with Prisma.

## Current Situation

Currently, you have:

- Some tables managed by retired-provider migrations (like existing link management tables)
- Some tables managed by Prisma (WhatsApp integration tables)
- The `user_profiles` table in both systems

## Migration Steps

### 1. First, Check Your Current Tables

See what tables exist in your retired-provider database:

```bash
npm run db:tables
```

### 2. Backup Current Schema

```bash
cp prisma/schema.prisma prisma/schema.backup.prisma
```

### 3. Introspect Existing Database

Pull all existing tables from retired-provider:

```bash
npm run prisma:introspect
```

This will update your `schema.prisma` with all existing tables.

### 4. Review and Clean Schema

After introspection, your schema might include:

- retired-provider internal tables (you can remove these)
- Your existing tables with auto-generated names

Clean up the schema:

1. Remove any `_prisma_migrations` table
2. Remove retired-provider internal tables (like `schema_migrations`, `buckets`, etc.)
3. Rename models to use PascalCase
4. Add proper relations between models
5. Add missing indexes

### 5. Use the Complete Schema

We've prepared a complete schema in `prisma/schema.complete.prisma` that includes:

```
✅ User & Authentication Models
   - Profile (main user profile)
   - UserProfile (phone verification)

✅ Link Management Models
   - Category
   - SubCategory
   - Link
   - Tag
   - LinkTag (many-to-many)

✅ AI Chat Models
   - ChatMessage

✅ WhatsApp Integration Models
   - Contact
   - OtpAttempt
   - WhatsappSession
   - RateLimit
```

To use it:

```bash
# Replace current schema with complete one
cp prisma/schema.complete.prisma prisma/schema.prisma

# Validate the schema
npm run prisma:validate
```

### 6. Handle Existing Data

Since you likely have existing data, you have two options:

#### Option A: Create Migration from Current State (Recommended)

```bash
# Delete old migrations (they're not in sync)
rm -rf prisma/migrations

# Create new baseline migration
npm run prisma:migrate:init

# This creates a migration that represents your current state
```

#### Option B: Push Schema Changes (Development Only)

```bash
# Push schema changes without migration
npm run prisma:push

# This updates the database to match your schema
```

### 7. Generate Prisma Client

```bash
npm run prisma:generate
```

### 8. Update Your Code

After migration, update your backend code to use Prisma for all database operations:

```typescript
// Example: Creating a new link
const newLink = await prisma.link.create({
  data: {
    userId: user.id,
    categoryId: category.id,
    url: 'https://example.com',
    title: 'Example Link',
    // ... other fields
  },
});

// Example: Fetching categories with links
const categories = await prisma.category.findMany({
  where: { userId: user.id },
  include: {
    links: true,
    subCategories: {
      include: {
        links: true,
      },
    },
  },
});
```

## Benefits of Managing All Models with Prisma

1. **Type Safety**: Full TypeScript types for all models
2. **Migrations**: Version control for database schema
3. **Relations**: Easy eager/lazy loading of related data
4. **Consistency**: Single source of truth for schema
5. **Tooling**: Prisma Studio for data management

## Important Considerations

### retired-provider RLS (Row Level Security)

Prisma doesn't manage RLS policies. Keep your existing RLS policies:

```sql
-- Keep these policies in retired-provider
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
-- etc.
```

### retired-provider Realtime

Realtime subscriptions still work with Prisma-managed tables:

```javascript
// This still works
retired-provider
  .channel('db-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'links',
    },
    handleChange
  )
  .subscribe();
```

### Auth Integration

The `Profile` model references retired-provider auth users via `userId`:

- This is a "soft" foreign key (not enforced by database)
- retired-provider triggers still work to create profiles on signup

## Troubleshooting

### "Table already exists" Error

If you get this error when migrating:

1. You're trying to create a table that already exists
2. Use `npm run prisma:push` for development
3. Or create a migration that alters existing tables

### "Unknown column" Error

If Prisma expects columns that don't exist:

1. Your schema doesn't match the database
2. Run `npm run prisma:introspect` to see actual schema
3. Update your schema.prisma accordingly

### Performance Considerations

Add indexes for commonly queried fields:

```prisma
model Link {
  // ... fields ...

  @@index([userId])
  @@index([categoryId])
  @@index([domain])
  @@index([createdAt])
}
```

## Next Steps

1. Run `npm run db:test` to verify connection
2. Use Prisma Studio to explore data: `npm run prisma:studio`
3. Update your API endpoints to use Prisma
4. Set up automated backups before major changes
