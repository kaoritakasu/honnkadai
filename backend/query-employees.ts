import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    include: {
      user: {
        select: { name: true }
      }
    }
  });

  console.log('\n=== データベース内のテスト社員一覧 ===\n');
  employees.forEach((emp) => {
    console.log(`ID: ${emp.id}`);
    console.log(`  社員番号: ${emp.employeeNumber}`);
    console.log(`  ユーザー名: ${emp.user?.name}`);
    console.log(`  現在の部署: ${emp.currentDept}`);
    console.log(`  営業力: ${emp.salesForce}, 管理力: ${emp.managementForce}, 開拓力: ${emp.explorationForce}, 育成力: ${emp.developmentForce}`);
    console.log('');
  });
}

main().finally(() => prisma.$disconnect());
