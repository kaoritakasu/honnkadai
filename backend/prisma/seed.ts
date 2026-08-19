import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Delete existing test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['admin@test.com', 'employee@test.com']
        }
      }
    });

    // Create test admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        password: adminPassword,
        name: 'Admin User',
        role: 'ADMIN'
      }
    });

    // Create admin record
    await prisma.admin.create({
      data: {
        userId: adminUser.id
      }
    });

    // Create test employee user
    const employeePassword = await bcrypt.hash('employee123', 10);
    const employeeUser = await prisma.user.create({
      data: {
        email: 'employee@test.com',
        password: employeePassword,
        name: 'Employee User',
        role: 'EMPLOYEE'
      }
    });

    // Create employee record
    await prisma.employee.create({
      data: {
        userId: employeeUser.id,
        score: 80,
        desiredDept: 'Sales',
        currentDept: 'Engineering'
      }
    });

    // Create sample departments
    await prisma.department.deleteMany();

    await prisma.department.create({
      data: {
        name: 'Sales',
        requiredSkills: 'Communication, Negotiation',
        requiredScore: 70,
        expectedRevenue: 5000000,
        description: 'Sales department'
      }
    });

    await prisma.department.create({
      data: {
        name: 'Engineering',
        requiredSkills: 'Programming, Problem Solving',
        requiredScore: 75,
        expectedRevenue: 3000000,
        description: 'Engineering department'
      }
    });

    console.log('✅ Seed data created successfully!');
    console.log('');
    console.log('Test Account 1 (Admin):');
    console.log('  Email: admin@test.com');
    console.log('  Password: admin123');
    console.log('');
    console.log('Test Account 2 (Employee):');
    console.log('  Email: employee@test.com');
    console.log('  Password: employee123');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
