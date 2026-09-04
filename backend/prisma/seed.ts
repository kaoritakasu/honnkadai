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
    await prisma.department.deleteMany();
    await prisma.user.deleteMany();

    // ==========================================
    // 1. 作成済みのテストユーザー (Admin & Employee)
    // ==========================================
    const adminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.create({
      data: { email: 'admin@test.com', password: adminPassword, name: 'Admin User', role: 'ADMIN' }
    });
    await prisma.admin.create({ data: { userId: adminUser.id } });

    const employeePassword = await bcrypt.hash('employee123', 10);
    const employeeUser = await prisma.user.create({
      data: { email: 'employee@test.com', password: employeePassword, name: 'Employee User', role: 'EMPLOYEE' }
    });

    const randomSkill = () => Math.floor(Math.random() * 71) + 30;

    await prisma.employee.create({
      data: {
        employeeNumber: 'EMP001', userId: employeeUser.id, score: 80,
        desiredDept: 'Sales', currentDept: 'Engineering',
        salesForce: randomSkill(), managementForce: randomSkill(), explorationForce: randomSkill(), developmentForce: randomSkill(),
        laborCost: 5
      }
    });

    const employees = [
      { email: 'emp002@test.com', name: 'Alice Johnson', empNumber: 'EMP002', score: 75, dept: 'Sales' },
      { email: 'emp003@test.com', name: 'Bob Smith', empNumber: 'EMP003', score: 85, dept: 'Engineering' },
      { email: 'emp004@test.com', name: 'Carol Davis', empNumber: 'EMP004', score: 90, dept: 'Marketing' },
      { email: 'emp005@test.com', name: 'David Wilson', empNumber: 'EMP005', score: 70, dept: 'Sales' }
    ];

    for (const emp of employees) {
      const password = await bcrypt.hash('password123', 10);
      const user = await prisma.user.create({
        data: { email: emp.email, password, name: emp.name, role: 'EMPLOYEE' }
      });
      await prisma.employee.create({
        data: {
          employeeNumber: emp.empNumber, userId: user.id, score: emp.score,
          desiredDept: emp.dept, currentDept: emp.dept,
          salesForce: randomSkill(), managementForce: randomSkill(), explorationForce: randomSkill(), developmentForce: randomSkill(),
          laborCost: 4 + Math.random() * 2
        }
      });
    }

    // ==========================================
    // 2. 追加のデモ用リアル社員10名 (A/B/C事業部へ配属)
    // ==========================================
    const demoEmployees = [
      { email: 'tanaka@test.com', name: '田中 健太', empNumber: 'DEMO001', score: 85, currentDept: 'A事業部', desiredDept: 'B事業部', sales: 90, mgmt: 85, exp: 60, dev: 40, cost: 8 },
      { email: 'sato@test.com', name: '佐藤 美咲', empNumber: 'DEMO002', score: 78, currentDept: 'B事業部', desiredDept: 'C事業部', sales: 95, mgmt: 40, exp: 80, dev: 30, cost: 5 },
      { email: 'suzuki@test.com', name: '鈴木 一郎', empNumber: 'DEMO003', score: 70, currentDept: 'A事業部', desiredDept: 'A事業部', sales: 60, mgmt: 65, exp: 55, dev: 50, cost: 6 },
      { email: 'takahashi@test.com', name: '高橋 陽子', empNumber: 'DEMO004', score: 92, currentDept: 'C事業部', desiredDept: 'B事業部', sales: 40, mgmt: 95, exp: 70, dev: 85, cost: 9 },
      { email: 'ito@test.com', name: '伊藤 翔太', empNumber: 'DEMO005', score: 65, currentDept: 'B事業部', desiredDept: 'A事業部', sales: 75, mgmt: 30, exp: 90, dev: 20, cost: 4 },
      { email: 'watanabe@test.com', name: '渡辺 結衣', empNumber: 'DEMO006', score: 88, currentDept: 'A事業部', desiredDept: 'C事業部', sales: 85, mgmt: 80, exp: 65, dev: 70, cost: 7.5 },
      { email: 'yamamoto@test.com', name: '山本 大地', empNumber: 'DEMO007', score: 73, currentDept: 'C事業部', desiredDept: 'B事業部', sales: 50, mgmt: 55, exp: 85, dev: 60, cost: 5.5 },
      { email: 'nakamura@test.com', name: '中村 さくら', empNumber: 'DEMO008', score: 81, currentDept: 'B事業部', desiredDept: 'A事業部', sales: 80, mgmt: 70, exp: 75, dev: 50, cost: 6.5 },
      { email: 'kobayashi@test.com', name: '小林 竜也', empNumber: 'DEMO009', score: 68, currentDept: 'A事業部', desiredDept: 'C事業部', sales: 65, mgmt: 45, exp: 60, dev: 80, cost: 4.5 },
      { email: 'kato@test.com', name: '加藤 恵', empNumber: 'DEMO010', score: 86, currentDept: 'C事業部', desiredDept: 'B事業部', sales: 70, mgmt: 90, exp: 80, dev: 75, cost: 8.5 }
    ];

    for (const emp of demoEmployees) {
      const password = await bcrypt.hash('password123', 10);
      const user = await prisma.user.create({
        data: { email: emp.email, password, name: emp.name, role: 'EMPLOYEE' }
      });
      await prisma.employee.create({
        data: {
          employeeNumber: emp.empNumber, userId: user.id, score: emp.score,
          desiredDept: emp.desiredDept, currentDept: emp.currentDept,
          salesForce: emp.sales, managementForce: emp.mgmt, explorationForce: emp.exp, developmentForce: emp.dev,
          laborCost: emp.cost
        }
      });
    }

    // ==========================================
    // 3. 元の事業部データ (Sales, Engineering, Marketing)
    // ==========================================
    await prisma.department.create({
      data: {
        name: 'Sales', requiredSkills: 'Communication, Negotiation', requiredScore: 70, expectedRevenue: 5000000,
        description: 'Sales department', weightSales: 40, weightManagement: 20, weightExploration: 30, weightDevelopment: 10,
        optimalHeadcount: 10, minHeadcount: 3, baseRevenue: 100000, growthFactor: 1.2
      }
    });

    await prisma.department.create({
      data: {
        name: 'Engineering', requiredSkills: 'Programming, Problem Solving', requiredScore: 75, expectedRevenue: 3000000,
        description: 'Engineering department', weightSales: 10, weightManagement: 20, weightExploration: 30, weightDevelopment: 40,
        optimalHeadcount: 8, minHeadcount: 2, baseRevenue: 80000, growthFactor: 1.5
      }
    });

    await prisma.department.create({
      data: {
        name: 'Marketing', requiredSkills: 'Market Analysis, Communication', requiredScore: 70, expectedRevenue: 4000000,
        description: 'Marketing department', weightSales: 30, weightManagement: 25, weightExploration: 35, weightDevelopment: 10,
        optimalHeadcount: 6, minHeadcount: 2, baseRevenue: 70000, growthFactor: 1.3
      }
    });

    // ==========================================
    // 4. 復旧したA/B/C事業部データ
    // ==========================================
    const restoredDepartments = [
      {
        id: "cmtjgen75000ig2fdy3pffwzh", name: "A事業部", requiredSkills: "Communication, Negotiation", requiredScore: 70, expectedRevenue: 5000000,
        status: "飽宣事業", description: "売上規模は大きいが成長率は低い", optimalHeadcount: 40, minHeadcount: 30,
        weightSales: 0.45, weightManagement: 0.35, weightExploration: 0.1, weightDevelopment: 0.1,
        baseRevenue: 1000000000, growthFactor: 0.06
      },
      {
        id: "cmtjgen7a000jg2fdwcb32s6u", name: "B事業部", requiredSkills: "Programming, Problem Solving", requiredScore: 75, expectedRevenue: 3000000,
        status: "成長事業", description: "売上拡大の余地が大きい", optimalHeadcount: 35, minHeadcount: 20,
        weightSales: 0.35, weightManagement: 0.2, weightExploration: 0.3, weightDevelopment: 0.15,
        baseRevenue: 700000000, growthFactor: 0.12
      },
      {
        id: "cmtjgen7g000kg2fd9q816vfl", name: "C事業部", requiredSkills: "Market Analysis, Communication", requiredScore: 70, expectedRevenue: 4000000,
        status: "新規事業", description: "現在の売上は小さいが将来性が高い", optimalHeadcount: 25, minHeadcount: 10,
        weightSales: 0.2, weightManagement: 0.1, weightExploration: 0.5, weightDevelopment: 0.2,
        baseRevenue: 200000000, growthFactor: 0.25
      }
    ];

    for (const dept of restoredDepartments) {
      await prisma.department.create({ data: dept });
    }

    // ==========================================
    // 5. 相談履歴と面談受付ルール (元のまま)
    // ==========================================
    const allEmployees = await prisma.employee.findMany();
    if (allEmployees.length > 0) {
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

    for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
      await prisma.interviewAvailabilityRule.create({
        data: { dayOfWeek, startTime: '10:00', endTime: '18:00', isActive: true }
      });
    }

    console.log('✅ 全データの統合とSeedが完了しました！');
    console.log('Test Account 1 (Admin): admin@test.com / admin123');
    console.log('Test Account 2 (Employee): employee@test.com / employee123');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();