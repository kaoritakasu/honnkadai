import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { HrDashboardComponent } from './components/hr-dashboard/hr-dashboard.component';
import { MyPageComponent } from './components/my-page/my-page.component';
import { AuthGuard } from './guards/auth.guard';
import { NaijiListComponent } from './components/admin-dashboard/naiji-list.component';
import { ConsultationsListComponent } from './components/admin-dashboard/consultations-list.component';
import { ReservationsListComponent } from './components/admin-dashboard/reservations-list.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'admin/dashboard',
    component: AdminDashboardComponent,
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'HR'] }
  },
  {
    path: 'admin/reservations',
    component: ReservationsListComponent,
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'HR'] }
  },
  {
    path: 'admin/consultations',
    component: ConsultationsListComponent,
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'HR'] }
  },
  {
    path: 'admin/naiji',
    component: NaijiListComponent,
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'HR'] }
  },
  {
    path: 'hr-dashboard',
    component: HrDashboardComponent,
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'HR'] }
  },
  {
    path: 'mypage',
    component: MyPageComponent,
    canActivate: [AuthGuard],
    data: { roles: ['EMPLOYEE'] }
  },
  { path: '**', redirectTo: '/login' }
];