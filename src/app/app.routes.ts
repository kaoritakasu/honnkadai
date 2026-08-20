import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { MyPageComponent } from './components/my-page/my-page.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [AuthGuard], data: { roles: ['ADMIN', 'HR'] } },
  { path: 'mypage', component: MyPageComponent, canActivate: [AuthGuard], data: { roles: ['EMPLOYEE'] } },
  { path: '**', redirectTo: '/login' }
];
