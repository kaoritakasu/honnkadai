import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const SLOT_DURATION = 30;
const DEFAULT_WORKING_HOURS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

// Helper: Generate time slots between start and end time
function generateTimeSlots(startTime: string, endTime: string): string[] {
  const slots: string[] = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  let currentHour = startHour;
  let currentMinute = startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;

  while (currentHour * 60 + currentMinute < endTotalMinutes) {
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    const nextMinute = currentMinute + SLOT_DURATION;
    const nextHour = nextMinute >= 60 ? currentHour + 1 : currentHour;
    const normalizedMinute = nextMinute % 60;
    const nextTimeStr = `${String(nextHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;

    slots.push(`${timeStr}-${nextTimeStr}`);

    currentMinute += SLOT_DURATION;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }

  return slots;
}

// Admin: Save availability rule
router.post('/availability-rules', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    let { dayOfWeek, startTime, endTime } = req.body;

    if (dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'dayOfWeek, startTime, and endTime are required' });
    }

    // ここで文字列で送られてきた曜日を数値(Int)に変換します
    dayOfWeek = Number(dayOfWeek);

    // 変換に失敗（NaN）していないかどうかも合わせてチェックします
    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be a valid number between 0 and 6' });
    }

    const rule = await prisma.interviewAvailabilityRule.upsert({
      where: { dayOfWeek_startTime_endTime: { dayOfWeek, startTime, endTime } },
      update: { isActive: true },
      create: { dayOfWeek, startTime, endTime, isActive: true },
    });

    res.json(rule);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get availability rules (public - employees need this to see available dates)
router.get('/availability-rules', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const rules = await prisma.interviewAvailabilityRule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    res.json(rules);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Delete availability rule
router.delete('/availability-rules/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rule = await prisma.interviewAvailabilityRule.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json(rule);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Employee: Get available time slots (based on rules)
router.get('/available-slots', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayOfWeek = targetDate.getDay();

    // Get availability rules for this day of week
    const rules = await prisma.interviewAvailabilityRule.findMany({
      where: { dayOfWeek, isActive: true },
    });

    let slots: Array<{ timeSlot: string; startTime: Date }> = [];

    if (rules.length > 0) {
      // Generate slots based on rules
      rules.forEach(rule => {
        const timeSlots = generateTimeSlots(rule.startTime, rule.endTime);
        timeSlots.forEach(timeSlot => {
          const [startHourStr, startMinStr] = timeSlot.split('-')[0].split(':').map(Number);
          const slotTime = new Date(targetDate);
          slotTime.setHours(startHourStr, startMinStr);
          slots.push({ timeSlot, startTime: slotTime });
        });
      });
    } else {
      // Fallback to default working hours if no rules defined
      const timeSlots = DEFAULT_WORKING_HOURS.map(time => {
        const [hour, minute] = time.split(':').map(Number);
        const slotTime = new Date(targetDate);
        slotTime.setHours(hour, minute);

        const endHour = minute + SLOT_DURATION === 60 ? hour + 1 : hour;
        const endMinute = (minute + SLOT_DURATION) % 60;
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

        return {
          timeSlot: `${time}-${endTime}`,
          startTime: slotTime,
        };
      });
      slots = timeSlots;
    }

    const reservedSlots = await prisma.interviewReservation.findMany({
      where: {
        date: {
          gte: targetDate,
          lt: nextDay,
        },
        status: 'RESERVED',
      },
      select: { timeSlot: true },
    });

    const reservedTimeSlots = new Set(reservedSlots.map(r => r.timeSlot));

    const availableSlots = slots
      .filter(slot => !reservedTimeSlots.has(slot.timeSlot))
      .map(({ timeSlot, startTime }) => ({ timeSlot, date: startTime.toISOString() }));

    res.json(availableSlots);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Employee: Create reservation
router.post('/reservation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date, timeSlot, reason } = req.body;

    if (!date || !timeSlot) {
      return res.status(400).json({ error: 'Date and timeSlot are required' });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const existing = await prisma.interviewReservation.findFirst({
      where: {
        date: {
          gte: targetDate,
          lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000),
        },
        timeSlot,
        status: 'RESERVED',
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'This slot is already reserved' });
    }

    const reservation = await prisma.interviewReservation.create({
      data: {
        employeeId: employee.id,
        date: targetDate,
        timeSlot,
        reason: reason || null,
        status: 'RESERVED',
      },
      include: { employee: { include: { user: true } } },
    });

    res.json(reservation);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Employee: Get own reservations
router.get('/my-reservations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const reservations = await prisma.interviewReservation.findMany({
      where: { employeeId: employee.id },
      orderBy: { date: 'asc' },
    });

    res.json(reservations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Get all reservations
router.get('/all-reservations', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const reservations = await prisma.interviewReservation.findMany({
      include: {
        employee: { include: { user: true } },
      },
      orderBy: { date: 'asc' },
    });

    res.json(reservations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Employee: Cancel reservation
router.put('/reservation/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const reservation = await prisma.interviewReservation.findUnique({
      where: { id: req.params.id },
      include: { employee: true },
    });

    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee || reservation.employeeId !== employee.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.interviewReservation.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: { employee: { include: { user: true } } },
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Update reservation status (COMPLETED, etc)
router.put('/admin/reservation/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;

    const updated = await prisma.interviewReservation.update({
      where: { id: req.params.id },
      data: { status },
      include: { employee: { include: { user: true } } },
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
