import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, employeeNumber } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
   data: {
    name,
    email,
    password: hashedPassword,
    role: role || 'EMPLOYEE'
   }
 });

    if (user.role === 'ADMIN') {
      await prisma.admin.create({
        data: { userId: user.id },
      });
    } else {
      await prisma.employee.create({
        data: { userId: user.id, employeeNumber },
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    // メールアドレスの前後の空白を削除
    const email = (req.body.email || '').trim();
    const password = req.body.password;

    console.log(`[LOGIN ATTEMPT] Email: '${email}'`);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[LOGIN FAILED] ユーザーが見つかりません: '${email}'`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.log(`[LOGIN FAILED] パスワードが一致しません: '${email}'`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[LOGIN SUCCESS] ログイン成功: '${email}'`);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
