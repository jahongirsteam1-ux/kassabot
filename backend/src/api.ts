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

// Serve static files from frontend build
// TEMPORARILY COMMENTED OUT TO DEBUG RAILWAY HANG
// app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Catch-all route for frontend SPA routing
app.use((req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Debug View</title></head>
      <body style="background: white; color: black; padding: 20px;">
        <h1>Server is ALIVE</h1>
        <p>If you see this, the Express server is working perfectly, but the frontend static files were causing the hang!</p>
      </body>
    </html>
  `);
});
