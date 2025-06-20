# Clippo WhatsApp Integration Backend

This Express.js backend provides WhatsApp integration for the Clippo link management AI, allowing users to interact with the AI assistant via WhatsApp messages.

## Features

- **WhatsApp OTP Authentication**: Send and verify OTP codes via WhatsApp
- **Account Linking**: Link WhatsApp phone numbers to existing Google-authenticated accounts
- **Message Processing**: Handle incoming WhatsApp messages and route them to the AI
- **Session Management**: Maintain conversation context across WhatsApp chats
- **Rate Limiting**: Protect against abuse with configurable rate limits

## Prerequisites

- Node.js v18+ and npm
- PostgreSQL database (Supabase)
- WhatsApp Business API access
- Deployed Supabase Edge Function for AI processing

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `env.example` to `.env` and fill in your values:

```bash
cp env.example .env
```

Required environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for admin operations)
- `DATABASE_URL`: PostgreSQL connection string
- `WHATSAPP_ACCESS_TOKEN`: WhatsApp Business API access token
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp phone number ID
- `WHATSAPP_VERIFY_TOKEN`: Custom token for webhook verification

### 3. Database Setup

#### Option A: Apply Migrations (Recommended)

Generate Prisma client and apply migrations:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

#### Option B: Introspect Existing Database

If you already have tables in Supabase:

```bash
# Pull current schema from database
npm run prisma:introspect

# Generate Prisma client
npm run prisma:generate

# Create initial migration
npm run prisma:migrate:init
```

#### Test Connection

Verify your setup:

```bash
npm run db:test
```

#### View & Edit Data

Open Prisma Studio:

```bash
npm run prisma:studio
```

#### Manage All Models with Prisma

To manage all your database models with Prisma (recommended):

```bash
npm run db:setup-complete
```

This interactive script will help you:

- Introspect your existing Supabase database
- Or use a complete schema template with all models
- Set up Prisma to manage all your tables

For more database operations, see:

- [DATABASE_GUIDE.md](DATABASE_GUIDE.md) - General database operations
- [PRISMA_MIGRATION_GUIDE.md](PRISMA_MIGRATION_GUIDE.md) - Complete migration guide

### 4. WhatsApp Configuration

1. Set up webhook URL in Meta Business Platform:

   - Webhook URL: `https://your-domain.com/webhook/whatsapp`
   - Verify token: Use the value from `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to: `messages` field

2. Create WhatsApp message template named `otp` with:
   - Body: "Tu código de verificación es: {{1}}"
   - Button: URL button with `{{1}}` parameter

## Development

Run the development server:

```bash
npm run dev
```

The server will start on `http://localhost:3000` with hot-reloading enabled.

## API Endpoints

### Authentication

- `POST /auth/send-otp-web`: Send OTP to web user's phone
- `POST /auth/verify-otp-web`: Verify OTP and link phone to account
- `GET /auth/phone-status`: Get current user's phone verification status

### WhatsApp Webhook

- `GET /webhook/whatsapp`: Webhook verification endpoint
- `POST /webhook/whatsapp`: Handle incoming WhatsApp messages

### Health Check

- `GET /health`: Server health status

## Deployment

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Railway Deployment

This backend is configured for deployment on Railway:

1. Connect your GitHub repository
2. Set all environment variables in Railway dashboard
3. Deploy with automatic builds on push

## Architecture

### Services

- **WhatsApp Service**: Handles WhatsApp API communication
- **User Service**: Manages user accounts and phone linking
- **OTP Service**: Generates and verifies OTP codes
- **AI Service**: Integrates with Supabase Edge Function

### Database Models

- **Contact**: User profiles with phone numbers
- **OtpAttempt**: OTP verification tracking
- **WhatsappSession**: Conversation session management
- **RateLimit**: API rate limiting

### Security

- Supabase JWT authentication for web endpoints
- Phone number verification via OTP
- Rate limiting on all endpoints
- Webhook signature verification

## Testing

### Test WhatsApp Integration

1. Send a message to your WhatsApp Business number
2. Check logs for incoming webhook data
3. Verify AI response is sent back

### Test OTP Flow

1. Call `/auth/send-otp-web` with valid Supabase token
2. Check WhatsApp for OTP message
3. Verify with `/auth/verify-otp-web`

## Troubleshooting

### Common Issues

1. **Webhook not receiving messages**

   - Verify webhook URL is publicly accessible
   - Check WhatsApp webhook subscriptions
   - Ensure verify token matches

2. **OTP not sending**

   - Verify WhatsApp template is approved
   - Check WhatsApp API credentials
   - Review rate limiting settings

3. **Database connection errors**
   - Verify DATABASE_URL is correct
   - Check Supabase connection pooling settings
   - Run `npm run prisma:generate` after schema changes

## License

MIT
