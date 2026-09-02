import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // Delete all existing data to start fresh
    await prisma.consultation.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.allocation.deleteMany();
    await prisma.interviewReservation.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.admin.deleteMany();
    await prisma.user.deleteMany();

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

    // Helper to generate random skill value (30-100)
    const randomSkill = () => Math.floor(Math.random() * 71) + 30;

    // Create employee record
    await prisma.employee.create({
      data: {
        employeeNumber: 'EMP001',
        userId: employeeUser.id,
        score: 80,
        desiredDept: 'Sales',
        currentDept: 'Engineering',
        salesForce: randomSkill(),
        managementForce: randomSkill(),
        explorationForce: randomSkill(),
        developmentForce: randomSkill(),
        laborCost: 5
      }
    });

    // Create additional test employees with employeeNumber
    const employees = [
      { email: 'emp002@test.com', name: 'Alice Johnson', empNumber: 'EMP002', score: 75, dept: 'Sales' },
      { email: 'emp003@test.com', name: 'Bob Smith', empNumber: 'EMP003', score: 85, dept: 'Engineering' },
      { email: 'emp004@test.com', name: 'Carol Davis', empNumber: 'EMP004', score: 90, dept: 'Marketing' },
      { email: 'emp005@test.com', name: 'David Wilson', empNumber: 'EMP005', score: 70, dept: 'Sales' }
    ];

    for (const emp of employees) {
      const password = await bcrypt.hash('password123', 10);
      const user = await prisma.user.create({
        data: {
          email: emp.email,
          password,
          name: emp.name,
          role: 'EMPLOYEE'
        }
      });

      await prisma.employee.create({
        data: {
          employeeNumber: emp.empNumber,
          userId: user.id,
          score: emp.score,
          desiredDept: emp.dept,
          currentDept: emp.dept,
          salesForce: randomSkill(),
          managementForce: randomSkill(),
          explorationForce: randomSkill(),
          developmentForce: randomSkill(),
          laborCost: 4 + Math.random() * 2
        }
      });
    }

    // Create sample departments
    await prisma.department.deleteMany();

    await prisma.department.create({
      data: {
        name: 'Sales',
        requiredSkills: 'Communication, Negotiation',
        requiredScore: 70,
        expectedRevenue: 5000000,
        description: 'Sales department',
        weightSales: 40,
        weightManagement: 20,
        weightExploration: 30,
        weightDevelopment: 10,
        optimalHeadcount: 10,
        minHeadcount: 3,
        baseRevenue: 100000,
        growthFactor: 1.2
      }
    });

    await prisma.department.create({
      data: {
        name: 'Engineering',
        requiredSkills: 'Programming, Problem Solving',
        requiredScore: 75,
        expectedRevenue: 3000000,
        description: 'Engineering department',
        weightSales: 10,
        weightManagement: 20,
        weightExploration: 30,
        weightDevelopment: 40,
        optimalHeadcount: 8,
        minHeadcount: 2,
        baseRevenue: 80000,
        growthFactor: 1.5
      }
    });

    await prisma.department.create({
      data: {
        name: 'Marketing',
        requiredSkills: 'Market Analysis, Communication',
        requiredScore: 70,
        expectedRevenue: 4000000,
        description: 'Marketing department',
        weightSales: 30,
        weightManagement: 25,
        weightExploration: 35,
        weightDevelopment: 10,
        optimalHeadcount: 6,
        minHeadcount: 2,
        baseRevenue: 70000,
        growthFactor: 1.3
      }
    });

    // Create sample consultations
    const allEmployees = await prisma.employee.findMany();
    if (allEmployees.length > 0) {
      await prisma.consultation.deleteMany();

      const consultations = [
        {
          title: 'キャリアについての相談',
          description: 'マネージャーへのステップアップについて相談したいです。現在の職務経歴書の作成手伝いや、必要なスキルについてのアドバイスをいただきたいと考えています。',
          status: 'pending'
        },
        {
          title: '異動希望の相談',
          description: '現在の部署から営業部への異動を希望しています。営業スキルの育成計画や、キャリアパスについて相談させていただきたいです。',
          status: 'resolved',
          response: 'ご相談ありがとうございます。営業部への異動について前向きに検討させていただきます。来月のキャリア面談時に詳しくお話しましょう。'
        },
        {
          title: 'スキルアップ研修についての相談',
          description: 'プログラミングスキルを向上させるための研修プログラムについて知りたいです。会社で提供している研修制度はありますか？',
          status: 'resolved',
          response: 'スキルアップについてのご質問ありがとうございます。複数の研修プログラムをご用意しており、Webポータルから申し込み可能です。詳しくはHRまでお問い合わせください。'
        }
      ];

      for (let i = 0; i < Math.min(consultations.length, allEmployees.length); i++) {
        await prisma.consultation.create({
          data: {
            employeeId: allEmployees[i].id,
            title: consultations[i].title,
            description: consultations[i].description,
            status: consultations[i].status,
            response: consultations[i].response || null
          }
        });
      }
    }

    // Create interview availability rules (Monday-Friday 10:00-18:00)
    await prisma.interviewAvailabilityRule.deleteMany();

    // Monday (1) to Friday (5)
    for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
      await prisma.interviewAvailabilityRule.create({
        data: {
          dayOfWeek,
          startTime: '10:00',
          endTime: '18:00',
          isActive: true
        }
      });
    }

    console.log('✅ Seed data created successfully!');
    console.log('');
    console.log('Test Account 1 (Admin):');
    console.log('  Email: admin@test.com');
    console.log('  Password: admin123');
    console.log('');
    console.log('Test Account 2 (Employee):');
    console.log('  Email: employee@test.com');
    console.log('  Password: employee123');
    console.log('');
    console.log('Interview Availability Rules:');
    console.log('  Monday-Friday: 10:00-18:00');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
