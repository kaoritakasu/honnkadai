import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const latestSimulation = await prisma.simulationResult.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (!latestSimulation) {
    console.log('シミュレーション結果が見つかりません');
    return;
  }

  console.log('\n=== 最新のシミュレーション結果 ===\n');
  console.log(`ID: ${latestSimulation.id}`);
  console.log(`作成日時: ${latestSimulation.createdAt}`);
  console.log(`全社売上: ${latestSimulation.totalRevenue}`);
  console.log(`全社コスト: ${latestSimulation.totalCost}`);
  console.log(`全社利益: ${latestSimulation.totalProfit}`);
  console.log('\n=== Details (最初の3000文字) ===\n');

  let details: any = latestSimulation.details;
  if (typeof details === 'string') {
    details = JSON.parse(details);
  }

  console.log(JSON.stringify(details, null, 2).substring(0, 3000));
  console.log('\n... (詳細は省略)\n');

  // E002 社員を検索
  if (Array.isArray(details)) {
    for (const dept of details) {
      if (dept?.candidates && Array.isArray(dept.candidates)) {
        const found = dept.candidates.find((c: any) => c.employeeNumber === 'E002');
        if (found) {
          console.log(`\n✓ E002 (黛夕華) が見つかりました！`);
          console.log(`部門: ${dept.departmentName}`);
          console.log(`データ:`, JSON.stringify(found, null, 2));
        }
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
