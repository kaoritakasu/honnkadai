import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  isLogin = signal(true);
  email = signal('');
  password = signal('');
  name = signal('');
  employeeNumber = signal('');
  role = signal('EMPLOYEE');
  loading = signal(false);
  error = signal('');

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  toggleMode() {
    this.isLogin.set(!this.isLogin());
    this.error.set('');
  }

  submit() {
    this.loading.set(true);
    this.error.set('');

    if (this.isLogin()) {
      this.authService.login(this.email(), this.password()).subscribe({
        next: (response: any) => {
          // データ構造の違いを吸収し、すべて大文字（EMPLOYEE）に変換して判定する
          const userRole = (response.role || response.user?.role || '').toUpperCase();
          
          // デバッグ用：ブラウザのConsoleに実際のデータを表示
          console.log('認証データ:', response);
          console.log('判定された権限:', userRole);

          if (userRole === 'EMPLOYEE') {
            this.router.navigate(['/mypage']);
          } else {
            this.router.navigate(['/admin/dashboard']);
          }
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Login failed');
        }
      });
    }
   else {
      this.authService.register(this.email(), this.password(), this.name(), this.role(), this.employeeNumber()).subscribe({
        next: () => {
          this.isLogin.set(true);
          this.error.set('Registration successful! Please login.');
          this.password.set('');
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Registration failed');
          this.loading.set(false);
        }
      });
    }
  }
}
