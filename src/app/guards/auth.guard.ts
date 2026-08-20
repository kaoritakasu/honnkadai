import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    const requiredRoles = route.data['roles'] as string[];
    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = this.authService.currentUser?.role;
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
