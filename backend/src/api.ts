import express from 'express';
import cors from 'cors';
import { prisma } from './prisma';
import { bot } from './bot';

import path from 'path';

export const app = express();
app.use(cors());
app.use(express.json());

// Health check route for Railway (must be BEFORE static files to avoid libuv thread pool exhaustion)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Serve static files from frontend build
// app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Get all channels and their plans
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      include: { plans: true }
    });
    res.json(channels);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user subscriptions
app.get('/api/subscriptions/:userId', async (req, res) => {
  try {
    const subs = await prisma.subscription.findMany({
      where: { userId: req.params.userId, status: 'ACTIVE' },
      include: { channel: true }
    });
    res.json(subs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Invoice Link for Stars
app.post('/api/create-invoice', async (req, res) => {
  const { channelId, planId } = req.body;
  
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  
  if (!plan || !channel) {
    return res.status(404).json({ error: "Plan or Channel not found" });
  }

  try {
    const invoiceLink = await bot.telegram.createInvoiceLink({
      title: `${channel.title} VIP`,
      description: `${plan.name} tarifiga obuna - ${plan.duration} kun`,
      payload: `${channelId}_${planId}`,
      provider_token: "", // Empty for Telegram Stars
      currency: "XTR", // Telegram Stars currency code
      prices: [{ label: "Narxi", amount: plan.price }], // amount is in stars, e.g. 100
    });
    
    res.json({ invoiceLink });
  } catch (err) {
    console.error("Invoice Error:", err);
    res.status(500).json({ error: "Failed to create invoice link" });
  }
});
// Admin Middleware
import { validateWebAppData } from './utils/telegramAuth';

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Check local development bypass or real telegram auth
  const isLocalHost = req.hostname === 'localhost';
  if (isLocalHost && process.env.NODE_ENV !== 'production') {
    return next(); // Bypass for local dev testing if needed
  }

  const initData = req.headers['x-telegram-init-data'] as string;
  const botToken = process.env.BOT_TOKEN;
  const adminId = process.env.ADMIN_ID; // The user's Telegram ID from Railway variables

  if (!initData || !botToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing initData or token' });
  }

  const user = validateWebAppData(initData, botToken);
  
  // Also check against hardcoded ID if ADMIN_ID is not set yet, to prevent total lockout for the owner during setup
  if (!user || (adminId && user.id?.toString() !== adminId)) {
    return res.status(403).json({ error: 'Forbidden: You are not the admin' });
  }

  next();
};

// --- Admin Routes ---

// Get basic stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeSubs = await prisma.subscription.count({ where: { status: 'ACTIVE' } });
    const totalChannels = await prisma.channel.count();
    res.json({ totalUsers, activeSubs, totalChannels });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a new channel
app.post('/api/admin/channels', requireAdmin, async (req, res) => {
  const { id, title, adminId } = req.body;
  try {
    const channel = await prisma.channel.create({
      data: { id, title, adminId: adminId || "12345" }
    });
    res.json(channel);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

// Delete a channel
app.delete('/api/admin/channels/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    await prisma.plan.deleteMany({ where: { channelId: id } });
    await prisma.subscription.deleteMany({ where: { channelId: id } });
    await prisma.channel.delete({ where: { id: id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// Add a plan
app.post('/api/admin/channels/:channelId/plans', requireAdmin, async (req, res) => {
  const channelId = req.params.channelId as string;
  const { name, description, price, duration } = req.body;
  try {
    const plan = await prisma.plan.create({
      data: {
        channelId,
        name,
        description,
        price: Number(price),
        duration: Number(duration),
        priceType: 'STARS'
      }
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add plan' });
  }
});

// Delete a plan
app.delete('/api/admin/plans/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.plan.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});
// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Catch-all route for frontend SPA routing
app.use((req, res) => {
  const filePath = path.join(__dirname, '../../frontend/dist/index.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Frontend build not found at', filePath);
      res.status(500).send('Frontend is building or not found. Please wait.');
    }
  });
});
