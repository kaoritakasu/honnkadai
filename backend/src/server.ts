import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Import routes
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employee';
import adminRoutes from './routes/admin';
import departmentRoutes from './routes/department';
import allocationRoutes from './routes/allocation';
import consultationRoutes from './routes/consultation';
import interviewRoutes from './routes/interview';

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/interview', interviewRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
