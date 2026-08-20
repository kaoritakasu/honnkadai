import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<any>(JSON.parse(localStorage.getItem('currentUser') || 'null'));
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private apiService: ApiService) {}

  get currentUser(): any {
    return this.currentUserSubject.value;
  }

  register(email: string, password: string, name: string, role: string, employeeNumber?: string): Observable<any> {
    return this.apiService.register(email, password, name, role, employeeNumber).pipe(
      map(response => {
        if (response && response.token) {
          localStorage.setItem('currentUser', JSON.stringify(response.user));
          this.apiService.setAuthToken(response.token);
          this.currentUserSubject.next(response.user);
        }
        return response.user;
      })
    );
  }

  login(email: string, password: string): Observable<any> {
    return this.apiService.login(email, password).pipe(
      map(response => {
        if (response && response.token) {
          localStorage.setItem('currentUser', JSON.stringify(response.user));
          this.apiService.setAuthToken(response.token);
          this.currentUserSubject.next(response.user);
        }
        return response.user;
      })
    );
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    this.apiService.clearAuthToken();
    this.currentUserSubject.next(null);
  }

  isAuthenticated(): boolean {
    return !!this.currentUser && !!localStorage.getItem('auth_token');
  }

  isAdmin(): boolean {
    return this.currentUser && (this.currentUser.role === 'ADMIN' || this.currentUser.role === 'HR');
  }

  isEmployee(): boolean {
    return this.currentUser && this.currentUser.role === 'EMPLOYEE';
  }
}
