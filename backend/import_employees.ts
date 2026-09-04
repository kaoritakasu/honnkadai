import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const employeeData = [
  {empNumber: 'E001', salesForce: 75, managementForce: 46, explorationForce: 63, developmentForce: 40, laborCost: 6.7},
  {empNumber: 'E002', salesForce: 85, managementForce: 67, explorationForce: 59, developmentForce: 42, laborCost: 9.9},
  {empNumber: 'E003', salesForce: 89, managementForce: 48, explorationForce: 59, developmentForce: 44, laborCost: 9.1},
  {empNumber: 'E004', salesForce: 85, managementForce: 44, explorationForce: 53, developmentForce: 29, laborCost: 8.0},
  {empNumber: 'E005', salesForce: 77, managementForce: 54, explorationForce: 54, developmentForce: 36, laborCost: 6.0},
  {empNumber: 'E006', salesForce: 96, managementForce: 72, explorationForce: 56, developmentForce: 57, laborCost: 7.3},
  {empNumber: 'E007', salesForce: 93, managementForce: 67, explorationForce: 64, developmentForce: 33, laborCost: 8.0},
  {empNumber: 'E008', salesForce: 80, managementForce: 74, explorationForce: 48, developmentForce: 41, laborCost: 5.8},
  {empNumber: 'E009', salesForce: 74, managementForce: 54, explorationForce: 63, developmentForce: 45, laborCost: 7.6},
  {empNumber: 'E010', salesForce: 78, managementForce: 70, explorationForce: 40, developmentForce: 50, laborCost: 6.7},
  {empNumber: 'E011', salesForce: 77, managementForce: 59, explorationForce: 67, developmentForce: 48, laborCost: 9.7},
  {empNumber: 'E012', salesForce: 73, managementForce: 72, explorationForce: 34, developmentForce: 30, laborCost: 7.5},
  {empNumber: 'E013', salesForce: 98, managementForce: 37, explorationForce: 56, developmentForce: 61, laborCost: 6.0},
  {empNumber: 'E014', salesForce: 97, managementForce: 67, explorationForce: 59, developmentForce: 49, laborCost: 6.7},
  {empNumber: 'E015', salesForce: 77, managementForce: 45, explorationForce: 30, developmentForce: 34, laborCost: 5.6},
  {empNumber: 'E016', salesForce: 94, managementForce: 44, explorationForce: 56, developmentForce: 60, laborCost: 7.9},
  {empNumber: 'E017', salesForce: 82, managementForce: 39, explorationForce: 48, developmentForce: 54, laborCost: 6.0},
  {empNumber: 'E018', salesForce: 93, managementForce: 50, explorationForce: 50, developmentForce: 51, laborCost: 6.4},
  {empNumber: 'E019', salesForce: 78, managementForce: 62, explorationForce: 57, developmentForce: 59, laborCost: 9.5},
  {empNumber: 'E020', salesForce: 85, managementForce: 44, explorationForce: 56, developmentForce: 29, laborCost: 8.0},
  {empNumber: 'E021', salesForce: 92, managementForce: 51, explorationForce: 40, developmentForce: 31, laborCost: 5.7},
  {empNumber: 'E022', salesForce: 94, managementForce: 46, explorationForce: 35, developmentForce: 28, laborCost: 8.2},
  {empNumber: 'E023', salesForce: 94, managementForce: 72, explorationForce: 64, developmentForce: 46, laborCost: 6.8},
  {empNumber: 'E024', salesForce: 90, managementForce: 64, explorationForce: 53, developmentForce: 43, laborCost: 7.5},
  {empNumber: 'E025', salesForce: 98, managementForce: 66, explorationForce: 68, developmentForce: 65, laborCost: 7.4},
  {empNumber: 'E026', salesForce: 88, managementForce: 38, explorationForce: 64, developmentForce: 40, laborCost: 5.8},
  {empNumber: 'E027', salesForce: 89, managementForce: 44, explorationForce: 63, developmentForce: 28, laborCost: 8.0},
  {empNumber: 'E028', salesForce: 78, managementForce: 44, explorationForce: 67, developmentForce: 29, laborCost: 8.7},
  {empNumber: 'E029', salesForce: 98, managementForce: 64, explorationForce: 62, developmentForce: 63, laborCost: 7.0},
  {empNumber: 'E030', salesForce: 92, managementForce: 51, explorationForce: 67, developmentForce: 59, laborCost: 8.4},
  {empNumber: 'E031', salesForce: 81, managementForce: 54, explorationForce: 65, developmentForce: 41, laborCost: 6.0},
  {empNumber: 'E032', salesForce: 91, managementForce: 53, explorationForce: 45, developmentForce: 36, laborCost: 6.6},
  {empNumber: 'E033', salesForce: 98, managementForce: 55, explorationForce: 30, developmentForce: 56, laborCost: 8.9},
  {empNumber: 'E034', salesForce: 76, managementForce: 45, explorationForce: 34, developmentForce: 26, laborCost: 5.1},
  {empNumber: 'E035', salesForce: 74, managementForce: 37, explorationForce: 70, developmentForce: 48, laborCost: 5.4},
  {empNumber: 'E036', salesForce: 33, managementForce: 95, explorationForce: 36, developmentForce: 41, laborCost: 5.0},
  {empNumber: 'E037', salesForce: 38, managementForce: 95, explorationForce: 27, developmentForce: 67, laborCost: 5.9},
  {empNumber: 'E038', salesForce: 41, managementForce: 75, explorationForce: 25, developmentForce: 55, laborCost: 7.6},
  {empNumber: 'E039', salesForce: 40, managementForce: 79, explorationForce: 55, developmentForce: 36, laborCost: 7.9},
  {empNumber: 'E040', salesForce: 31, managementForce: 83, explorationForce: 30, developmentForce: 38, laborCost: 6.8},
  {empNumber: 'E041', salesForce: 46, managementForce: 77, explorationForce: 49, developmentForce: 67, laborCost: 5.6},
  {empNumber: 'E042', salesForce: 38, managementForce: 84, explorationForce: 52, developmentForce: 58, laborCost: 5.4},
  {empNumber: 'E043', salesForce: 48, managementForce: 79, explorationForce: 65, developmentForce: 64, laborCost: 6.3},
  {empNumber: 'E044', salesForce: 51, managementForce: 76, explorationForce: 27, developmentForce: 55, laborCost: 6.8},
  {empNumber: 'E045', salesForce: 49, managementForce: 90, explorationForce: 39, developmentForce: 40, laborCost: 7.5},
  {empNumber: 'E046', salesForce: 48, managementForce: 72, explorationForce: 28, developmentForce: 47, laborCost: 5.4},
  {empNumber: 'E047', salesForce: 58, managementForce: 95, explorationForce: 39, developmentForce: 72, laborCost: 9.2},
  {empNumber: 'E048', salesForce: 31, managementForce: 98, explorationForce: 35, developmentForce: 60, laborCost: 7.9},
  {empNumber: 'E049', salesForce: 66, managementForce: 89, explorationForce: 52, developmentForce: 50, laborCost: 6.6},
  {empNumber: 'E050', salesForce: 63, managementForce: 93, explorationForce: 61, developmentForce: 41, laborCost: 9.3},
  {empNumber: 'E051', salesForce: 35, managementForce: 93, explorationForce: 60, developmentForce: 45, laborCost: 7.7},
  {empNumber: 'E052', salesForce: 69, managementForce: 96, explorationForce: 37, developmentForce: 65, laborCost: 7.4},
  {empNumber: 'E053', salesForce: 57, managementForce: 94, explorationForce: 50, developmentForce: 43, laborCost: 8.4},
  {empNumber: 'E054', salesForce: 69, managementForce: 98, explorationForce: 36, developmentForce: 52, laborCost: 6.5},
  {empNumber: 'E055', salesForce: 43, managementForce: 87, explorationForce: 35, developmentForce: 48, laborCost: 7.1},
  {empNumber: 'E056', salesForce: 52, managementForce: 83, explorationForce: 54, developmentForce: 47, laborCost: 7.7},
  {empNumber: 'E057', salesForce: 49, managementForce: 72, explorationForce: 28, developmentForce: 65, laborCost: 8.3},
  {empNumber: 'E058', salesForce: 67, managementForce: 75, explorationForce: 36, developmentForce: 52, laborCost: 9.0},
  {empNumber: 'E059', salesForce: 64, managementForce: 94, explorationForce: 51, developmentForce: 63, laborCost: 6.8},
  {empNumber: 'E060', salesForce: 63, managementForce: 98, explorationForce: 40, developmentForce: 59, laborCost: 6.5},
  {empNumber: 'E061', salesForce: 64, managementForce: 57, explorationForce: 89, developmentForce: 60, laborCost: 6.7},
  {empNumber: 'E062', salesForce: 50, managementForce: 39, explorationForce: 97, developmentForce: 57, laborCost: 9.0},
  {empNumber: 'E063', salesForce: 56, managementForce: 60, explorationForce: 87, developmentForce: 39, laborCost: 7.0},
  {empNumber: 'E064', salesForce: 63, managementForce: 49, explorationForce: 78, developmentForce: 50, laborCost: 5.7},
  {empNumber: 'E065', salesForce: 58, managementForce: 25, explorationForce: 75, developmentForce: 41, laborCost: 6.0},
  {empNumber: 'E066', salesForce: 60, managementForce: 37, explorationForce: 87, developmentForce: 64, laborCost: 7.0},
  {empNumber: 'E067', salesForce: 64, managementForce: 35, explorationForce: 78, developmentForce: 70, laborCost: 8.5},
  {empNumber: 'E068', salesForce: 41, managementForce: 48, explorationForce: 80, developmentForce: 64, laborCost: 6.3},
  {empNumber: 'E069', salesForce: 63, managementForce: 35, explorationForce: 90, developmentForce: 64, laborCost: 7.7},
  {empNumber: 'E070', salesForce: 63, managementForce: 60, explorationForce: 72, developmentForce: 51, laborCost: 6.6},
  {empNumber: 'E071', salesForce: 46, managementForce: 38, explorationForce: 93, developmentForce: 33, laborCost: 7.1},
  {empNumber: 'E072', salesForce: 63, managementForce: 43, explorationForce: 72, developmentForce: 60, laborCost: 7.2},
  {empNumber: 'E073', salesForce: 45, managementForce: 57, explorationForce: 74, developmentForce: 70, laborCost: 9.6},
  {empNumber: 'E074', salesForce: 70, managementForce: 64, explorationForce: 90, developmentForce: 70, laborCost: 7.4},
  {empNumber: 'E075', salesForce: 44, managementForce: 52, explorationForce: 82, developmentForce: 67, laborCost: 7.3},
  {empNumber: 'E076', salesForce: 39, managementForce: 35, explorationForce: 77, developmentForce: 57, laborCost: 7.8},
  {empNumber: 'E077', salesForce: 47, managementForce: 57, explorationForce: 84, developmentForce: 61, laborCost: 9.2},
  {empNumber: 'E078', salesForce: 63, managementForce: 46, explorationForce: 85, developmentForce: 60, laborCost: 5.9},
  {empNumber: 'E079', salesForce: 66, managementForce: 60, explorationForce: 92, developmentForce: 30, laborCost: 6.6},
  {empNumber: 'E080', salesForce: 47, managementForce: 58, explorationForce: 89, developmentForce: 64, laborCost: 9.5},
  {empNumber: 'E081', salesForce: 35, managementForce: 56, explorationForce: 83, developmentForce: 54, laborCost: 7.2},
  {empNumber: 'E082', salesForce: 51, managementForce: 30, explorationForce: 95, developmentForce: 41, laborCost: 6.6},
  {empNumber: 'E083', salesForce: 73, managementForce: 26, explorationForce: 94, developmentForce: 63, laborCost: 6.2},
  {empNumber: 'E084', salesForce: 54, managementForce: 40, explorationForce: 72, developmentForce: 48, laborCost: 6.6},
  {empNumber: 'E085', salesForce: 41, managementForce: 30, explorationForce: 73, developmentForce: 67, laborCost: 5.0},
  {empNumber: 'E086', salesForce: 63, managementForce: 74, explorationForce: 46, developmentForce: 86, laborCost: 9.4},
  {empNumber: 'E087', salesForce: 62, managementForce: 43, explorationForce: 36, developmentForce: 73, laborCost: 8.6},
  {empNumber: 'E088', salesForce: 65, managementForce: 62, explorationForce: 30, developmentForce: 95, laborCost: 6.0},
  {empNumber: 'E089', salesForce: 31, managementForce: 60, explorationForce: 62, developmentForce: 87, laborCost: 5.8},
  {empNumber: 'E090', salesForce: 56, managementForce: 53, explorationForce: 47, developmentForce: 96, laborCost: 9.6},
  {empNumber: 'E091', salesForce: 35, managementForce: 61, explorationForce: 51, developmentForce: 74, laborCost: 8.2},
  {empNumber: 'E092', salesForce: 58, managementForce: 36, explorationForce: 58, developmentForce: 73, laborCost: 7.1},
  {empNumber: 'E093', salesForce: 29, managementForce: 74, explorationForce: 61, developmentForce: 85, laborCost: 9.3},
  {empNumber: 'E094', salesForce: 57, managementForce: 35, explorationForce: 55, developmentForce: 89, laborCost: 7.7},
  {empNumber: 'E095', salesForce: 33, managementForce: 67, explorationForce: 63, developmentForce: 86, laborCost: 7.4},
  {empNumber: 'E096', salesForce: 31, managementForce: 62, explorationForce: 34, developmentForce: 83, laborCost: 6.4},
  {empNumber: 'E097', salesForce: 40, managementForce: 36, explorationForce: 33, developmentForce: 80, laborCost: 5.0},
  {empNumber: 'E098', salesForce: 39, managementForce: 74, explorationForce: 57, developmentForce: 95, laborCost: 9.2},
  {empNumber: 'E099', salesForce: 54, managementForce: 35, explorationForce: 54, developmentForce: 76, laborCost: 6.1},
  {empNumber: 'E100', salesForce: 53, managementForce: 75, explorationForce: 36, developmentForce: 87, laborCost: 9.4},
];

async function main() {
  try {
    console.log('Starting employee import...');
    
    // Clean up
    console.log('Cleaning up existing data...');
    await prisma.consultation.deleteMany();
    await prisma.feedback.deleteMany();
    await prisma.allocation.deleteMany();
    await prisma.interviewReservation.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.user.deleteMany();
    
    // Create admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.create({
      data: { email: 'admin@test.com', password: adminPassword, name: 'Admin User', role: 'ADMIN' }
    });
    await prisma.admin.create({ data: { userId: adminUser.id } });
    console.log('✓ Admin user created');
    
    // Import employees
    let count = 0;
    for (const emp of employeeData) {
      const password = await bcrypt.hash('password123', 10);
      const user = await prisma.user.create({
        data: { email: `${emp.empNumber}@test.com`, password, name: emp.empNumber, role: 'EMPLOYEE' }
      });
      
      await prisma.employee.create({
        data: {
          employeeNumber: emp.empNumber,
          userId: user.id,
          score: Math.floor(Math.random() * 100),
          desiredDept: 'Not specified',
          currentDept: 'Engineering',
          salesForce: emp.salesForce,
          managementForce: emp.managementForce,
          explorationForce: emp.explorationForce,
          developmentForce: emp.developmentForce,
          laborCost: emp.laborCost
        }
      });
      
      count++;
      if (count % 20 === 0) console.log(`  Created ${count} employees...`);
    }
    
    console.log(`✅ Successfully imported ${count} employees!`);
    console.log('\nTest account: admin@test.com / admin123\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
