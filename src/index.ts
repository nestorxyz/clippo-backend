// Load environment variables FIRST
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Import routes
import authRoutes from './routes/auth.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

dotenv.config();

// Import middleware
import { errorHandler } from './middleware/error.middleware.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    credentials: true,
  })
);

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/webhooks', webhookRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((_, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'The requested resource was not found',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`
  );
});
