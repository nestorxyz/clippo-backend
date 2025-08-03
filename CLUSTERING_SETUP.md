# Clustering Feature Database Setup

This guide explains how to set up the database tables required for the AI clustering feature.

## Required Tables

The clustering feature requires two new tables in your retired-provider database:

### 1. clustered_problems

Stores AI-clustered problem data with grouped similar issues.

### 2. clustered_emotions

Stores AI-clustered emotion data with grouped similar emotions.

## Installation Steps

### Method 1: Using retired-provider Dashboard (Recommended)

1. Go to your retired-provider project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `clustering_tables.sql`
5. Click **Run** to execute the SQL

### Method 2: Using retired-provider CLI

```bash
# Make sure you're in the backend directory
cd /path/to/your/backend

# Run the SQL file
retired-provider db push --file clustering_tables.sql
```

### Method 3: Manual Execution

Execute the SQL commands from `clustering_tables.sql` in your preferred PostgreSQL client.

## Verification

After running the SQL, you should see two new tables in your retired-provider database:

- `clustered_problems`
- `clustered_emotions`

Each table should have the following columns:

- `id` (UUID, Primary Key)
- `original_problems/original_emotions` (JSONB)
- `clustered_problems/clustered_emotions` (JSONB)
- `clustered_at` (Timestamp)
- `created_at` (Timestamp)
- `input_hash` (Text)

## TypeScript Types Update (Optional)

After creating the tables, you may want to regenerate your retired-provider TypeScript types:

```bash
# Generate updated types
retired-provider gen types typescript --project-id YOUR_PROJECT_ID > src/types/retired-provider.ts
```

This will ensure proper TypeScript intellisense for the new tables.

## Testing

Once the tables are created, you can test the clustering endpoints:

- `POST /api/dashboard/cluster-problems`
- `POST /api/dashboard/cluster-emotions`

The API will automatically save clustered results to these tables and retrieve them for subsequent requests with the same data.
