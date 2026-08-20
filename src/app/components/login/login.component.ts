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
        next: (user) => {
          if (user.role === 'EMPLOYEE') {
            this.router.navigate(['/mypage']);
          } else {
            this.router.navigate(['/admin/dashboard']);
          }
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Login failed');
          this.loading.set(false);
        }
      });
    } else {
      this.authService.register(this.email(), this.password(), this.name(), this.role()).subscribe({
        next: () => {
          this.isLogin.set(true);
          this.error.set('Registration successful! Please login.');
          this.password.set('');
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Registration failed');
          this.loading.set(false);
        }
      });
    }
  }
}
