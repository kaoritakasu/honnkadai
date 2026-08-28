import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';
import { sendConsultationReplyEmail } from '../utils/emailService';

const router = express.Router();
const prisma = new PrismaClient();

// Employee: Create consultation request
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const consultation = await prisma.consultation.create({
      data: {
        employeeId: employee.id,
        title,
        description,
        status: 'pending',
      },
    });

    res.json(consultation);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Employee: Get own consultations
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const consultations = await prisma.consultation.findMany({
      where: { employeeId: employee.id },
    });

    res.json(consultations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Get all consultation requests
router.get('/', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const consultations = await prisma.consultation.findMany({
      include: {
        employee: { include: { user: true } },
      },
    });

    res.json(consultations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Respond to consultation
router.put('/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { response, status } = req.body;

    const consultation = await prisma.consultation.update({
      where: { id: req.params.id },
      data: {
        response: response !== undefined ? response : undefined,
        status: status !== undefined ? status : undefined,
      },
      include: { employee: { include: { user: true } } },
    });

    // Send email notification when responding to consultation
    if (response && consultation.employee?.user) {
      await sendConsultationReplyEmail(
        consultation.employee.user.email,
        consultation.employee.user.name,
        consultation.title,
        response
      );
    }

    res.json(consultation);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
