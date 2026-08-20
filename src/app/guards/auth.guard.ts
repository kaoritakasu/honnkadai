import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const requiredRoles = route.data['roles'] as string[];
    const userRole = this.authService.currentUser?.role;

    if (requiredRoles && requiredRoles.length > 0) {
      // 許可されたロールを持っていない場合、強制送還
      if (!requiredRoles.includes(userRole)) {
        if (userRole === 'EMPLOYEE') {
          this.router.navigate(['/mypage']);
        } else {
          this.router.navigate(['/admin/dashboard']);
        }
        return false;
      }
    }
    return true;
  }
}